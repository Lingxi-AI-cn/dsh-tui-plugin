/** Pure Unicode-aware editor state and layout for the native TUI composer. */

import stringWidth from 'string-width'
import type { ImageAttachmentRef } from './host.ts'
import { terminalSafe } from './sanitize.ts'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const words = new Intl.Segmenter(undefined, { granularity: 'word' })
const COMPOSER_UNDO_LIMIT = 100
const COMPOSER_COALESCE_MS = 750
const LARGE_PASTE_MIN_BYTES = 4 * 1024
const LARGE_PASTE_MIN_LINES = 8

/** Process-local large-paste payload represented by one bounded editor placeholder. */
export interface TuiComposerPasteReference {
  /** Stable placeholder embedded in this draft's visible text. */
  readonly placeholder: string
  /** Terminal-safe original text expanded only when the prompt is submitted. */
  readonly text: string
  /** UTF-8 payload size used in the bounded placeholder. */
  readonly bytes: number
  /** Physical source-line count used in the bounded placeholder. */
  readonly lines: number
}

/** Process-local image chip backed by a durable content-addressed reference. */
export interface TuiComposerImageAttachment {
  /** Durable image metadata; encoded bytes never enter composer state. */
  readonly ref: ImageAttachmentRef
}

/** Text and insertion point restored by one composer undo or redo action. */
export interface TuiComposerSnapshot {
  /** Complete editor text. */
  text: string
  /** UTF-16 insertion offset at a grapheme boundary. */
  cursor: number
  /** Large-paste payloads still referenced by the visible text. */
  references?: readonly TuiComposerPasteReference[] | undefined
  /** Image chips retained with this undo snapshot. */
  attachments?: readonly TuiComposerImageAttachment[] | undefined
}

/** Edit category used to define composer undo units. */
export type TuiComposerEditKind =
  | 'typing'
  | 'delete-backward'
  | 'delete-forward'
  | 'delete-word-backward'
  | 'delete-word-forward'
  | 'paste'
  | 'multiline'
  | 'suggestion'
  | 'history'
  | 'external-editor'
  | 'attachment'

/** Bounded process-local undo and redo stacks for one active draft. */
export interface TuiComposerEditHistory {
  /** Oldest-first snapshots available to undo. */
  past: readonly TuiComposerSnapshot[]
  /** Oldest-first snapshots available to redo, with the next value last. */
  future: readonly TuiComposerSnapshot[]
  /** Most recent mergeable edit and its timestamp. */
  coalescing?: { kind: TuiComposerEditKind; at: number } | undefined
}

/** Process-local editor value, insertion point, and history traversal state. */
export interface ComposerState {
  /** Complete draft text. */
  text: string
  /** UTF-16 insertion offset at a grapheme boundary. */
  cursor: number
  /** Newest-first submitted-history offset, or `-1` outside history traversal. */
  historyIndex: number
  /** Draft retained while submitted history is being inspected. */
  historyScratch?: TuiComposerDraft | undefined
  /** Large-paste payloads referenced by bounded placeholders in {@link text}. */
  references?: readonly TuiComposerPasteReference[] | undefined
  /** Durable image chips attached to this draft. */
  attachments?: readonly TuiComposerImageAttachment[] | undefined
  /** Process-local bounded edit history, created after the first text change. */
  editHistory?: TuiComposerEditHistory | undefined
}

/** Process-local draft value retained outside the active editor. */
export interface TuiComposerDraft {
  /** Complete retained text. */
  text: string
  /** UTF-16 insertion offset at a grapheme boundary. */
  cursor: number
  /** Edit history retained with this draft while it is stashed or searched. */
  editHistory?: TuiComposerEditHistory | undefined
  /** Large-paste payloads retained with this process-local draft. */
  references?: readonly TuiComposerPasteReference[] | undefined
  /** Durable image chips retained with this process-local draft. */
  attachments?: readonly TuiComposerImageAttachment[] | undefined
}

/** Result of one stash, restore, or swap action. */
export interface TuiComposerStashTransition {
  /** Active editor after the action. */
  composer: ComposerState
  /** Draft retained outside the editor, absent after restoration. */
  stash?: TuiComposerDraft | undefined
  /** Observable action taken for status rendering. */
  action: 'unchanged' | 'stashed' | 'restored' | 'swapped'
}

