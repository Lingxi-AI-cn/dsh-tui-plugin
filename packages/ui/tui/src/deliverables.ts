/** Project successful file mutations into a bounded per-turn deliverables row. */

import type { TranscriptNode, TranscriptToolNode } from './transcript.ts'
import { terminalSafe } from './sanitize.ts'
import stringWidth from 'string-width'
import { tuiMessage, type TuiLocale } from './locale.ts'

const DEFAULT_MAX_ITEMS = 24
const MAX_PATH_GRAPHEMES = 1_024
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function fitCells(text: string, columns: number): string {
  const width = Math.max(1, Math.floor(columns))
  if (stringWidth(text) <= width) return text
  if (width === 1) return '…'
  let out = ''
  for (const { segment } of GRAPHEMES.segment(text)) {
    if (stringWidth(`${out}${segment}…`) > width) break
    out += segment
  }
  return `${out}…`
}

/** The mutation class shown beside one delivered file. */
export type TuiDeliverableOperation = 'write' | 'edit' | 'move'

/** One successful file mutation owned by a completed Agent turn. */
export interface TuiDeliverableItem {
  readonly path: string
  readonly operation: TuiDeliverableOperation
  readonly turn: number
  readonly callId: string
}

/** Bounded deliverables projection for the latest turn containing mutations. */
export interface TuiDeliverableSnapshot {
  readonly turn?: number
  readonly items: readonly TuiDeliverableItem[]
  readonly omitted: number
}

/** Width-fitted single-row projection for a completed Turn. */
export interface TuiDeliverableRow {
  readonly text: string
  readonly visibleCount: number
  readonly omitted: number
}

/** One closing-message inline-code token proven to name a delivered file. */
export interface TuiDeliverableInlineReference {
  /** Visible inline-code text retained by the terminal Markdown projection. */
  readonly text: string
  /** Exact owner-projected path; never reconstructed from the assistant prose. */
  readonly path: string
  /** Index in the owning deliverables node used by keyboard-equivalent actions. */
  readonly itemIndex: number
}

function inlineCodeValues(text: string): readonly string[] {
  const values: string[] = []
  for (let offset = 0; offset < text.length && values.length < 256;) {
    if (text[offset] !== '`') {
      offset += 1
      continue
    }
    let delimiterEnd = offset + 1
    while (text[delimiterEnd] === '`') delimiterEnd += 1
    const delimiterLength = delimiterEnd - offset
    let cursor = delimiterEnd
    let closingStart = -1
    while (cursor < text.length) {
      const candidate = text.indexOf('`', cursor)
      if (candidate < 0) break
      let candidateEnd = candidate + 1
      while (text[candidateEnd] === '`') candidateEnd += 1
      if (candidateEnd - candidate === delimiterLength) {
        closingStart = candidate
        break
      }
      cursor = candidateEnd
    }
    if (closingStart < 0) {
      offset = delimiterEnd
      continue
    }
    const raw = text.slice(delimiterEnd, closingStart)
    if (raw.length <= 4_096 && !raw.includes('\n') && !raw.includes('\r')) {
      const normalized = raw.startsWith(' ') && raw.endsWith(' ') && raw.trim() !== ''
        ? raw.slice(1, -1)
        : raw
      if (normalized !== '' && terminalSafe(normalized) === normalized) values.push(normalized)
    }
    offset = closingStart + delimiterLength
  }
  return Object.freeze(values)
}

function deliverableBasename(path: string): string {
  return path.replace(/\\/gu, '/').split('/').at(-1) ?? path
}

/**
 * Resolve closing-message inline code only against successful mutation facts
 * already owned by the same completed Turn. Exact paths win; a basename is
 * accepted only when it identifies exactly one delivered path. Prose that was
 * not enclosed in inline code and paths from another Turn never become actions.
 *
 * @param node - finalized assistant transcript node.
 * @param deliverables - successful mutations appended for the same Turn.
 * @returns bounded inline references carrying exact owner-projected paths.
 */
