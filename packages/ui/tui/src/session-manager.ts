/** Terminal-native Session and Workspace Manager projection over Host owners. */

import type { SessionIdType as SessionId, TuiWorkspace, TuiWorkspaceId } from './host.ts'
import type { TuiResumeCandidate } from './resume.ts'
import { terminalSafe } from './sanitize.ts'

const SESSION_MANAGER_RESULT_LIMIT = 100_000
/** Maximum normalized query units consumed by the metadata projection. */
export const TUI_SESSION_MANAGER_QUERY_LIMIT = 500

/** Archive visibility selected by the Session Manager. */
export type TuiSessionArchiveFilter = 'active' | 'archived' | 'all'
export type TuiSessionScope = 'workspace' | 'all'
export type TuiSessionSort = 'updated-desc' | 'updated-asc' | 'title' | 'workspace'

/** Durable native-TUI preferences for the metadata-only Session list. */
export interface TuiSessionManagerPreferences {
  readonly scope: TuiSessionScope
  readonly archive: TuiSessionArchiveFilter
  readonly sort: TuiSessionSort
  readonly groupByWorkspace: boolean
}

export const DEFAULT_TUI_SESSION_MANAGER_PREFERENCES: TuiSessionManagerPreferences = Object.freeze({
  scope: 'workspace',
  archive: 'active',
  sort: 'updated-desc',
  groupByWorkspace: true,
})

/** One durable Workspace row detached from its owner object. */
export interface TuiWorkspaceManagerRow {
  readonly id: TuiWorkspaceId
  readonly title: string
  readonly path: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly sessionIds: readonly SessionId[]
  readonly status: 'ok' | 'missing-dir'
}

/** One Session row enriched with Workspace and archive facts. */
export interface TuiSessionManagerRow {
  readonly candidate: TuiResumeCandidate
  readonly workspaceId?: TuiWorkspaceId
  readonly workspaceTitle: string
  readonly archived: boolean
  readonly current: boolean
  readonly groupStart: boolean
}

/** Bounded metadata projection shown by the Session Manager. */
export interface TuiSessionManagerProjection {
  readonly sessions: readonly TuiSessionManagerRow[]
  readonly workspaces: readonly TuiWorkspaceManagerRow[]
  readonly omitted: number
  readonly contentSearchAvailable: boolean
}

/** Controller-owned asynchronous state for one Session Manager generation. */
export interface TuiSessionManagerDialogSnapshot {
  readonly generation: number
  readonly phase: 'loading' | 'ready' | 'mutating'
  readonly initialTab: 'sessions' | 'workspaces'
  readonly currentSessionId: SessionId
  readonly currentWorkspaceLabel: string
  readonly candidates?: readonly TuiResumeCandidate[]
  readonly workspaces?: readonly TuiWorkspaceManagerRow[]
  readonly archivedSessionIds?: readonly SessionId[]
  readonly error?: string
}

/**
 * Read the owner roster and resolve live directory state without mutating it.
 * @param workspaces - current authoritative Workspace roster.
 * @param signal - optional scan cancellation boundary.
 * @returns detached terminal-safe Workspace rows.
 */
export async function collectTuiWorkspaceRows(
  workspaces: readonly TuiWorkspace[],
  signal?: AbortSignal,
): Promise<readonly TuiWorkspaceManagerRow[]> {
  const rows = await Promise.all(workspaces.map(async (workspace): Promise<TuiWorkspaceManagerRow> => {
    signal?.throwIfAborted()
    const status = await workspace.status()
    signal?.throwIfAborted()
    return Object.freeze({
      id: workspace.id,
      title: terminalSafe(workspace.title),
      path: terminalSafe(workspace.path),
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      sessionIds: Object.freeze([...workspace.sessionIds]),
      status,
    })
  }))
  return Object.freeze(rows)
}

