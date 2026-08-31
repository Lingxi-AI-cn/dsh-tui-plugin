/** Line-aware transcript selection for the fixed-height terminal viewport. */

import stringWidth from 'string-width'
import { STRUCTURED_CHILD_LIMIT, type TranscriptNode, type TranscriptTextNode } from './transcript.ts'
import { terminalMarkdownText } from './markdown.ts'
import { tuiToolActivityRows } from './tool-activity.tsx'

/** One transcript node plus the exact text selected for this terminal frame. */
export interface TranscriptWindowEntry {
  /** Durable semantic node. */
  node: TranscriptNode
  /** Terminal projection for text nodes; absent for tool nodes. */
  text?: string | undefined
  /** Source physical-row range retained when an oversized text node is paged. */
  textRange?: TuiTranscriptTextWindowRange | undefined
}

/** Physical source rows represented by one paged transcript text entry. */
export interface TuiTranscriptTextWindowRange {
  /** Inclusive source physical row. */
  start: number
  /** Exclusive source physical row. */
  end: number
  /** Total source physical rows at the active terminal width. */
  total: number
}

/** One navigable transcript frame and its position in the complete projection. */
export interface TranscriptWindow {
  /** Entries mounted in this frame. */
  entries: readonly TranscriptWindowEntry[]
  /** First mounted node index, or `-1` for an empty transcript. */
  startIndex: number
  /** Last mounted node index, or `-1` for an empty transcript. */
  endIndex: number
  /** Whether complete transcript content exists above this frame. */
  hasOlder: boolean
  /** Whether complete transcript content exists below this frame. */
  hasNewer: boolean
}

/** Stable process-local position for a historical transcript viewport. */
export interface TuiTranscriptViewportAnchor {
  /** Semantic node key at the top of the viewport. */
  key: string
  /** Previous semantic index used only when replacement removes the key. */
  index: number
  /** Optional physical text row inside an oversized semantic block. */
  rowOffset?: number | undefined
}

/** A visible transcript frame plus bounded blocks mounted as render overscan. */
export interface TuiTranscriptVirtualWindow extends TranscriptWindow {
  /** Nearby blocks mounted before the visible frame without consuming rows. */
  overscanBefore: readonly TranscriptWindowEntry[]
  /** Nearby blocks mounted after the visible frame without consuming rows. */
  overscanAfter: readonly TranscriptWindowEntry[]
  /** First mounted semantic index including overscan, or `-1` when empty. */
  mountedStartIndex: number
  /** Last mounted semantic index including overscan, or `-1` when empty. */
  mountedEndIndex: number
}

