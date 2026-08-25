/** Pure completion state shared by command and workspace-path suggestions. */

import type {
  CommandCompletionNode, CommandDescriptor, FsPathCompletionResult,
} from './host.ts'
import { tuiCommandDescription, type TuiLocale } from './locale.ts'

/** Origin of one TUI completion candidate. */
export type TuiSuggestionKind = 'command' | 'path' | 'reference' | 'file' | 'session'

/** Resolution state for a bounded TUI completion query. */
export type TuiSuggestionStatus = 'ready' | 'loading' | 'empty' | 'truncated' | 'error'

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
  /** Why this completion is unavailable; unavailable rows cannot be accepted. */
  disabledReason?: string | undefined
  /** Canonical command path represented by this row, without the slash. */
  commandPath?: readonly string[] | undefined
  /** Source that produced this item. */
  source: TuiSuggestionKind
  /** Canonical reference kind, when this row came from an `@` owner. */
  referenceKind?: 'file' | 'directory' | 'session' | undefined
  /** Workspace-rooted path used by image attachment intake. */
  referencePath?: string | undefined
  /** Opaque owner identity carried by a canonical Session reference. */
  referenceId?: string | undefined
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
  /** Partial or complete provider failure retained beside usable rows. */
  error?: string | undefined
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

function firstSelectable(items: readonly TuiSuggestionItem[]): number {
  return items.findIndex(item => item.disabledReason === undefined)
}

function commandDescription(
  description: string,
  descriptions: Readonly<Record<string, string>> | undefined,
  locale: string,
): string {
  return descriptions?.[locale] ?? descriptions?.en ?? description
}

function commandAliasMatches(
  name: string,
  aliases: readonly string[] | undefined,
  token: string,
): string | undefined {
  const normalized = token.toLocaleLowerCase()
  if (name.toLocaleLowerCase().startsWith(normalized)) return name
  return aliases?.find(alias => alias.toLocaleLowerCase().startsWith(normalized))
}

function resolveCompletionNode(
  candidates: readonly CommandCompletionNode[],
  token: string,
): CommandCompletionNode | undefined {
  const normalized = token.toLocaleLowerCase()
  return candidates.find(candidate => candidate.name.toLocaleLowerCase() === normalized
    || candidate.aliases?.some(alias => alias.toLocaleLowerCase() === normalized))
}

function commandQuery(
  text: string,
  cursor: number,
): { readonly tokens: readonly string[]; readonly prefix: string } | undefined {
  if (cursor !== text.length || !text.startsWith('/') || /[\r\n]/u.test(text)) return undefined
  const body = text.slice(1)
  if (!/^[a-z0-9_-]*(?:[\t ]+[a-z0-9_-]*)*$/iu.test(body)) return undefined
  const trailingSeparator = /[\t ]$/u.test(body)
  const parts = body.split(/[\t ]+/u)
  const prefix = trailingSeparator ? '' : (parts.pop() ?? '')
  const tokens = parts.filter(token => token !== '')
  return { tokens, prefix }
}

/**
 * Resolve slash-command candidates for a command-only draft.
 * @param text - complete composer text.
 * @param cursor - active UTF-16 insertion offset.
 * @param commands - effective Agent-scoped command descriptors.
 * @param locale - locale key used for provider-owned description fallback.
 * @returns active suggestion state, or `undefined` outside a command query.
 */
export function commandSuggestionState(
  text: string,
  cursor: number,
  commands: readonly CommandDescriptor[],
  locale: TuiLocale = 'en',
): TuiSuggestionState | undefined {
  const parsed = commandQuery(text, cursor)
  if (parsed === undefined) return undefined
  const { tokens, prefix } = parsed
  const roots = commands.toSorted((left, right) => left.name.localeCompare(right.name))
  let candidates: readonly CommandDescriptor[] | readonly CommandCompletionNode[] = roots
  let canonicalTokens: readonly string[] = []
  let root: CommandDescriptor | undefined
  if (tokens.length > 0) {
    root = roots.find(command => command.name.toLocaleLowerCase() === tokens[0]?.toLocaleLowerCase()
      || command.completion?.aliases?.some(alias => alias.toLocaleLowerCase() === tokens[0]?.toLocaleLowerCase()))
    if (root === undefined) return undefined
    canonicalTokens = [root.name]
    candidates = root.completion?.children ?? []
    for (const token of tokens.slice(1)) {
      if (!Array.isArray(candidates)) return undefined
      const resolved = resolveCompletionNode(candidates, token)
      if (resolved === undefined) return undefined
      canonicalTokens = [...canonicalTokens, resolved.name]
      candidates = resolved.children ?? []
    }
  }
  const normalizedPrefix = prefix.toLocaleLowerCase()
  const items = candidates
    .flatMap((candidate): TuiSuggestionItem[] => {
      const name = candidate.name
      const rootCommand = root === undefined ? candidate as CommandDescriptor : undefined
      const completionNode = rootCommand === undefined ? candidate as CommandCompletionNode : undefined
      const aliases = rootCommand?.completion?.aliases ?? completionNode?.aliases
      const completionToken = commandAliasMatches(name, aliases, normalizedPrefix)
      if (completionToken === undefined) return []
      const path = completionNode?.canonicalPath !== undefined
        ? [...completionNode.canonicalPath]
        : [...canonicalTokens, completionToken]
      const description = rootCommand !== undefined
        ? tuiCommandDescription(rootCommand, locale)
        : commandDescription(candidate.description, (candidate as CommandCompletionNode).descriptions, locale)
      const input = candidate.input
      return [{
        id: `command:${path.join(' ')}`,
        insertText: `/${path.join(' ')} `,
        label: `/${path.join(' ')}`,
        description,
        ...input === undefined ? {} : { detail: input.hint },
        ...completionNode?.disabledReason === undefined ? {} : { disabledReason: completionNode.disabledReason },
        commandPath: Object.freeze(path),
        source: 'command',
      }]
    })
    .toSorted((left, right) => left.label.localeCompare(right.label))
  // Once a complete command has no children, leave suggestion mode so Enter
  // submits the command instead of being consumed by an empty suggestion list.
  if (items.length === 0 && (candidates.length === 0 || (tokens.length > 0 && prefix !== ''))) return undefined
  const selectedIndex = firstSelectable(items)
  return {
    kind: 'command', queryStart: 0, queryEnd: cursor, selectedIndex: selectedIndex < 0 ? 0 : selectedIndex, visibleStart: 0,
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
  let selectedIndex = state.selectedIndex
  let candidate = direction === 'previous' ? selectedIndex - 1 : selectedIndex + 1
  while (candidate >= 0 && candidate < state.items.length) {
    if (state.items[candidate]?.disabledReason === undefined) {
      selectedIndex = candidate
      break
    }
    candidate += direction === 'previous' ? -1 : 1
  }
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
  if (item === undefined || item.disabledReason !== undefined) return undefined
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
