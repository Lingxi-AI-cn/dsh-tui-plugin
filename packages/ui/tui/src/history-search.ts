/** Pure process-local search state over submitted TUI prompt history. */

import { tuiComposerDraft, type ComposerState, type TuiComposerDraft } from './composer.ts'

/** Active reverse-history query and the draft restored when search is cancelled. */
export interface TuiHistorySearchState {
  /** Text matched case-insensitively against submitted prompts. */
  query: string
  /** Zero-based position in newest-first matching prompts, or `-1` with no match. */
  matchIndex: number
  /** Exact editor value retained while search owns keyboard input. */
  originalDraft: TuiComposerDraft
}

/** Current match and count derived from one history-search state. */
export interface TuiHistorySearchResult {
  /** Selected submitted prompt, absent when the query has no match. */
  match?: string | undefined
  /** Exact submitted draft, including process-local paste references. */
  draft?: TuiComposerDraft | undefined
  /** One-based selected position, or zero when no prompt matches. */
  position: number
  /** Number of unique matching submitted prompts. */
  count: number
}

function normalized(value: string): string {
  return value.normalize('NFC').toLowerCase()
}

function asDraft(value: string | TuiComposerDraft): TuiComposerDraft {
  return typeof value === 'string' ? { text: value, cursor: value.length } : value
}

function matchingHistory(
  history: readonly (string | TuiComposerDraft)[],
  query: string,
): TuiComposerDraft[] {
  const needle = normalized(query)
  const seen = new Set<string>()
  const matches: TuiComposerDraft[] = []
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const value = history[index]
    if (value === undefined) continue
    const draft = asDraft(value)
    if (seen.has(draft.text) || !normalized(draft.text).includes(needle)) continue
    seen.add(draft.text)
    matches.push(draft)
  }
  return matches
}

/**
 * Start reverse search using the current draft as both the query and cancel target.
 * @param composer - editor state before search takes keyboard ownership.
 * @param history - oldest-first submitted prompts.
 * @returns initialized search state selecting the newest match when one exists.
 */
export function startTuiHistorySearch(
  composer: ComposerState,
  history: readonly (string | TuiComposerDraft)[],
): TuiHistorySearchState {
  return {
    query: composer.text,
    matchIndex: matchingHistory(history, composer.text).length === 0 ? -1 : 0,
    originalDraft: tuiComposerDraft(composer),
  }
}

/**
 * Restore the exact editor value retained when reverse search started.
 * @param state - active history-search state.
 * @returns editor state with the original text and insertion point.
 */
export function cancelTuiHistorySearch(state: TuiHistorySearchState): ComposerState {
  return {
    text: state.originalDraft.text,
    cursor: state.originalDraft.cursor,
    historyIndex: -1,
    ...(state.originalDraft.editHistory === undefined ? {} : { editHistory: state.originalDraft.editHistory }),
    ...(state.originalDraft.references === undefined ? {} : { references: state.originalDraft.references }),
  }
}

/**
 * Replace the active query and restart matching from the newest prompt.
 * @param state - active history-search state.
 * @param query - complete replacement query.
 * @param history - oldest-first submitted prompts.
 * @returns search state positioned at the newest match.
 */
export function updateTuiHistorySearchQuery(
  state: TuiHistorySearchState,
  query: string,
  history: readonly (string | TuiComposerDraft)[],
): TuiHistorySearchState {
  return { ...state, query, matchIndex: matchingHistory(history, query).length === 0 ? -1 : 0 }
}

/**
 * Select the next older match without wrapping to the newest prompt.
 * @param state - active history-search state.
 * @param history - oldest-first submitted prompts.
 * @returns search state with a bounded selected index.
 */
export function nextTuiHistorySearchMatch(
  state: TuiHistorySearchState,
  history: readonly (string | TuiComposerDraft)[],
): TuiHistorySearchState {
  const matches = matchingHistory(history, state.query)
  if (matches.length === 0) return { ...state, matchIndex: -1 }
  return { ...state, matchIndex: Math.min(matches.length - 1, Math.max(0, state.matchIndex) + 1) }
}

/**
 * Resolve the selected prompt and display position from current submitted history.
 * @param state - active history-search state.
 * @param history - oldest-first submitted prompts.
 * @returns selected match and newest-first position metadata.
 */
export function tuiHistorySearchResult(
  state: TuiHistorySearchState,
  history: readonly (string | TuiComposerDraft)[],
): TuiHistorySearchResult {
  const matches = matchingHistory(history, state.query)
  const draft = matches[state.matchIndex]
  return {
    ...(draft === undefined ? {} : { match: draft.text, draft }),
    position: draft === undefined ? 0 : state.matchIndex + 1,
    count: matches.length,
  }
}