/** Diagnostic counters for one viewport index and terminal width. */
export interface TuiTranscriptViewportStats {
  /** Nodes with exact physical heights measured at the current width. */
  measuredBlocks: number
  /** Nodes still represented by conservative height estimates. */
  estimatedBlocks: number
  /** Current prefix-index row total, including estimates. */
  indexedRows: number
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function displayText(node: TranscriptTextNode, width: number): string {
  if (node.tone === 'reasoning' && node.key.startsWith('event:')) return ''
  return node.tone === 'assistant' || node.tone === 'reasoning'
    ? terminalMarkdownText(node.text, width)
    : node.text
}

/**
 * Wrap terminal text by grapheme display cells without splitting a grapheme cluster.
 * @param text - logical terminal text to wrap.
 * @param width - available terminal cells per physical row.
 * @returns wrapped physical display rows.
 */
export function terminalWrappedLines(text: string, width: number): string[] {
  const result: string[] = []
  const columns = Math.max(1, width)
  for (const logicalLine of text.split('\n')) {
    if (logicalLine === '') {
      result.push('')
      continue
    }
    if (/^[\x20-\x7e]+$/u.test(logicalLine)) {
      for (let offset = 0; offset < logicalLine.length; offset += columns) {
        result.push(logicalLine.slice(offset, offset + columns))
      }
      continue
    }
    let line = ''
    let cells = 0
    for (const { segment } of graphemes.segment(logicalLine)) {
      const segmentCells = stringWidth(segment)
      if (line !== '' && cells + segmentCells > columns) {
        result.push(line)
        line = ''
        cells = 0
      }
      line += segment
      cells += segmentCells
    }
    result.push(line)
  }
  return result
}

function pagedText(
  text: string,
  rows: number,
  width: number,
  mode: 'head' | 'tail' | 'offset',
  offset = 0,
): { readonly text: string; readonly range: TuiTranscriptTextWindowRange } {
  const lines = terminalWrappedLines(text, width)
  const total = Math.max(1, lines.length)
  const budget = Math.max(1, rows)
  if (mode === 'tail') {
    const markerRows = total > budget && budget > 1 ? 1 : 0
    const contentRows = Math.max(1, budget - markerRows)
    const start = Math.max(0, total - contentRows)
    return {
      text: [...(start > 0 ? ['… earlier content'] : []), ...lines.slice(start)].join('\n'),
      range: { start, end: total, total },
    }
  }

  const start = Math.min(Math.max(0, mode === 'head' ? 0 : offset), total - 1)
  const hasEarlier = start > 0
  const availableAfterEarlier = Math.max(1, budget - (hasEarlier ? 1 : 0))
  const canMarkLater = availableAfterEarlier > 1 && start + availableAfterEarlier < total
  const contentRows = Math.max(1, availableAfterEarlier - (canMarkLater ? 1 : 0))
  const end = Math.min(total, start + contentRows)
  return {
    text: [
      ...(hasEarlier ? ['… earlier content'] : []),
      ...lines.slice(start, end),
      ...(end < total && canMarkLater ? ['… later content'] : []),
    ].join('\n'),
    range: { start, end, total },
  }
}

function nodeRows(node: TranscriptNode, width: number, projectedText?: string): number {
  if (node.kind === 'tool') return 1
  if (node.kind === 'deliverables') return 1
  if (node.kind === 'turn-usage') return 1
  if (node.kind === 'question') return 1
  if (node.kind === 'tool-activity') return tuiToolActivityRows(node)
  if (node.kind === 'compaction') {
    return 1 + (node.summary === undefined ? 0 : 1) + (node.error === undefined ? 0 : 1)
  }
  if (node.kind === 'tool-group') {
    const visible = Math.min(node.tools.length, STRUCTURED_CHILD_LIMIT)
    return visible + 1 + (node.tools.length > visible ? 1 : 0)
  }
  if (node.kind === 'todo') {
    const visible = Math.min(node.todos.length, STRUCTURED_CHILD_LIMIT)
    return Math.max(1, visible + 1 + (node.todos.length > visible ? 1 : 0))
  }
  if (node.tone === 'reasoning' && node.key.startsWith('event:')) return 2
  return 1 + Math.max(1, terminalWrappedLines(projectedText ?? displayText(node, width), width).length) + 1
}

/**
 * Read the exact physical rows occupied by one mounted transcript entry.
 * @param entry - semantic node and the text selected for this frame.
 * @param width - available terminal cells inside the transcript padding.
 * @returns rendered rows, including the entry's visible bottom margin.
 */
export function tuiTranscriptWindowEntryRows(entry: TranscriptWindowEntry, width: number): number {
  return nodeRows(entry.node, Math.max(1, width), entry.text)
}

function estimatedNodeRows(node: TranscriptNode, width: number): number {
  if (node.kind !== 'text') return nodeRows(node, width)
  if (node.tone === 'reasoning' && node.key.startsWith('event:')) return 2
  let bodyRows = 0
  for (const line of node.text.split('\n')) {
    // Two cells per UTF-16 code unit intentionally overestimates ordinary text.
    bodyRows += Math.max(1, Math.ceil((line.length * 2) / Math.max(1, width)))
  }
  return 2 + bodyRows
}

function entry(
  node: TranscriptNode,
  text?: string,
  textRange?: TuiTranscriptTextWindowRange,
): TranscriptWindowEntry {
  return text === undefined ? { node } : { node, text, ...(textRange === undefined ? {} : { textRange }) }
}

function selectFromStart(
  nodes: readonly TranscriptNode[],
  startIndex: number,
  maxRows: number,
  width: number,
): TranscriptWindow {
  let remaining = Math.max(1, maxRows)
  const selected: TranscriptWindowEntry[] = []
  let endIndex = startIndex - 1
  for (let index = startIndex; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node === undefined) continue
    const required = nodeRows(node, width)
    if (required <= remaining) {
      selected.push(node.kind === 'text' ? entry(node, displayText(node, width)) : entry(node))
      remaining -= required
      endIndex = index
      continue
    }
    if (selected.length === 0 && node.kind === 'text' && remaining >= 2) {
      const page = pagedText(displayText(node, width), Math.max(1, remaining - 2), width, 'head')
      selected.push(entry(node, page.text, page.range))
      endIndex = index
    }
    break
  }
  return {
    entries: Object.freeze(selected), startIndex, endIndex,
    hasOlder: startIndex > 0 || (selected[0]?.textRange?.start ?? 0) > 0,
    hasNewer: (selected.at(-1)?.textRange?.end ?? 0) < (selected.at(-1)?.textRange?.total ?? 0)
      || (endIndex >= 0 && endIndex < nodes.length - 1),
  }
}

