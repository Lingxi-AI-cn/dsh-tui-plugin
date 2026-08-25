/** Pure durable Goal/Plan projection for the terminal status surface. */

import type { TuiGoalProjection, TuiPlanProjection } from './host.ts'
import { type TuiLocale, tuiMessage } from './locale.ts'

/** Session-owned Goal/Plan values at one durable projection watermark. */
export interface TuiGoalPlanProjectionFrame<Owner = unknown> {
  readonly owner: Owner
  readonly asOfSeq: number
  readonly goal: TuiGoalProjection | null | undefined
  readonly plan: TuiPlanProjection | undefined
}

/**
 * Replace all Goal/Plan values from one authoritative replay/switch snapshot.
 * @param owner - Session identity token owning this frame.
 * @param asOfSeq - durable projection watermark.
 * @param goal - complete Goal projection at the watermark.
 * @param plan - complete Plan projection at the watermark.
 * @returns a new authoritative projection frame.
 */
export function createTuiGoalPlanProjectionFrame<Owner>(
  owner: Owner,
  asOfSeq: number,
  goal: TuiGoalProjection | null | undefined,
  plan: TuiPlanProjection | undefined,
): TuiGoalPlanProjectionFrame<Owner> {
  return { owner, asOfSeq, goal, plan }
}

/**
 * Apply one owner change only when it belongs to the current Session and is not stale.
 * @param frame - current projection frame.
 * @param owner - Session identity carried by the change.
 * @param key - projection domain changed by the owner.
 * @param value - latest Goal or Plan value.
 * @param seq - durable change watermark.
 * @returns the original frame for foreign/stale changes, otherwise an updated frame.
 */
export function updateTuiGoalPlanProjectionFrame<Owner>(
  frame: TuiGoalPlanProjectionFrame<Owner>,
  owner: Owner,
  key: 'goal' | 'plan',
  value: TuiGoalProjection | TuiPlanProjection | null,
  seq: number,
): TuiGoalPlanProjectionFrame<Owner> {
  if (owner !== frame.owner || seq < frame.asOfSeq) return frame
  return key === 'goal'
    ? { ...frame, asOfSeq: seq, goal: value as TuiGoalProjection | null }
    : { ...frame, asOfSeq: seq, plan: value as TuiPlanProjection }
}

/**
 * Map owner errors to stable, localized user actions without exposing implementation details.
 * @param error - owner failure caught by the terminal controller.
 * @param locale - selected first-party locale.
 * @returns localized stable remediation text.
 */
export function tuiGoalPlanMutationErrorMessage(
  error: unknown,
  locale: TuiLocale = 'en',
): string {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : undefined
  const code = typeof record?.['code'] === 'string' ? record['code'] : undefined
  if (code === 'GOAL_STALE_REVISION' || code === 'GOAL_NOT_FOUND') {
    return tuiMessage(locale, 'goalPlan.error.conflict')
  }
  if (code === 'GOAL_AGENT_NOT_LIVE') return tuiMessage(locale, 'goalPlan.error.sessionChanged')
  if (code === 'GOAL_INVALID_TRANSITION') return tuiMessage(locale, 'goalPlan.error.transition')
  const message = typeof record?.['message'] === 'string' ? record['message'] : ''
  if (message.includes('Goal service is unavailable')) return tuiMessage(locale, 'goalPlan.error.unavailable')
  return tuiMessage(locale, 'goalPlan.error.failed')
}

/** Host-derived state rendered by the compact strip and control dialog. */
export interface TuiGoalPlanSurface {
  readonly goal?: TuiGoalProjection['goal'] | undefined
  readonly roundsStarted?: number | undefined
  readonly plan?: {
    readonly active: boolean
    readonly pending: boolean
    readonly effective: boolean
  } | undefined
}

/**
 * Fold the owner projection's pending toggle into its effective target.
 * @param plan - latest owner Plan projection.
 * @returns effective active target after a pending transition.
 */
export function effectiveTuiPlanTarget(plan: TuiPlanProjection): boolean {
  return plan.pending ? !plan.active : plan.active
}

/**
 * Omit completed Goals and inactive settled Plan mode so no terminal row is consumed.
 * @param goal - latest Goal projection.
 * @param plan - latest Plan projection.
 * @returns visible compact surface, or undefined when neither domain needs a row.
 */
export function projectTuiGoalPlan(
  goal: TuiGoalProjection | null | undefined,
  plan: TuiPlanProjection | undefined,
): TuiGoalPlanSurface | undefined {
  const visibleGoal = goal?.goal.phase === 'complete' ? undefined : goal?.goal
  const effectivePlan = plan === undefined ? undefined : effectiveTuiPlanTarget(plan)
  if (visibleGoal === undefined && effectivePlan !== true) return undefined
  return {
    ...visibleGoal === undefined ? {} : { goal: visibleGoal, roundsStarted: goal?.roundsStarted },
    ...plan === undefined ? {} : { plan: { ...plan, effective: effectiveTuiPlanTarget(plan) } },
  }
}
