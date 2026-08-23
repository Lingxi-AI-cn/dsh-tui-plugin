/** Pure text-selection ranges over a bounded TUI screen-cell map. */

import type { TuiScreenCell, TuiScreenMap } from './screen-map.ts'

/** One zero-based terminal-cell coordinate. */
export interface TuiScreenPosition {
  /** Zero-based physical row. */
  row: number
  /** Zero-based physical column. */
  column: number
}

/** Inclusive text range in screen-cell coordinates. */
export interface TuiScreenSelection {
  /** First selected text cell in document order. */
  start: TuiScreenPosition
  /** Last selected text cell in document order. */
  end: TuiScreenPosition
  /** Gesture that established this range. */
  kind: 'drag' | 'double' | 'triple' | 'keyboard'
}

/** Direction used to extend an existing screen selection from the keyboard. */
export type TuiScreenSelectionDirection = 'left' | 'right' | 'up' | 'down' | 'home' | 'end'

/** Pointer gesture resolved against a screen map. */
export type TuiScreenSelectionGesture =
  | { kind: 'drag'; anchor: TuiScreenPosition; focus: TuiScreenPosition }
  | { kind: 'double' | 'triple'; at: TuiScreenPosition }

/** One contiguous rendered text segment and whether its cells are selected. */
export interface TuiScreenTextSegment {
  /** Grapheme-safe text without gutter or padding cells. */
  text: string
  /** Whether every cell represented by this segment belongs to the range. */
  selected: boolean
}

/** Process-local click identity used to distinguish single, double, and triple clicks. */
export interface TuiScreenClick {
  /** Surface identity that received the previous click. */
  surface: string
  /** Zero-based screen position of the previous click. */
  at: TuiScreenPosition
  /** Monotonic wall-clock timestamp in milliseconds. */
  time: number
  /** Number of clicks in the current sequence, from one through three. */
  count: 1 | 2 | 3
}

interface GraphemePoint {
  row: number
  column: number
  cell: TuiScreenCell
}

const WORD_CORE = /[\p{L}\p{N}\p{M}_]/u
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const EMOJI = /\p{Extended_Pictographic}/u
const PATH_PUNCTUATION = /^[/:?#@%._~+=-]+$/u

function positionOrder(left: TuiScreenPosition, right: TuiScreenPosition): number {
  return left.row - right.row || left.column - right.column
}

function rowTextPoints(map: TuiScreenMap, row: number): GraphemePoint[] {
  const cells = map.rows[row]?.cells ?? []
  const points: GraphemePoint[] = []
  for (let column = 0; column < cells.length; column += 1) {
    const cell = cells[column]
    if (cell === undefined || cell.source !== 'text' || !cell.selectable || cell.continuation || cell.grapheme === '') continue
    points.push({ row, column, cell })
  }
  return points
}

function logicalLineRows(map: TuiScreenMap, row: number): number[] {
  const current = map.rows[row]
  if (current === undefined) return []
  let start = row
  while (start > 0) {
    const previous = map.rows[start - 1]
    if (previous === undefined || previous.semanticBlockKey !== current.semanticBlockKey || !previous.softWrap) break
    start -= 1
  }
  const rows = [start]
  while (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last === undefined || last >= map.rows.length - 1) break
    const source = map.rows[last]
    const next = map.rows[last + 1]
    if (source === undefined || next === undefined || source.semanticBlockKey !== current.semanticBlockKey || !source.softWrap) break
    rows.push(last + 1)
  }
  return rows
}

function pointAt(map: TuiScreenMap, position: TuiScreenPosition): GraphemePoint | undefined {
  const row = Math.min(Math.max(0, position.row), Math.max(0, map.rows.length - 1))
  const points = rowTextPoints(map, row)
  const direct = points.find((point) => {
    const width = Math.max(1, point.cell.displayWidth)
    return position.column >= point.column && position.column < point.column + width
  })
  return direct
}

function linePoints(map: TuiScreenMap, row: number): GraphemePoint[] {
  return logicalLineRows(map, row).flatMap(lineRow => rowTextPoints(map, lineRow))
}

function classify(point: GraphemePoint, points: readonly GraphemePoint[], index: number): 'space' | 'word' | 'path' | 'cjk' | 'emoji' | 'punctuation' {
  const grapheme = point.cell.grapheme
  if (/^\s+$/u.test(grapheme)) return 'space'
  if (CJK.test(grapheme)) return 'cjk'
  if (EMOJI.test(grapheme)) return 'emoji'
  if (WORD_CORE.test(grapheme)) return 'word'
  if (PATH_PUNCTUATION.test(grapheme)) {
    const left = points[index - 1]?.cell.grapheme ?? ''
    const right = points[index + 1]?.cell.grapheme ?? ''
    if (WORD_CORE.test(left) || WORD_CORE.test(right) || PATH_PUNCTUATION.test(left) || PATH_PUNCTUATION.test(right)) {
      return 'path'
    }
  }
  return 'punctuation'
}

