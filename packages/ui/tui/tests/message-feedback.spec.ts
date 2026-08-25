import { describe, expect, it } from 'vitest'
import { MessageId } from '@deepseek-ai/dsh-llm/brand'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { MessageFeedbackVersion, MessageFeedbackListResult, MessageFeedbackPutResult, MessageFeedbackDeleteResult } from '@deepseek-ai/dsh-message-feedback'
import {
  projectMessageFeedback,
  findMessageFeedback,
  feedbackRatingLabel,
  feedbackBadge,
  tuiMessageFeedbackErrorMessage,
  processPutResult,
  processDeleteResult,
} from '../src/message-feedback.ts'
import { foldTranscript } from '../src/transcript.ts'

function version(v: string): MessageFeedbackVersion {
  return v as MessageFeedbackVersion
}

describe('native TUI Message Feedback', () => {
  const sessionId = SessionId('session-1')
  const msgA = MessageId('msg-a')
  const msgB = MessageId('msg-b')

  it('projects an empty list result', () => {
    const result: MessageFeedbackListResult = { ok: true, value: { items: [] } }
    const snapshot = projectMessageFeedback(sessionId, result)
    expect(snapshot.sessionId).toBe(sessionId)
    expect(snapshot.items).toHaveLength(0)
  })

  it('projects items from a successful list result', () => {
    const result: MessageFeedbackListResult = {
      ok: true,
      value: {
        items: [
          { messageId: msgA, rating: 'positive', version: version('v1'), createdAt: 1000, updatedAt: 1000 },
          { messageId: msgB, rating: 'negative', note: 'too verbose', version: version('v2'), createdAt: 2000, updatedAt: 2000 },
        ],
      },
    }
    const snapshot = projectMessageFeedback(sessionId, result)
    expect(snapshot.items).toHaveLength(2)
    expect(snapshot.items[0]?.rating).toBe('positive')
    expect(snapshot.items[1]?.note).toBe('too verbose')
  })

  it('projects a rejected list result as empty', () => {
    const result: MessageFeedbackListResult = {
      ok: false,
      error: { code: 'session-not-found', sessionId },
    }
    const snapshot = projectMessageFeedback(sessionId, result)
    expect(snapshot.items).toHaveLength(0)
  })

  it('finds feedback for a specific message', () => {
    const snapshot = projectMessageFeedback(sessionId, {
      ok: true,
      value: {
        items: [
          { messageId: msgA, rating: 'positive', version: version('v1'), createdAt: 1000, updatedAt: 1000 },
        ],
      },
    })
    expect(findMessageFeedback(snapshot, msgA)?.rating).toBe('positive')
    expect(findMessageFeedback(snapshot, msgB)).toBeUndefined()
    expect(findMessageFeedback(undefined, msgA)).toBeUndefined()
  })

  it('retains the real closing assistant message identity in the transcript', () => {
    const message = createAssistantMessage({
      content: [{ type: 'text', text: 'final answer' }],
      source: { provider: 'test', model: 'test' },
    })
    const events = [
      {
        type: 'assistant/message', seq: 1, time: 10,
        data: { turn: 1, step: 1, message }, surfaceOp: 'append',
      },
      { type: 'turn/end', seq: 2, time: 20, data: { turn: 1, reason: { kind: 'completed' } } },
    ] as SessionEvent[]

    expect(foldTranscript(events).find(node => node.kind === 'text' && node.tone === 'assistant'))
      .toMatchObject({ messageId: message.id, turn: 1, step: 1, closing: true })
  })

  it('formats feedback rating labels', () => {
    expect(feedbackRatingLabel('positive', 'en')).toMatch(/like|thumbs up/i)
    expect(feedbackRatingLabel('negative', 'en')).toMatch(/dislike|thumbs down/i)
    expect(feedbackRatingLabel(undefined, 'en')).toBeTruthy()
  })

  it('generates feedback badges', () => {
    expect(feedbackBadge({ messageId: msgA, rating: 'positive', version: version('v1') })).toBe(' [+]')
    expect(feedbackBadge({ messageId: msgA, rating: 'negative', version: version('v2') })).toBe(' [-]')
    expect(feedbackBadge(undefined)).toBe('')
  })

  it('processes a successful put result', () => {
    const result: MessageFeedbackPutResult = {
      ok: true,
      value: { messageId: msgA, rating: 'positive', version: version('v3'), createdAt: 1000, updatedAt: 2000 },
    }
    const state = processPutResult(result, sessionId, msgA)
    expect(state.status).toBe('success')
    if (state.status === 'idle') throw new Error('expected mutation state')
    expect(state.sessionId).toBe(sessionId)
    expect(state.targetMessageId).toBe(msgA)
  })

  it('processes a failed put result', () => {
    const result: MessageFeedbackPutResult = {
      ok: false,
      error: { code: 'version-conflict', current: null },
    }
    const state = processPutResult(result, sessionId, msgA)
    expect(state.status).toBe('error')
    if (state.status !== 'error') throw new Error('expected error state')
    expect(state.errorCode).toBe('version-conflict')
  })

  it('processes a successful delete result', () => {
    const result: MessageFeedbackDeleteResult = { ok: true, value: { absent: true } }
    const state = processDeleteResult(result, sessionId, msgA)
    expect(state.status).toBe('success')
  })

  it('processes a failed delete result', () => {
    const result: MessageFeedbackDeleteResult = {
      ok: false,
      error: { code: 'session-not-found', sessionId },
    }
    const state = processDeleteResult(result, sessionId, msgA)
    expect(state.status).toBe('error')
    if (state.status !== 'error') throw new Error('expected error state')
    expect(state.errorCode).toBe('session-not-found')
  })

  it('keeps feedback snapshots and mutations scoped to their owning Session', () => {
    const state = processPutResult({
      ok: true,
      value: { messageId: msgA, rating: 'positive', version: version('v4'), createdAt: 1, updatedAt: 1 },
    }, sessionId, msgA)
    expect(state).toMatchObject({ status: 'success', sessionId, targetMessageId: msgA })
    expect(findMessageFeedback(projectMessageFeedback(SessionId('other-session'), {
      ok: true,
      value: { items: [{ messageId: msgB, rating: 'negative', version: version('v5'), createdAt: 1, updatedAt: 1 }] },
    }), msgA)).toBeUndefined()
  })

  it('maps stable owner failures to actionable localized guidance', () => {
    expect(tuiMessageFeedbackErrorMessage('version-conflict', 'en')).toMatch(/reloaded|retry/iu)
    expect(tuiMessageFeedbackErrorMessage('note-too-large', 'zh')).toMatch(/超过|缩短/u)
    expect(tuiMessageFeedbackErrorMessage('owner-unavailable', 'en')).not.toContain('owner-unavailable')
    expect(tuiMessageFeedbackErrorMessage('unexpected', 'zh')).toMatch(/重试/u)
  })
})
