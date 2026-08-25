/** Terminal-native projection of the Host file/session reference owners. */

import {
  activeAtToken,
  formatFileMention,
  formatSessionReferenceMention,
  type FileReferenceCandidate,
  type TuiSessionReferenceCandidate,
} from './host.ts'
import { type TuiLocale, tuiMessage } from './locale.ts'
import { formatTuiRelativeTime } from './resume.ts'
import type { TuiSuggestionItem, TuiSuggestionState } from './suggestion.ts'

/** Active provider-neutral `@` query under the composer cursor. */
export interface TuiReferenceQuery {
  readonly queryStart: number
  readonly queryEnd: number
  readonly query: string
  readonly quoted: boolean
}

/** Detached result from both reference owners for one exact query generation. */
export interface TuiReferenceResolution {
  readonly files: readonly FileReferenceCandidate[]
  readonly sessions: readonly TuiSessionReferenceCandidate[]
  readonly errors: readonly ('file' | 'session')[]
}

/** Provider calls used by one cancellable unified query generation. */
export interface TuiReferenceProviders {
  readonly files: (query: string, signal: AbortSignal) => Promise<readonly FileReferenceCandidate[]>
  readonly sessions: (query: string, signal: AbortSignal) => Promise<readonly TuiSessionReferenceCandidate[]>
}

/**
 * Settle independent providers without letting one failure hide the other.
 * @param query - exact active token query.
 * @param providers - Host file and Session reference providers.
 * @param signal - query-generation cancellation boundary.
 * @returns detached successful rows plus failed provider kinds.
 */
export async function collectTuiReferenceResolution(
  query: string,
  providers: TuiReferenceProviders,
  signal: AbortSignal,
): Promise<TuiReferenceResolution> {
  const [files, sessions] = await Promise.allSettled([
    Promise.resolve().then(() => providers.files(query, signal)),
    Promise.resolve().then(() => providers.sessions(query, signal)),
  ])
  signal.throwIfAborted()
  return {
    files: files.status === 'fulfilled' ? files.value : [],
    sessions: sessions.status === 'fulfilled' ? sessions.value : [],
    errors: [
      ...files.status === 'rejected' ? ['file' as const] : [],
      ...sessions.status === 'rejected' ? ['session' as const] : [],
    ],
  }
}

/**
 * Validate canonical Session mentions before admission while preserving the exact user-authored text.
 * Referenced content remains owner-prepared at `agent/pre-step`; the TUI never copies it into the durable message.
 * @param text - complete composer text.
 * @param validate - Host metadata-only validation call.
 * @param signal - admission cancellation boundary.
 * @returns the exact input text after successful validation.
 */
export async function preflightTuiReferenceText(
  text: string,
  validate: (text: string, signal: AbortSignal) => Promise<unknown>,
  signal: AbortSignal,
): Promise<string> {
  if (!text.includes('dsh-session:')) return text
  await validate(text, signal)
  signal.throwIfAborted()
  return text
}

/**
 * Find one `@file`/`@session` query on the current line, including mid-token edits.
 * @param text - complete composer text.
 * @param cursor - UTF-16 insertion offset.
 * @returns active bounded query, or undefined outside a reference token.
 */
export function tuiReferenceQuery(text: string, cursor: number): TuiReferenceQuery | undefined {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > text.length) return undefined
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const nextLine = text.indexOf('\n', cursor)
  const lineEnd = nextLine < 0 ? text.length : nextLine
  const line = text.slice(lineStart, lineEnd)
  const column = cursor - lineStart
  const token = activeAtToken(line, column)
  if (token === undefined || (!token.quoted && token.query.startsWith('['))) return undefined
  const queryStart = cursor - token.prefix.length
  let queryEnd = cursor
  if (token.quoted) {
    const close = text.indexOf('"', cursor)
    queryEnd = close >= cursor && close < lineEnd ? close + 1 : lineEnd
  } else {
    while (queryEnd < lineEnd && !/\s/u.test(text[queryEnd] ?? '')) queryEnd += 1
  }
  return { queryStart, queryEnd, query: token.query, quoted: token.quoted }
}

/**
 * Merge bounded owner results into one explicitly typed completion list.
 * @param query - active composer reference token.
 * @param resolution - settled owner rows, or undefined while loading.
 * @param locale - selected first-party locale.
 * @param now - comparison time for Session activity labels.
 * @returns a bounded typed suggestion state.
 */
export function tuiReferenceSuggestionState(
  query: TuiReferenceQuery,
  resolution: TuiReferenceResolution | undefined,
  locale: TuiLocale = 'en',
  now: number = Date.now(),
): TuiSuggestionState {
  const fileLimit = 12
  const sessionLimit = 12
  const files = resolution?.files.slice(0, fileLimit) ?? []
  const sessions = resolution?.sessions.slice(0, sessionLimit) ?? []
  const fileItems = files.map((candidate): TuiSuggestionItem => {
    const mention = formatFileMention(candidate, query.quoted)
    return {
      id: `reference:file:${candidate.kind}:${candidate.path}`,
      insertText: mention === undefined ? '' : `${mention}${candidate.kind === 'file' ? ' ' : ''}`,
      label: `F  ${mention ?? `@${candidate.path}`}`,
      description: tuiMessage(locale, candidate.kind === 'directory'
        ? 'suggestion.reference.directory' : 'suggestion.reference.file'),
      source: 'file',
      referenceKind: candidate.kind,
      referencePath: candidate.path,
      ...mention === undefined ? { disabledReason: tuiMessage(locale, 'suggestion.reference.invalidPath') } : {},
    }
  })
  const sessionItems = sessions.map((candidate): TuiSuggestionItem => ({
    id: `reference:session:${candidate.sessionId}`,
    insertText: `${formatSessionReferenceMention({ sessionId: candidate.sessionId, label: candidate.label })} `,
    label: `S  @${candidate.label}`,
    description: tuiMessage(locale, 'suggestion.reference.session'),
    detail: `${candidate.cwd ?? tuiMessage(locale, 'resume.workspace.none')} · ${formatTuiRelativeTime(candidate.updatedAt, now)}`,
    source: 'session',
    referenceKind: 'session',
    referenceId: candidate.sessionId,
  }))
  const items = [...fileItems, ...sessionItems]
  const truncated = resolution !== undefined
    && (resolution.files.length > fileLimit || resolution.sessions.length > sessionLimit)
  const errors = resolution?.errors ?? []
  return {
    kind: 'reference',
    queryStart: query.queryStart,
    queryEnd: query.queryEnd,
    selectedIndex: 0,
    visibleStart: 0,
    items,
    status: resolution === undefined
      ? 'loading'
      : errors.length > 0 && items.length === 0
        ? 'error'
        : truncated ? 'truncated' : items.length === 0 ? 'empty' : 'ready',
    ...errors.length === 0 ? {} : {
      error: tuiMessage(locale, errors.length === 2
        ? 'suggestion.reference.error.all'
        : errors[0] === 'file' ? 'suggestion.reference.error.file' : 'suggestion.reference.error.session'),
    },
  }
}