/** Visible composer rows and insertion cell relative to the editor content. */
export interface ComposerLayout {
  /** Bounded physical rows mounted by Ink. */
  lines: readonly string[]
  /** Zero-based visible row containing the insertion point. */
  cursorRow: number
  /** Zero-based display cell within `cursorRow`. */
  cursorColumn: number
}

/**
 * Create a composer editor at the end of an optional initial value.
 * @param text - initial editor text.
 * @returns initialized editor state.
 */
export function createComposerState(text = ''): ComposerState {
  return { text, cursor: text.length, historyIndex: -1 }
}

function composerFromDraft(draft: TuiComposerDraft): ComposerState {
  return {
    ...createComposerState(draft.text),
    cursor: draft.cursor,
    ...(draft.editHistory === undefined ? {} : { editHistory: draft.editHistory }),
    ...(draft.references === undefined ? {} : { references: draft.references }),
    ...(draft.attachments === undefined ? {} : { attachments: draft.attachments }),
  }
}

/**
 * Stash a non-empty draft, restore into an empty editor, or swap two non-empty drafts.
 * @param composer - active editor value and cursor.
 * @param stash - currently retained process-local draft.
 * @returns the new editor, retained draft, and action name.
 */
export function toggleTuiComposerStash(
  composer: ComposerState,
  stash: TuiComposerDraft | undefined,
): TuiComposerStashTransition {
  const current = {
    text: composer.text,
    cursor: composer.cursor,
    ...(composer.editHistory === undefined ? {} : { editHistory: composer.editHistory }),
    ...(composer.references === undefined ? {} : { references: composer.references }),
    ...(composer.attachments === undefined ? {} : { attachments: composer.attachments }),
  }
  if (composer.text === '' && (composer.attachments?.length ?? 0) === 0) {
    if (stash === undefined) return { composer, action: 'unchanged' }
    return { composer: composerFromDraft(stash), action: 'restored' }
  }
  if (stash === undefined) {
    return { composer: createComposerState(), stash: current, action: 'stashed' }
  }
  return { composer: composerFromDraft(stash), stash: current, action: 'swapped' }
}

function boundaries(text: string): number[] {
  return [0, ...Array.from(graphemes.segment(text), item => item.index + item.segment.length)]
}

function previousBoundary(text: string, cursor: number): number {
  return boundaries(text).findLast(offset => offset < cursor) ?? 0
}

function nextBoundary(text: string, cursor: number): number {
  return boundaries(text).find(offset => offset > cursor) ?? text.length
}

function boundedSnapshots(values: readonly TuiComposerSnapshot[]): readonly TuiComposerSnapshot[] {
  return values.length <= COMPOSER_UNDO_LIMIT ? values : values.slice(-COMPOSER_UNDO_LIMIT)
}

function mergeable(kind: TuiComposerEditKind): boolean {
  return kind === 'typing' || kind.startsWith('delete-')
}

function stopCoalescing(history: TuiComposerEditHistory | undefined): TuiComposerEditHistory | undefined {
  if (history?.coalescing === undefined) return history
  return { past: history.past, future: history.future }
}

function snapshot(state: ComposerState): TuiComposerSnapshot {
  return {
    text: state.text,
    cursor: state.cursor,
    ...(state.references === undefined ? {} : { references: state.references }),
    ...(state.attachments === undefined ? {} : { attachments: state.attachments }),
  }
}

function referencesInText(
  text: string,
  references: readonly TuiComposerPasteReference[] | undefined,
): readonly TuiComposerPasteReference[] | undefined {
  if (references === undefined) return undefined
  const retained = references.filter(reference => text.includes(reference.placeholder))
  if (retained.length === 0) return undefined
  return retained.length === references.length ? references : retained
}

/**
 * Replace the complete editor value as one explicit undo unit.
 * @param state - current editor state.
 * @param text - complete replacement text.
 * @param cursor - insertion point in the replacement text.
 * @param kind - edit category controlling coalescing.
 * @param now - edit timestamp used for bounded typing and deletion coalescing.
 * @param references - paste references retained by placeholders in the replacement text.
 * @param attachments - image chips retained with the replacement text.
 * @returns updated editor with redo cleared.
 */