function pointSelection(
  points: readonly GraphemePoint[],
  start: number,
  end: number,
  kind: TuiScreenSelection['kind'],
): TuiScreenSelection {
  const first = points[start]
  const last = points[end]
  if (first === undefined || last === undefined) throw new Error('TUI selection points are unavailable')
  return {
    start: { row: first.row, column: first.column },
    end: { row: last.row, column: last.column + Math.max(1, last.cell.displayWidth) - 1 },
    kind,
  }
}

function cellInSelection(selection: TuiScreenSelection, row: number, column: number): boolean {
  if (row < selection.start.row || row > selection.end.row) return false
  const first = row === selection.start.row ? selection.start.column : 0
  const last = row === selection.end.row ? selection.end.column : Number.MAX_SAFE_INTEGER
  return column >= first && column <= last
}

function doubleSelection(map: TuiScreenMap, position: TuiScreenPosition): TuiScreenSelection | undefined {
  const point = pointAt(map, position)
  if (point === undefined) return undefined
  const points = linePoints(map, point.row)
  const index = points.findIndex(candidate => candidate.row === point.row && candidate.column === point.column)
  if (index < 0) return undefined
  const kind = classify(point, points, index)
  if (kind === 'cjk' || kind === 'emoji' || kind === 'punctuation') return pointSelection(points, index, index, 'double')
  let start = index
  let end = index
  const expandable = (candidate: 'space' | 'word' | 'path' | 'cjk' | 'emoji' | 'punctuation'): boolean =>
    kind === 'word' || kind === 'path' ? candidate === 'word' || candidate === 'path' : candidate === kind
  while (start > 0) {
    const previous = points[start - 1]
    if (previous === undefined || !expandable(classify(previous, points, start - 1))) break
    start -= 1
  }
  while (end < points.length - 1) {
    const next = points[end + 1]
    if (next === undefined || !expandable(classify(next, points, end + 1))) break
    end += 1
  }
  return pointSelection(points, start, end, 'double')
}

function tripleSelection(map: TuiScreenMap, position: TuiScreenPosition): TuiScreenSelection | undefined {
  const point = pointAt(map, position)
  if (point === undefined) return undefined
  const rows = logicalLineRows(map, point.row)
  const points = rows.flatMap(row => rowTextPoints(map, row))
  if (points.length === 0) return undefined
  return pointSelection(points, 0, points.length - 1, 'triple')
}

function dragSelection(map: TuiScreenMap, anchor: TuiScreenPosition, focus: TuiScreenPosition): TuiScreenSelection | undefined {
  if (positionOrder(anchor, focus) === 0) return undefined
  const first = pointAt(map, anchor)
  const last = pointAt(map, focus)
  if (first === undefined || last === undefined) return undefined
  const start = positionOrder(first, last) <= 0 ? first : last
  const end = start === first ? last : first
  return {
    start: { row: start.row, column: start.column },
    end: { row: end.row, column: end.column + Math.max(1, end.cell.displayWidth) - 1 },
    kind: 'drag',
  }
}

/**
 * Resolve a pointer gesture into a bounded process-local text range.
 *
 * Drag requires a real coordinate change; an unmoved press/release therefore
 * returns `undefined` so the normal click owner can retain its semantics.
 * Double-click uses fixed word classes: paths and URLs stay contiguous, CJK
 * and emoji select one grapheme, punctuation selects one grapheme, and spaces
 * select their contiguous run. Triple-click selects the current soft-wrapped
 * logical line. Gutter, padding, and non-selectable cells never resolve.
 * @param map - immutable screen-cell provenance.
 * @param gesture - process-local gesture coordinates.
 * @returns normalized inclusive range, or `undefined` when no text is selected.
 */
export function resolveTuiScreenSelection(
  map: TuiScreenMap,
  gesture: TuiScreenSelectionGesture,
): TuiScreenSelection | undefined {
  if (gesture.kind === 'drag') return dragSelection(map, gesture.anchor, gesture.focus)
  return gesture.kind === 'double'
    ? doubleSelection(map, gesture.at)
    : tripleSelection(map, gesture.at)
}

function adjacentRowPoint(
  map: TuiScreenMap,
  focus: TuiScreenPosition,
  offset: -1 | 1,
): GraphemePoint | undefined {
  for (let row = focus.row + offset; row >= 0 && row < map.rows.length; row += offset) {
    const points = rowTextPoints(map, row)
    if (points.length === 0) continue
    return points.reduce((nearest, point) =>
      Math.abs(point.column - focus.column) < Math.abs(nearest.column - focus.column) ? point : nearest)
  }
  return undefined
}

/**
 * Expand one existing selection by one grapheme, row, or logical-line edge.
 *
 * The operation is intentionally monotonic: keyboard gestures add text to the
 * existing normalized range and never collapse a pointer-established range.
 * @param map - immutable screen-cell provenance.
 * @param selection - active normalized range.
 * @param direction - requested expansion direction.
 * @returns expanded immutable range, or the original range at a screen edge.
 */
