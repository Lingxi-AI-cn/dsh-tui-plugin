/** Width-aware terminal projection for provider-neutral file diffs. */

import stringWidth from 'string-width'
import { terminalSafe } from './sanitize.ts'

/** One file hunk consumed by the TUI diff projection. */
export interface TuiDiffHunk {
  /** Display path supplied by the tool presentation owner. */
  readonly path: string
  /** Previous content, or `null` when there is no previous file. */
  readonly oldText: string | null
  /** Content after the mutation. */
  readonly newText: string
}

/** Requested terminal diff presentation. */
export type TuiDiffMode = 'auto' | 'unified' | 'split'

const SPLIT_GUTTER = ' │ '
const SPLIT_GUTTER_CELLS = stringWidth(SPLIT_GUTTER)
const MIN_SPLIT_SIDE_CELLS = 24
const MAX_LCS_CELLS = 65_536

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function contentLines(text: string): string[] {
  const safe = terminalSafe(text)
  if (safe === '') return []
  return (safe.endsWith('\n') ? safe.slice(0, -1) : safe).split('\n')
}

function truncateCells(text: string, columns: number): string {
  const width = Math.max(0, columns)
  if (width === 0) return ''
  if (stringWidth(text) <= width) return text
  if (width === 1) return '…'
  let output = ''
  for (const { segment } of graphemes.segment(text)) {
    if (stringWidth(output + segment) > width - 1) break
    output += segment
  }
  return `${output}…`
}

function padCells(text: string, columns: number): string {
  const missing = Math.max(0, columns - stringWidth(text))
  return `${text}${' '.repeat(missing)}`
}

/** Resolve the concrete layout for a requested mode and available cell width. */
export function resolveTuiDiffMode(width: number, requested: TuiDiffMode = 'auto'): Exclude<TuiDiffMode, 'auto'> {
  if (requested !== 'auto') return requested
  const columns = Math.max(0, width)
  return columns >= MIN_SPLIT_SIDE_CELLS * 2 + SPLIT_GUTTER_CELLS ? 'split' : 'unified'
}

interface AlignedDiffRow {
  readonly oldText?: string | undefined
  readonly newText?: string | undefined
  readonly kind: 'context' | 'change' | 'delete' | 'add'
}

function positionalAlignment(oldLines: readonly string[], newLines: readonly string[]): readonly AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = []
  const count = Math.max(oldLines.length, newLines.length)
  for (let index = 0; index < count; index += 1) {
    const oldText = oldLines[index]
    const newText = newLines[index]
    if (oldText === undefined) rows.push({ newText, kind: 'add' })
    else if (newText === undefined) rows.push({ oldText, kind: 'delete' })
    else rows.push({ oldText, newText, kind: oldText === newText ? 'context' : 'change' })
  }
  return rows
}

/**
 * Align changed lines with a bounded, case-insensitive LCS. Large hunks use a
 * positional fallback so a hostile tool result cannot allocate unbounded state.
 */
function alignDiffLines(oldLines: readonly string[], newLines: readonly string[]): readonly AlignedDiffRow[] {
  if (oldLines.length === 0 || newLines.length === 0) return positionalAlignment(oldLines, newLines)
  if (oldLines.length * newLines.length > MAX_LCS_CELLS) return positionalAlignment(oldLines, newLines)

  const table = Array.from({ length: oldLines.length + 1 }, () => new Uint16Array(newLines.length + 1))
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const current = table[oldIndex]
      const below = table[oldIndex + 1]
      const oldText = oldLines[oldIndex]
      const newText = newLines[newIndex]
      if (current === undefined || below === undefined || oldText === undefined || newText === undefined) continue
      current[newIndex] = oldText.toLowerCase() === newText.toLowerCase()
        ? (below[newIndex + 1] ?? 0) + 1
        : Math.max(below[newIndex] ?? 0, current[newIndex + 1] ?? 0)
    }
  }

  const rows: AlignedDiffRow[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldText = oldLines[oldIndex]
    const newText = newLines[newIndex]
    if (oldText !== undefined && newText !== undefined
      && oldText.toLowerCase() === newText.toLowerCase()) {
      rows.push({ oldText, newText, kind: oldText === newText ? 'context' : 'change' })
      oldIndex += 1
      newIndex += 1
    } else if (oldText !== undefined && (newText === undefined
      || (table[oldIndex + 1]?.[newIndex] ?? 0) >= (table[oldIndex]?.[newIndex + 1] ?? 0))) {
      rows.push({ oldText, kind: 'delete' })
      oldIndex += 1
    } else if (newText !== undefined) {
      rows.push({ newText, kind: 'add' })
      newIndex += 1
    }
  }
  const collapsed: AlignedDiffRow[] = []
  for (let index = 0; index < rows.length;) {
    const row = rows[index]
    if (row?.kind === 'context') {
      collapsed.push(row)
      index += 1
      continue
    }
    const oldBlock: string[] = []
    const newBlock: string[] = []
    while (index < rows.length && rows[index]?.kind !== 'context') {
      const changed = rows[index]
      if (changed === undefined) break
      if (changed.oldText !== undefined) oldBlock.push(changed.oldText)
      if (changed.newText !== undefined) newBlock.push(changed.newText)
      index += 1
    }
    const paired = Math.min(oldBlock.length, newBlock.length)
    for (let pair = 0; pair < paired; pair += 1) {
      collapsed.push({ oldText: oldBlock[pair], newText: newBlock[pair], kind: 'change' })
    }
    for (let pair = paired; pair < oldBlock.length; pair += 1) {
      collapsed.push({ oldText: oldBlock[pair], kind: 'delete' })
    }
    for (let pair = paired; pair < newBlock.length; pair += 1) {
      collapsed.push({ newText: newBlock[pair], kind: 'add' })
    }
  }
  return collapsed
}

