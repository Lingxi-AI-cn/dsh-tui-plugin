/** Terminal Trajectory ledger projection from Session events. */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { ToolCallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  createTuiTrajectoryTimelineScale,
  formatTuiTrajectoryTimeline,
  projectTuiTrajectory,
  reconcileTuiTrajectorySelection,
  TuiTrajectoryProjectionCache,
  formatTrajectoryDuration,
  trajectoryKindLabel,
  trajectoryTimingFacts,
  visibleTuiTrajectoryEntries,
} from '../src/trajectory.ts'

let nextSeq = 1
function event(type: string, time: number, data: unknown): SessionEvent {
  return { type, seq: nextSeq++, time, data } as unknown as SessionEvent
}

function resetSeq(): void { nextSeq = 1 }

describe('native TUI Terminal Trajectory', () => {
  it('projects turn/step/user/assistant/tool events into a structured ledger', () => {
    resetSeq()
    const events = [
      event('turn/start', 1000, { turn: 1 }),
      event('step/start', 1010, { turn: 1, step: 1 }),
      event('user/message', 1020, {
        ...createUserMessage({ content: [{ type: 'text', text: 'Hello agent' }], source: { kind: 'user' } }),
      }),
      event('tool/call', 1100, {
        turn: 1, step: 1, callId: ToolCallId('c1'), name: 'read_file',
        arguments: '{"path":"README.md"}',
      }),
      event('tool/result', 1200, {
        turn: 1, step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('c1'), content: [{ type: 'text', text: 'file content here' }], isError: false,
        }),
      }),
      event('assistant/message', 1300, {
        turn: 1, step: 1,
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'I read the file.' }], source: { provider: 'test', model: 'test' },
        }),
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
      event('step/end', 1400, { turn: 1, step: 1 }),
      event('turn/end', 1500, { turn: 1, reason: { kind: 'completed' } }),
    ]
    const snapshot = projectTuiTrajectory(events)

    expect(snapshot.turnCount).toBe(1)
    expect(snapshot.stepCount).toBe(1)
    expect(snapshot.totalEvents).toBe(8)
    expect(snapshot.omitted).toBe(0)
    expect(snapshot.entries).toHaveLength(8)

    const turn = snapshot.entries[0]!
    expect(turn.kind).toBe('turn')
    expect(turn.turn).toBe(1)

    const step = snapshot.entries[1]!
    expect(step.kind).toBe('step')
    expect(step.turn).toBe(1)
    expect(step.step).toBe(1)

    const user = snapshot.entries[2]!
    expect(user.kind).toBe('user')
    expect(user.label).toBe('Hello agent')

    const toolCall = snapshot.entries[3]!
    expect(toolCall.kind).toBe('tool-call')
    expect(toolCall.label).toBe('read_file')

    const toolResult = snapshot.entries[4]!
    expect(toolResult.kind).toBe('tool-result')
    expect(toolResult.label).toBe('file content here')
    expect(toolResult.durationMs).toBe(100)

    const assistant = snapshot.entries[5]!
    expect(assistant.kind).toBe('assistant')
    expect(assistant.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    expect(assistant.durationMs).toBe(290)
    expect(assistant.timing).not.toHaveProperty('llmMs')
    expect(assistant.timing).not.toHaveProperty('ttftMs')

    const stepEnd = snapshot.entries[6]!
    expect(stepEnd.kind).toBe('step')
    expect(stepEnd.durationMs).toBe(390)

    const turnEnd = snapshot.entries[7]!
    expect(turnEnd.kind).toBe('turn')
    expect(turnEnd.detail).toBe('completed')
    expect(turnEnd.durationMs).toBe(500)
  })

  it('handles interrupted assistant messages', () => {
    resetSeq()
    const events = [
      event('turn/start', 1000, { turn: 1 }),
      event('step/start', 1010, { turn: 1, step: 1 }),
      event('assistant/message', 1100, {
        turn: 1, step: 1,
        message: { content: [{ type: 'text', text: 'partial...' }] },
        interrupted: true,
      }),
      event('step/end', 1200, { turn: 1, step: 1 }),
      event('turn/end', 1300, { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }),
    ]
    const snapshot = projectTuiTrajectory(events)
    const assistant = snapshot.entries.find(e => e.kind === 'assistant')!
    expect(assistant.interrupted).toBe(true)
  })

  it('projects compaction events', () => {
    resetSeq()
    const events = [
      event('compaction/start', 5000, { compactionId: 'compact-1', turn: null }),
      event('compaction/summary', 5100, {
        compactionId: 'compact-1', summary: [{ type: 'text', text: 'condensed' }],
        shadowedRange: { start: 1, end: 8 }, shadowedSeqs: [1, 4, 8], shadowedTokenCount: 90,
        provider: 'test', model: 'compact-model',
      }),
      event('compaction/end', 5200, { compactionId: 'compact-1', turn: null }),
    ]
    const snapshot = projectTuiTrajectory(events)
    expect(snapshot.entries).toHaveLength(3)
    expect(snapshot.entries[0]!.kind).toBe('compaction')
    expect(snapshot.entries[0]!.label).toBe('compaction start')
    expect(snapshot.entries[1]).toMatchObject({ output: 'condensed' })
    expect(snapshot.entries[1]?.detail).toContain('~90 tokens')
    expect(snapshot.entries[2]).toMatchObject({ durationMs: 200, boundary: 'end' })
  })

  it('bounds ledger entries and reports omitted count', () => {
    resetSeq()
    const events = Array.from({ length: 20 }, (_, i) =>
      event('turn/start', 1000 + i * 100, { turn: i + 1 }),
    )
    const snapshot = projectTuiTrajectory(events, 5)
    expect(snapshot.entries).toHaveLength(5)
    expect(snapshot.omitted).toBe(15)
    expect(snapshot.entries[0]!.turn).toBe(16)
    expect(snapshot.entries[4]!.turn).toBe(20)
  })

  it('handles empty event log', () => {
    resetSeq()
    const snapshot = projectTuiTrajectory([])
    expect(snapshot.entries).toHaveLength(0)
    expect(snapshot.turnCount).toBe(0)
    expect(snapshot.stepCount).toBe(0)
  })

  it('skips non-structural events like chunks and request headers', () => {
    resetSeq()
    const events = [
      event('turn/start', 1000, { turn: 1 }),
      event('step/start', 1010, { turn: 1, step: 1 }),
      event('assistant/chunk', 1050, { turn: 1, step: 1, chunk: { text: 'hi' } }),
      event('request/header', 1060, { header: {}, reason: 'initial' }),
      event('session/title', 1070, { title: 'Test' }),
      event('step/end', 1100, { turn: 1, step: 1 }),
      event('turn/end', 1200, { turn: 1, reason: { kind: 'completed' } }),
    ]
    const snapshot = projectTuiTrajectory(events)
    expect(snapshot.entries.some(e => (e as { kind: string }).kind === 'chunk')).toBe(false)
    expect(snapshot.entries).toHaveLength(4)
  })

  it('records tool call error facts', () => {
    resetSeq()
    const events = [
      event('turn/start', 1000, { turn: 1 }),
      event('step/start', 1010, { turn: 1, step: 1 }),
      event('tool/call', 1100, { turn: 1, step: 1, callId: ToolCallId('c1'), name: 'exec', arguments: '{}' }),
      event('tool/result', 1200, {
        turn: 1, step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('c1'), content: [{ type: 'text', text: 'failed' }], isError: true,
        }),
        error: { name: 'ToolError', code: 'EXEC_FAILED' },
      }),
    ]
    const snapshot = projectTuiTrajectory(events)
    const result = snapshot.entries.find(e => e.kind === 'tool-result')!
    expect(result.error).toEqual({ name: 'ToolError', code: 'EXEC_FAILED' })
    expect(result.durationMs).toBe(100)
  })
})

