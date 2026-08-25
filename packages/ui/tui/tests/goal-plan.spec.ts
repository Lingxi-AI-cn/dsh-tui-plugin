import { describe, expect, it } from 'vitest'
import {
  createTuiGoalPlanProjectionFrame, effectiveTuiPlanTarget, projectTuiGoalPlan,
  tuiGoalPlanMutationErrorMessage, updateTuiGoalPlanProjectionFrame,
} from '../src/goal-plan.ts'
import { tuiFooterItems } from '../src/footer.ts'
import { TuiPointerRegionRegistry, tuiGoalPlanDialogPointerRegions, tuiGoalPlanPointerRegions } from '../src/pointer.ts'

const goal = (phase: 'active' | 'paused' | 'blocked' | 'complete' = 'active') => ({
  goal: {
    id: 'goal-1' as never,
    revision: 2,
    objective: 'Ship the terminal surface',
    phase,
    maxGoalRounds: 8,
    ...phase === 'blocked' ? { blockedReason: { code: 'test', message: 'Needs input' } } : {},
  },
  roundsStarted: 3,
  createdAt: 10,
  updatedAt: 20,
})

describe('Goal and Plan durable surface', () => {
  it('folds pending Plan intent and omits fully inactive state', () => {
    expect(effectiveTuiPlanTarget({ active: false, pending: true })).toBe(true)
    expect(effectiveTuiPlanTarget({ active: true, pending: true })).toBe(false)
    expect(projectTuiGoalPlan(undefined, { active: false, pending: false })).toBeUndefined()
    expect(projectTuiGoalPlan(goal('complete'), { active: false, pending: false })).toBeUndefined()
    expect(projectTuiGoalPlan(goal('active'), { active: false, pending: true })).toMatchObject({
      goal: { phase: 'active' },
      plan: { active: false, pending: true, effective: true },
    })
  })

  it('projects narrow state as an actionable footer item without process-local optimism', () => {
    const surface = projectTuiGoalPlan(goal('paused'), { active: true, pending: false })
    const item = tuiFooterItems({
      modelSelectionKind: 'next request',
      goalPlan: surface,
      transcript: { startIndex: -1, endIndex: -1, total: 0, hasOlder: false, hasNewer: false },
    }, 'zh').find(candidate => candidate.id === 'goalPlan')
    expect(item).toMatchObject({ action: 'goalPlan', label: '目标' })
    expect(item?.detailLines.join('\n')).toContain('Ship the terminal surface')
  })

  it('maps the exact strip row and every dialog footer action', () => {
    const strip = tuiGoalPlanPointerRegions(80, 20, 'Composer')
    expect(strip[0]?.rect).toEqual({ left: 1, top: 20, right: 80, bottom: 20 })
    const actions = [
      { action: { id: 'goalPlan.edit' as const }, label: 'E Edit' },
      { action: { id: 'goalPlan.pause' as const }, label: 'P Pause' },
      { action: { id: 'goalPlan.clear' as const }, label: 'C Clear' },
      { action: { id: 'goalPlan.exitPlan' as const }, label: 'X Exit Plan' },
      { action: { id: 'goalPlan.close' as const }, label: 'Esc Close' },
    ]
    const dialog = tuiGoalPlanDialogPointerRegions(100, 30, actions)
    const registry = new TuiPointerRegionRegistry()
    registry.replace(dialog)
    expect(registry.hitTest({ column: 14, row: 30 }, 'Dialog')?.region.action)
      .toEqual({ id: 'goalPlan.pause' })
    expect(registry.hitTest({ column: 48, row: 30 }, 'Dialog')?.region.action)
      .toEqual({ id: 'goalPlan.close' })
  })

  it('replaces replay state and ignores stale or prior-Session projection changes', () => {
    const resumedSession = {}
    const retiredSession = {}
    const replayed = createTuiGoalPlanProjectionFrame(
      resumedSession, 12, goal('paused'), { active: true, pending: false },
    )
    expect(updateTuiGoalPlanProjectionFrame(
      replayed, retiredSession, 'goal', goal('active'), 13,
    )).toBe(replayed)
    expect(updateTuiGoalPlanProjectionFrame(
      replayed, resumedSession, 'plan', { active: false, pending: false }, 11,
    )).toBe(replayed)

    const changed = updateTuiGoalPlanProjectionFrame(
      replayed, resumedSession, 'goal', { ...goal('active'), roundsStarted: 4 }, 13,
    )
    expect(changed).toMatchObject({
      owner: resumedSession,
      asOfSeq: 13,
      goal: { goal: { phase: 'active' }, roundsStarted: 4 },
      plan: { active: true, pending: false },
    })

    const reconnectedSession = {}
    const reconnected = createTuiGoalPlanProjectionFrame(
      reconnectedSession, 20, undefined, { active: false, pending: false },
    )
    expect(reconnected).toMatchObject({ owner: reconnectedSession, asOfSeq: 20, goal: undefined })
    expect(updateTuiGoalPlanProjectionFrame(
      reconnected, resumedSession, 'goal', goal('blocked'), 21,
    )).toBe(reconnected)
  })

  it('maps owner conflicts and capability loss to stable bilingual guidance', () => {
    expect(tuiGoalPlanMutationErrorMessage({ code: 'GOAL_STALE_REVISION' }, 'en'))
      .toContain('draft is kept')
    expect(tuiGoalPlanMutationErrorMessage({ code: 'GOAL_NOT_FOUND' }, 'zh'))
      .toContain('草稿已保留')
    expect(tuiGoalPlanMutationErrorMessage({ code: 'GOAL_INVALID_TRANSITION' }, 'zh'))
      .toContain('当前阶段')
    expect(tuiGoalPlanMutationErrorMessage(new Error(
      'TUI Goal service is unavailable for this Agent mode',
    ), 'en')).toContain('unavailable')
    expect(tuiGoalPlanMutationErrorMessage(new Error('database details'), 'zh'))
      .toBe('Goal 或 Plan 操作失败，请刷新后重试。')
  })
})
