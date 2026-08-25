/** TUI message feedback projection for assistant messages. */

import type {
  MessageId, SessionIdType as SessionId,
  MessageFeedbackRating,
  MessageFeedbackVersion,
  MessageFeedbackListResult,
  MessageFeedbackPutResult,
  MessageFeedbackDeleteResult,
} from './host.ts'
import type { TuiLocale } from './locale.ts'
import { tuiMessage } from './locale.ts'

/** Compact feedback state for one assistant message shown in the transcript. */
export interface TuiMessageFeedbackEntry {
  readonly messageId: MessageId
  readonly rating: MessageFeedbackRating
  readonly note?: string
  readonly version: MessageFeedbackVersion
}

/** Snapshot of feedback items for the active Session. */
export interface TuiMessageFeedbackSnapshot {
  readonly sessionId: SessionId
  readonly items: readonly TuiMessageFeedbackEntry[]
}

/** Current mutation state for the feedback UI. */
export type TuiMessageFeedbackMutationState =
  | { readonly status: 'idle' }
  | {
    readonly status: 'pending' | 'success' | 'error'
    readonly sessionId: SessionId
    readonly targetMessageId: MessageId
    readonly errorCode?: string
  }

/** Options for the feedback owner (ctx.messageFeedback). */
export interface TuiMessageFeedbackOwner {
  list(request: { sessionId: SessionId }): Promise<MessageFeedbackListResult>
  put(request: {
    sessionId: SessionId
    messageId: MessageId
    rating: MessageFeedbackRating
    note?: string
    ifVersion: MessageFeedbackVersion | null
  }): Promise<MessageFeedbackPutResult>
  delete(request: {
    sessionId: SessionId
    messageId: MessageId
    ifVersion: MessageFeedbackVersion
  }): Promise<MessageFeedbackDeleteResult>
}

/** Project the list result into a TUI-ready snapshot. */
export function projectMessageFeedback(
  sessionId: SessionId,
  result: MessageFeedbackListResult,
): TuiMessageFeedbackSnapshot {
  if (!result.ok) return { sessionId, items: [] }
  return {
    sessionId,
    items: result.value.items.map(item => ({
      messageId: item.messageId,
      rating: item.rating,
      ...(item.note !== undefined ? { note: item.note } : {}),
      version: item.version,
    })),
  }
}

/** Find the feedback entry for a specific message. */
export function findMessageFeedback(
  snapshot: TuiMessageFeedbackSnapshot | undefined,
  messageId: MessageId | string,
): TuiMessageFeedbackEntry | undefined {
  return snapshot?.items.find(item => item.messageId === messageId)
}

/** Format the feedback rating for display. */
export function feedbackRatingLabel(
  rating: MessageFeedbackRating | undefined,
  locale: TuiLocale,
): string {
  if (rating === 'positive') return tuiMessage(locale, 'feedback.positive')
  if (rating === 'negative') return tuiMessage(locale, 'feedback.negative')
  return tuiMessage(locale, 'feedback.none')
}

/** Format the feedback badge for inline transcript display. */
export function feedbackBadge(
  entry: TuiMessageFeedbackEntry | undefined,
): string {
  if (entry === undefined) return ''
  return entry.rating === 'positive' ? ' [+]' : ' [-]'
}

/** Convert one stable owner error code into actionable localized guidance. */
export function tuiMessageFeedbackErrorMessage(errorCode: string | undefined, locale: TuiLocale): string {
  switch (errorCode) {
    case 'owner-unavailable': return tuiMessage(locale, 'feedback.error.unavailable')
    case 'version-conflict': return tuiMessage(locale, 'feedback.error.conflict')
    case 'target-not-found': return tuiMessage(locale, 'feedback.error.target')
    case 'session-not-found': return tuiMessage(locale, 'feedback.error.session')
    case 'note-blank': return tuiMessage(locale, 'feedback.error.noteBlank')
    case 'note-too-large': return tuiMessage(locale, 'feedback.error.noteTooLarge')
    default: return tuiMessage(locale, 'feedback.error.unknown')
  }
}

/** Process a put result into a mutation state. */
export function processPutResult(
  result: MessageFeedbackPutResult,
  sessionId: SessionId,
  messageId: MessageId,
): TuiMessageFeedbackMutationState {
  if (result.ok) return { status: 'success', sessionId, targetMessageId: messageId }
  return { status: 'error', sessionId, targetMessageId: messageId, errorCode: result.error.code }
}

/** Process a delete result into a mutation state. */
export function processDeleteResult(
  result: MessageFeedbackDeleteResult,
  sessionId: SessionId,
  messageId: MessageId,
): TuiMessageFeedbackMutationState {
  if (result.ok) return { status: 'success', sessionId, targetMessageId: messageId }
  return { status: 'error', sessionId, targetMessageId: messageId, errorCode: result.error.code }
}
