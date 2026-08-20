/** TUI-local state and path resolution for native Session archive export. */

import { resolve } from 'node:path'
import type { SessionIdType as SessionId } from './host.ts'

/** Lifecycle shown by the native Session export dialog. */
export type TuiSessionExportPhase = 'opening' | 'selecting' | 'exporting'

/** Process-local Session export dialog state; no field enters the Session log. */
export interface TuiSessionExportDialogSnapshot {
  /** Monotonic identity preventing stale export settlement from changing a newer dialog. */
  readonly generation: number
  /** Current dialog operation phase. */
  readonly phase: TuiSessionExportPhase
  /** Exact Session selected before the command lifecycle settled. */
  readonly sessionId: SessionId
  /** Absolute workspace used to resolve a relative directory entry. */
  readonly workspaceLabel: string
  /** Resolved absolute destination while bytes are being written. */
  readonly destination?: string
  /** Whether durable descendant artifacts are included while writing. */
  readonly includeDescendants?: boolean
  /** Safe failure text retained while the operator edits the destination. */
  readonly error?: string
}

/**
 * Resolve terminal directory input against the Session workspace.
 * @param workspace - absolute Session working directory.
 * @param input - absolute or workspace-relative operator input; blank selects the workspace.
 * @returns an absolute directory path for the host export service to validate.
 */
export function resolveTuiSessionExportDirectory(workspace: string, input: string): string {
  return resolve(workspace, input.trim() || '.')
}
