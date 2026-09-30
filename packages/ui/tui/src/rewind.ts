/** Pure human-boundary projection for native TUI Session rewind. */

import {
  isAppendSurfaceEvent, resolveSessionForkAnchor, type ContentBlock, type SessionEvent,
  type SessionIdType as SessionId,
} from './host.ts'
import { terminalSafe } from './sanitize.ts'

/** One completed human turn that can seed a rewound child Session. */
export interface TuiRewindCandidate {
  /** Append-origin human `user/message` seq used as the fork anchor. */
  readonly eventSeq: number
  /** Sanitized prompt text shown in the selector and confirmation. */
  readonly promptText: string
  /** Durable source events retained in the child seed. */
  readonly retainedEventCount: number
  /** Later durable source events that remain only in the parent. */
  readonly hiddenEventCount: number
}

/** Controller-owned selection or Agent-preparation state for one rewind request. */
export interface TuiRewindDialogSnapshot {
  /** Monotonic identity for one dialog activation. */
  readonly generation: number
  /** Command-audit settlement, selection, or child preparation phase. */
  readonly phase: 'opening' | 'browsing' | 'rewinding'
  /** Source Session whose durable events seed the child. */
  readonly currentSessionId: SessionId
  /** Newest-first completed human boundaries, present after audit settlement. */
  readonly candidates?: readonly TuiRewindCandidate[]
  /** Candidate currently preparing a child Agent. */
  readonly rewindingSeq?: number
  /** Latest preparation or switch failure while selection remains open. */
  readonly error?: string
}

/**
 * Project every safe append-origin human boundary from a durable Session log.
 * Open turns and model-only replacements are excluded; results are newest first.
 *
 * @param events - Complete current Session log after the rewind command audit settles.
 * @returns Detached candidates with retained and parent-only event counts.
 */
export function tuiRewindCandidates(events: readonly SessionEvent[]): TuiRewindCandidate[] {
  const candidates: TuiRewindCandidate[] = []
  for (const event of events) {
    if (event.type !== 'user/message'
      || !isAppendSurfaceEvent(event)
      || event.data.source.kind !== 'user') continue
    const anchor = resolveSessionForkAnchor(events, event.seq)
    if (anchor.kind === 'unavailable') continue
    candidates.push({
      eventSeq: event.seq,
      promptText: rewindPromptText(event.data.content),
      retainedEventCount: anchor.seedLength,
      hiddenEventCount: events.length - anchor.seedLength,
    })
  }
  return candidates.reverse()
}

function rewindPromptText(content: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' || block.type === 'reasoning') parts.push(block.text)
    else if (block.type === 'image') parts.push(`[image: ${block.attachment.name ?? block.attachment.attachmentId}]`)
    else if (block.type === 'file') parts.push(`[file: ${block.attachment.name}]`)
    else if (block.type === 'tool-call') parts.push(`${block.name} ${block.arguments}`)
    else if (block.type === 'tool-addition') parts.push(`[tool added: ${block.toolName}]`)
    else parts.push(`[tool removed: ${block.toolName}]`)
  }
  return terminalSafe(parts.filter(Boolean).join('\n')) || '(non-text prompt)'
}