/**
 * Select the newest complete transcript blocks that fit the available terminal rows.
 * A final oversized text block retains its label and a marked tail instead of letting
 * Ink flex-shrink unrelated tool cards into border fragments.
 * @param nodes - complete semantic transcript.
 * @param maxRows - physical terminal rows available to the transcript region.
 * @param columns - physical columns available inside the transcript padding.
 * @returns display entries in chronological order.
 */
export function selectTranscriptWindow(
  nodes: readonly TranscriptNode[],
  maxRows: number,
  columns: number,
): readonly TranscriptWindowEntry[] {
  const width = Math.max(1, columns)
  let remaining = Math.max(1, maxRows)
  const selected: TranscriptWindowEntry[] = []

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node === undefined) continue
    if (node.kind === 'tool') {
      if (remaining < 1) break
      selected.push({ node })
      remaining -= 1
      continue
    }

    if (node.kind === 'tool-activity') {
      const required = tuiToolActivityRows(node)
      if (required > remaining) break
      selected.push({ node })
      remaining -= required
      continue
    }

    if (node.kind === 'compaction') {
      const required = nodeRows(node, width)
      if (required > remaining) break
      selected.push({ node })
      remaining -= required
      continue
    }

    if (node.kind === 'tool-group') {
      const visible = Math.min(node.tools.length, STRUCTURED_CHILD_LIMIT)
      const required = visible + 1 + (node.tools.length > visible ? 1 : 0)
      if (required <= remaining) {
        selected.push({ node })
        remaining -= required
        continue
      }
      break
    }

    if (node.kind === 'todo') {
      const visible = Math.min(node.todos.length, STRUCTURED_CHILD_LIMIT)
      const required = Math.max(1, visible + 1 + (node.todos.length > visible ? 1 : 0))
      if (required <= remaining) {
        selected.push({ node })
        remaining -= required
        continue
      }
      break
    }

    if (node.kind === 'deliverables') {
      if (remaining >= 1) {
        selected.push({ node })
        remaining -= 1
        continue
      }
      break
    }

    if (node.kind === 'turn-usage') {
      if (remaining >= 1) {
        selected.push({ node })
        remaining -= 1
        continue
      }
      break
    }

    if (node.kind === 'question') {
      if (remaining >= 1) {
        selected.push({ node })
        remaining -= 1
        continue
      }
      break
    }

    const text = displayText(node, width)
    const bodyRows = Math.max(1, terminalWrappedLines(text, width).length)
    const required = 1 + bodyRows + 1
    if (required <= remaining) {
      selected.push({ node, text })
      remaining -= required
      continue
    }
    if (selected.length === 0 && remaining >= 2) {
      const page = pagedText(text, Math.max(1, remaining - 2), width, 'tail')
      selected.push(entry(node, page.text, page.range))
    }
    break
  }

  return Object.freeze(selected.reverse())
}

/**
 * Select a transcript page from a stable semantic top anchor, or the live tail when absent.
 * @param nodes - complete semantic transcript.
 * @param maxRows - physical rows available to the transcript region.
 * @param columns - physical columns available inside transcript padding.
 * @param startKey - historical page's first node key; absent follows the live tail.
 * @param startIndexHint - previous index used only when node replacement removes `startKey`.
 * @returns mounted entries and navigation boundaries.
 */
export function selectTranscriptPage(
  nodes: readonly TranscriptNode[],
  maxRows: number,
  columns: number,
  startKey?: string,
  startIndexHint?: number,
): TranscriptWindow {
  if (nodes.length === 0) {
    return { entries: Object.freeze([]), startIndex: -1, endIndex: -1, hasOlder: false, hasNewer: false }
  }
  const width = Math.max(1, columns)
  if (startKey !== undefined) {
    const found = nodes.findIndex(node => node.key === startKey)
    const fallback = Math.min(Math.max(0, startIndexHint ?? nodes.length - 1), nodes.length - 1)
    return selectFromStart(nodes, found < 0 ? fallback : found, maxRows, width)
  }
  const entries = selectTranscriptWindow(nodes, maxRows, width)
  const firstKey = entries[0]?.node.key
  const lastKey = entries.at(-1)?.node.key
  const startIndex = firstKey === undefined ? -1 : nodes.findIndex(node => node.key === firstKey)
  const endIndex = lastKey === undefined ? -1 : nodes.findIndex(node => node.key === lastKey)
  return {
    entries,
    startIndex,
    endIndex,
    hasOlder: startIndex > 0 || (entries[0]?.textRange?.start ?? 0) > 0,
    hasNewer: false,
  }
}

