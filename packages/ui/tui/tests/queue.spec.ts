/** Pending Inbox projection and revision-safe TUI Queue mutations. */

import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import {
  deleteTuiQueueItem,
  editTuiQueueItem,
  formatTuiQueueAge,
  projectTuiQueue,
  readTuiQueue,
} from '../src/index.ts'

function fixture() {
  const lanes = {
    nextStep: [] as UserMessage[],
    nextTurn: [] as UserMessage[],
  }
  const insertedAt = new Map<string, number>()
  const inbox = {
    revision: 0,
    get nextStep() { return lanes.nextStep },
    get nextTurn() { return lanes.nextTurn },
    append(target: 'next-step' | 'next-turn', message: UserMessage) {
      lanes[target === 'next-step' ? 'nextStep' : 'nextTurn'].push(message)
      insertedAt.set(String(message.id), Date.now())
      this.revision += 1
    },
    snapshot() {
      const project = (target: 'next-step' | 'next-turn', messages: readonly UserMessage[]) =>
        messages.map((message, index) => ({ target, index, message, insertedAt: insertedAt.get(String(message.id)) ?? 0 }))
      return {
        revision: this.revision,
        nextStep: project('next-step', lanes.nextStep),
        nextTurn: project('next-turn', lanes.nextTurn),
        omitted: 0,
      }
    },
    replaceAtRevision(id: UserMessage['id'], message: UserMessage, expectedRevision: number) {
      if (expectedRevision !== this.revision) return { ok: false as const, revision: this.revision, reason: 'revision-conflict' as const }
      for (const lane of [lanes.nextStep, lanes.nextTurn]) {
        const index = lane.findIndex(value => value.id === id)
        if (index >= 0) {
          lane[index] = message
          this.revision += 1
          return { ok: true as const, revision: this.revision }
        }
      }
      return { ok: false as const, revision: this.revision, reason: 'not-pending' as const }
    },
    removeAtRevision(id: UserMessage['id'], expectedRevision: number) {
      if (expectedRevision !== this.revision) return { ok: false as const, revision: this.revision, reason: 'revision-conflict' as const }
      for (const lane of [lanes.nextStep, lanes.nextTurn]) {
        const index = lane.findIndex(value => value.id === id)
        if (index >= 0) {
          lane.splice(index, 1)
          this.revision += 1
          return { ok: true as const, revision: this.revision }
        }
      }
      return { ok: false as const, revision: this.revision, reason: 'not-pending' as const }
    },
  }
  return { agent: { inbox } as unknown as Agent, inbox }
}

describe('native TUI pending Queue projection', () => {
  it('shows both owner lanes, source, attachment metadata, age, and bounded text', () => {
    const { inbox } = fixture()
    inbox.append('next-turn', createUserMessage({
      content: [{ type: 'text', text: 'follow up later' }], source: { kind: 'user' },
    }))
    inbox.append('next-step', createUserMessage({
      content: [
        { type: 'text', text: 'steer now' },
        { type: 'image', attachment: { attachmentId: AttachmentId('image-queue'), mediaType: 'image/png', bytes: 10, width: 64, height: 64 } },
      ],
      source: { kind: 'user' },
    }))
    const queue = projectTuiQueue(inbox.snapshot())
    expect(queue).toMatchObject({
      revision: 2,
      nextStepCount: 1,
      nextTurnCount: 1,
      omitted: 0,
      canMoveLane: false,
      canSendEarly: false,
    })
    expect(queue.items.map(item => ({ lane: item.lane, preview: item.preview, attachments: item.attachmentCount })))
      .toEqual([
        { lane: 'next-step', preview: 'steer now', attachments: 1 },
        { lane: 'next-turn', preview: 'follow up later', attachments: 0 },
      ])
    expect(formatTuiQueueAge(Date.now() - 65_000)).toBe('1m')
  })

  it('only advertises lane transitions that the Agent Inbox owner exposes', () => {
    const { inbox } = fixture()
    expect(projectTuiQueue(inbox.snapshot(), { canMoveLane: true, canSendEarly: true })).toMatchObject({
      canMoveLane: true,
      canSendEarly: true,
    })
  })

  it('degrades the official rc.8 Inbox to a bounded read-only queue', () => {
    const { inbox } = fixture()
    const message = createUserMessage({
      content: [{ type: 'text', text: 'legacy follow up' }], source: { kind: 'user' },
    })
    inbox.append('next-turn', message)
    const legacyAgent = { inbox: {
      get nextStep() { return inbox.nextStep },
      get nextTurn() { return inbox.nextTurn },
    } } as unknown as Agent

    const queue = readTuiQueue(legacyAgent)
    expect(queue).toMatchObject({ revision: 0, nextStepCount: 0, nextTurnCount: 1, omitted: 0 })
    expect(queue.items[0]).toMatchObject({ preview: 'legacy follow up', insertedAt: 0, canEdit: false, canDelete: false })
    expect(formatTuiQueueAge(queue.items[0]?.insertedAt ?? 0)).toBe('—')
    expect(editTuiQueueItem(legacyAgent, message.id, 'changed', 0)).toMatchObject({ reason: 'not-editable' })
    expect(deleteTuiQueueItem(legacyAgent, message.id, 0)).toMatchObject({ reason: 'not-deletable' })
  })

  it('edits text while preserving identity and attachments, then deletes at the next revision', () => {
    const { agent, inbox } = fixture()
    const message = createUserMessage({
      content: [
        { type: 'text', text: 'before' },
        { type: 'image', attachment: { attachmentId: AttachmentId('image-preserved'), mediaType: 'image/png', bytes: 10, width: 64, height: 64 } },
      ],
      source: { kind: 'user' },
    })
    inbox.append('next-turn', message)
    const opened = projectTuiQueue(inbox.snapshot())
    expect(editTuiQueueItem(agent, message.id, 'after', opened.revision)).toEqual({ ok: true, revision: 2 })
    expect(inbox.nextTurn[0]).toMatchObject({ id: message.id, content: [
      { type: 'text', text: 'after' },
      { type: 'image', attachment: { attachmentId: AttachmentId('image-preserved') } },
    ] })
    expect(deleteTuiQueueItem(agent, message.id, opened.revision)).toEqual({
      ok: false, revision: 2, reason: 'revision-conflict',
    })
    expect(deleteTuiQueueItem(agent, message.id, 2)).toEqual({ ok: true, revision: 3 })
  })

  it('does not expose edit or delete for plugin-owned pending context', () => {
    const { agent, inbox } = fixture()
    const message = createUserMessage({
      content: [{ type: 'text', text: 'injected context' }],
      source: { kind: 'test' },
    })
    inbox.append('next-step', message)
    const queue = projectTuiQueue(inbox.snapshot())
    expect(queue.items[0]).toMatchObject({ source: 'test', canEdit: false, canDelete: false })
    expect(editTuiQueueItem(agent, message.id, 'changed', queue.revision)).toMatchObject({ reason: 'not-editable' })
    expect(deleteTuiQueueItem(agent, message.id, queue.revision)).toMatchObject({ reason: 'not-deletable' })
    expect(inbox.nextStep).toEqual([message])
  })
})
