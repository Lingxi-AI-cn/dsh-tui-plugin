/** Passive npm version discovery for the user-facing TUI bundle. */

import { createRequire } from 'node:module'

const ENTRY_PACKAGE = '@lingxi-ai-cn/dsh-tui'
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(ENTRY_PACKAGE)}`
const { version: CURRENT_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string }

/** Detached update status that never performs profile mutation. */
export interface TuiUpdateStatus {
  /** User-facing package queried from the public npm registry. */
  readonly packageName: typeof ENTRY_PACKAGE
  /** Installed TUI runtime version. */
  readonly currentVersion: string
  /** Newest observed version for the selected compatibility suffix. */
  readonly latestVersion?: string
  /** Whether the observed version targets the installed official DSH prerelease suffix. */
  readonly compatible: boolean
  /** Whether a strictly newer compatible TUI core exists. */
  readonly updateAvailable: boolean
  /** Exact external profile-install command when an update exists. */
  readonly command?: string
}

function parsedVersion(value: string): { core: readonly number[]; suffix: string } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/u.exec(value)
  if (match === null) return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    suffix: match[4] ?? '',
  }
}

function newer(left: readonly number[], right: readonly number[]): boolean {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a > b
  }
  return false
}

/**
 * Select the newest published package version for the current official DSH prerelease suffix.
 * @param currentVersion - installed TUI version and compatibility suffix.
 * @param versions - public registry versions to inspect.
 * @returns newest compatible version, or `undefined` when none exists.
 */
export function selectTuiCompatibleVersion(
  currentVersion: string,
  versions: readonly string[],
): string | undefined {
  const current = parsedVersion(currentVersion)
  if (current === undefined) return undefined
  let selected: { value: string; core: readonly number[] } | undefined
  for (const value of versions) {
    const candidate = parsedVersion(value)
    if (candidate === undefined || candidate.suffix !== current.suffix) continue
    if (selected === undefined || newer(candidate.core, selected.core)) {
      selected = { value, core: candidate.core }
    }
  }
  return selected?.value
}

/**
 * Build a compatibility-aware status from one registry version string.
 * @param latestVersion - newest public version observed by the caller.
 * @returns immutable passive update status and optional external command.
 */
export function tuiUpdateStatus(latestVersion?: string): TuiUpdateStatus {
  const current = parsedVersion(CURRENT_VERSION)
  const latest = latestVersion === undefined ? undefined : parsedVersion(latestVersion)
  const compatible = current !== undefined && latest !== undefined && current.suffix === latest.suffix
  const updateAvailable = compatible && newer(latest.core, current.core)
  return Object.freeze({
    packageName: ENTRY_PACKAGE,
    currentVersion: CURRENT_VERSION,
    ...latestVersion === undefined ? {} : { latestVersion },
    compatible,
    updateAvailable,
    ...updateAvailable ? {
      command: `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ dsh plugin --profile tui add --save-exact ${ENTRY_PACKAGE}@${latestVersion}`,
    } : {},
  })
}

/**
 * Read the public npm dist-tag without mutating the profile.
 * @param signal - cancellation shared with the caller lifecycle.
 * @returns current, latest, compatibility, and an exact external update command.
 */
export async function checkTuiUpdate(signal?: AbortSignal): Promise<TuiUpdateStatus> {
  signal?.throwIfAborted()
  const response = await fetch(REGISTRY_URL, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    ...signal === undefined ? {} : { signal },
  })
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`)
  const value: unknown = await response.json()
  signal?.throwIfAborted()
  const record = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as { 'dist-tags'?: unknown; versions?: unknown }
    : undefined
  const tags = record?.['dist-tags']
  const latest = typeof tags === 'object' && tags !== null && !Array.isArray(tags)
    ? (tags as { latest?: unknown }).latest
    : undefined
  const versions = typeof record?.versions === 'object' && record.versions !== null && !Array.isArray(record.versions)
    ? Object.keys(record.versions)
    : []
  const compatible = selectTuiCompatibleVersion(CURRENT_VERSION, versions)
  const version = compatible ?? (typeof latest === 'string' ? latest : undefined)
  if (version === undefined) throw new Error('npm registry response has no published versions')
  return tuiUpdateStatus(version)
}

/** Current installed runtime version. */
export const TUI_RUNTIME_VERSION = CURRENT_VERSION