export function tuiDeliverableInlineReferences(
  node: Extract<TranscriptNode, { readonly kind: 'text' }>,
  deliverables: Extract<TranscriptNode, { readonly kind: 'deliverables' }>,
): readonly TuiDeliverableInlineReference[] {
  if (node.tone !== 'assistant' || node.closing !== true || node.turn !== deliverables.turn) {
    return Object.freeze([])
  }
  const basenameIndexes = new Map<string, number[]>()
  deliverables.items.forEach((item, index) => {
    const basename = deliverableBasename(item.path)
    basenameIndexes.set(basename, [...basenameIndexes.get(basename) ?? [], index])
  })
  const seen = new Set<string>()
  const references: TuiDeliverableInlineReference[] = []
  for (const text of inlineCodeValues(node.text)) {
    const exact = deliverables.items.findIndex(item => item.path === text)
    const basename = /[\\/]/u.test(text) ? [] : basenameIndexes.get(text) ?? []
    const itemIndex = exact >= 0 ? exact : basename.length === 1 ? basename[0] ?? -1 : -1
    const item = deliverables.items[itemIndex]
    if (item === undefined) continue
    const identity = `${text}\u0000${item.path}`
    if (seen.has(identity)) continue
    seen.add(identity)
    references.push(Object.freeze({ text, path: item.path, itemIndex }))
  }
  return Object.freeze(references)
}

function toolNodes(nodes: readonly TranscriptNode[]): readonly TranscriptToolNode[] {
  return nodes.flatMap(node => node.kind === 'tool'
    ? [node]
    : node.kind === 'tool-group' ? node.tools : [])
}

function operationFor(node: TranscriptToolNode): TuiDeliverableOperation | undefined {
  if (node.state !== 'success') return undefined
  if (node.resultView?.card === 'diff') {
    return node.resultView.diffs.some(diff => diff.oldText === null) ? 'write' : 'edit'
  }
  if (node.callView.card === 'diff') {
    const diffs = node.callView.diffs
    return diffs.some(diff => diff.oldText === null) ? 'write' : 'edit'
  }
  if (node.callView.card !== 'generic') return undefined
  if (node.callView.kind === 'edit') return 'edit'
  if (node.callView.kind === 'move') return 'move'
  return undefined
}

function pathsFor(node: TranscriptToolNode): readonly string[] {
  if (node.resultView?.card === 'diff') return node.resultView.diffs.map(diff => diff.path)
  if (node.callView.card === 'diff') return node.callView.diffs.map(diff => diff.path)
  if (node.callView.card === 'generic') return (node.callView.locations ?? []).map(location => location.path)
  return []
}

function boundedPath(path: string): string | undefined {
  if (path.trim() === '' || terminalSafe(path) !== path
    || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(path)) return undefined
  const graphemes = Array.from(GRAPHEMES.segment(path), entry => entry.segment)
  return graphemes.length <= MAX_PATH_GRAPHEMES ? path : undefined
}

/**
 * Project successful mutation facts from the latest turn that produced them.
 * Read, delete, failed, and turnless tool nodes are intentionally excluded.
 * @param nodes - folded transcript nodes from the current Agent Session.
 * @param maxItems - maximum files retained after per-turn deduplication.
 * @returns bounded deliverables facts; absent `turn` means no successful mutation exists.
 */
export function projectTuiDeliverables(
  nodes: readonly TranscriptNode[],
  maxItems = DEFAULT_MAX_ITEMS,
): TuiDeliverableSnapshot {
  const candidates = toolNodes(nodes).flatMap((node) => {
    const turn = node.turn
    const operation = operationFor(node)
    if (turn === undefined || operation === undefined) return []
    return pathsFor(node).flatMap((path) => {
      const bounded = boundedPath(path)
      return bounded === undefined ? [] : [{ node, path: bounded, operation, turn }]
    })
  })
  const latestTurn = candidates.reduce<number | undefined>((latest, candidate) => (
    latest === undefined || candidate.turn > latest ? candidate.turn : latest
  ), undefined)
  if (latestTurn === undefined) return Object.freeze({ items: Object.freeze([]), omitted: 0 })
  const seen = new Set<string>()
  const latest = candidates.filter(candidate => candidate.turn === latestTurn).filter((candidate) => {
    if (seen.has(candidate.path)) return false
    seen.add(candidate.path)
    return true
  })
  const limit = Number.isSafeInteger(maxItems) ? Math.max(1, Math.min(256, maxItems)) : DEFAULT_MAX_ITEMS
  const items = latest.slice(0, limit).map(candidate => Object.freeze({
    path: candidate.path,
    operation: candidate.operation,
    turn: candidate.turn,
    callId: candidate.node.callId,
  }))
  return Object.freeze({
    turn: latestTurn,
    items: Object.freeze(items),
    omitted: Math.max(0, latest.length - items.length),
  })
}