export function replaceComposerText(
  state: ComposerState,
  text: string,
  cursor: number,
  kind: TuiComposerEditKind,
  now = Date.now(),
  references = referencesInText(text, state.references),
  attachments = state.attachments,
): ComposerState {
  if (state.text === text && state.cursor === cursor && state.references === references && state.attachments === attachments) return state
  const previous = state.editHistory
  const coalescing = previous?.coalescing
  const merge = mergeable(kind)
    && coalescing?.kind === kind
    && now >= coalescing.at
    && now - coalescing.at <= COMPOSER_COALESCE_MS
  const past = merge
    ? previous?.past ?? []
    : boundedSnapshots([...(previous?.past ?? []), snapshot(state)])
  return {
    text,
    cursor,
    historyIndex: -1,
    ...(references === undefined ? {} : { references }),
    ...(attachments === undefined ? {} : { attachments }),
    editHistory: {
      past,
      future: [],
      ...(mergeable(kind) ? { coalescing: { kind, at: now } } : {}),
    },
  }
}

/**
 * Restore the preceding composer snapshot.
 * @param state - current editor state.
 * @returns preceding value, or the unchanged state when no undo is available.
 */
export function undoComposerEdit(state: ComposerState): ComposerState {
  const history = state.editHistory
  const previous = history?.past.at(-1)
  if (history === undefined || previous === undefined) return state
  return {
    text: previous.text,
    cursor: previous.cursor,
    historyIndex: -1,
    ...(previous.references === undefined ? {} : { references: previous.references }),
    ...(previous.attachments === undefined ? {} : { attachments: previous.attachments }),
    editHistory: {
      past: history.past.slice(0, -1),
      future: boundedSnapshots([...history.future, snapshot(state)]),
    },
  }
}

/**
 * Restore the next composer snapshot after an undo.
 * @param state - current editor state.
 * @returns next value, or the unchanged state when no redo is available.
 */
export function redoComposerEdit(state: ComposerState): ComposerState {
  const history = state.editHistory
  const next = history?.future.at(-1)
  if (history === undefined || next === undefined) return state
  return {
    text: next.text,
    cursor: next.cursor,
    historyIndex: -1,
    ...(next.references === undefined ? {} : { references: next.references }),
    ...(next.attachments === undefined ? {} : { attachments: next.attachments }),
    editHistory: {
      past: boundedSnapshots([...history.past, snapshot(state)]),
      future: history.future.slice(0, -1),
    },
  }
}

function lineStart(text: string, cursor: number): number {
  return text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
}

function lineEnd(text: string, cursor: number): number {
  const end = text.indexOf('\n', cursor)
  return end < 0 ? text.length : end
}

function wordBoundary(text: string, cursor: number, direction: -1 | 1): number {
  const segments = Array.from(words.segment(text))
  if (direction < 0) {
    const before = segments.filter(item => item.index < cursor)
    const word = before.findLast(item => item.isWordLike && item.index < cursor)
    return word?.index ?? 0
  }
  const word = segments.find(item => item.isWordLike && item.index + item.segment.length > cursor)
  if (word === undefined) return text.length
  const after = segments.find(item => item.isWordLike && item.index >= word.index + word.segment.length)
  return after?.index ?? text.length
}

/**
 * Insert terminal-safe text at the active insertion point.
 * @param state - current editor state.
 * @param input - typed or pasted text.
 * @param now - edit timestamp used for coalescing.
 * @returns updated editor state.
 */
export function insertComposerText(state: ComposerState, input: string, now = Date.now()): ComposerState {
  const value = terminalSafe(input.replace(/\r\n?|\n/gu, '\n'))
  if (value === '') return state
  const text = state.text.slice(0, state.cursor) + value + state.text.slice(state.cursor)
  const kind = value.includes('\n')
    ? 'multiline'
    : Array.from(graphemes.segment(value)).length === 1 ? 'typing' : 'paste'
  return replaceComposerText(state, text, state.cursor + value.length, kind, now)
}

/**
 * Decide whether one bracketed paste should be represented by a bounded placeholder.
 * @param input - committed terminal paste text.
 * @returns true when its byte or line count exceeds the direct-editor threshold.
 */
export function isLargeComposerPaste(input: string): boolean {
  const value = input.replace(/\r\n?|\n/gu, '\n')
  return Buffer.byteLength(value) >= LARGE_PASTE_MIN_BYTES
    || value.split('\n').length >= LARGE_PASTE_MIN_LINES
}

/**
 * Insert one large terminal paste as an undoable process-local reference.
 * @param state - current editor state.
 * @param input - committed bracketed-paste payload.
 * @param now - edit timestamp retained with the independent paste unit.
 * @returns editor state containing one bounded visible placeholder.
 */