/**
 * Resolve the preceding page's stable top anchor without skipping a complete node.
 * @param nodes - complete semantic transcript.
 * @param currentStart - first node index in the current frame.
 * @param maxRows - physical rows available to one frame.
 * @param columns - physical columns available inside transcript padding.
 * @returns preceding frame's first node key, or the oldest key.
 */
export function previousTranscriptPageAnchor(
  nodes: readonly TranscriptNode[],
  currentStart: number,
  maxRows: number,
  columns: number,
): string | undefined {
  if (nodes.length === 0 || currentStart <= 0) return nodes[0]?.key
  const width = Math.max(1, columns)
  let remaining = Math.max(1, maxRows)
  let index = currentStart - 1
  let start = index
  for (; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node === undefined) continue
    const required = nodeRows(node, width)
    if (required > remaining && start !== currentStart - 1) break
    start = index
    remaining -= Math.min(required, remaining)
    if (remaining === 0) break
  }
  return nodes[start]?.key
}

interface TranscriptNodeMeasurement {
  readonly rows: number
  readonly text?: string | undefined
}

function measurementWidth(node: TranscriptNode, width: number): number {
  return node.kind === 'text' ? width : 0
}

class PhysicalRowIndex {
  private readonly tree: number[]

  constructor(values: readonly number[]) {
    this.tree = Array.from({ length: values.length + 1 }, () => 0)
    for (let cursor = 1; cursor < this.tree.length; cursor += 1) {
      this.tree[cursor] = (this.tree[cursor] ?? 0) + (values[cursor - 1] ?? 0)
      const parent = cursor + (cursor & -cursor)
      if (parent < this.tree.length) this.tree[parent] = (this.tree[parent] ?? 0) + (this.tree[cursor] ?? 0)
    }
  }

  add(index: number, delta: number): void {
    for (let cursor = index + 1; cursor < this.tree.length; cursor += cursor & -cursor) {
      this.tree[cursor] = (this.tree[cursor] ?? 0) + delta
    }
  }

  prefix(count: number): number {
    let total = 0
    for (let cursor = Math.min(Math.max(0, count), this.tree.length - 1); cursor > 0; cursor -= cursor & -cursor) {
      total += this.tree[cursor] ?? 0
    }
    return total
  }

  total(): number {
    return this.prefix(this.tree.length - 1)
  }

  indexAt(row: number): number {
    const size = this.tree.length - 1
    if (size <= 0) return -1
    const target = Math.min(Math.max(0, row), Math.max(0, this.total() - 1))
    let index = 0
    let prefix = 0
    let bit = 1
    while (bit * 2 <= size) bit *= 2
    for (; bit > 0; bit = Math.floor(bit / 2)) {
      const next = index + bit
      const value = this.tree[next]
      if (next <= size && value !== undefined && prefix + value <= target) {
        index = next
        prefix += value
      }
    }
    return Math.min(index, size - 1)
  }
}

/**
 * Agent-local physical-row index with node-identity and width-aware measurement caches.
 * Unmounted blocks retain conservative estimates until a viewport operation measures them.
 */
export class TuiTranscriptViewportIndex {
  private readonly measurementCache = new WeakMap<object, Map<number, TranscriptNodeMeasurement>>()
  private nodes: readonly TranscriptNode[] = Object.freeze([])
  private width = 1
  private heights: number[] = []
  private exact: boolean[] = []
  private rows = new PhysicalRowIndex([])
  private keyIndices = new Map<string, number>()
  private nodeIndices = new WeakMap<object, number>()

  constructor(private readonly overscanBlocks = 2) {}

