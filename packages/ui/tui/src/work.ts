/** Authoritative background-work projection for the native TUI. */

import type {
  AgentStatus, JobSnapshot, JobStatus, SessionIdType as SessionId,
  SubagentDescendantListEntry, SubagentRunEndInfo, SubagentRunInfo, SubagentTimingProjection,
} from './host.ts'

/** Live Agent facts used to refine one durable subagent catalog row. */
export interface TuiWorkAgentSnapshot {
  /** Exact live Agent status. */
  readonly status: AgentStatus
  /** Durable active-turn timing folded by the subagent projection. */
  readonly timing?: SubagentTimingProjection | undefined
}

/** One owner-scoped remote subagent lifecycle observed during this TUI process. */
export interface TuiObservedSubagentRun {
  /** Authoritative lifecycle start payload. */
  readonly info: SubagentRunInfo
  /** Local receipt time used only as a lower-bound elapsed clock. */
  readonly observedAt: number
  /** Authoritative terminal payload, absent while the run is live. */
  readonly outcome?: SubagentRunEndInfo | undefined
  /** Local receipt time of the terminal edge. */
  readonly finishedAt?: number | undefined
}

/** State vocabulary shared by jobs and continuable subagent rows. */
export type TuiWorkItemState = JobStatus | 'waiting' | 'inactive'

/** One deduplicated row in the native TUI work panel. */
export interface TuiWorkItemView {
  /** Stable React and selection identity. */
  readonly key: string
  /** Owning source of truth and available controls. */
  readonly source: 'job' | 'subagent'
  /** Source-owned job id or child Session id. */
  readonly id: string
  /** Concise source-owned label. */
  readonly label: string
  /** Owning Agent Session when known. */
  readonly ownerSession?: SessionId | undefined
  /** Current authoritative lifecycle state. */
  readonly state: TuiWorkItemState
  /** Source-specific terminal detail. */
  readonly detail?: string | undefined
  /** Epoch milliseconds at the authoritative start or local observation edge. */
  readonly startedAt?: number | undefined
  /** Epoch milliseconds at terminal settlement. */
  readonly finishedAt?: number | undefined
  /** Durable tree depth for subagents; jobs use zero. */
  readonly depth: number
  /** Whether Enter can open a local Session transcript. */
  readonly inspectable: boolean
  /** Why a non-local child has no inspectable transcript. */
  readonly readOnlyReason?: string | undefined
  /** Source-owned action currently safe to expose. */
  readonly action: 'cancel-job' | 'interrupt-subagent' | 'none'
  /** Durable accumulated execution and optional open-turn timing. */
  readonly timing?: SubagentTimingProjection | undefined
}

/** Footer counters derived from the same work rows as the panel. */
export interface TuiWorkSummary {
  /** Running or stopping rows. */
  readonly running: number
  /** Authoritative queued rows; zero until an owning service exposes that state. */
  readonly queued: number
  /** Terminal failed rows retained by their owning service or observed lifecycle. */
  readonly failed: number
  /** Total mounted work rows. */
  readonly total: number
}

/** Immutable work-panel snapshot consumed through `useSyncExternalStore`. */
export interface TuiWorkSnapshot {
  /** Deduplicated rows in stable live-first order. */
  readonly items: readonly TuiWorkItemView[]
  /** Counters projected from `items`. */
  readonly summary: TuiWorkSummary
  /** Catalog refresh currently in flight. */
  readonly loading: boolean
  /** Contained catalog failure, retried on the next lifecycle change. */
  readonly error?: string | undefined
}

/** Empty immutable snapshot used before the first authoritative scan. */
export const EMPTY_TUI_WORK_SNAPSHOT: TuiWorkSnapshot = Object.freeze({
  items: Object.freeze([]),
  summary: Object.freeze({ running: 0, queued: 0, failed: 0, total: 0 }),
  loading: false,
})

/** Inputs for one deterministic work projection. */
export interface TuiWorkProjectionInput {
  /** Jobs visible to the root and its currently live descendants. */
  readonly jobs: readonly JobSnapshot[]
  /** Durable local child catalog below the TUI root. */
  readonly subagents: readonly SubagentDescendantListEntry[]
  /** Exact live Agent facts keyed by child Session id. */
  readonly liveAgents: ReadonlyMap<SessionId, TuiWorkAgentSnapshot>
  /** Owner-scoped remote runs observed in this process. */
  readonly remoteRuns: readonly TuiObservedSubagentRun[]
  /** Whether an authoritative catalog refresh is pending. */
  readonly loading?: boolean
  /** Contained catalog error. */
  readonly error?: string
}