export function insertComposerPasteReference(
  state: ComposerState,
  input: string,
  now = Date.now(),
): ComposerState {
  const value = terminalSafe(input.replace(/\r\n?|\n/gu, '\n'))
  if (value === '') return state
  const bytes = Buffer.byteLength(value)
  const lines = value.split('\n').length
  let number = (state.references?.length ?? 0) + 1
  let placeholder = `[Pasted text #${number}: ${lines} lines, ${formatPasteBytes(bytes)}]`
  while (state.text.includes(placeholder)) {
    number += 1
    placeholder = `[Pasted text #${number}: ${lines} lines, ${formatPasteBytes(bytes)}]`
  }
  const reference = Object.freeze({ placeholder, text: value, bytes, lines })
  const text = state.text.slice(0, state.cursor) + placeholder + state.text.slice(state.cursor)
  return replaceComposerText(
    state,
    text,
    state.cursor + placeholder.length,
    'paste',
    now,
    Object.freeze([...(state.references ?? []), reference]),
  )
}

/**
 * Expand process-local paste references into the model-visible prompt.
 * @param state - complete editor state at submission.
 * @returns terminal-safe prompt text with every intact placeholder expanded.
 */
export function materializeComposerText(state: ComposerState): string {
  let text = state.text
  for (const reference of state.references ?? []) {
    text = text.split(reference.placeholder).join(reference.text)
  }
  return text
}

/**
 * Detach one draft for stash, submitted history, or view-local retention.
 * @param state - active editor state.
 * @returns process-local draft preserving cursor, edits, and paste references.
 */
export function tuiComposerDraft(state: ComposerState): TuiComposerDraft {
  return {
    text: state.text,
    cursor: state.cursor,
    ...(state.editHistory === undefined ? {} : { editHistory: state.editHistory }),
    ...(state.references === undefined ? {} : { references: state.references }),
    ...(state.attachments === undefined ? {} : { attachments: state.attachments }),
  }
}

/**
 * Restore a detached process-local draft as an active editor.
 * @param draft - retained draft value.
 * @returns editor state preserving paste references and edit history.
 */
export function restoreTuiComposerDraft(draft: TuiComposerDraft): ComposerState {
  return composerFromDraft(draft)
}

/** Add one durable image chip, deduplicating by its content-addressed id.
 * @param state - current editor state.
 * @param ref - durable image reference to retain.
 * @param now - edit timestamp used for the undo unit.
 * @returns updated editor state, or the unchanged state for a duplicate.
 */
export function addComposerImageAttachment(
  state: ComposerState,
  ref: ImageAttachmentRef,
  now = Date.now(),
): ComposerState {
  if (state.attachments?.some(item => item.ref.attachmentId === ref.attachmentId)) return state
  const attachments = Object.freeze([
    ...(state.attachments ?? []),
    Object.freeze({ ref }),
  ])
  return replaceComposerText(state, state.text, state.cursor, 'attachment', now, state.references, attachments)
}

/** Insert one system-clipboard payload as a single undoable text/chip edit.
 * @param state - current editor state.
 * @param input - clipboard text, normalized and terminal-sanitized before insertion.
 * @param refs - durable image references admitted by the clipboard owner.
 * @param now - edit timestamp used for the undo unit.
 * @returns updated editor state containing the text/reference and image chips.
 */
export function insertComposerClipboard(
  state: ComposerState,
  input: string,
  refs: readonly ImageAttachmentRef[] = [],
  now = Date.now(),
): ComposerState {
  const attachments = refs.reduce<readonly TuiComposerImageAttachment[]>((current, ref) => {
    if (current.some(item => item.ref.attachmentId === ref.attachmentId)) return current
    return Object.freeze([...current, Object.freeze({ ref })])
  }, state.attachments ?? [])
  const nextAttachments = attachments.length === 0 ? undefined : attachments
  const value = terminalSafe(input.replace(/\r\n?|\n/gu, '\n'))
  if (value === '') {
    return nextAttachments === state.attachments
      ? state
      : replaceComposerText(state, state.text, state.cursor, 'attachment', now, state.references, nextAttachments)
  }
  if (isLargeComposerPaste(value)) {
    let number = (state.references?.length ?? 0) + 1
    const bytes = Buffer.byteLength(value)
    const lines = value.split('\n').length
    let placeholder = `[Pasted text #${number}: ${lines} lines, ${formatPasteBytes(bytes)}]`
    while (state.text.includes(placeholder)) {
      number += 1
      placeholder = `[Pasted text #${number}: ${lines} lines, ${formatPasteBytes(bytes)}]`
    }
    const reference = Object.freeze({ placeholder, text: value, bytes, lines })
    return replaceComposerText(
      state,
      state.text.slice(0, state.cursor) + placeholder + state.text.slice(state.cursor),
      state.cursor + placeholder.length,
      'paste',
      now,
      Object.freeze([...(state.references ?? []), reference]),
      nextAttachments,
    )
  }
  const text = state.text.slice(0, state.cursor) + value + state.text.slice(state.cursor)
  const kind = value.includes('\n')
    ? 'multiline'
    : Array.from(graphemes.segment(value)).length === 1 ? 'typing' : 'paste'
  return replaceComposerText(state, text, state.cursor + value.length, kind, now, state.references, nextAttachments)
}

