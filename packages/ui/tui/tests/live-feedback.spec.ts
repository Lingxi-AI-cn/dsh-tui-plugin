import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { projectTuiLatestSpeed, projectTuiSettledSpeed } from '../src/index.ts'

function events(values: readonly unknown[]): readonly SessionEvent[] {
  return values as readonly SessionEvent[]
}

describe('TUI live feedback', () => {
  it('marks open-stream speed as approximate and keeps a fixed trend', () => {
    const sample = projectTuiLatestSpeed(events([
      { type: 'step/start', seq: 0, time: 1_000, data: { turn: 1, step: 1 } },
    ]), 2_100, {
      attemptId: 'speed', revision: 1, turn: 1, step: 1, chunks: [
        { time: 1_100, chunk: { type: 'text-delta', index: 0, text: 'abcdefgh' } },
        { time: 1_600, chunk: { type: 'text-delta', index: 0, text: 'ijklmnop' } },
      ],
    })
    expect(sample).toMatchObject({ approximate: true, tokens: 4, elapsedMs: 1_000, tokensPerSecond: 4 })
    expect(sample?.trend).toHaveLength(6)
  })

  it('uses provider output tokens when the latest message settles', () => {
    const sample = projectTuiLatestSpeed(events([
      { type: 'step/start', seq: 0, time: 1_000, data: { turn: 2, step: 3 } },
      { type: 'assistant/message', seq: 2, time: 2_200, data: {
        turn: 2, step: 3, stream: [{ type: 'text-chunks', time0: 1_200, index: 0, dt: [], texts: ['short'] }], message: {}, usage: { inputTokens: 10, outputTokens: 25 },
      } },
    ]), 9_000)
    expect(sample).toMatchObject({ approximate: false, tokens: 25, elapsedMs: 1_000, tokensPerSecond: 25 })
  })

  it('falls back to the authoritative settled Session aggregate', () => {
    expect(projectTuiSettledSpeed({
      turns: 1, steps: 2, llmMs: 4_000, toolMs: 0,
      ttftMs: 500, ttftSteps: 2, decodeMs: 2_000, decodeTokens: 50,
    })).toEqual({ tokensPerSecond: 25, approximate: false, trend: '', tokens: 50, elapsedMs: 2_000 })
    expect(projectTuiSettledSpeed(undefined)).toBeUndefined()
  })
})
