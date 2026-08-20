/** Host-only GFM projection for readable terminal text. */

import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { terminalSafe } from './sanitize.ts'

interface MarkdownNode {
  type: string
  value?: string
  lang?: string | null
  alt?: string
  ordered?: boolean
  start?: number | null
  children?: MarkdownNode[]
}

const BLOCK_HTML_TAG = new RegExp([
  '<\\/?(?:article|aside|blockquote|br|details|div|figcaption|figure|footer|',
  'h[1-6]|header|hr|li|main|ol|p|pre|section|summary|table|tbody|td|',
  'tfoot|th|thead|tr|ul)\\b[^>]*>',
].join(''), 'giu')

/**
 * Recover common block boundaries when a registry removed every physical README line break.
 * @param markdown - untrusted Markdown source.
 * @returns source with conservative physical block separators.
 */
function normalizeMarkdownSource(markdown: string): string {
  const source = markdown.replace(/\r\n?/gu, '\n')
  if (source.includes('\n')) return source
  return source
    .replace(BLOCK_HTML_TAG, '\n\n')
    .replace(/\n[ \t]+/gu, '\n')
    .replace(/([^\n])(?=#{1,6}\s)/gu, '$1\n\n')
    .replace(/(#{1,6}\s+[^\n]+?)(?=(?:[-+]|\d+\.|(?<!\*)\*)\s)/gu, '$1\n\n')
    .replace(/([.!?。！？:：)\]}])(?=(?:[-*+]|\d+\.)\s)/gu, '$1\n\n')
    .replace(/([^\n])(?=```)/gu, '$1\n\n')
    .replace(/```(?=\S)/gu, '```\n')
    .replace(/\n{3,}/gu, '\n\n')
}

function inlineText(node: MarkdownNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
      return node.value ?? ''
    case 'image':
    case 'imageReference':
      return node.alt ?? ''
    case 'break':
      return '\n'
    case 'html':
      return ''
    default:
      return node.children?.map(inlineText).join('') ?? ''
  }
}

function compactInline(node: MarkdownNode): string {
  return inlineText(node).replace(/[ \t\f\v]+/gu, ' ').trim()
}

function blockText(node: MarkdownNode, narrow: boolean): string {
  switch (node.type) {
    case 'root':
      return node.children?.map(child => blockText(child, narrow)).filter(Boolean).join('\n\n') ?? ''
    case 'paragraph':
    case 'heading':
      return compactInline(node)
    case 'code':
      return [`Code${node.lang == null ? '' : ` · ${node.lang}`}`, node.value?.trimEnd() ?? ''].join('\n')
    case 'blockquote':
      return (node.children?.map(child => blockText(child, narrow)).filter(Boolean).join('\n\n') ?? '')
        .split('\n').map(line => `│ ${line}`).join('\n')
    case 'list': {
      const start = node.start ?? 1
      return node.children?.map((child, index) => {
        const marker = node.ordered === true ? `${start + index}.` : '•'
        return `${marker} ${blockText(child, narrow).replace(/\n/gu, '\n  ')}`
      }).filter(Boolean).join('\n') ?? ''
    }
    case 'listItem':
      return node.children?.map(child => blockText(child, narrow)).filter(Boolean).join(' ') ?? ''
    case 'table': {
      if (!narrow) return node.children?.map(child => blockText(child, narrow)).filter(Boolean).join('\n') ?? ''
      const rows = node.children ?? []
      const headers = rows[0]?.children?.map(compactInline) ?? []
      return rows.slice(1).map((row, index) => [
        `Row ${index + 1}`,
        ...(row.children ?? []).map((cell, cellIndex) => `${headers[cellIndex] ?? `Field ${cellIndex + 1}`}: ${compactInline(cell)}`),
      ].join('\n')).join('\n\n')
    }
    case 'tableRow':
      return node.children?.map(child => blockText(child, narrow)).join(' │ ') ?? ''
    case 'tableCell':
      return compactInline(node)
    case 'html':
      return ''
    case 'thematicBreak':
      return '────────'
    case 'definition':
      return ''
    default:
      return compactInline(node)
  }
}

/**
 * Remove Markdown presentation syntax while retaining readable block structure.
 * @param markdown - untrusted GFM source.
 * @param width - available terminal cells used for narrow table projection.
 * @returns terminal-safe text with readable block structure and no raw HTML or resource targets.
 */
export function terminalMarkdownText(markdown: string, width = 80): string {
  try {
    const root = fromMarkdown(normalizeMarkdownSource(markdown), {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    }) as MarkdownNode
    return terminalSafe(blockText(root, width < 60)
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim())
  } catch {
    // A malformed streaming prefix remains readable instead of breaking the TUI render.
    return terminalSafe(markdown)
  }
}
