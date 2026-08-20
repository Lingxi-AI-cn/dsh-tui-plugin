/** Process-local single-view Agent navigation state for the native TUI. */

import type { SessionIdType as SessionId } from './host.ts'

/** Exact Agent transcript and input target rendered by the native TUI. */
export interface TuiAgentViewDescriptor {
  /** Whether the view is the owned root or one borrowed local child. */
  readonly kind: 'root' | 'child'
  /** Session and Agent identity whose durable transcript is rendered. */
  readonly id: SessionId
  /** Concise source-owned label shown in the header. */
  readonly label: string
  /** Durable direct parent required to authorize child input. */
  readonly parentSession?: SessionId | undefined
  /** Whether the current view accepts composer input. */
  readonly acceptsInput: boolean
  /** Exact reason input is unavailable. */
  readonly readOnlyReason?: string | undefined
}

/**
 * Process-local state slots keyed by Agent Session id.
 * @typeParam T - complete disposable UI state owned by one transcript view.
 */
export class TuiAgentViewStateCache<T> {
  private readonly states = new Map<SessionId, T>()

  /**
   * Save the complete local state of one view.
   * @param id - view Session id.
   * @param state - disposable state to restore on the next visit.
   */
  set(id: SessionId, state: T): void {
    this.states.set(id, state)
  }

  /**
   * Restore one view or create its initial local state.
   * @param id - view Session id.
   * @param create - initializer used only on the first visit.
   * @returns the cached or newly initialized state.
   */
  get(id: SessionId, create: () => T): T {
    const existing = this.states.get(id)
    if (existing !== undefined) return existing
    const state = create()
    this.states.set(id, state)
    return state
  }

  /** Drop every saved view after the owning TUI lifecycle ends. */
  clear(): void {
    this.states.clear()
  }
}
