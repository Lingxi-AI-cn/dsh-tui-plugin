/** Small external stores shared by the controller and Ink component tree. */

import {
  UserQuestionError,
  type AgentStatus,
  type ApprovalOutcome,
  type ApprovalRequest,
  type AskUserQuestionAnswer,
  type AskUserQuestionRequest,
  type SessionEvent,
} from './host.ts'

type Listener = () => void

/** Observable immutable value with stable snapshots for `useSyncExternalStore`. */
export class ValueStore<T> {
  private readonly listeners = new Set<Listener>()

  constructor(private value: T) {}

  /** Read the current immutable value for `useSyncExternalStore`. */
  getSnapshot = (): T => this.value

  /**
   * Subscribe to value changes.
   * @param listener - callback invoked after a changed value commits.
   * @returns disposer for this subscription.
   */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Commit one value and notify subscribers when its identity changed.
   * @param value - next immutable snapshot.
   */
  set(value: T): void {
    if (Object.is(value, this.value)) return
    this.value = value
    for (const listener of this.listeners) listener()
  }
}

/** Append-only observable Session-event snapshot. */
export class SessionEventStore extends ValueStore<readonly SessionEvent[]> {
  constructor(events: readonly SessionEvent[]) {
    super(Object.freeze([...events]))
  }

  /**
   * Append one committed Session event to the observable snapshot.
   * @param event - exact post-commit event.
   */
  append(event: SessionEvent): void {
    this.set(Object.freeze([...this.getSnapshot(), event]))
  }
}

/** Live Agent status projection. */
export class AgentStatusStore extends ValueStore<AgentStatus> {}

/** Public view of the approval currently owning terminal input. */
interface PendingApproval {
  /** Interaction discriminant. */
  kind: 'approval'
  /** Borrowed approval request. */
  request: ApprovalRequest
}

/** Public view of the structured question currently owning terminal input. */
export interface PendingQuestion {
  /** Interaction discriminant. */
  kind: 'question'
  /** Borrowed structured-question request. */
  request: AskUserQuestionRequest
}

/** The one FIFO interaction visible to the component tree, or no takeover. */
export type TuiPendingInteraction = PendingApproval | PendingQuestion

interface QueuedApproval extends PendingApproval {
  resolve(outcome: ApprovalOutcome): void
  signal?: AbortSignal
  onAbort?: () => void
}

interface QueuedQuestion extends PendingQuestion {
  resolve(answer: AskUserQuestionAnswer): void
  reject(error: Error): void
  signal?: AbortSignal
  onAbort?: () => void
}

type QueuedInteraction = QueuedApproval | QueuedQuestion

/** FIFO owner for approvals and structured user questions. */
export class InteractionStore extends ValueStore<TuiPendingInteraction | undefined> {
  private readonly queue: QueuedInteraction[] = []
  private disposed = false

  constructor() {
    super(undefined)
  }

  /**
   * Queue one approval wait.
   * @param request - exact scoped approval request.
   * @returns its fail-closed outcome after user action, abort, or teardown.
   */
  askApproval(request: ApprovalRequest): Promise<ApprovalOutcome> {
    if (this.disposed || request.signal?.aborted === true) return Promise.resolve('cancelled')
    return new Promise<ApprovalOutcome>((resolve) => {
      const entry: QueuedApproval = { kind: 'approval', request, resolve }
      if (request.signal !== undefined) {
        entry.signal = request.signal
        entry.onAbort = () => { this.settle(entry, 'cancelled') }
        request.signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      this.enqueue(entry)
    })
  }

  /**
   * Queue one structured human-question wait.
   * @param request - validated request from `ctx.userQuestions`.
   * @returns structured answers after every question is completed.
   */
  askQuestion(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
    if (this.disposed || request.signal?.aborted === true) {
      return Promise.reject(new UserQuestionError(
        'TUI user question was aborted before the user answered', 'ASK_ABORTED'))
    }
    return new Promise<AskUserQuestionAnswer>((resolve, reject) => {
      const entry: QueuedQuestion = { kind: 'question', request, resolve, reject }
      if (request.signal !== undefined) {
        entry.signal = request.signal
        entry.onAbort = () => {
          this.remove(entry)
          reject(new UserQuestionError(
            'TUI user question was aborted before the user answered', 'ASK_ABORTED'))
        }
        request.signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      this.enqueue(entry)
    })
  }

  /**
   * Settle the current approval with a user-selectable outcome.
   * @param outcome - allow once or reject.
   */
  answerApproval(outcome: Extract<ApprovalOutcome, 'allowed-once' | 'rejected'>): void {
    const entry = this.queue[0]
    if (entry?.kind !== 'approval') return
    this.settle(entry, outcome)
  }

  /**
   * Settle the current question with validated UI encoding.
   * @param answer - structured answer set.
   */
  answerQuestion(answer: AskUserQuestionAnswer): void {
    const entry = this.queue[0]
    if (entry?.kind !== 'question') return
    this.remove(entry)
    entry.resolve(answer)
  }

  /** Reject or abort the interaction currently owning input. */
  cancelCurrent(): void {
    const entry = this.queue[0]
    if (entry === undefined) return
    if (entry.kind === 'approval') this.settle(entry, 'rejected')
    else {
      this.remove(entry)
      entry.reject(new UserQuestionError('TUI user question was cancelled', 'ASK_CANCELLED'))
    }
  }

  /** Fail closed and settle every queued interaction exactly once. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const entry of [...this.queue]) {
      if (entry.kind === 'approval') this.settle(entry, 'cancelled')
      else {
        this.remove(entry)
        entry.reject(new UserQuestionError('TUI user-questions provider was disposed', 'ASK_ABORTED'))
      }
    }
  }

  private enqueue(entry: QueuedInteraction): void {
    this.queue.push(entry)
    this.publish()
  }

  private settle(entry: QueuedApproval, outcome: ApprovalOutcome): void {
    if (!this.remove(entry)) return
    entry.resolve(outcome)
  }

  private remove(entry: QueuedInteraction): boolean {
    const index = this.queue.indexOf(entry)
    if (index < 0) return false
    this.queue.splice(index, 1)
    if (entry.signal !== undefined && entry.onAbort !== undefined) {
      entry.signal.removeEventListener('abort', entry.onAbort)
    }
    this.publish()
    return true
  }

  private publish(): void {
    const entry = this.queue[0]
    this.set(entry === undefined ? undefined : { kind: entry.kind, request: entry.request } as TuiPendingInteraction)
  }
}

/** Identify an explicit human dismissal without conflating it with owner abort or teardown. */
export function isTuiQuestionCancellation(error: unknown): error is UserQuestionError {
  return error instanceof UserQuestionError && error.code === 'ASK_CANCELLED'
}
