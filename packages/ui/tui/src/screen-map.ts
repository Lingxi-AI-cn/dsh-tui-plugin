/** Bounded terminal-cell provenance for selectable TUI text projections. */

import stringWidth from 'string-width'
import { tuiBidiGraphemes, type TuiBidiGrapheme } from './bidi.ts'
import { tuiFindHyperlinks, tuiHyperlinkAt, type TuiHyperlinkRange } from './hyperlink.ts'
import { terminalSafe } from './sanitize.ts'
import { terminalWrappedLines } from './viewport.ts'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** One already-bounded logical projection line supplied by a TUI owner. */
export interface TuiScreenMapLine {
  /** Stable semantic block identity used by focus and copy owners. */
  semanticBlockKey: string
  /** Terminal-safe logical text. Newlines create hard-newline boundaries. */
  text: string
  /** Optional terminal-safe, non-selectable prefix rendered on every physical row. */
  gutter?: string | undefined
  /** Whether text cells may participate in a future selection. Defaults to `true`. */
  selectable?: boolean | undefined
}

/** Options for projecting bounded logical lines into terminal cells. */
export interface TuiScreenMapOptions {
  /** Physical terminal columns available to the projection. */
  columns: number
  /** Maximum physical rows to retain; omitted means the caller's input bound applies. */
  maxRows?: number | undefined
  /** Cell order; logical is the compatibility default. */
  bidi?: 'logical' | 'visual' | undefined
}

/** One physical terminal cell with its semantic and wrapping provenance. */
export interface TuiScreenCell {
  /** Grapheme rendered at the first cell of an atomic cluster; empty for continuation/padding. */
  grapheme: string
  /** Display width of the grapheme, or `0` for a wide-grapheme continuation cell. */
  displayWidth: number
  /** Whether this cell continues the grapheme in the preceding cell. */
  continuation: boolean
  /** Whether the boundary after this row is a soft wrap. */
  softWrap: boolean
  /** Whether the boundary after this row is a source newline. */
  hardNewline: boolean
  /** Semantic block owning this cell. */
  semanticBlockKey: string
  /** Whether a selection may include this cell. Gutters and padding are false. */
  selectable: boolean
  /** Cell origin, allowing copy owners to exclude gutters without text heuristics. */
  source: 'gutter' | 'text' | 'padding'
  /** Safe HTTP(S) target when this text cell is part of an OSC 8 link. */
  hyperlink?: string | undefined
  /** Logical grapheme index within the source line for visual bidi maps. */
  logicalIndex?: number | undefined
}

/** One physical screen row in the map's logical or visual bidi order. */
export interface TuiScreenMapRow {
  /** Zero-based row in the projected map. */
  row: number
  /** Cells from left to right in the map's logical or visual order. */
  cells: readonly TuiScreenCell[]
  /** Semantic block represented by the row. */
  semanticBlockKey: string
  /** Whether this row continues the same logical source line. */
  softWrap: boolean
  /** Whether this row ends at a source newline. */
  hardNewline: boolean
}

/** Complete bounded screen-cell projection with explicit logical/visual order. */
export interface TuiScreenMap {
  /** Requested physical width in terminal cells. */
  columns: number
  /** Rows retained after the optional physical-row bound. */
  rows: readonly TuiScreenMapRow[]
  /** Cell order used by this bounded map. */
  bidi: 'logical' | 'visual'
  /** Whether the input produced rows beyond `maxRows`. */
  truncated: boolean
}

interface MutableCell {
  grapheme: string
  displayWidth: number
  continuation: boolean
  softWrap: boolean
  hardNewline: boolean
  semanticBlockKey: string
  selectable: boolean
  source: 'gutter' | 'text' | 'padding'
  hyperlink?: string | undefined
  logicalIndex?: number | undefined
}