  /**
   * Reconcile the complete semantic projection and current terminal width.
   * @param nodes - complete immutable semantic projection.
   * @param columns - available terminal cells inside transcript padding.
   */
  update(nodes: readonly TranscriptNode[], columns: number): void {
    const width = Math.max(1, columns)
    if (nodes === this.nodes && width === this.width) return
    this.nodes = nodes
    this.width = width
    this.keyIndices = new Map()
    this.nodeIndices = new WeakMap()
    this.heights = []
    this.exact = []
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      if (node === undefined) continue
      if (!this.keyIndices.has(node.key)) this.keyIndices.set(node.key, index)
      this.nodeIndices.set(node, index)
      const cached = this.measurementCache.get(node)?.get(measurementWidth(node, width))
      this.heights[index] = cached?.rows ?? estimatedNodeRows(node, width)
      this.exact[index] = cached !== undefined
    }
    this.rows = new PhysicalRowIndex(this.heights)
  }

  /**
   * Select one visible frame and its bounded render overscan.
   * @param maxRows - physical-row budget for visible transcript content.
   * @param anchor - historical semantic top anchor; absent follows the live tail.
   * @returns visible entries, boundaries, and nearby mounted blocks.
   */
  page(maxRows: number, anchor?: TuiTranscriptViewportAnchor): TuiTranscriptVirtualWindow {
    if (this.nodes.length === 0) return this.virtualize({
      entries: Object.freeze([]), startIndex: -1, endIndex: -1, hasOlder: false, hasNewer: false,
    })
    if (anchor !== undefined) {
      const start = this.resolveIndex(anchor.key, anchor.index)
      return this.virtualize(this.selectFromStart(start, maxRows, anchor.rowOffset ?? 0))
    }
    return this.virtualize(this.selectTail(maxRows))
  }

  /**
   * Resolve a stable key, falling back to the nearest surviving semantic index.
   * @param key - preferred semantic node key.
   * @param indexHint - previous index used when replacement removes the key.
   * @param rowOffset - optional physical row inside an oversized text block.
   * @returns replacement-safe anchor, or undefined for an empty projection.
   */
  anchor(key: string, indexHint: number, rowOffset = 0): TuiTranscriptViewportAnchor | undefined {
    if (this.nodes.length === 0) return undefined
    const index = this.resolveIndex(key, indexHint)
    const node = this.nodes[index]
    return node === undefined ? undefined : {
      key: node.key,
      index,
      ...(rowOffset > 0 ? { rowOffset } : {}),
    }
  }

  /**
   * Resolve the previous complete physical-row page.
   * @param currentStart - first semantic index in the current frame.
   * @param maxRows - physical-row budget for the preceding frame.
   * @returns preceding semantic anchor, or undefined for an empty projection.
   */
  previousAnchor(currentStart: number, maxRows: number): TuiTranscriptViewportAnchor | undefined {
    if (this.nodes.length === 0) return undefined
    if (currentStart <= 0) return this.anchorAt(0)
    let remaining = Math.max(1, maxRows)
    let start = currentStart - 1
    for (let index = currentStart - 1; index >= 0; index -= 1) {
      const required = this.measure(index).rows
      if (required > remaining && start !== currentStart - 1) break
      start = index
      remaining -= Math.min(required, remaining)
      if (remaining === 0) break
    }
    return this.anchorAt(start)
  }

  /**
   * Read the exact-or-estimated physical-row prefix for a semantic block.
   * @param index - semantic block index.
   * @returns indexed rows before that block.
   */
  physicalRowAt(index: number): number {
    return this.rows.prefix(Math.min(Math.max(0, index), this.nodes.length))
  }

  /**
   * Locate the semantic block covering one indexed physical row.
   * @param row - zero-based exact-or-estimated physical row.
   * @returns semantic block index, or `-1` for an empty projection.
   */
  indexAtPhysicalRow(row: number): number {
    return this.rows.indexAt(row)
  }

  /**
   * Read the current exact-or-estimated indexed physical-row total.
   * @returns physical rows represented by the current immutable-node index.
   */
  totalPhysicalRows(): number {
    return this.rows.total()
  }

  /**
   * Resolve a small-scroll target from one indexed physical row. Text blocks
   * retain an inner body-row offset; structured blocks snap to their boundary.
   * @param row - zero-based physical row in the complete semantic projection.
   * @returns replacement-safe semantic/inner-row anchor.
   */
  anchorAtPhysicalRow(row: number): TuiTranscriptViewportAnchor | undefined {
    if (this.nodes.length === 0) return undefined
    let index = this.indexAtPhysicalRow(row)
    if (index < 0) return undefined
    this.measure(index)
    index = this.indexAtPhysicalRow(row)
    const node = this.nodes[index]
    if (node === undefined) return undefined
    const measured = this.measure(index)
    const offset = Math.max(0, row - this.physicalRowAt(index))
    if (node.kind !== 'text') return this.anchorAt(index)
    if (offset >= measured.rows - 1 && index < this.nodes.length - 1) return this.anchorAt(index + 1)
    const bodyOffset = Math.max(0, offset - 1)
    return this.anchor(node.key, index, bodyOffset)
  }

  /**
   * Perform an O(1) semantic-key lookup for navigation and replacement recovery.
   * @param key - semantic node key.
   * @returns semantic index, or `-1` when absent.
   */
  indexOfKey(key: string): number {
    return this.keyIndices.get(key) ?? -1
  }

  /**
   * Perform an O(1) immutable-node lookup for focus navigation.
   * @param node - exact node reference from the current projection.
   * @returns semantic index, or `-1` when absent.
   */
  indexOfNode(node: TranscriptNode): number {
    return this.nodeIndices.get(node) ?? -1
  }

  /**
   * Read current measurement coverage for benchmark and regression evidence.
   * @returns exact/estimated block counts and the indexed physical-row total.
   */
  stats(): TuiTranscriptViewportStats {
    const measuredBlocks = this.exact.reduce((total, value) => total + (value ? 1 : 0), 0)
    return {
      measuredBlocks,
      estimatedBlocks: this.nodes.length - measuredBlocks,
      indexedRows: this.rows.total(),
    }
  }

  private resolveIndex(key: string, hint: number): number {
    return this.keyIndices.get(key)
      ?? Math.min(Math.max(0, hint), Math.max(0, this.nodes.length - 1))
  }

  private anchorAt(index: number): TuiTranscriptViewportAnchor | undefined {
    const node = this.nodes[index]
    return node === undefined ? undefined : { key: node.key, index }
  }

  private measure(index: number): TranscriptNodeMeasurement {
    const node = this.nodes[index]
    if (node === undefined) return { rows: 0 }
    const cacheWidth = measurementWidth(node, this.width)
    const cached = this.measurementCache.get(node)?.get(cacheWidth)
    if (cached !== undefined) return cached
    const text = node.kind === 'text' ? displayText(node, this.width) : undefined
    const measured = Object.freeze({
      rows: nodeRows(node, this.width, text),
      ...(text === undefined ? {} : { text }),
    })
    let widths = this.measurementCache.get(node)
    if (widths === undefined) {
      widths = new Map()
      this.measurementCache.set(node, widths)
    }
    widths.set(cacheWidth, measured)
    const previous = this.heights[index] ?? 0
    this.heights[index] = measured.rows
    this.exact[index] = true
    this.rows.add(index, measured.rows - previous)
    return measured
  }

  private measuredEntry(index: number): TranscriptWindowEntry | undefined {
    const node = this.nodes[index]
    if (node === undefined) return undefined
    const measured = this.measure(index)
    return node.kind === 'text' ? entry(node, measured.text ?? '') : entry(node)
  }

  private overscanEntry(index: number): TranscriptWindowEntry | undefined {
    const node = this.nodes[index]
    if (node === undefined) return undefined
    if (node.kind !== 'text') return entry(node)
    const cached = this.measurementCache.get(node)?.get(measurementWidth(node, this.width))
    return entry(node, cached?.text ?? '')
  }

  private selectFromStart(startIndex: number, maxRows: number, rowOffset = 0): TranscriptWindow {
    let remaining = Math.max(1, maxRows)
    const selected: TranscriptWindowEntry[] = []
    let endIndex = startIndex - 1
    for (let index = startIndex; index < this.nodes.length; index += 1) {
      const node = this.nodes[index]
      if (node === undefined) continue
      const measured = this.measure(index)
      if (selected.length === 0 && node.kind === 'text' && (rowOffset > 0 || measured.rows > remaining)) {
        const page = pagedText(
          measured.text ?? '', Math.max(1, remaining - 2), this.width, rowOffset > 0 ? 'offset' : 'head', rowOffset,
        )
        selected.push(entry(node, page.text, page.range))
        endIndex = index
        return {
          entries: Object.freeze(selected), startIndex, endIndex,
          hasOlder: startIndex > 0 || page.range.start > 0,
          hasNewer: page.range.end < page.range.total || endIndex < this.nodes.length - 1,
        }
      }
      if (measured.rows <= remaining) {
        const item = this.measuredEntry(index)
        if (item !== undefined) selected.push(item)
        remaining -= measured.rows
        endIndex = index
        continue
      }
      break
    }
    return {
      entries: Object.freeze(selected), startIndex, endIndex,
      hasOlder: startIndex > 0, hasNewer: endIndex >= 0 && endIndex < this.nodes.length - 1,
    }
  }

  private selectTail(maxRows: number): TranscriptWindow {
    let remaining = Math.max(1, maxRows)
    const selected: TranscriptWindowEntry[] = []
    let startIndex = this.nodes.length
    for (let index = this.nodes.length - 1; index >= 0; index -= 1) {
      const node = this.nodes[index]
      if (node === undefined) continue
      const measured = this.measure(index)
      if (measured.rows <= remaining) {
        const item = this.measuredEntry(index)
        if (item !== undefined) selected.push(item)
        remaining -= measured.rows
        startIndex = index
        continue
      }
      if (selected.length === 0 && node.kind === 'text' && remaining >= 2) {
        const page = pagedText(measured.text ?? '', Math.max(1, remaining - 2), this.width, 'tail')
        selected.push(entry(node, page.text, page.range))
        startIndex = index
      }
      break
    }
    const entries = Object.freeze(selected.reverse())
    return {
      entries,
      startIndex: entries.length === 0 ? -1 : startIndex,
      endIndex: entries.length === 0 ? -1 : this.nodes.length - 1,
      hasOlder: entries.length > 0 && (startIndex > 0 || (entries[0]?.textRange?.start ?? 0) > 0),
      hasNewer: false,
    }
  }

  private virtualize(window: TranscriptWindow): TuiTranscriptVirtualWindow {
    if (window.startIndex < 0 || window.endIndex < 0) return {
      ...window,
      overscanBefore: Object.freeze([]), overscanAfter: Object.freeze([]),
      mountedStartIndex: -1, mountedEndIndex: -1,
    }
    const mountedStartIndex = Math.max(0, window.startIndex - this.overscanBlocks)
    const mountedEndIndex = Math.min(this.nodes.length - 1, window.endIndex + this.overscanBlocks)
    const before: TranscriptWindowEntry[] = []
    const after: TranscriptWindowEntry[] = []
    for (let index = mountedStartIndex; index < window.startIndex; index += 1) {
      const item = this.overscanEntry(index)
      if (item !== undefined) before.push(item)
    }
    for (let index = window.endIndex + 1; index <= mountedEndIndex; index += 1) {
      const item = this.overscanEntry(index)
      if (item !== undefined) after.push(item)
    }
    return {
      ...window,
      overscanBefore: Object.freeze(before), overscanAfter: Object.freeze(after),
      mountedStartIndex, mountedEndIndex,
    }
  }
}