/** Remove one image chip by durable attachment id.
 * @param state - current editor state.
 * @param attachmentId - content-addressed id of the chip to remove.
 * @param now - edit timestamp used for the undo unit.
 * @returns updated editor state, or the unchanged state when no chip matches.
 */
export function removeComposerImageAttachment(
  state: ComposerState,
  attachmentId: ImageAttachmentRef['attachmentId'],
  now = Date.now(),
): ComposerState {
  const attachments = state.attachments?.filter(item => item.ref.attachmentId !== attachmentId)
  if (attachments === undefined || attachments.length === state.attachments?.length) return state
  return replaceComposerText(
    state, state.text, state.cursor, 'attachment', now, state.references,
    attachments.length === 0 ? undefined : Object.freeze(attachments),
  )
}

/** Remove the last image chip, used by Backspace when the text buffer is empty.
 * @param state - current editor state.
 * @param now - edit timestamp used for the undo unit.
 * @returns updated editor state, or the unchanged state when no chip exists.
 */
export function removeLastComposerImageAttachment(state: ComposerState, now = Date.now()): ComposerState {
  const last = state.attachments?.at(-1)
  return last === undefined ? state : removeComposerImageAttachment(state, last.ref.attachmentId, now)
}

function formatPasteBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kib = bytes / 1024
  return `${kib >= 10 ? Math.round(kib) : Math.round(kib * 10) / 10} KiB`
}

/**
 * Move the insertion point without changing text.
 * @param state - current editor state.
 * @param movement - grapheme, word, line, or buffer movement.
 * @returns state with the updated insertion point.
 */
export function moveComposerCursor(
  state: ComposerState,
  movement: 'left' | 'right' | 'home' | 'end' | 'buffer-home' | 'buffer-end' | 'word-left' | 'word-right',
): ComposerState {
  let cursor = state.cursor
  if (movement === 'left') cursor = previousBoundary(state.text, cursor)
  else if (movement === 'right') cursor = nextBoundary(state.text, cursor)
  else if (movement === 'home') cursor = lineStart(state.text, cursor)
  else if (movement === 'end') cursor = lineEnd(state.text, cursor)
  else if (movement === 'buffer-home') cursor = 0
  else if (movement === 'buffer-end') cursor = state.text.length
  else cursor = wordBoundary(state.text, cursor, movement === 'word-left' ? -1 : 1)
  const editHistory = stopCoalescing(state.editHistory)
  return { ...state, cursor, ...(editHistory === undefined ? {} : { editHistory }) }
}

/**
 * Delete one grapheme or one adjacent word around the insertion point.
 * @param state - current editor state.
 * @param deletion - deletion direction and unit.
 * @param now - edit timestamp used for coalescing.
 * @returns updated editor state.
 */
export function deleteComposerText(
  state: ComposerState,
  deletion: 'backward' | 'forward' | 'word-backward' | 'word-forward',
  now = Date.now(),
): ComposerState {
  const enclosing = state.references?.find((reference) => {
    const start = state.text.indexOf(reference.placeholder)
    const end = start + reference.placeholder.length
    return start >= 0 && (deletion === 'backward' || deletion === 'word-backward'
      ? state.cursor > start && state.cursor <= end
      : state.cursor >= start && state.cursor < end)
  })
  if (enclosing !== undefined) {
    const start = state.text.indexOf(enclosing.placeholder)
    const end = start + enclosing.placeholder.length
    return replaceComposerText(
      state,
      state.text.slice(0, start) + state.text.slice(end),
      start,
      deletion === 'forward' || deletion === 'word-forward' ? 'delete-forward' : 'delete-backward',
      now,
      referencesInText(
        state.text.slice(0, start) + state.text.slice(end),
        state.references,
      ),
    )
  }
  const start = deletion === 'backward'
    ? previousBoundary(state.text, state.cursor)
    : deletion === 'word-backward' ? wordBoundary(state.text, state.cursor, -1) : state.cursor
  const end = deletion === 'forward'
    ? nextBoundary(state.text, state.cursor)
    : deletion === 'word-forward' ? wordBoundary(state.text, state.cursor, 1) : state.cursor
  return replaceComposerText(
    state,
    state.text.slice(0, start) + state.text.slice(end),
    start,
    deletion === 'backward' ? 'delete-backward'
      : deletion === 'forward' ? 'delete-forward'
        : deletion === 'word-backward' ? 'delete-word-backward' : 'delete-word-forward',
    now,
  )
}

