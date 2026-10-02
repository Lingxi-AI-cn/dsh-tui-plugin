/** Native question waits and views over the official user-questions owner. */

import {
  UserQuestionError,
  type AskUserQuestionAnswer,
  type AskUserQuestionRequest,
  type UserQuestionProjectionView,
  type UserQuestionService,
} from './host.ts'
import { InteractionStore } from './store.ts'

/** Empty projection before a Session has any timed question calls. */
export const EMPTY_TUI_QUESTIONS: UserQuestionProjectionView = Object.freeze({ active: [], settled: [] })

/**
 * Claim a timed Host wait before exposing its deadline to the native question panel.
 * The Host closes a successful claim after it accepts the provider's answer.
 * @param owner - Official question service holding the foreground wait.
 * @param interactions - Native FIFO input owner.
 * @param request - Exact scoped request dispatched by the Host.
 * @returns The human's complete batch, or the owner-compatible cancellation/timeout rejection.
 */
export async function askTuiQuestion(
  owner: UserQuestionService,
  interactions: InteractionStore,
  request: AskUserQuestionRequest,
): Promise<AskUserQuestionAnswer> {
  if (request.wait?.timed !== true) return interactions.askQuestion(request)
  if (request.agent === undefined) {
    throw new UserQuestionError('A timed TUI question needs its live root Agent', 'CALLER_NOT_LIVE')
  }
  const controller = new AbortController()
  const signal = request.signal === undefined
    ? controller.signal : AbortSignal.any([controller.signal, request.signal])
  const stream = owner.attachWait(request.agent, request.wait.callId, signal)[Symbol.asyncIterator]()
  let closed: Promise<IteratorResult<{ remainingMs: number }>> | undefined
  try {
    const first = await stream.next()
    if (first.done === true) {
      throw new UserQuestionError('The foreground question wait already ended', 'ASK_TIMED_OUT')
    }
    closed = stream.next()
    // Observe the business stream until the Host closes it; success must not
    // release its claim between the UI settlement and owner admission.
    void closed.catch(() => undefined)
    return await interactions.askQuestion(request, { remainingMs: first.value.remainingMs })
  } catch (error: unknown) {
    controller.abort(error)
    await closed?.catch(() => undefined)
    await stream.return?.()
    throw error
  }
}
