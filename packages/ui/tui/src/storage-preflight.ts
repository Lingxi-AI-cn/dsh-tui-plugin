/** Metadata-only Session storage compatibility gate run before the TUI creates an Agent. */

import { SESSION_FORMAT_VERSION, type SessionHeader, type SessionPersistence } from './host.ts'

/** Successful storage preflight facts safe to expose in diagnostics. */
export interface TuiSessionStoragePreflight {
  readonly backend: string
  readonly expectedFormat: number
  readonly compatibleSessions: number
  readonly supportsRawArtifacts: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/**
 * Refuse incompatible or unreadable storage before any TUI-owned Session write.
 * The official metadata listing is intentionally used instead of `load()` or
 * opening a content read handle, so this gate neither repairs tails nor reads Session content.
 * @param persistence - mounted Session persistence owner to inspect.
 * @param signal - optional cancellation for the metadata listing.
 * @returns non-secret compatibility facts safe for runtime diagnostics.
 */
export async function preflightTuiSessionStorage(
  persistence: SessionPersistence,
  signal?: AbortSignal,
): Promise<TuiSessionStoragePreflight> {
  let headers: readonly SessionHeader[]
  try {
    headers = (await persistence.list(signal === undefined ? {} : { signal })).map(snapshot => snapshot.header)
  } catch (error: unknown) {
    signal?.throwIfAborted()
    throw new Error(
      `Session storage preflight failed for ${persistence.name}: ${errorText(error)}. `
      + 'Back up the configured Session store and run the matching previous DSH build to export it; '
      + 'this TUI will not write to the store.',
      { cause: error },
    )
  }
  signal?.throwIfAborted()
  return Object.freeze({
    backend: persistence.name,
    expectedFormat: SESSION_FORMAT_VERSION,
    compatibleSessions: headers.length,
    supportsRawArtifacts: false,
  })
}
