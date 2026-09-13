/** Pure session-resume candidate projection and picker helpers for the native TUI. */

import {
  type SessionIdType as SessionId, type SessionPreviewLine, type SessionRecord,
} from './host.ts'

/** One detached row shown by the native TUI Session picker. */
export interface TuiResumeCandidate {
  /** Live-preferred Session record observed during the picker scan. */
  record: SessionRecord
  /** Folded durable title or the local untitled fallback. */
  title: string
  /** Best metadata-only activity timestamp available to the picker. */
  updatedAt: number
  /** Whether this row belongs to the current Agent's workspace. */
  currentWorkspace: boolean
  /** Display label for the row's own workspace. */
  workspaceLabel: string
  /** Bounded current-surface summaries used by the picker preview. */
  preview: readonly SessionPreviewLine[]
  /** Whether older preview summaries or bytes were omitted. */
  previewTruncated: boolean
  /** Preview-only failure; the row remains resumable when this is set. */
  previewError?: string
  /** Resolved durable Agent preset shown without its filesystem path. */
  agentPreset?: TuiResumePresetSummary
  /** Why the row cannot be resumed by this preset-aware TUI composition. */
  disabledReason?: string
}

/** Detached preset identity and health projected during the Session scan. */
export interface TuiResumePresetSummary {
  readonly id: string
  readonly label: string
  readonly trust?: 'system' | 'user'
  readonly disabledReason?: string
}

/** Current workspace scope selected in the native TUI Session picker. */
export type TuiResumeScope = 'workspace' | 'all'

/** Controller-owned asynchronous state for one Session picker generation. */
export interface TuiResumeDialogSnapshot {
  /** Monotonic identity used to reset picker-local search and selection. */
  generation: number
  /** Current scan or resume operation phase. */
  phase: 'loading' | 'ready' | 'resuming'
  /** Current Agent workspace used by the default picker scope. */
  currentWorkspaceLabel: string
  /** Sorted rows after the scan settles; absent while loading. */
  candidates?: readonly TuiResumeCandidate[]
  /** Candidate currently being resumed. */
  resumingId?: SessionId
  /** Latest activation failure; the ready picker remains open for retry. */
  error?: string
}

/**
 * Summarize one logical Session for the preset-aware TUI composition.
 * @param record - live-preferred Session record from `ctx.sessionQuery`.
 * @param title - folded durable title, when one exists.
 * @param updatedAt - live last-event time or persisted artifact mtime.
 * @param currentId - Session currently owned by the TUI.
 * @param currentCwd - current Session workspace used by the default scope.
 * @param preview - bounded current-surface summaries, when available.
 * @param previewTruncated - whether older preview content was omitted.
 * @param previewError - preview-only failure text, when the Session could not be read.
 * @param agentPreset - log-resolved preset identity and health.
 * @param presetDisabledReason - localized roster/read failure when no healthy preset exists.
 * @returns a detached picker row with compatibility status.
 */
export function summarizeTuiResumeCandidate(
  record: SessionRecord,
  title: string | undefined,
  updatedAt: number | undefined,
  currentId: SessionId,
  currentCwd: string | undefined,
  preview: readonly SessionPreviewLine[] = [],
  previewTruncated = false,
  previewError?: string,
  agentPreset?: TuiResumePresetSummary,
  presetDisabledReason?: string,
): TuiResumeCandidate {
  let disabledReason: string | undefined
  if (record.header.id === currentId) disabledReason = 'current session'
  else if (record.live) disabledReason = 'session is already live in this runtime'
  else if (!record.persisted) disabledReason = 'session is not persisted'
  else if (record.header.origin === 'subagent') disabledReason = 'subagent-owned session'
  else if (presetDisabledReason !== undefined) disabledReason = presetDisabledReason
  else if (agentPreset === undefined) disabledReason = 'legacy rosterless session'
  else if (agentPreset.disabledReason !== undefined) disabledReason = agentPreset.disabledReason
  else if (record.header.cwd === undefined) disabledReason = 'session has no recorded workspace'
  return {
    record,
    title: title ?? 'Untitled session',
    updatedAt: updatedAt ?? record.header.createdAt,
    currentWorkspace: record.header.cwd === currentCwd,
    workspaceLabel: record.header.cwd ?? '(no workspace)',
    preview,
    previewTruncated,
    ...previewError === undefined ? {} : { previewError },
    ...agentPreset === undefined ? {} : { agentPreset },
    ...disabledReason === undefined ? {} : { disabledReason },
  }
}

/**
 * Sort resume rows newest-first with a stable Session-id tie break.
 * @param candidates - detached picker rows.
 * @returns a new sorted array.
 */
export function sortTuiResumeCandidates(
  candidates: readonly TuiResumeCandidate[],
): TuiResumeCandidate[] {
  return [...candidates].sort((a, b) => b.updatedAt - a.updatedAt
    || a.record.header.id.localeCompare(b.record.header.id))
}

/**
 * Apply workspace scope and normalized literal search to picker rows.
 * @param candidates - complete sorted picker rows.
 * @param scope - current-workspace or all-workspaces view.
 * @param query - title, id, or visible workspace query.
 * @returns matching rows without mutating the source array.
 */
export function filterTuiResumeCandidates(
  candidates: readonly TuiResumeCandidate[],
  scope: TuiResumeScope,
  query: string,
): TuiResumeCandidate[] {
  const scoped = scope === 'all'
    ? groupTuiResumeCandidates(candidates)
    : candidates.filter(candidate => candidate.currentWorkspace)
  const normalized = normalizeResumeText(query.trim())
  if (normalized === '') return [...scoped]
  return scoped.filter(candidate => normalizeResumeText(candidate.title).includes(normalized)
    || normalizeResumeText(candidate.record.header.id).includes(normalized)
    || (scope === 'all' && normalizeResumeText(candidate.workspaceLabel).includes(normalized)))
}

/**
 * Keep all-workspace browsing readable without losing newest-first order inside each workspace.
 * The current workspace appears first, followed by other workspace groups ordered by their
 * most recently active Session.
 * @param candidates - already newest-first Session candidates.
 * @returns candidates grouped by workspace with the current workspace first.
 */
export function groupTuiResumeCandidates(
  candidates: readonly TuiResumeCandidate[],
): TuiResumeCandidate[] {
  const groups = new Map<string, TuiResumeCandidate[]>()
  for (const candidate of candidates) {
    const entries = groups.get(candidate.workspaceLabel) ?? []
    entries.push(candidate)
    groups.set(candidate.workspaceLabel, entries)
  }
  return [...groups.values()]
    .sort((a, b) => Number(Boolean(b[0]?.currentWorkspace)) - Number(Boolean(a[0]?.currentWorkspace))
      || (b[0]?.updatedAt ?? 0) - (a[0]?.updatedAt ?? 0)
      || (a[0]?.workspaceLabel ?? '').localeCompare(b[0]?.workspaceLabel ?? ''))
    .flatMap(group => group)
}

/**
 * Format one activity timestamp as a compact deterministic relative age.
 * @param updatedAt - observed Unix epoch milliseconds.
 * @param now - current Unix epoch milliseconds.
 * @returns `now` or a compact minutes/hours/days/months/years age.
 */
export function formatTuiRelativeTime(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1_000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function normalizeResumeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}
