/** Explicit running-Agent composer delivery gestures. */

import type { TuiKeypress } from './keybindings.ts'

/** Durable route selected for one submitted composer draft. */
export type TuiSubmitMode = 'steer' | 'followup' | 'interrupt'

/** Inputs relevant to running-Agent delivery selection. */
export interface TuiComposerDeliveryInput {
  /** Only the root view exposes running delivery choices. */
  readonly rootView: boolean
  /** The visible Agent is currently driving a turn. */
  readonly running: boolean
  /** A non-empty composer draft is available to deliver. */
  readonly hasDraft: boolean
  /** Suggestions own Tab and Enter before delivery selection. */
  readonly suggestionVisible: boolean
  /** Decoded terminal keypress. */
  readonly key: TuiKeypress
}

/**
 * Resolve a running root composer gesture without mutating UI or Agent state.
 *
 * @param input - current view, draft, suggestion, and keypress facts.
 * @returns the requested delivery route, or `undefined` when another owner keeps the key.
 */
export function resolveTuiComposerDelivery(
  input: TuiComposerDeliveryInput,
): TuiSubmitMode | undefined {
  if (!input.rootView || !input.running || !input.hasDraft || input.suggestionVisible) return undefined
  const modified = input.key.meta === true || input.key.super === true || input.key.hyper === true
  if (input.key.ctrl === true && input.key.return === true && input.key.shift !== true && !modified) return 'interrupt'
  if (input.key.tab === true && input.key.shift !== true && input.key.ctrl !== true && !modified) return 'followup'
  if (input.key.return === true && input.key.shift !== true && input.key.ctrl !== true && !modified) return 'steer'
  return undefined
}

/** Compact help rows for the explicit running delivery mode. */
export function tuiRunningDeliveryHelpLines(): readonly {
  readonly key: string
  readonly text: string
  readonly kind: 'heading' | 'binding'
}[] {
  return Object.freeze([
    Object.freeze({ key: 'running-delivery:heading', text: 'Running input', kind: 'heading' as const }),
    Object.freeze({ key: 'running-delivery:steer', text: '  Enter  Steer the current turn', kind: 'binding' as const }),
    Object.freeze({ key: 'running-delivery:followup', text: '  Tab    Queue a follow-up turn', kind: 'binding' as const }),
    Object.freeze({ key: 'running-delivery:interrupt', text: '  Ctrl+Enter  Interrupt, then queue', kind: 'binding' as const }),
    Object.freeze({ key: 'running-delivery:reclaim', text: '  Alt+Up  Reclaim pending input', kind: 'binding' as const }),
  ])
}