/** One navigation authority for tail, paging, focus, search, mouse, and boundary jumps. */
export class TuiTranscriptScrollController {
  constructor(private readonly viewport: TuiTranscriptViewportIndex) {}

  /**
   * Follow the live transcript tail.
   * @returns the absent-anchor representation of tail-follow mode.
   */
  latest(): TuiTranscriptViewportAnchor | undefined {
    return undefined
  }

  /**
   * Anchor the oldest surviving semantic block.
   * @returns oldest anchor, or undefined for an empty projection.
   */
  oldest(): TuiTranscriptViewportAnchor | undefined {
    return this.viewport.anchor('', 0)
  }

  /**
   * Anchor one key with replacement-safe fallback.
   * @param key - preferred semantic node key.
   * @param indexHint - previous index used when replacement removes the key.
   * @returns resolved anchor, or undefined for an empty projection.
   */
  reveal(key: string, indexHint: number): TuiTranscriptViewportAnchor | undefined {
    return this.viewport.anchor(key, indexHint)
  }

  /**
   * Move backward by one physical-row page.
   * @param page - current visible frame.
   * @param maxRows - physical-row budget for one frame.
   * @returns preceding anchor, or undefined for an empty projection.
   */
  previous(page: TranscriptWindow, maxRows: number): TuiTranscriptViewportAnchor | undefined {
    const first = page.entries[0]
    if (first?.textRange !== undefined && first.textRange.start > 0) {
      const bodyRows = Math.max(1, maxRows - 2)
      const middleContentRows = Math.max(1, bodyRows - 2)
      return this.viewport.anchor(
        first.node.key,
        page.startIndex,
        Math.max(0, first.textRange.start - middleContentRows),
      )
    }
    return this.viewport.previousAnchor(page.startIndex, maxRows)
  }

