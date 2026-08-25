/** Bounded terminal projection for the Host-owned browse directory-picker capability. */

import type { TuiDirectoryListing } from './host.ts'
import { terminalSafe } from './sanitize.ts'

/** One selectable directory browser row. */
export interface TuiDirectoryBrowserRow {
  readonly kind: 'select-current' | 'directory'
  readonly name: string
  readonly path: string
  readonly hidden: boolean
}

/** Detached browser page preserving owner paths and a stable parent target. */
export interface TuiDirectoryBrowserPage {
  readonly path: string
  readonly home: string
  readonly parent?: string
  readonly rows: readonly TuiDirectoryBrowserRow[]
  readonly truncated: boolean
}

/**
 * Project one owner listing without joining paths or guessing filesystem facts in the TUI.
 * @param listing - Host-owned directory facts for one path.
 * @param showHidden - whether hidden directory rows remain visible.
 * @returns a detached terminal-safe browser page.
 */
export function projectTuiDirectoryBrowser(
  listing: TuiDirectoryListing,
  showHidden: boolean,
): TuiDirectoryBrowserPage {
  const parent = listing.crumbs.length > 1 ? listing.crumbs[listing.crumbs.length - 2]?.path : undefined
  const entries = listing.entries.filter(entry => showHidden || !entry.hidden)
  return Object.freeze({
    path: terminalSafe(listing.path),
    home: terminalSafe(listing.home),
    ...(parent === undefined ? {} : { parent: terminalSafe(parent) }),
    rows: Object.freeze([
      Object.freeze({
        kind: 'select-current' as const,
        name: terminalSafe(listing.path),
        path: terminalSafe(listing.path),
        hidden: false,
      }),
      ...entries.map(entry => Object.freeze({
        kind: 'directory' as const,
        name: terminalSafe(entry.name),
        path: terminalSafe(entry.path),
        hidden: entry.hidden,
      })),
    ]),
    truncated: listing.truncated,
  })
}
