/** Pure completion state shared by command and workspace-path suggestions. */

import type { CommandDescriptor, FsPathCompletionResult } from './host.ts'

/** Origin of one TUI completion candidate. */
export type TuiSuggestionKind = 'command' | 'path'

/** Resolution state for a bounded TUI completion query. */
export type TuiSuggestionStatus = 'ready' | 'loading' | 'empty' | 'truncated'

/** One insertable item supplied by a TUI completion source. */
export interface TuiSuggestionItem {
  /** Stable identity within the source. */
  id: string
  /** Text that replaces the active query range when accepted. */
  insertText: string
  /** Primary text displayed in the completion list. */
  label: string
  /** Concise explanation displayed beside the label. */
  description: string
  /** Optional secondary information such as an argument hint. */
  detail?: string | undefined
  /** Source that produced this item. */
  source: TuiSuggestionKind
}

/** Complete local state for one active TUI completion query. */
export interface TuiSuggestionState {
  /** Source that owns the active query. */
  kind: TuiSuggestionKind
  /** Inclusive UTF-16 offset replaced on acceptance. */
  queryStart: number
  /** Exclusive UTF-16 offset replaced on acceptance. */
  queryEnd: number
  /** Selected item index in the complete result. */
  selectedIndex: number
  /** First item mounted by the bounded list renderer. */
  visibleStart: number
  /** Complete bounded result supplied by the source. */
  items: readonly TuiSuggestionItem[]
  /** Query resolution state shown when candidates are unavailable or incomplete. */
  status: TuiSuggestionStatus
}

/** Text and insertion point produced by accepting a completion. */
export interface TuiSuggestionAcceptance {
  /** Complete editor text after replacement. */
  text: string
  /** UTF-16 insertion offset after the inserted text. */
  cursor: number
}

/** Range and workspace-relative query for the `@` token under the cursor. */
export interface TuiPathSuggestionQuery {
  /** Inclusive UTF-16 offset of the `@` marker. */
  queryStart: number
  /** Exclusive UTF-16 offset of the complete token. */
  queryEnd: number
  /** Query text after the `@` marker. */
  query: string
}

function selectedWindow(index: number, start: number, itemCount: number, visibleLimit: number): number {
  const limit = Math.max(1, visibleLimit)
  const maximum = Math.max(0, itemCount - limit)
  if (index < start) return index
  if (index >= start + limit) return Math.min(maximum, index - limit + 1)
  return Math.min(maximum, start)
}

/**
 * Resolve slash-command candidates for a command-only draft.
 * @param text - complete composer text.
 * @param cursor - active UTF-16 insertion offset.
 * @param commands - effective Agent-scoped command descriptors.
 * @returns active suggestion state, or `undefined` outside a command query.
 */
export function commandSuggestionState(
  text: string,
  cursor: number,
  commands: readonly CommandDescriptor[],
): TuiSuggestionState | undefined {
  if (cursor !== text.length || !/^\/[a-z0-9_-]*$/u.test(text)) return undefined
  const query = text.slice(1).toLocaleLowerCase()
  const items = commands
    .filter(command => command.name.toLocaleLowerCase().startsWith(query))
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((command): TuiSuggestionItem => ({
      id: `command:${command.name}`,
      insertText: `/${command.name} `,
      label: `/${command.name}`,
      description: command.description,
      ...command.input === undefined ? {} : { detail: command.input.hint },
      source: 'command',
    }))
  return {
    kind: 'command', queryStart: 0, queryEnd: cursor, selectedIndex: 0, visibleStart: 0,
    items, status: items.length === 0 ? 'empty' : 'ready',
  }
}

/**
 * Find an `@token` only when the token begins at the draft or after whitespace.
 * @param text - complete composer text.
 * @param cursor - active UTF-16 insertion offset.
 * @returns the token range and workspace-relative query, or `undefined` outside one.
 */
export function pathSuggestionQuery(text: string, cursor: number): TuiPathSuggestionQuery | undefined {
  if (cursor < 0 || cursor > text.length) return undefined
  let start = cursor
  while (start > 0 && !/\s/u.test(text[start - 1] ?? '')) start -= 1
  if (text[start] !== '@' || (start > 0 && !/\s/u.test(text[start - 1] ?? ''))) return undefined
  let end = cursor
  while (end < text.length && !/\s/u.test(text[end] ?? '')) end += 1
  return { queryStart: start, queryEnd: end, query: text.slice(start + 1, end) }
}

/**
 * Convert one bounded filesystem result into the shared TUI suggestion state.
 * @param query - active `@token` range and workspace-relative query.
 * @param result - provider result, or `undefined` while the query is loading.
 * @returns path suggestion state with directory/file-specific insertion text.
 */
export function pathSuggestionState(
  query: TuiPathSuggestionQuery,
  result: FsPathCompletionResult | undefined,
): TuiSuggestionState {
  const items = result?.entries.map((entry): TuiSuggestionItem => ({
    id: `path:${entry.type}:${entry.path}`,
    insertText: `@${entry.path}${entry.type === 'file' ? ' ' : ''}`,
    label: `@${entry.path}`,
    description: entry.type === 'directory' ? 'directory' : 'file',
    source: 'path',
  })) ?? []
  return {
    kind: 'path',
    queryStart: query.queryStart,
    queryEnd: query.queryEnd,
    selectedIndex: 0,
    visibleStart: 0,
    items,
    status: result === undefined ? 'loading' : result.truncated ? 'truncated' : result.entries.length === 0 ? 'empty' : 'ready',
  }
}

/**
 * Move the selected candidate while keeping it inside the mounted item window.
 * @param state - active suggestion state.
 * @param direction - selection direction.
 * @param visibleLimit - maximum mounted candidate rows.
 * @returns state with a clamped selection and window.
 */
export function moveTuiSuggestion(
  state: TuiSuggestionState,
  direction: 'previous' | 'next',
  visibleLimit: number,
): TuiSuggestionState {
  if (state.items.length === 0) return state
  const selectedIndex = direction === 'previous'
    ? Math.max(0, state.selectedIndex - 1)
    : Math.min(state.items.length - 1, state.selectedIndex + 1)
  return {
    ...state,
    selectedIndex,
    visibleStart: selectedWindow(selectedIndex, state.visibleStart, state.items.length, visibleLimit),
  }
}

/**
 * Replace the active query with its selected candidate.
 * @param text - complete composer text.
 * @param state - active suggestion state.
 * @returns updated text and cursor, or `undefined` when no item is selectable.
 */
export function acceptTuiSuggestion(
  text: string,
  state: TuiSuggestionState,
): TuiSuggestionAcceptance | undefined {
  const item = state.items[state.selectedIndex]
  if (item === undefined) return undefined
  const value = text.slice(0, state.queryStart) + item.insertText + text.slice(state.queryEnd)
  return { text: value, cursor: state.queryStart + item.insertText.length }
}

/**
 * Return only the candidate rows mounted by the current suggestion window.
 * @param state - active suggestion state.
 * @param visibleLimit - maximum mounted candidate rows.
 * @returns the visible item slice.
 */
export function visibleTuiSuggestions(
  state: TuiSuggestionState,
  visibleLimit: number,
): readonly TuiSuggestionItem[] {
  return state.items.slice(state.visibleStart, state.visibleStart + Math.max(1, visibleLimit))
}