  /**
   * Move forward by one physical-row page, returning to tail-follow on the final page.
   * @param page - current visible frame.
   * @param maxRows - physical-row budget for one frame.
   * @returns next historical anchor, or undefined for tail-follow mode.
   */
  next(page: TranscriptWindow, maxRows: number): TuiTranscriptViewportAnchor | undefined {
    const last = page.entries.at(-1)
    if (last?.textRange !== undefined && last.textRange.end < last.textRange.total) {
      return this.viewport.anchor(last.node.key, page.endIndex, last.textRange.end)
    }
    const nextIndex = page.endIndex + 1
    if (nextIndex <= 0) return this.latest()
    const next = this.viewport.anchor('', nextIndex)
    if (next === undefined) return this.latest()
    return this.viewport.page(maxRows, next).hasNewer ? next : this.latest()
  }

  /**
   * Move the viewport top by a small physical-row delta. Oversized text keeps
   * an inner row offset; entering a new text block or compact structured
   * activity snaps at its semantic edge. Reaching the final frame restores
   * tail-follow mode.
   * @param page - current visible frame.
   * @param deltaRows - signed physical-row delta.
   * @param maxRows - physical-row budget for one frame.
   * @returns historical anchor, or undefined for live tail-follow.
   */
  byRows(
    page: TranscriptWindow,
    deltaRows: number,
    maxRows: number,
  ): TuiTranscriptViewportAnchor | undefined {
    const first = page.entries[0]
    if (first === undefined || page.startIndex < 0 || deltaRows === 0) return this.latest()
    const innerRow = first.textRange === undefined ? 0 : 1 + first.textRange.start
    const currentRow = this.viewport.physicalRowAt(page.startIndex) + innerRow
    const targetRow = Math.min(
      Math.max(0, currentRow + Math.trunc(deltaRows)),
      Math.max(0, this.viewport.totalPhysicalRows() - 1),
    )
    const next = this.viewport.anchorAtPhysicalRow(targetRow)
    if (next === undefined) return this.latest()
    const nextPage = this.viewport.page(maxRows, next)
    if (deltaRows > 0 && next.index > page.startIndex && nextPage.entries[0]?.node.kind === 'text') {
      const entered = this.viewport.anchor(next.key, next.index)
      if (entered !== undefined) return entered
    }
    return nextPage.hasNewer ? next : this.latest()
  }