export function extendTuiScreenSelection(
  map: TuiScreenMap,
  selection: TuiScreenSelection,
  direction: TuiScreenSelectionDirection,
): TuiScreenSelection {
  const points = map.rows.flatMap((_row, row) => rowTextPoints(map, row))
  if (points.length === 0) return selection
  const leading = direction === 'left' || direction === 'up' || direction === 'home'
  const focus = leading ? selection.start : selection.end
  const current = pointAt(map, focus)
  if (current === undefined) return selection
  const index = points.findIndex(point => point.row === current.row && point.column === current.column)
  const next = direction === 'left'
    ? points[Math.max(0, index - 1)]
    : direction === 'right'
      ? points[Math.min(points.length - 1, index + 1)]
      : direction === 'up'
        ? adjacentRowPoint(map, focus, -1)
        : direction === 'down'
          ? adjacentRowPoint(map, focus, 1)
          : direction === 'home'
            ? linePoints(map, focus.row).at(0)
            : linePoints(map, focus.row).at(-1)
  if (next === undefined) return selection
  const nextStart = { row: next.row, column: next.column }
  const nextEnd = {
    row: next.row,
    column: next.column + Math.max(1, next.cell.displayWidth) - 1,
  }
  const start = positionOrder(nextStart, selection.start) < 0 ? nextStart : selection.start
  const end = positionOrder(nextEnd, selection.end) > 0 ? nextEnd : selection.end
  if (positionOrder(start, selection.start) === 0 && positionOrder(end, selection.end) === 0) return selection
  return Object.freeze({ start: { ...start }, end: { ...end }, kind: 'keyboard' })
}

/**
 * Project one screen row into selectable text segments for rendering.
 *
 * Gutters, continuation cells, and padding are omitted. Combining marks stay
 * attached to their grapheme because the screen map already stores clusters.
 * @param map - immutable screen-cell provenance.
 * @param row - zero-based physical map row.
 * @param selection - active range, when one exists.
 * @returns immutable text segments in rendered order.
 */
export function tuiScreenTextSegments(
  map: TuiScreenMap,
  row: number,
  selection: TuiScreenSelection | undefined,
): readonly TuiScreenTextSegment[] {
  const cells = map.rows[row]?.cells ?? []
  const segments: TuiScreenTextSegment[] = []
  for (let column = 0; column < cells.length; column += 1) {
    const cell = cells[column]
    if (cell === undefined || cell.source !== 'text' || cell.continuation || cell.grapheme === '') continue
    const selected = selection === undefined ? false : cellInSelection(selection, row, column)
    const previous = segments.at(-1)
    if (previous !== undefined && previous.selected === selected) {
      segments[segments.length - 1] = { ...previous, text: previous.text + cell.grapheme }
    } else {
      segments.push({ text: cell.grapheme, selected })
    }
  }
  return Object.freeze(segments)
}

/**
 * Extract selected text without terminal gutters or padding.
 *
 * Soft-wrapped rows are joined directly. Hard newlines and independent
 * semantic rows retain a newline so copy-on-release remains readable.
 * @param map - immutable screen-cell provenance.
 * @param selection - inclusive range to copy.
 * @returns grapheme-safe selected text.
 */
export function tuiScreenSelectionText(map: TuiScreenMap, selection: TuiScreenSelection): string {
  const parts: string[] = []
  for (let row = selection.start.row; row <= selection.end.row; row += 1) {
    const cells = map.rows[row]?.cells ?? []
    const first = row === selection.start.row ? selection.start.column : 0
    const last = row === selection.end.row ? selection.end.column : cells.length - 1
    const selected: TuiScreenCell[] = []
    for (let column = first; column <= last; column += 1) {
      const cell = cells[column]
      if (cell?.source === 'text' && cell.selectable && !cell.continuation) selected.push(cell)
    }
    if (map.bidi === 'visual') selected.sort((left, right) => (left.logicalIndex ?? 0) - (right.logicalIndex ?? 0))
    parts.push(...selected.map(cell => cell.grapheme))
    if (row < selection.end.row) {
      const source = map.rows[row]
      if (source?.softWrap !== true) parts.push('\n')
    }
  }
  return parts.join('')
}

/**
 * Advance a bounded click sequence for one surface and cell.
 *
 * A third click completes the sequence and the following click starts a new
 * single-click sequence. Surface and coordinate changes also restart it.
 * @param previous - previous process-local click, if any.
 * @param next - current surface and zero-based cell.
 * @param time - current timestamp in milliseconds.
 * @param windowMs - maximum gap between clicks in one sequence.
 * @returns the new click record.
 */
export function advanceTuiScreenClick(
  previous: TuiScreenClick | undefined,
  next: { surface: string; at: TuiScreenPosition },
  time: number,
  windowMs = 500,
): TuiScreenClick {
  const same = previous !== undefined
    && previous.surface === next.surface
    && previous.at.row === next.at.row
    && previous.at.column === next.at.column
    && time >= previous.time
    && time - previous.time <= windowMs
  const count: 1 | 2 | 3 = same
    ? previous.count === 1 ? 2 : previous.count === 2 ? 3 : 1
    : 1
  return Object.freeze({ surface: next.surface, at: { ...next.at }, time, count })
}
