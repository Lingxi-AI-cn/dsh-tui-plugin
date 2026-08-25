/** Pending Agent Inbox projection and revision-checked TUI mutations. */

import {
  freezeMessage,
  type Agent,
  type ContentBlock,
  type UserMessage,
} from './host.ts'
import { terminalSafe } from './sanitize.ts'

const MAX_QUEUE_TEXT = 65_536
const MAX_PREVIEW_GRAPHEMES = 160
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Structural Inbox item matching the public owner contract added in dsh-agent. */
export interface TuiInboxPendingItem {
  readonly target: 'next-step' | 'next-turn'
  readonly index: number
  readonly message: UserMessage
  readonly insertedAt: number
}

/** Structural Inbox snapshot matching the public owner contract added in dsh-agent. */
export interface TuiInboxSnapshot {
  readonly revision: number
  readonly nextStep: readonly TuiInboxPendingItem[]
  readonly nextTurn: readonly TuiInboxPendingItem[]
  readonly omitted: number
}

/** Structural revisioned mutation result returned by the Agent Inbox owner. */
export type TuiInboxMutationResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly revision: number; readonly reason: 'revision-conflict' | 'not-pending' }

interface TuiInboxOwner {
  readonly nextStep: readonly UserMessage[]
  readonly nextTurn: readonly UserMessage[]
  readonly revision?: number
  snapshot?(maxItems?: number): TuiInboxSnapshot
  replaceAtRevision?(id: UserMessage['id'], message: UserMessage, expectedRevision: number): TuiInboxMutationResult
  removeAtRevision?(id: UserMessage['id'], expectedRevision: number): TuiInboxMutationResult
  moveAtRevision?: unknown
  sendEarlyAtRevision?: unknown
}

type TuiRevisionedInboxOwner = TuiInboxOwner & Required<Pick<
  TuiInboxOwner,
  'snapshot' | 'replaceAtRevision' | 'removeAtRevision'
>>

function isRevisionedInboxOwner(inbox: TuiInboxOwner): inbox is TuiRevisionedInboxOwner {
  return typeof inbox.snapshot === 'function'
    && typeof inbox.replaceAtRevision === 'function'
    && typeof inbox.removeAtRevision === 'function'
}

/** One bounded pending input row projected from the owning Agent Inbox. */
export interface TuiQueueItem {
  readonly id: string
  readonly lane: 'next-step' | 'next-turn'
  readonly index: number
  readonly text: string
  readonly preview: string
  readonly textTruncated: boolean
  readonly attachmentCount: number
  readonly source: string
  readonly insertedAt: number
  readonly canEdit: boolean
  readonly canDelete: boolean
}

/** Complete bounded Queue card snapshot for one Agent view. */
export interface TuiQueueSnapshot {
  readonly revision: number
  readonly items: readonly TuiQueueItem[]
  readonly nextStepCount: number
  readonly nextTurnCount: number
  readonly omitted: number
  readonly canMoveLane: boolean
  readonly canSendEarly: boolean
}

function textOf(message: UserMessage): { text: string; truncated: boolean } {
  const value = message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
  if (value.length <= MAX_QUEUE_TEXT) return { text: terminalSafe(value), truncated: false }
  return { text: terminalSafe(value.slice(0, MAX_QUEUE_TEXT)), truncated: true }
}

function previewOf(value: string): string {
  const single = value.replace(/\s+/gu, ' ').trim()
  const graphemes = Array.from(GRAPHEMES.segment(single), entry => entry.segment)
  return graphemes.length <= MAX_PREVIEW_GRAPHEMES
    ? single
    : `${graphemes.slice(0, MAX_PREVIEW_GRAPHEMES - 1).join('')}…`
}

function projectItem(item: TuiInboxPendingItem, canMutate: boolean): TuiQueueItem {
  const projected = textOf(item.message)
  const userOwned = item.message.source.kind === 'user'
  return Object.freeze({
    id: String(item.message.id),
    lane: item.target,
    index: item.index,
    text: projected.text,
    preview: previewOf(projected.text),
    textTruncated: projected.truncated,
    attachmentCount: item.message.content.filter(block => block.type === 'image').length,
    source: terminalSafe(item.message.source.kind),
    insertedAt: item.insertedAt,
    canEdit: canMutate && userOwned && !projected.truncated && projected.text.length > 0,
    canDelete: canMutate && userOwned,
  })
}

/**
 * Project every owner-supplied pending item without consulting a process-local submit ledger.
 * @param snapshot - revisioned Agent Inbox snapshot.
 * @param capabilities - optional owner transitions beyond edit and delete.
 * @returns next-step first, followed by next-turn, preserving owner order.
 */
export function projectTuiQueue(
  snapshot: TuiInboxSnapshot,
  capabilities: {
    readonly canMutate?: boolean
    readonly canMoveLane?: boolean
    readonly canSendEarly?: boolean
  } = {},
): TuiQueueSnapshot {
  const canMutate = capabilities.canMutate !== false
  return Object.freeze({
    revision: snapshot.revision,
    items: Object.freeze([
      ...snapshot.nextStep.map(item => projectItem(item, canMutate)),
      ...snapshot.nextTurn.map(item => projectItem(item, canMutate)),
    ]),
    nextStepCount: snapshot.nextStep.length,
    nextTurnCount: snapshot.nextTurn.length,
    omitted: snapshot.omitted,
    canMoveLane: capabilities.canMoveLane === true,
    canSendEarly: capabilities.canSendEarly === true,
  })
}