function sideText(marker: string, text: string | undefined, width: number): string {
  const columns = Math.max(1, width)
  if (columns === 1) return marker.slice(0, 1)
  const prefix = marker.slice(0, Math.min(columns, marker.length))
  const contentWidth = columns - stringWidth(prefix)
  const content = text === undefined ? '' : truncateCells(text, contentWidth)
  return padCells(`${prefix}${content}`, columns)
}

function splitLines(hunk: TuiDiffHunk, width: number): readonly string[] {
  if (width < SPLIT_GUTTER_CELLS + 2) return unifiedLines(hunk, width)
  const sideWidth = Math.max(1, Math.floor((Math.max(1, width) - SPLIT_GUTTER_CELLS) / 2))
  return [truncateCells(terminalSafe(hunk.path), width), ...alignDiffLines(
    hunk.oldText === null ? [] : contentLines(hunk.oldText),
    contentLines(hunk.newText),
  ).map((row) => {
    const oldMarker = row.kind === 'delete' || row.kind === 'change' ? '- ' : '  '
    const newMarker = row.kind === 'add' || row.kind === 'change' ? '+ ' : '  '
    return `${sideText(oldMarker, row.oldText, sideWidth)}${SPLIT_GUTTER}${sideText(newMarker, row.newText, sideWidth)}`
  })]
}

function unifiedLines(hunk: TuiDiffHunk, width: number): readonly string[] {
  const line = (marker: string, text: string | undefined): string => {
    const columns = Math.max(1, width)
    if (columns === 1) return marker.slice(0, 1)
    const prefix = marker.slice(0, Math.min(columns, marker.length))
    const content = text === undefined ? '' : truncateCells(text, columns - stringWidth(prefix))
    return `${prefix}${content}`
  }
  return [truncateCells(terminalSafe(hunk.path), width), ...alignDiffLines(
    hunk.oldText === null ? [] : contentLines(hunk.oldText),
    contentLines(hunk.newText),
  ).flatMap((row): readonly string[] => {
    if (row.kind === 'context') return [line('  ', row.newText ?? row.oldText)]
    if (row.kind === 'change') return [line('- ', row.oldText), line('+ ', row.newText)]
    if (row.kind === 'delete') return [line('- ', row.oldText)]
    return [line('+ ', row.newText)]
  })]
}

/**
 * Project file diffs into bounded terminal rows. `auto` selects split only when
 * both panes retain a readable minimum; explicit `unified` remains the stable
 * clipboard/search representation and explicit `split` is honored whenever the
 * gutter can fit; extremely narrow requests use the bounded unified form.
 * @param diffs - provider-neutral file hunks in display order.
 * @param width - available terminal cells for one detail row.
 * @param mode - requested layout, defaulting to the width-aware automatic mode.
 * @returns terminal-safe logical rows with `-`/`+` markers preserved.
 */
export function projectTuiDiffLines(
  diffs: readonly TuiDiffHunk[],
  width = 80,
  mode: TuiDiffMode = 'auto',
): readonly string[] {
  const columns = Math.max(1, width)
  const resolved = resolveTuiDiffMode(columns, mode)
  return diffs.flatMap(diff => resolved === 'split' ? splitLines(diff, columns) : unifiedLines(diff, columns))
}
