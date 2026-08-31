/** Cached logical and physical rows for one focused transcript detail. */

import type { TranscriptNode, TranscriptToolNode } from './transcript.ts'
import { terminalMarkdownText } from './markdown.ts'
import { terminalSafe } from './sanitize.ts'
import { toolDetailLines, toolStateMark } from './tool-card.tsx'
import { terminalWrappedLines } from './viewport.ts'
import { tuiTurnUsageDetailLines } from './turn-usage.ts'
import { tuiMessage, type TuiLocale } from './locale.ts'

interface DetailCacheEntry {
  readonly target: TranscriptNode | TranscriptToolNode
  readonly logicalLines: Map<number, readonly string[]>
  readonly physicalLines: Map<number, readonly string[]>
}

function detailTitle(tool: TranscriptToolNode): string {
  return tool.resultView?.title ?? tool.callView.title
}

function logicalDetailLines(
  node: TranscriptNode,
  child?: TranscriptToolNode,
  width?: number,
  locale: TuiLocale = 'en',
): readonly string[] {
  if (child !== undefined) return toolDetailLines(child, { width })
  if (node.kind === 'tool') return toolDetailLines(node, { width })
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
  if (node.kind === 'deliverables') return [
    ...node.items.map((item, index) => `${index + 1}. ${item.operation} · ${item.path}`),
    ...(node.omitted === 0 ? [] : [`+${node.omitted}`]),
  ]
  if (node.kind === 'turn-usage') return tuiTurnUsageDetailLines(node.usage, locale)
  if (node.kind === 'question') return [
    tuiMessage(locale, 'question.history.detail.status', {
      status: tuiMessage(locale, `question.history.status.${node.status}`),
    }),
    ...node.questions.flatMap((question, index) => [
      `${index + 1}. ${question.header ?? question.id}: ${question.question}`,
      tuiMessage(locale, 'question.history.detail.answer', {
        answer: question.secret
          ? tuiMessage(locale, 'question.history.detail.hidden')
          : question.answer ?? tuiMessage(locale, 'question.history.status.unsubmitted'),
      }),
    ]),
    ...(node.omitted === 0 ? [] : [tuiMessage(locale, 'question.history.detail.omitted', { count: node.omitted })]),
  ]
  return node.tools.map(tool => `${toolStateMark(tool)} ${detailTitle(tool)}`)
}

/**
 * Project complete unwrapped transcript detail for clipboard transfer.
 * @param node - current semantic parent block.
 * @param child - focused retained tool child, when applicable.
 * @param locale - active TUI message catalog locale.
 * @returns terminal-safe logical rows joined without viewport-introduced wrapping.
 */
export function tuiTranscriptDetailText(
  node: TranscriptNode,
  child?: TranscriptToolNode,
  locale: TuiLocale = 'en',
): string {
  return logicalDetailLines(node, child, undefined, locale).join('\n')
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
   * @param locale - active TUI message catalog locale.
   * @returns immutable physical detail rows.
   */
  lines(
    node: TranscriptNode,
    width: number,
    child?: TranscriptToolNode,
    locale: TuiLocale = 'en',
  ): readonly string[] {
    const targetKey = child === undefined ? node.key : `${node.key}:${child.callId}`
    const key = `${targetKey}:${locale}`
    const target = child ?? node
    let entry = this.entries.get(key)
    if (entry?.target !== target) {
      entry = {
        target,
        logicalLines: new Map(),
        physicalLines: new Map(),
      }
      this.entries.set(key, entry)
    }
    const columns = Math.max(1, width)
    const logical = entry.logicalLines.get(columns)
      ?? Object.freeze([...logicalDetailLines(node, child, columns, locale)])
    entry.logicalLines.set(columns, logical)
    const cached = entry.physicalLines.get(columns)
    if (cached !== undefined) return cached
    const physical = Object.freeze(logical.flatMap(line => terminalWrappedLines(line, columns)))
    entry.physicalLines.set(columns, physical)
    return physical
  }
}