/**
 * Read and project one Agent owner's current Inbox snapshot.
 * @param agent - exact live Agent owning the inbox.
 * @returns a bounded terminal Queue snapshot.
 */
export function readTuiQueue(agent: Agent): TuiQueueSnapshot {
  const inbox = agent.inbox as unknown as TuiInboxOwner
  if (!isRevisionedInboxOwner(inbox)) {
    const project = (target: 'next-step' | 'next-turn', messages: readonly UserMessage[]): readonly TuiInboxPendingItem[] =>
      Object.freeze(messages.slice(0, 256).map((message, index) => Object.freeze({
        target, index, message, insertedAt: 0,
      })))
    const nextStep = project('next-step', inbox.nextStep)
    const remaining = Math.max(0, 256 - nextStep.length)
    const nextTurn = project('next-turn', inbox.nextTurn.slice(0, remaining))
    return projectTuiQueue({
      revision: 0,
      nextStep,
      nextTurn,
      omitted: Math.max(0, inbox.nextStep.length + inbox.nextTurn.length - nextStep.length - nextTurn.length),
    }, { canMutate: false })
  }
  return projectTuiQueue(inbox.snapshot(), {
    canMutate: true,
    canMoveLane: typeof inbox.moveAtRevision === 'function',
    canSendEarly: typeof inbox.sendEarlyAtRevision === 'function',
  })
}

/**
 * Format bounded relative age for one Queue row.
 * @param insertedAt - durable insertion time in epoch milliseconds.
 * @param now - comparison time in epoch milliseconds.
 * @returns compact seconds, minutes, hours, or days text.
 */
export function formatTuiQueueAge(insertedAt: number, now = Date.now()): string {
  if (insertedAt <= 0) return '—'
  const seconds = Math.max(0, Math.floor((now - insertedAt) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

function pendingMessage(agent: Agent, id: string): UserMessage | undefined {
  return [...agent.inbox.nextStep, ...agent.inbox.nextTurn].find(message => String(message.id) === id)
}

/**
 * Replace only the text portion of one user-owned pending item at an exact Inbox revision.
 * Non-text blocks retain object identity and ordering; the durable message id is unchanged.
 * @param agent - exact live Agent owning the inbox.
 * @param id - pending message identity.
 * @param text - replacement user text.
 * @param expectedRevision - revision observed by the Queue view.
 * @returns owner mutation result or a stable non-editable refusal.
 */
export function editTuiQueueItem(
  agent: Agent,
  id: string,
  text: string,
  expectedRevision: number,
): TuiInboxMutationResult | { readonly ok: false; readonly revision: number; readonly reason: 'not-editable' } {
  const inbox = agent.inbox as unknown as TuiInboxOwner
  const revision = inbox.revision ?? 0
  if (typeof inbox.replaceAtRevision !== 'function') {
    return Object.freeze({ ok: false, revision, reason: 'not-editable' })
  }
  const message = pendingMessage(agent, id)
  if (message === undefined) {
    return Object.freeze({ ok: false, revision, reason: 'not-editable' })
  }
  const value = text.trim()
  if (message.source.kind !== 'user' || value.length === 0 || value.length > MAX_QUEUE_TEXT) {
    return Object.freeze({ ok: false, revision, reason: 'not-editable' })
  }
  let replacedText = false
  const content: ContentBlock[] = []
  for (const block of message.content) {
    if (block.type !== 'text') {
      content.push(block)
      continue
    }
    if (replacedText) continue
    replacedText = true
    content.push({ type: 'text', text: value })
  }
  if (!replacedText) return Object.freeze({ ok: false, revision, reason: 'not-editable' })
  const replacement = freezeMessage({ ...message, content })
  return inbox.replaceAtRevision(message.id, replacement, expectedRevision)
}

/**
 * Remove one user-owned pending item at an exact Inbox revision.
 * @param agent - exact live Agent owning the inbox.
 * @param id - pending message identity.
 * @param expectedRevision - revision observed by the Queue view.
 * @returns owner mutation result or a stable non-deletable refusal.
 */
export function deleteTuiQueueItem(
  agent: Agent,
  id: string,
  expectedRevision: number,
): TuiInboxMutationResult | { readonly ok: false; readonly revision: number; readonly reason: 'not-deletable' } {
  const inbox = agent.inbox as unknown as TuiInboxOwner
  const revision = inbox.revision ?? 0
  if (typeof inbox.removeAtRevision !== 'function') {
    return Object.freeze({ ok: false, revision, reason: 'not-deletable' })
  }
  const message = pendingMessage(agent, id)
  if (message?.source.kind !== 'user') {
    return Object.freeze({ ok: false, revision, reason: 'not-deletable' })
  }
  return inbox.removeAtRevision(message.id, expectedRevision)
}