/**
 * Join Session candidates to the durable Workspace roster and apply a bounded
 * metadata-only query. Full-text snippets remain absent unless a separate
 * owner explicitly supplies them.
 * @param candidates - bounded Session-query candidates.
 * @param workspaces - detached Workspace roster rows.
 * @param archivedSessionIds - authoritative registry archive set.
 * @param options - query, scope, sort, grouping, and limit controls.
 * @returns bounded Session and Workspace projection.
 */
export function projectTuiSessionManager(
  candidates: readonly TuiResumeCandidate[],
  workspaces: readonly TuiWorkspaceManagerRow[],
  archivedSessionIds: readonly SessionId[],
  options: {
    readonly query?: string
    readonly archive?: TuiSessionArchiveFilter
    readonly scope?: TuiSessionScope
    readonly sort?: TuiSessionSort
    readonly groupByWorkspace?: boolean
    readonly currentSessionId?: SessionId
    readonly limit?: number
    readonly contentSearchAvailable?: boolean
  } = {},
): TuiSessionManagerProjection {
  const archived = new Set(archivedSessionIds)
  const workspaceBySession = new Map<SessionId, TuiWorkspaceManagerRow>()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) workspaceBySession.set(sessionId, workspace)
  }
  const archive = options.archive ?? 'active'
  const scope = options.scope ?? 'all'
  const query = normalize(options.query ?? '').slice(0, TUI_SESSION_MANAGER_QUERY_LIMIT)
  const matches = candidates.flatMap((candidate): TuiSessionManagerRow[] => {
    const sessionId = candidate.record.header.id
    if (scope === 'workspace' && !candidate.currentWorkspace) return []
    const isArchived = archived.has(sessionId)
    if (archive === 'active' && isArchived) return []
    if (archive === 'archived' && !isArchived) return []
    const workspace = workspaceBySession.get(sessionId)
    const workspaceTitle = workspace?.title ?? candidate.workspaceLabel
    if (query !== '' && ![
      candidate.title,
      sessionId,
      candidate.record.header.cwd ?? '',
      candidate.workspaceLabel,
      workspaceTitle,
    ].some(value => normalize(value).includes(query))) return []
    return [Object.freeze({
      candidate,
      ...(workspace === undefined ? {} : { workspaceId: workspace.id }),
      workspaceTitle,
      archived: isArchived,
      current: sessionId === options.currentSessionId,
      groupStart: false,
    })]
  })
  const sort = options.sort ?? 'updated-desc'
  const compareWithinGroup = (left: TuiSessionManagerRow, right: TuiSessionManagerRow): number => {
    if (sort === 'title') return left.candidate.title.localeCompare(right.candidate.title)
      || String(left.candidate.record.header.id).localeCompare(String(right.candidate.record.header.id))
    if (sort === 'workspace') return left.workspaceTitle.localeCompare(right.workspaceTitle)
      || right.candidate.updatedAt - left.candidate.updatedAt
      || String(left.candidate.record.header.id).localeCompare(String(right.candidate.record.header.id))
    const direction = sort === 'updated-asc' ? 1 : -1
    return direction * (left.candidate.updatedAt - right.candidate.updatedAt)
      || String(left.candidate.record.header.id).localeCompare(String(right.candidate.record.header.id))
  }
  matches.sort((left, right) => options.groupByWorkspace === true
    ? left.workspaceTitle.localeCompare(right.workspaceTitle) || compareWithinGroup(left, right)
    : compareWithinGroup(left, right))
  const grouped = options.groupByWorkspace === true
    ? matches.map((row, index) => Object.freeze({
      ...row,
      groupStart: index === 0 || matches[index - 1]?.workspaceTitle !== row.workspaceTitle,
    }))
    : matches
  const requestedLimit = options.limit ?? SESSION_MANAGER_RESULT_LIMIT
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.max(1, Math.min(SESSION_MANAGER_RESULT_LIMIT, requestedLimit))
    : SESSION_MANAGER_RESULT_LIMIT
  return Object.freeze({
    sessions: Object.freeze(grouped.slice(0, limit)),
    workspaces: Object.freeze([...workspaces]),
    omitted: Math.max(0, grouped.length - limit),
    contentSearchAvailable: options.contentSearchAvailable === true,
  })
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}
