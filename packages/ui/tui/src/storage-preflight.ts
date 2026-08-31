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

function backupLocations(persistence: SessionPersistence, headers: readonly SessionHeader[]): readonly string[] {
  return [...new Set(headers.flatMap((header) => {
    const location = persistence.locate(header)
    return location === undefined ? [] : [location.path]
  }))]
}

/**
 * Refuse incompatible or unreadable storage before any TUI-owned Session write.
 * The official metadata listing is intentionally used instead of `load()` or
 * `inspect()`, so this gate neither repairs tails nor reads Session content.
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
    headers = await persistence.list(signal)
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
  const incompatible = headers.filter(header => header.version !== SESSION_FORMAT_VERSION)
  if (incompatible.length > 0) {
    const locations = backupLocations(persistence, incompatible)
    throw new Error(
      `${persistence.name} contains ${incompatible.length} Session(s) outside format ${SESSION_FORMAT_VERSION}. `
      + `${locations.length === 0 ? 'Back up the configured Session store.' : `Back up: ${locations.join(', ')}.`} `
      + 'Use the matching previous DSH build to export them; this TUI will not write to the store.',
    )
  }
  return Object.freeze({
    backend: persistence.name,
    expectedFormat: SESSION_FORMAT_VERSION,
    compatibleSessions: headers.length,
    supportsRawArtifacts: persistence.supportsRawArtifacts,
  })
}
