/** Cached logical and physical rows for one focused transcript detail. */

import type { TranscriptNode, TranscriptToolNode } from './transcript.ts'
import { terminalMarkdownText } from './markdown.ts'
import { terminalSafe } from './sanitize.ts'
import { toolDetailLines, toolStateMark } from './tool-card.tsx'
import { terminalWrappedLines } from './viewport.ts'

interface DetailCacheEntry {
  readonly target: TranscriptNode | TranscriptToolNode
  readonly logicalLines: readonly string[]
  readonly physicalLines: Map<number, readonly string[]>
}

function detailTitle(tool: TranscriptToolNode): string {
  return tool.resultView?.title ?? tool.callView.title
}

function logicalDetailLines(node: TranscriptNode, child?: TranscriptToolNode): readonly string[] {
  if (child !== undefined) return toolDetailLines(child)
  if (node.kind === 'tool') return toolDetailLines(node)
  if (node.kind === 'text') {
    const text = node.tone === 'assistant' || node.tone === 'reasoning'
      ? terminalMarkdownText(node.text)
      : node.text
    return text.split('\n')
  }
  if (node.kind === 'todo') return node.todos.map(todo =>
    `${todo.status === 'completed' ? '[x]' : todo.status === 'in_progress' ? '[>]' : '[ ]'} ${terminalSafe(todo.content)}`)
  if (node.kind === 'compaction') return [
    `State: ${node.state}`,
    `${node.shadowedItemCount} history items · ~${node.shadowedTokenCount} tokens`,
    ...(node.shadowedRange === undefined ? [] : [`Range: ${node.shadowedRange.start}-${node.shadowedRange.end}`]),
    ...(node.error === undefined ? [] : [`Error: ${node.error}`]),
    ...(node.summary ?? '').split('\n'),
  ].filter(Boolean)
  return node.tools.map(tool => `${toolStateMark(tool)} ${detailTitle(tool)}`)
}

/**
 * Project complete unwrapped transcript detail for clipboard transfer.
 * @param node - current semantic parent block.
 * @param child - focused retained tool child, when applicable.
 * @returns terminal-safe logical rows joined without viewport-introduced wrapping.
 */
export function tuiTranscriptDetailText(node: TranscriptNode, child?: TranscriptToolNode): string {
  return logicalDetailLines(node, child).join('\n')
}

/** Process-local detail projection keyed by stable block identity and current node reference. */
export class TuiTranscriptDetailCache {
  private readonly entries = new Map<string, DetailCacheEntry>()

  /** Drop all cached logical and width-dependent physical rows. */
  reset(): void {
    this.entries.clear()
  }

  /**
   * Resolve wrapped physical rows for one transcript block or retained child.
   * @param node - current semantic parent block.
   * @param width - available terminal cells.
   * @param child - focused retained tool child, when applicable.
   * @returns immutable physical detail rows.
   */
  lines(node: TranscriptNode, width: number, child?: TranscriptToolNode): readonly string[] {
    const key = child === undefined ? node.key : `${node.key}:${child.callId}`
    const target = child ?? node
    let entry = this.entries.get(key)
    if (entry?.target !== target) {
      entry = {
        target,
        logicalLines: Object.freeze([...logicalDetailLines(node, child)]),
        physicalLines: new Map(),
      }
      this.entries.set(key, entry)
    }
    const columns = Math.max(1, width)
    const cached = entry.physicalLines.get(columns)
    if (cached !== undefined) return cached
    const physical = Object.freeze(entry.logicalLines.flatMap(line => terminalWrappedLines(line, columns)))
    entry.physicalLines.set(columns, physical)
    return physical
  }
}