describe('trajectory display helpers', () => {
  it('formats durations correctly', () => {
    expect(formatTrajectoryDuration(undefined)).toBe('—')
    expect(formatTrajectoryDuration(50)).toBe('50ms')
    expect(formatTrajectoryDuration(1500)).toBe('1.5s')
    expect(formatTrajectoryDuration(65000)).toBe('1m5s')
  })

  it('provides kind labels in English and Chinese', () => {
    expect(trajectoryKindLabel('turn', 'en')).toBe('Turn')
    expect(trajectoryKindLabel('turn', 'zh')).toBe('轮次')
    expect(trajectoryKindLabel('tool-call', 'en')).toBe('Tool Call')
    expect(trajectoryKindLabel('tool-result', 'zh')).toBe('工具结果')
  })

  it('computes timing facts for a selected entry', () => {
    resetSeq()
    const events = [
      event('turn/start', 1000, { turn: 1 }),
      event('step/start', 1010, { turn: 1, step: 1 }),
      event('step/end', 1400, { turn: 1, step: 1 }),
    ]
    const snapshot = projectTuiTrajectory(events)
    const facts = trajectoryTimingFacts(snapshot.entries, 2)
    expect(facts.startTime).toBe(1010)
    expect(facts.endTime).toBe(1400)
    expect(facts.durationMs).toBe(390)

    expect(trajectoryTimingFacts(snapshot.entries, 999)).toEqual({})
  })

  it('renders recorded durations as spans and unknown durations as markers', () => {
    const entries = [
      { key: 'instant', kind: 'user' as const, seq: 1, time: 1_000, depth: 0, label: 'instant' },
      {
        key: 'span', kind: 'tool-result' as const, seq: 2, time: 2_000, depth: 0,
        label: 'span', durationMs: 500,
      },
    ]
    const scale = createTuiTrajectoryTimelineScale(entries, 10)
    const instant = formatTuiTrajectoryTimeline(entries[0]!, scale)
    const span = formatTuiTrajectoryTimeline(entries[1]!, scale)
    expect(instant).toHaveLength(10)
    expect(instant).toContain('│')
    expect(instant).not.toContain('━')
    expect(span).toContain('━')
  })

  it('keeps group, call, and result hierarchy with stable identities', () => {
    resetSeq()
    const callId = ToolCallId('nested-call')
    const snapshot = projectTuiTrajectory([
      event('turn/start', 1_000, { turn: 1 }),
      event('step/start', 1_010, { turn: 1, step: 1 }),
      event('tool/execution-group', 1_020, {
        turn: 1, step: 1, group: 0, mode: 'parallel',
        members: [{ callId, name: 'read', arguments: '{}' }], closed: false,
      }),
      event('tool/call', 1_030, { turn: 1, step: 1, callId, name: 'read', arguments: '{}' }),
      event('tool/result', 1_080, {
        turn: 1, step: 1,
        message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'ok' }], isError: false }),
      }),
      event('tool/execution-group', 1_090, {
        turn: 1, step: 1, group: 0, mode: 'parallel',
        members: [{ callId, name: 'read', arguments: '{}' }], closed: true,
      }),
    ])
    const group = snapshot.entries.find(entry => entry.kind === 'tool-group' && entry.boundary === 'start')!
    const groupEnd = snapshot.entries.find(entry => entry.kind === 'tool-group' && entry.boundary === 'end')!
    const call = snapshot.entries.find(entry => entry.kind === 'tool-call')!
    const result = snapshot.entries.find(entry => entry.kind === 'tool-result')!
    expect(group.depth).toBe(2)
    expect(groupEnd.durationMs).toBe(70)
    expect(call).toMatchObject({ callId: 'nested-call', depth: 3 })
    expect(call.parentKey).toContain('group:1:1:0')
    expect(result).toMatchObject({ callId: 'nested-call', depth: 4 })
    expect(call.key).toBe('tool-call:nested-call')
    expect(result.parentKey).toBe(call.key)
  })

  it('searches loaded facts and folds turn and step descendants', () => {
    resetSeq()
    const snapshot = projectTuiTrajectory([
      event('turn/start', 1_000, { turn: 1 }),
      event('step/start', 1_010, { turn: 1, step: 1 }),
      event('tool/call', 1_030, {
        turn: 1, step: 1, callId: ToolCallId('needle'), name: 'read_file', arguments: '{"path":"README.md"}',
      }),
      event('step/end', 1_100, { turn: 1, step: 1 }),
      event('turn/end', 1_200, { turn: 1, reason: { kind: 'completed' } }),
    ])
    expect(visibleTuiTrajectoryEntries(snapshot.entries, 'README')).toHaveLength(1)
    expect(visibleTuiTrajectoryEntries(snapshot.entries, '', new Set([1])).every(entry => entry.kind === 'turn')).toBe(true)
    expect(visibleTuiTrajectoryEntries(snapshot.entries, '', new Set(), new Set(['1:1']))
      .some(entry => entry.kind === 'tool-call')).toBe(false)
  })

  it('increments an append-only projection and preserves selection across older-page prepend', () => {
    resetSeq()
    const events = Array.from({ length: 5 }, (_, index) =>
      event('turn/start', index, { turn: index + 1 }))
    const cache = new TuiTrajectoryProjectionCache()
    const tail = cache.update(events, 2)
    expect(tail.entries.map(entry => entry.turn)).toEqual([4, 5])

    const older = cache.update(events, 5)
    expect(older.entries.map(entry => entry.turn)).toEqual([1, 2, 3, 4, 5])
    expect(reconcileTuiTrajectorySelection(tail.entries, older.entries, 0, false)).toBe(3)

    const appendedEvents = [...events, event('turn/start', 6, { turn: 6 })]
    const appended = cache.update(appendedEvents, 6)
    expect(reconcileTuiTrajectorySelection(older.entries, appended.entries, 3, false)).toBe(3)
    expect(reconcileTuiTrajectorySelection(older.entries, appended.entries, 3, true)).toBe(5)
  })

  it('bounds inspector payloads by UTF-8 bytes', () => {
    resetSeq()
    const callId = ToolCallId('large')
    const snapshot = projectTuiTrajectory([
      event('tool/call', 1, { turn: 1, step: 1, callId, name: 'large', arguments: '密'.repeat(20_000) }),
      event('tool/result', 2, {
        turn: 1, step: 1,
        message: createToolResultMessage({
          callId, content: [{ type: 'text', text: '结'.repeat(20_000) }], isError: false,
        }),
      }),
    ])
    const call = snapshot.entries.find(entry => entry.kind === 'tool-call')
    const result = snapshot.entries.find(entry => entry.kind === 'tool-result')
    expect(Buffer.byteLength(call?.input ?? '', 'utf8')).toBeLessThanOrEqual(16 * 1024)
    expect(Buffer.byteLength(result?.output ?? '', 'utf8')).toBeLessThanOrEqual(16 * 1024)
    expect(call?.input).toMatch(/…$/u)
    expect(result?.output).toMatch(/…$/u)
  })
})
