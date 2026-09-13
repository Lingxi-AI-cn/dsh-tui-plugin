import { describe, expect, it } from 'vitest'
import { createAssistantMessage, LlmAttemptId } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionEventStore } from '../src/store.ts'
import { foldTranscript, projectTuiAssistantStream } from '../src/transcript.ts'
import { projectTuiLatestSpeed } from '../src/live-feedback.ts'

const attemptId = LlmAttemptId('stream-attempt')
function start(store: SessionEventStore, revision = 1): void {
  store.acceptStream({ type: 'start', attemptId, revision, turn: 1, step: 1 })
}

describe('Agent-owned transient TUI output', () => {
  it('displays live output without adding Session records and replaces it with one committed message', () => {
    const store = new SessionEventStore([])
    const durable = store.getSnapshot()
    start(store)
    store.acceptStream({ type: 'chunk', attemptId, revision: 2, index: 0, time: 100,
      chunk: { type: 'text-delta', index: 0, text: 'partial' } })
    expect(store.getSnapshot()).toBe(durable)
    expect(projectTuiAssistantStream(store.stream.getSnapshot())).toMatchObject([{ text: 'partial' }])
    const committed: SessionEvent = { type: 'assistant/message', seq: SessionSeq(0), time: 300,
      surfaceOp: 'append', data: { turn: 1, step: 1,
        stream: [{ type: 'text-chunks', time0: 100, index: 0, dt: [], texts: ['partial'] }],
        message: createAssistantMessage({ content: [{ type: 'text', text: 'complete' }], source: { provider: 'p', model: 'm' } }),
      } }
    store.append(committed)
    expect(store.stream.getSnapshot()).toBeUndefined()
    store.acceptStream({ type: 'end', attemptId, revision: 3, index: 1,
      outcome: { kind: 'committed', eventType: 'assistant/message', seq: committed.seq } })
    expect(foldTranscript(store.getSnapshot())).toMatchObject([{ text: 'complete' }])
    expect(durable).toEqual([])
  })

  it('clears abandoned output and isolates a retry from late frames', () => {
    const store = new SessionEventStore([])
    start(store)
    store.acceptStream({ type: 'chunk', attemptId, revision: 2, index: 0, time: 100,
      chunk: { type: 'reasoning-delta', index: 0, text: 'old reasoning' } })
    store.acceptStream({ type: 'end', attemptId, revision: 3, index: 1, outcome: { kind: 'abandoned' } })
    expect(projectTuiAssistantStream(store.stream.getSnapshot())).toEqual([])
    start(store, 4)
    store.acceptStream({ type: 'chunk', attemptId, revision: 1, index: 1, time: 110,
      chunk: { type: 'text-delta', index: 1, text: 'late' } })
    store.acceptStream({ type: 'chunk', attemptId, revision: 5, index: 0, time: 120,
      chunk: { type: 'text-delta', index: 0, text: 'retry' } })
    expect(projectTuiAssistantStream(store.stream.getSnapshot())).toMatchObject([{ text: 'retry' }])
    expect(store.getSnapshot()).toEqual([])
  })

  it('clears a no-surface settlement without inventing a human transcript message', () => {
    const store = new SessionEventStore([])
    start(store)
    store.append({ type: 'assistant/attempt', seq: SessionSeq(0), time: 200,
      data: { turn: 1, step: 1, stream: [] } })
    expect(store.stream.getSnapshot()).toBeUndefined()
    expect(foldTranscript(store.getSnapshot())).toEqual([])
  })

  it('uses transient chunks for live speed and the embedded stream for settled speed', () => {
    const store = new SessionEventStore([{ type: 'step/start', seq: SessionSeq(0), time: 1, data: { turn: 1, step: 1 } }])
    start(store)
    store.acceptStream({ type: 'chunk', attemptId, revision: 2, index: 0, time: 100,
      chunk: { type: 'text-delta', index: 0, text: 'abcdefgh' } })
    expect(projectTuiLatestSpeed(store.getSnapshot(), 1_100, store.stream.getSnapshot()))
      .toMatchObject({ tokens: 2, approximate: true, elapsedMs: 1_000 })
    store.append({ type: 'assistant/message', seq: SessionSeq(1), time: 1_100, surfaceOp: 'append', data: {
      turn: 1, step: 1, stream: [{ type: 'text-chunks', time0: 100, index: 0, dt: [], texts: ['abcdefgh'] }],
      message: createAssistantMessage({ content: [{ type: 'text', text: 'abcdefgh' }], source: { provider: 'p', model: 'm' } }),
      usage: { inputTokens: 1, outputTokens: 4, totalTokens: 5 },
    } })
    expect(projectTuiLatestSpeed(store.getSnapshot())).toMatchObject({ tokens: 4, approximate: false, elapsedMs: 1_000 })
  })
})
