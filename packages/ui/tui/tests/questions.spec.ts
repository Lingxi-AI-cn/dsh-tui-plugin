/** Native waits against the official question owner and durable projection. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { createToolResultMessage, ToolCallId, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { askTuiQuestion } from '../src/questions.ts'
import { InteractionStore } from '../src/store.ts'
import { tuiFooterItems, visibleTuiFooterItems } from '../src/footer.ts'
import { foldTranscript, TuiTranscriptProjectionCache } from '../src/transcript.ts'

const contexts: Context[] = []
const stores: InteractionStore[] = []
const callId = ToolCallId('native-timed')
const questions = [{ id: 'scope', question: 'Which scope?', options: [{ label: 'Small' }] }]
const answer = { answers: [{ id: 'scope', selected: ['Small'] }] }

afterEach(async () => {
  for (const store of stores.splice(0)) store.dispose()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.useRealTimers()
})

function root(ctx: Context, session = Session.create(SessionId('native-question'))): Agent {
  const pending: UserMessage[] = []
  return {
    id: session.id, session, options: {}, ctx, status: 'idle',
    inbox: {
      nextTurn: [], nextStep: pending, clear() {}, append() {}, prepend() {},
      replace: () => false, remove: () => false, splice: () => [],
    },
    send() {}, followup() {}, steer(message) { pending.push(message) }, inject() {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
}

async function setup() {
  vi.useFakeTimers()
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(UserQuestionService)
  const store = new InteractionStore()
  stores.push(store)
  const agent = root(ctx)
  const detach = ctx.agents.enter(agent, undefined)
  ctx.on('user-questions/request', request => askTuiQuestion(ctx.userQuestions, store, request))
  return { ctx, store, agent, detach }
}

async function show() { await vi.advanceTimersByTimeAsync(0) }

function recordPending(session: Session) {
  session.append('request/header', { header: {
    config: { provider: 'fixture', model: 'fixture' },
    tools: [{ name: 'ask_user_question', description: 'timed', parameters: { properties: { timeout: {} } } }],
  }, reason: 'initial' })
  session.append('tool/call', { turn: 1, step: 1, callId, name: 'ask_user_question', arguments: JSON.stringify({ questions }) })
  session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({
    callId, content: [{ type: 'text', text: JSON.stringify({ pending: true, callId }) }], isError: false,
  }) }, { surfaceOp: 'append' })
}

describe('official timed owner with the native answerer', () => {
  it('keeps the pending question action visible at narrow and wide widths', () => {
    const items = tuiFooterItems({
      modelSelectionKind: 'next request', questions: 2,
      transcript: { startIndex: -1, endIndex: -1, total: 0, hasOlder: false, hasNewer: false },
    })
    for (const columns of [40, 64, 96]) {
      expect(visibleTuiFooterItems(items, columns).find(item => item.id === 'questions'))
        .toMatchObject({ value: '2', action: 'questions' })
    }
  })
  it('takes one Host deadline and returns a complete batch inside it', async () => {
    const { ctx, store, agent } = await setup()
    const result = ctx.userQuestions.askTimed({ agent, questions }, callId, 1_000)
    await show()
    expect(store.getSnapshot()).toMatchObject({ timing: { deadline: Date.now() + 1_000 }, allowEmptyAnswer: true })
    store.answerQuestion(answer)
    await expect(result).resolves.toEqual(answer)
    expect(store.getSnapshot()).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('holds the claim across editing and owner admission after the original deadline', async () => {
    const { ctx, store, agent } = await setup()
    const result = ctx.userQuestions.askTimed({ agent, questions }, callId, 1_000)
    await show()
    await vi.advanceTimersByTimeAsync(400)
    store.pauseQuestion()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(store.getSnapshot()).toMatchObject({ timing: { pausedRemainingMs: 600 } })
    store.answerQuestion(answer)
    await expect(result).resolves.toEqual(answer)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['deadline', 'later'] as const)('returns pending for %s without a reply message', async (action) => {
    const { ctx, store, agent } = await setup()
    const result = ctx.userQuestions.askTimed({ agent, questions }, callId, 1_000)
    await show()
    if (action === 'later') { store.pauseQuestion(); store.cancelCurrent() }
    else await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toEqual({ pending: true, callId })
    expect(agent.inbox.nextStep).toEqual([])
    expect(store.getSnapshot()).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves explicit empty answers and untimed blocking requests', async () => {
    const { ctx, store, agent } = await setup()
    const result = ctx.userQuestions.ask({ agent, questions, wait: { callId, timed: false } })
    await show()
    expect(store.getSnapshot()).toMatchObject({ allowEmptyAnswer: true })
    const snapshot = store.getSnapshot()
    expect(snapshot?.kind === 'question' ? snapshot.timing : undefined).toBeUndefined()
    await vi.advanceTimersByTimeAsync(10_000)
    store.answerQuestion({ answers: [{ id: 'scope', selected: [] }] })
    await expect(result).resolves.toEqual({ answers: [{ id: 'scope', selected: [] }] })
    const legacy = ctx.userQuestions.ask({ agent, questions })
    await show()
    expect(store.getSnapshot()).toMatchObject({ allowEmptyAnswer: false })
    store.cancelCurrent()
    await expect(legacy).rejects.toMatchObject({ code: 'ASK_CANCELLED' })
  })

  it.each(['abort', 'dispose'] as const)('releases the owner wait on %s', async (action) => {
    const { ctx, store, agent } = await setup()
    const controller = new AbortController()
    const result = ctx.userQuestions.askTimed({ agent, questions, signal: controller.signal }, callId, 1_000)
    const rejected = expect(result).rejects.toMatchObject({ code: 'ASK_ABORTED' })
    await show()
    if (action === 'abort') controller.abort()
    else store.dispose()
    await rejected
    expect(store.getSnapshot()).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reconstructs continued questions, queues once, and settles only on admission', async () => {
    const { ctx, agent, detach } = await setup()
    recordPending(agent.session)
    const resumed = root(ctx, Session.create(agent.id, [...agent.session.snapshotEvents()]))
    detach()
    ctx.agents.enter(resumed, undefined)
    expect(ctx.sessionProjections.snapshot(resumed.session).values.userQuestions?.active).toMatchObject([{ callId, state: 'continued' }])
    expect(ctx.userQuestions.answer(resumed, callId, answer)).toBe(true)
    expect(() => ctx.userQuestions.answer(resumed, callId, answer)).toThrow(/already queued/)
    expect(ctx.sessionProjections.snapshot(resumed.session).values.userQuestions?.active).toHaveLength(1)
    const reply = resumed.inbox.nextStep[0]
    if (reply === undefined) throw new Error('expected owner reply')
    resumed.session.append('user/message', reply, { surfaceOp: 'append' })
    expect(ctx.sessionProjections.snapshot(resumed.session).values.userQuestions).toMatchObject({
      active: [], settled: [{ callId, answers: answer.answers }],
    })
    expect(ctx.userQuestions.answer(resumed, callId, answer)).toBe(false)
    const transcript = foldTranscript(resumed.session.snapshotEvents())
    expect(transcript).toContainEqual(expect.objectContaining({ kind: 'question', status: 'pending' }))
    expect(transcript.some(node => node.kind === 'text' && node.tone === 'user'
      && node.text.includes('answer_to_pending_question'))).toBe(true)
    expect(new TuiTranscriptProjectionCache().update(resumed.session.snapshotEvents())).toEqual(transcript)
    expect(transcript.map(node => node.kind === 'question'
      ? { kind: node.kind, status: node.status, callId: node.callId }
      : node.kind === 'text' ? { kind: node.kind, tone: node.tone } : { kind: node.kind })).toMatchInlineSnapshot(`
      [
        {
          "callId": "native-timed",
          "kind": "question",
          "status": "pending",
        },
        {
          "kind": "text",
          "tone": "user",
        },
      ]
    `)
    expect(resumed.session.snapshotEvents().filter(event => event.type === 'tool/result')).toHaveLength(1)
  })

  it('rejects stale and delegated roots before opening a native panel', async () => {
    const { ctx, store, agent } = await setup()
    await expect(ctx.userQuestions.askTimed({ agent: root(ctx), questions }, callId, 1_000)).rejects.toMatchObject({ code: 'CALLER_NOT_LIVE' })
    const child = root(ctx, Session.create(SessionId('native-child')))
    ctx.agents.enter(child, agent)
    await expect(ctx.userQuestions.askTimed({ agent: child, questions }, callId, 1_000)).rejects.toMatchObject({ code: 'DELEGATED_CALLER' })
    expect(store.getSnapshot()).toBeUndefined()
  })
})