  /**
   * Preserve the current anchor when a target is visible, otherwise reveal it.
   * @param current - current historical anchor, or undefined for tail-follow.
   * @param page - current visible frame.
   * @param key - target semantic key.
   * @param indexHint - target index from the current projection.
   * @returns unchanged current state or a replacement-safe target anchor.
   */
  ensureVisible(
    current: TuiTranscriptViewportAnchor | undefined,
    page: TranscriptWindow,
    key: string,
    indexHint: number,
  ): TuiTranscriptViewportAnchor | undefined {
    const resolved = this.viewport.indexOfKey(key)
    const index = resolved < 0 ? indexHint : resolved
    return index >= page.startIndex && index <= page.endIndex ? current : this.reveal(key, indexHint)
  }
}

/** Suppress same-direction wheel inertia after entering a new long text block. */
export class TuiTranscriptWheelBoundaryGuard {
  private hold: { direction: -1 | 1; lastEventAt: number } | undefined

  /**
   * Start holding subsequent reports from the current wheel gesture.
   * @param direction - normalized wheel direction that crossed the boundary.
   * @param now - current monotonic-enough UI timestamp in milliseconds.
   */
  start(direction: -1 | 1, now: number): void {
    this.hold = { direction, lastEventAt: now }
  }

  /**
   * Consume one inertial report, extending the hold until the gesture becomes quiet.
   * @param direction - normalized direction for the new report.
   * @param now - current monotonic-enough UI timestamp in milliseconds.
   * @returns true when the report belongs to the held gesture and must not scroll.
   */
  consume(direction: -1 | 1, now: number): boolean {
    if (this.hold === undefined || this.hold.direction !== direction || now - this.hold.lastEventAt >= 180) {
      this.hold = undefined
      return false
    }
    this.hold = { direction, lastEventAt: now }
    return true
  }

  /** Clear any held gesture after an unrelated navigation transition. */
  reset(): void {
    this.hold = undefined
  }
}