function appendGraphemes(
  target: MutableCell[],
  value: string,
  source: 'gutter' | 'text',
  semanticBlockKey: string,
  selectable: boolean,
  hyperlinks: readonly TuiHyperlinkRange[] = [],
): void {
  for (const { segment, index: sourceIndex } of graphemes.segment(value)) {
    const width = stringWidth(segment)
    const hyperlink = source === 'text' ? tuiHyperlinkAt(hyperlinks, sourceIndex) : undefined
    let previous: MutableCell | undefined
    for (let index = target.length - 1; index >= 0; index -= 1) {
      const candidate = target[index]
      if (candidate === undefined || candidate.source !== source) break
      if (!candidate.continuation) {
        previous = candidate
        break
      }
    }
    if (width === 0 && previous !== undefined) {
      previous.grapheme += segment
      continue
    }
    if (width === 0) {
      target.push({
        grapheme: segment, displayWidth: 1, continuation: false,
        softWrap: false, hardNewline: false, semanticBlockKey, selectable, source,
        logicalIndex: sourceIndex,
        ...hyperlink === undefined ? {} : { hyperlink },
      })
      continue
    }
    target.push({
      grapheme: segment, displayWidth: width, continuation: false,
      softWrap: false, hardNewline: false, semanticBlockKey, selectable, source,
      logicalIndex: sourceIndex,
      ...hyperlink === undefined ? {} : { hyperlink },
    })
    for (let widthIndex = 1; widthIndex < width; widthIndex += 1) {
      target.push({
        grapheme: '', displayWidth: 0, continuation: true,
        softWrap: false, hardNewline: false, semanticBlockKey, selectable, source,
        logicalIndex: sourceIndex,
        ...hyperlink === undefined ? {} : { hyperlink },
      })
    }
  }
}

function immutableCell(cell: MutableCell): TuiScreenCell {
  return Object.freeze({ ...cell })
}

function boundAtomicCells(cells: readonly MutableCell[], columns: number): MutableCell[] {
  const bounded: MutableCell[] = []
  for (let index = 0; index < cells.length;) {
    const first = cells[index]
    if (first === undefined || first.continuation) break
    const width = Math.max(1, first.displayWidth)
    if (bounded.length + width > columns) break
    bounded.push(...cells.slice(index, index + width))
    index += width
  }
  return bounded
}

function projectRow(
  row: number,
  line: TuiScreenMapLine,
  text: string,
  columns: number,
  softWrap: boolean,
  hardNewline: boolean,
): TuiScreenMapRow {
  const safeGutter = line.gutter === undefined ? '' : terminalSafe(line.gutter)
  const safeText = terminalSafe(text)
  const gutterCells: MutableCell[] = []
  appendGraphemes(gutterCells, safeGutter, 'gutter', line.semanticBlockKey, false)
  const boundedGutter = boundAtomicCells(gutterCells, columns)
  const cells = [...boundedGutter]
  appendGraphemes(cells, safeText, 'text', line.semanticBlockKey, line.selectable !== false, tuiFindHyperlinks(safeText))
  while (cells.length < columns) {
    cells.push({
      grapheme: '', displayWidth: 1, continuation: false,
      softWrap: false, hardNewline: false, semanticBlockKey: line.semanticBlockKey,
      selectable: false, source: 'padding',
    })
  }
  const last = cells.at(-1)
  if (last !== undefined) {
    last.softWrap = softWrap
    last.hardNewline = hardNewline
  }
  return Object.freeze({
    row,
    cells: Object.freeze(cells.map(immutableCell)),
    semanticBlockKey: line.semanticBlockKey,
    softWrap,
    hardNewline,
  })
}

function appendBidiGraphemes(
  target: MutableCell[],
  tokens: readonly TuiBidiGrapheme[],
  semanticBlockKey: string,
  selectable: boolean,
  hyperlinks: readonly TuiHyperlinkRange[],
): void {
  for (const token of tokens) {
    const width = Math.max(1, stringWidth(token.text))
    const hyperlink = tuiHyperlinkAt(hyperlinks, token.sourceIndex)
    target.push({
      grapheme: token.text,
      displayWidth: width,
      continuation: false,
      softWrap: false,
      hardNewline: false,
      semanticBlockKey,
      selectable,
      source: 'text',
      logicalIndex: token.logicalIndex,
      ...hyperlink === undefined ? {} : { hyperlink },
    })
    for (let index = 1; index < width; index += 1) {
      target.push({
        grapheme: '',
        displayWidth: 0,
        continuation: true,
        softWrap: false,
        hardNewline: false,
        semanticBlockKey,
        selectable,
        source: 'text',
        logicalIndex: token.logicalIndex,
        ...hyperlink === undefined ? {} : { hyperlink },
      })
    }
  }
}

function projectBidiRow(
  row: number,
  line: TuiScreenMapLine,
  tokens: readonly TuiBidiGrapheme[],
  columns: number,
  softWrap: boolean,
  hardNewline: boolean,
  hyperlinks: readonly TuiHyperlinkRange[],
): TuiScreenMapRow {
  const safeGutter = line.gutter === undefined ? '' : terminalSafe(line.gutter)
  const gutterCells: MutableCell[] = []
  appendGraphemes(gutterCells, safeGutter, 'gutter', line.semanticBlockKey, false)
  const cells = boundAtomicCells(gutterCells, columns)
  appendBidiGraphemes(cells, tokens, line.semanticBlockKey, line.selectable !== false, hyperlinks)
  while (cells.length < columns) {
    cells.push({
      grapheme: '', displayWidth: 1, continuation: false,
      softWrap: false, hardNewline: false, semanticBlockKey: line.semanticBlockKey,
      selectable: false, source: 'padding',
    })
  }
  const last = cells.at(-1)
  if (last !== undefined) {
    last.softWrap = softWrap
    last.hardNewline = hardNewline
  }
  return Object.freeze({
    row,
    cells: Object.freeze(cells.map(immutableCell)),
    semanticBlockKey: line.semanticBlockKey,
    softWrap,
    hardNewline,
  })
}

