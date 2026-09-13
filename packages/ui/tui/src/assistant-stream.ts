/** Process-local Assistant presentation state; never part of the durable Session log. */
import type { AssistantStreamFrame, TimedStreamChunk } from './host.ts'

/** One active attempt's ordered transient output. */
export interface TuiAssistantStream {
  readonly attemptId: string
  readonly revision: number
  readonly turn: number
  readonly step: number
  readonly chunks: readonly TimedStreamChunk[]
}

/**
 * Apply one owner frame, ignoring late or incomplete attempt sequences.
 * @param current - the current process-local attempt, if any.
 * @param frame - ordered frame published by the Agent owner.
 * @returns the next transient snapshot, cleared on settlement or abandonment.
 */
export function updateTuiAssistantStream(
  current: TuiAssistantStream | undefined,
  frame: AssistantStreamFrame,
): TuiAssistantStream | undefined {
  if (frame.type === 'start') {
    if (current !== undefined && frame.revision <= current.revision) return current
    return Object.freeze({
      attemptId: String(frame.attemptId), revision: frame.revision,
      turn: frame.turn, step: frame.step, chunks: Object.freeze([]),
    })
  }
  if (current === undefined || current.attemptId !== frame.attemptId || frame.revision <= current.revision) return current
  if (frame.type === 'end') return undefined
  if (frame.index !== current.chunks.length) return current
  return Object.freeze({
    ...current, revision: frame.revision,
    chunks: Object.freeze([...current.chunks, Object.freeze({ time: frame.time, chunk: frame.chunk })]),
  })
}
