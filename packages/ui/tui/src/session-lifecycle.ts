/** TUI-local state for replacing the active Agent with a fresh Session. */

import type { SessionIdType as SessionId } from './host.ts'

/** User command that requests a fresh TUI Session. */
export type TuiFreshSessionCommand = 'clear' | 'new' | 'mode' | 'workspace'

/** Controller-owned confirmation or creation state for one fresh Session request. */
export interface TuiFreshSessionDialogSnapshot {
  /** Monotonic identity for one dialog activation. */
  readonly generation: number
  /** Command spelling that opened the dialog. */
  readonly command: TuiFreshSessionCommand
  /** Whether the user is deciding or fresh Agent preparation is active. */
  readonly phase: 'confirming' | 'creating'
  /** Session that remains active until replacement commits. */
  readonly currentSessionId: SessionId
  /** Workspace copied into the fresh Session. */
  readonly workspaceLabel: string
  /** Explicit target selected through /mode; absent means inherit current. */
  readonly targetPreset?: { readonly id: string; readonly name: string }
  /** Latest preparation or switch failure while confirmation remains open. */
  readonly error?: string
}