/**
 * Traverse submitted history while preserving the unsent draft.
 * @param state - current editor state.
 * @param history - oldest-first submitted values.
 * @param direction - history traversal direction.
 * @param now - edit timestamp retained with the independent history unit.
 * @returns recalled value or restored scratch draft.
 */
export function traverseComposerHistory(
  state: ComposerState,
  history: readonly (string | TuiComposerDraft)[],
  direction: 'older' | 'newer',
  now = Date.now(),
): ComposerState {
  if (history.length === 0) return state
  if (direction === 'older') {
    const index = Math.min(history.length - 1, state.historyIndex + 1)
    const entry = history[history.length - 1 - index] ?? ''
    const draft = typeof entry === 'string' ? { text: entry, cursor: entry.length } : entry
    const edited = replaceComposerText(
      state, draft.text, draft.cursor, 'history', now, draft.references, draft.attachments,
    )
    return {
      ...edited, historyIndex: index,
      historyScratch: state.historyIndex < 0 ? tuiComposerDraft(state) : state.historyScratch,
    }
  }
  if (state.historyIndex < 0) return state
  const index = state.historyIndex - 1
  const entry = index < 0 ? state.historyScratch ?? { text: '', cursor: 0 } : history[history.length - 1 - index] ?? ''
  const draft = typeof entry === 'string' ? { text: entry, cursor: entry.length } : entry
  const edited = replaceComposerText(
    state, draft.text, draft.cursor, 'history', now, draft.references, draft.attachments,
  )
  return { ...edited, historyIndex: index, historyScratch: index < 0 ? undefined : state.historyScratch }
}

interface PositionedLine { text: string; start: number; end: number }

function physicalLines(text: string, width: number): PositionedLine[] {
  const result: PositionedLine[] = []
  let line = ''
  let cells = 0
  let start = 0
  for (const item of graphemes.segment(text)) {
    if (item.segment === '\n') {
      result.push({ text: line, start, end: item.index })
      line = ''
      cells = 0
      start = item.index + 1
      continue
    }
    const next = stringWidth(item.segment)
    if (line !== '' && cells + next > width) {
      result.push({ text: line, start, end: item.index })
      line = ''
      cells = 0
      start = item.index
    }
    line += item.segment
    cells += next
  }
  result.push({ text: line, start, end: text.length })
  return result
}

/**
 * Wrap and vertically window the draft while retaining the insertion row.
 * @param state - current editor state.
 * @param width - available terminal display cells, including the fixed line gutter.
 * @param maxRows - maximum visible physical rows.
 * @param gutterWidth - display cells reserved before every visible editor row.
 * @returns bounded visible lines and insertion geometry.
 */
export function layoutComposer(
  state: ComposerState,
  width: number,
  maxRows = 5,
  gutterWidth = 0,
): ComposerLayout {
  const contentWidth = Math.max(1, width - Math.max(0, gutterWidth))
  const lines = physicalLines(state.text, contentWidth)
  const cursorIndex = Math.max(0, lines.findIndex((line, index) =>
    state.cursor >= line.start && (state.cursor < line.end || index === lines.length - 1 || state.cursor === line.end)))
  const start = Math.max(0, Math.min(cursorIndex, lines.length - Math.max(1, maxRows)))
  const visible = lines.slice(start, start + Math.max(1, maxRows))
  const cursorLine = lines[cursorIndex] ?? { text: '', start: 0, end: 0 }
  return {
    lines: visible.map(line => line.text),
    cursorRow: cursorIndex - start,
    cursorColumn: stringWidth(state.text.slice(cursorLine.start, state.cursor)),
  }
}
