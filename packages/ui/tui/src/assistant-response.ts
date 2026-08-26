/** Complete-turn assistant response projection over durable transcript nodes. */

import type { TranscriptNode, TranscriptTextNode } from './transcript.ts'

/** One finalized assistant part eligible for complete-response reading. */
export type TuiAssistantResponsePart = TranscriptTextNode & {
  readonly tone: 'assistant'
  readonly turn: number
}

/**
 * Resolve every finalized assistant part in the selected part's scheduler Turn.
 * A target without Turn metadata remains an isolated extension-owned response.
 * @param nodes - complete projected transcript nodes for the visible Agent.
 * @param target - selected assistant segment whose response scope is requested.
 * @returns assistant segments that share the target's durable Turn identity.
 */
export function tuiAssistantResponseParts(
  nodes: readonly TranscriptNode[],
  target: TranscriptTextNode,
): readonly TranscriptTextNode[] {
  if (target.tone !== 'assistant' || target.turn === undefined) return Object.freeze([target])
  return Object.freeze(nodes.filter((node): node is TuiAssistantResponsePart =>
    node.kind === 'text' && node.tone === 'assistant' && node.turn === target.turn))
}

/**
 * Join complete response parts without tool-activity rows or viewport truncation.
 * @param parts - ordered assistant segments from one response scope.
 * @returns raw Markdown joined with explicit segment separators.
 */
export function tuiAssistantResponseText(parts: readonly TranscriptTextNode[]): string {
  return parts.map(part => part.text).filter(Boolean).join('\n\n---\n\n')
}