/**
 * Project jobs, continuable local children, and summary-only remote runs into
 * one stable panel without duplicating job-managed one-shot subagents.
 * @param input - current snapshots from the owning services and event streams.
 * @returns an immutable panel snapshot and counters.
 */
export function projectTuiWork(input: TuiWorkProjectionInput): TuiWorkSnapshot {
  const items: TuiWorkItemView[] = input.jobs.map(jobView)
  for (const entry of input.subagents) {
    if (entry.kind !== 'child' || entry.mode !== 'continuable') continue
    const live = input.liveAgents.get(entry.id)
    const state: TuiWorkItemState = entry.activity === 'inactive'
      ? 'inactive'
      : live?.status === 'running' ? 'running' : 'waiting'
    items.push(Object.freeze({
      key: `subagent:${entry.id}`,
      source: 'subagent',
      id: entry.id,
      label: entry.label,
      ownerSession: entry.parentId,
      state,
      depth: entry.depth,
      inspectable: live !== undefined,
      ...live === undefined ? {
        readOnlyReason: 'The local child Agent is not live; its durable summary remains available.',
      } : {},
      action: state === 'running' ? 'interrupt-subagent' : 'none',
      ...live?.timing === undefined ? {} : { timing: freezeTiming(live.timing) },
    }))
  }
  for (const run of input.remoteRuns) {
    const state = remoteRunState(run.outcome)
    items.push(Object.freeze({
      key: `remote-subagent:${run.info.runId}`,
      source: 'subagent',
      id: run.info.id,
      label: `${run.info.provider} subagent`,
      state,
      ...run.outcome === undefined ? {} : { detail: run.outcome.stopReason },
      startedAt: run.observedAt,
      ...run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt },
      depth: 1,
      inspectable: false,
      readOnlyReason: 'Remote provider exposed a summary only; no local Session transcript is available.',
      action: 'none',
    }))
  }
  items.sort(compareWorkItems)
  const summary = Object.freeze({
    running: items.filter(item => item.state === 'running' || item.state === 'stopping').length,
    queued: 0,
    failed: items.filter(item => item.state === 'failed').length,
    total: items.length,
  })
  return Object.freeze({
    items: Object.freeze(items),
    summary,
    loading: input.loading === true,
    ...input.error === undefined ? {} : { error: input.error },
  })
}

function jobView(job: JobSnapshot): TuiWorkItemView {
  return Object.freeze({
    key: `job:${job.id}`,
    source: 'job',
    id: job.id,
    label: job.label,
    ...job.ownerSession === undefined ? {} : { ownerSession: job.ownerSession },
    state: job.status,
    ...job.detail === undefined ? {} : { detail: job.detail },
    startedAt: job.startedAt,
    ...job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt },
    depth: 0,
    inspectable: false,
    action: job.status === 'running' ? 'cancel-job' : 'none',
  })
}

function remoteRunState(outcome: SubagentRunEndInfo | undefined): TuiWorkItemState {
  switch (outcome?.stopReason) {
    case undefined:
      return 'running'
    case 'completed':
      return 'completed'
    case 'aborted':
      return 'killed'
    case 'error':
    case 'max-tokens':
    case 'refusal':
      return 'failed'
  }
}

function compareWorkItems(a: TuiWorkItemView, b: TuiWorkItemView): number {
  const state = workStateRank(a.state) - workStateRank(b.state)
  if (state !== 0) return state
  const time = (a.startedAt ?? Number.MAX_SAFE_INTEGER) - (b.startedAt ?? Number.MAX_SAFE_INTEGER)
  return time !== 0 ? time : a.key.localeCompare(b.key)
}

function workStateRank(state: TuiWorkItemState): number {
  if (state === 'running' || state === 'stopping') return 0
  if (state === 'waiting') return 1
  if (state === 'failed') return 2
  if (state === 'inactive') return 3
  return 4
}

function freezeTiming(timing: SubagentTimingProjection): SubagentTimingProjection {
  return Object.freeze({
    settledMs: timing.settledMs,
    ...timing.active === undefined ? {} : { active: Object.freeze({ ...timing.active }) },
  })
}