/**
 * Project successful mutations belonging to one exact Turn.
 * @param nodes - folded transcript nodes available when the Turn closes.
 * @param turn - scheduler Turn whose mutations are requested.
 * @param maxItems - maximum complete paths retained for detail and actions.
 * @returns bounded per-Turn deliverables facts.
 */
export function projectTuiTurnDeliverables(
  nodes: readonly TranscriptNode[],
  turn: number,
  maxItems = DEFAULT_MAX_ITEMS,
): TuiDeliverableSnapshot {
  const candidates = toolNodes(nodes).flatMap((node) => {
    const operation = operationFor(node)
    if (node.turn !== turn || operation === undefined) return []
    return pathsFor(node).flatMap((path) => {
      const bounded = boundedPath(path)
      return bounded === undefined ? [] : [{ node, path: bounded, operation, turn }]
    })
  })
  const seen = new Set<string>()
  const unique = candidates.filter((candidate) => {
    if (seen.has(candidate.path)) return false
    seen.add(candidate.path)
    return true
  })
  const limit = Number.isSafeInteger(maxItems) ? Math.max(1, Math.min(256, maxItems)) : DEFAULT_MAX_ITEMS
  const items = unique.slice(0, limit).map(candidate => Object.freeze({
    path: candidate.path,
    operation: candidate.operation,
    turn,
    callId: candidate.node.callId,
  }))
  return Object.freeze({
    turn,
    items: Object.freeze(items),
    omitted: Math.max(0, unique.length - items.length),
  })
}

/**
 * Fit a per-Turn deliverables summary into one terminal row.
 * @param snapshot - complete bounded mutation facts for one Turn.
 * @param columns - available terminal cells.
 * @param locale - active TUI locale.
 * @returns row text and the exact count hidden by width or the item bound.
 */
export function formatTuiDeliverablesRow(
  snapshot: TuiDeliverableSnapshot,
  columns: number,
  locale: TuiLocale,
): TuiDeliverableRow {
  const width = Math.max(1, Math.floor(columns))
  const visible: string[] = []
  for (const item of snapshot.items) {
    const candidate = [...visible, item.path]
    const hidden = snapshot.items.length - candidate.length + snapshot.omitted
    const text = tuiMessage(locale, 'deliverables.row', {
      paths: candidate.join(' · '),
      suffix: hidden === 0 ? '' : tuiMessage(locale, 'deliverables.more', { count: hidden }),
    })
    if (stringWidth(text) > width) break
    visible.push(item.path)
  }
  const omitted = snapshot.items.length - visible.length + snapshot.omitted
  const suffix = omitted === 0 ? '' : tuiMessage(locale, 'deliverables.more', { count: omitted })
  const text = fitCells(tuiMessage(locale, 'deliverables.row', {
    paths: visible.join(' · '),
    suffix: visible.length === 0 ? suffix.trimStart() : suffix,
  }), width)
  return Object.freeze({ text, visibleCount: visible.length, omitted })
}

/** One physical row per deliverable so selection and pointer identity never drift after wrapping. */
export function formatTuiDeliverableDetailLines(
  snapshot: TuiDeliverableSnapshot,
  columns: number,
  locale: TuiLocale = 'en',
): readonly string[] {
  const width = Math.max(1, Math.floor(columns))
  return Object.freeze([
    ...snapshot.items.map((item, index) => fitCells(
      `${index + 1}. ${tuiMessage(locale, `deliverables.operation.${item.operation}`)} · ${item.path}`,
      width,
    )),
    ...(snapshot.omitted === 0 ? [] : [fitCells(`+${snapshot.omitted}`, width)]),
  ])
}