/**
 * Project bounded logical rows into a stable terminal-cell map.
 *
 * Newlines become hard boundaries and width wrapping becomes soft boundaries.
 * Wide graphemes remain atomic and receive continuation cells; zero-width
 * combining marks remain attached to their preceding grapheme. The default
 * map keeps logical order; visual maps use UAX #9 grapheme reordering while
 * retaining each cell's logical index for copy semantics.
 * @param lines - bounded semantic rows from transcript or detail projection.
 * @param options - terminal width and optional physical-row cap.
 * @returns immutable cell provenance for the retained rows.
 */
export function projectTuiScreenMap(
  lines: readonly TuiScreenMapLine[],
  options: TuiScreenMapOptions,
): TuiScreenMap {
  const columns = Math.max(1, Math.floor(options.columns))
  const maxRows = options.maxRows === undefined
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.floor(options.maxRows))
  const bidi = options.bidi ?? 'logical'
  const rows: TuiScreenMapRow[] = []
  let truncated = false
  if (bidi === 'visual') {
    for (const line of lines) {
      const safeText = terminalSafe(line.text)
      const hyperlinks = tuiFindHyperlinks(safeText)
      const logicalLines = safeText.split('\n')
      const gutterWidth = Math.min(columns, stringWidth(line.gutter === undefined ? '' : terminalSafe(line.gutter)))
      const textColumns = Math.max(1, columns - gutterWidth)
      for (const [logicalIndex, logicalLine] of logicalLines.entries()) {
        const logicalOffset = logicalLines.slice(0, logicalIndex).reduce((total, value) => total + value.length + 1, 0)
        const lineHyperlinks = hyperlinks
          .filter(range => range.start >= logicalOffset && range.end <= logicalOffset + logicalLine.length)
          .map(range => Object.freeze({
            start: range.start - logicalOffset,
            end: range.end - logicalOffset,
            url: range.url,
          }))
        const tokens = tuiBidiGraphemes(logicalLine)
        const wrapped: TuiBidiGrapheme[][] = []
        let current: TuiBidiGrapheme[] = []
        let currentWidth = 0
        for (const token of tokens) {
          const tokenWidth = Math.max(1, stringWidth(token.text))
          if (current.length > 0 && currentWidth + tokenWidth > textColumns) {
            wrapped.push(current)
            current = []
            currentWidth = 0
          }
          current.push(token)
          currentWidth += tokenWidth
        }
        if (current.length > 0 || wrapped.length === 0) wrapped.push(current)
        for (const [rowIndex, rowTokens] of wrapped.entries()) {
          if (rows.length >= maxRows) {
            truncated = true
            break
          }
          const softWrap = rowIndex < wrapped.length - 1
          const hardNewline = !softWrap && logicalIndex < logicalLines.length - 1
          rows.push(projectBidiRow(rows.length, line, rowTokens, columns, softWrap, hardNewline, lineHyperlinks))
        }
        if (truncated) break
      }
      if (truncated) break
    }
    return Object.freeze({
      columns,
      rows: Object.freeze(rows),
      bidi,
      truncated,
    })
  }
  for (const line of lines) {
    const safeGutter = line.gutter === undefined ? '' : terminalSafe(line.gutter)
    const gutterWidth = Math.min(columns, stringWidth(safeGutter))
    const textColumns = Math.max(1, columns - gutterWidth)
    const logicalLines = terminalSafe(line.text).split('\n')
    for (const [logicalIndex, logicalLine] of logicalLines.entries()) {
      const wrappedLines = terminalWrappedLines(logicalLine, textColumns)
      for (const [index, text] of wrappedLines.entries()) {
        const softWrap = index < wrappedLines.length - 1
        const hardNewline = !softWrap && logicalIndex < logicalLines.length - 1
        if (rows.length >= maxRows) {
          truncated = true
          break
        }
        rows.push(projectRow(rows.length, line, text, columns, softWrap, hardNewline))
      }
      if (truncated) break
    }
    if (truncated) break
  }
  return Object.freeze({
    columns,
    rows: Object.freeze(rows),
    bidi,
    truncated,
  })
}
