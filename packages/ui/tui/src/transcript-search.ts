/** Cached full-transcript search over the TUI's semantic node projection. */

import type { TranscriptNode, TranscriptToolNode } from './transcript.ts'
import { terminalSafe } from './sanitize.ts'
import { toolDetailLines } from './tool-card.tsx'

/** One searchable semantic transcript block. */
export interface TuiTranscriptSearchDocument {
  /** Stable transcript-node identity. */
  readonly key: string
  /** Current index in the complete folded transcript. */
  readonly nodeIndex: number
  /** Terminal-safe, whitespace-normalized text used for snippets. */
  readonly text: string
  /** Unicode-normalized lowercase text used for matching. */
  readonly normalizedText: string
}

/** One matching transcript block. */
export interface TuiTranscriptSearchHit extends TuiTranscriptSearchDocument {
  /** Start of the first match in `normalizedText`. */
  readonly matchStart: number
  /** End of the first match in `normalizedText`. */
  readonly matchEnd: number
}

/** One highlighted or ordinary substring for the search-result renderer. */
export interface TuiTranscriptSearchSegment {
  /** Source text for this segment. */
  readonly text: string
  /** Whether this segment is the first query match. */
  readonly match: boolean
}

interface CachedDocumentText {
  readonly node: TranscriptNode
  readonly text: string
  readonly normalizedText: string
}

/**
 * Retain lowercase search documents by stable node identity. Updating the
 * complete projection only re-normalizes blocks whose searchable text changed.
 */
export class TuiTranscriptSearchIndex {
  private readonly cache = new Map<string, CachedDocumentText>()
  private documents: readonly TuiTranscriptSearchDocument[] = Object.freeze([])

  /**
   * Reconcile the index with one complete folded transcript.
   * @param nodes - every semantic transcript node, including unmounted pages.
   */
  update(nodes: readonly TranscriptNode[]): void {
    const retained = new Set<string>()
    const documents = nodes.map((node, nodeIndex): TuiTranscriptSearchDocument => {
      retained.add(node.key)
      const cached = this.cache.get(node.key)
      let entry = cached
      if (entry?.node !== node) {
        const text = transcriptNodeSearchText(node)
        entry = Object.freeze({ node, text, normalizedText: normalizeTuiTranscriptSearchText(text) })
      }
      if (entry !== cached) this.cache.set(node.key, entry)
      return Object.freeze({
        key: node.key,
        nodeIndex,
        text: entry.text,
        normalizedText: entry.normalizedText,
      })
    })
    for (const key of this.cache.keys()) {
      if (!retained.has(key)) this.cache.delete(key)
    }
    this.documents = Object.freeze(documents)
  }

  /**
   * Find every matching semantic block in transcript order.
   * @param query - incremental caller query.
   * @returns one hit per matching block; an empty query has no hits.
   */
  search(query: string): readonly TuiTranscriptSearchHit[] {
    const normalizedQuery = normalizeTuiTranscriptSearchText(query)
    if (normalizedQuery === '') return Object.freeze([])
    const hits: TuiTranscriptSearchHit[] = []
    for (const document of this.documents) {
      const matchStart = document.normalizedText.indexOf(normalizedQuery)
      if (matchStart < 0) continue
      hits.push(Object.freeze({
        ...document,
        matchStart,
        matchEnd: matchStart + normalizedQuery.length,
      }))
    }
    return Object.freeze(hits)
  }
}

/**
 * Normalize terminal search text for case-insensitive incremental matching.
 * @param value - query or projected block text.
 * @returns terminal-safe NFKC lowercase text with collapsed whitespace.
 */
export function normalizeTuiTranscriptSearchText(value: string): string {
  return terminalSafe(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim()
}

/**
 * Split display text around its first normalized query match.
 * @param text - terminal-safe search document text.
 * @param query - active search query.
 * @returns immutable display segments; normalization-only matches highlight the complete text.
 */
export function tuiTranscriptSearchSegments(
  text: string,
  query: string,
): readonly TuiTranscriptSearchSegment[] {
  const normalizedText = normalizeTuiTranscriptSearchText(text)
  const normalizedQuery = normalizeTuiTranscriptSearchText(query)
  if (normalizedQuery === '') return Object.freeze([{ text, match: false }])
  const start = normalizedText.indexOf(normalizedQuery)
  if (start < 0) return Object.freeze([{ text, match: false }])
  const directStart = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  if (directStart < 0) return Object.freeze([{ text, match: true }])
  const end = directStart + query.length
  return Object.freeze([
    ...directStart === 0 ? [] : [{ text: text.slice(0, directStart), match: false }],
    { text: text.slice(directStart, end), match: true },
    ...end === text.length ? [] : [{ text: text.slice(end), match: false }],
  ].map(segment => Object.freeze(segment)))
}

/**
 * Preserve the selected block across index refreshes while it still matches.
 * @param hits - current transcript-ordered matches.
 * @param selectedKey - previously selected stable node key.
 * @returns the retained hit, the first hit, or `undefined` when no block matches.
 */
export function resolveTuiTranscriptSearchHit(
  hits: readonly TuiTranscriptSearchHit[],
  selectedKey: string | undefined,
): TuiTranscriptSearchHit | undefined {
  return hits.find(hit => hit.key === selectedKey) ?? hits[0]
}

function transcriptNodeSearchText(node: TranscriptNode): string {
  if (node.kind === 'text') return compactSearchText([node.label, node.text])
  if (node.kind === 'tool') return toolSearchText(node)
  if (node.kind === 'compaction') return compactSearchText([
    'Compaction', node.state, node.summary ?? '', node.error ?? '',
    `${node.shadowedItemCount} history items`, `${node.shadowedTokenCount} tokens`,
  ])
  if (node.kind === 'todo') {
    return compactSearchText([
      'Tasks',
      ...node.todos.map(todo => `${todo.status} ${todo.content}`),
    ])
  }
  return compactSearchText([
    node.activity,
    ...node.tools.map(toolSearchText),
  ])
}

function toolSearchText(tool: TranscriptToolNode): string {
  return compactSearchText([
    tool.name,
    tool.callView.title,
    tool.resultView?.title ?? '',
    ...toolDetailLines(tool).filter(line => !line.startsWith('Elapsed:')),
  ])
}

function compactSearchText(parts: readonly string[]): string {
  return terminalSafe(parts.filter(Boolean).join('\n')).replace(/\s+/gu, ' ').trim()
}
