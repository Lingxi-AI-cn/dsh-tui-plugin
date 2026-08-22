/** Pure selection and text projection for TUI-owned pending input reclaim. */

import type { UserMessage } from './host.ts'

/** Select the newest still-pending user message submitted by this TUI process. */
export function selectTuiReclaimableMessage(
  pending: readonly UserMessage[],
  submittedIds: readonly string[],
): UserMessage | undefined {
  for (const id of submittedIds.toReversed()) {
    const message = pending.find(candidate => candidate.id === id)
    if (message !== undefined && message.source.kind === 'user') return message
  }
  return undefined
}

/** Recover the editable text blocks of one reclaimed message. */
export function tuiReclaimMessageText(message: UserMessage): string {
  return message.content
    .filter((block): block is Extract<UserMessage['content'][number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
}
