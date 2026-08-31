/**
 * Terminal Trajectory: Turn-by-Turn ledger projection from Session events.
 *
 * Builds a diagnostic ledger that groups session events into Turns, Steps,
 * Tool calls, and compaction records. Each entry carries timing facts derived
 * from event timestamps — missing or unknown values stay undefined rather
 * than estimated.
 */

import type { ContentBlock, SessionEvent, TokenUsage, TurnEndReason } from './host.ts'
import { terminalSafe } from './sanitize.ts'
import { TuiAppendOnlySessionWindow } from './session-window.ts'

const MAX_LEDGER_ENTRIES = 100_000
const MAX_INSPECTOR_BYTES = 16 * 1024
const TRIM_BATCH = 1_024

/** Structural event emitted by newer Hosts; legacy logs simply omit it. */
interface TuiToolExecutionGroupEvent {
  readonly type: 'tool/execution-group'
  readonly seq: number
  readonly time: number
  readonly data: {
    readonly turn: number
    readonly step: number
    readonly group: number
    readonly mode: string
    readonly closed: boolean
    readonly members: readonly { readonly name: string; readonly callId: string }[]
  }
}

type TuiTrajectorySessionEvent = SessionEvent | TuiToolExecutionGroupEvent

/** Discriminated entry kind in the trajectory ledger. */
export type TuiTrajectoryKind = 'turn' | 'step' | 'user' | 'assistant'
  | 'tool-group' | 'tool-call' | 'tool-result' | 'compaction'

/** One row in the trajectory ledger. */
export interface TuiTrajectoryEntry {
  readonly key: string
  readonly kind: TuiTrajectoryKind
  readonly seq: number
  readonly time: number
  readonly turn?: number
  readonly step?: number
  readonly callId?: string
  readonly parentKey?: string
  readonly depth: number
  readonly boundary?: 'start' | 'end'
  readonly label: string
  readonly detail?: string
  readonly input?: string
  readonly output?: string
  /** Duration in ms when computable from paired events. */
  readonly durationMs?: number
  readonly usage?: TokenUsage
  readonly interrupted?: boolean
  readonly error?: { readonly name: string; readonly code: string }
  readonly timing?: TuiTrajectoryTimingFacts
}

/** Full trajectory ledger snapshot. */
export interface TuiTrajectorySnapshot {
  readonly entries: readonly TuiTrajectoryEntry[]
  readonly turnCount: number
  readonly stepCount: number
  readonly totalEvents: number
  readonly omitted: number
  readonly firstSeq?: number
  readonly lastSeq?: number
}

/** Timing facts for the inspector detail panel. */
export interface TuiTrajectoryTimingFacts {
  readonly startTime?: number
  readonly endTime?: number
  readonly durationMs?: number
  readonly ttftMs?: number
  readonly llmMs?: number
  readonly toolMs?: number
}

/** Recorded-time scale for one bounded overview column. */
export interface TuiTrajectoryTimelineScale {
  readonly min: number
  readonly max: number
  readonly cells: number
}

/**
 * Project a Session event log into a bounded trajectory ledger.
 *
 * Only structural events are projected — chunks, surface ops, and
 * session-title LLM requests are skipped. The ledger is built from the
 * tail so the most recent activity is always visible.
 *
 * @param events - the complete session event log.
 * @param limit - maximum ledger entries (defaults to MAX_LEDGER_ENTRIES).
 * @returns frozen trajectory snapshot.
 */
export function projectTuiTrajectory(
  events: readonly TuiTrajectorySessionEvent[],
  limit: number = MAX_LEDGER_ENTRIES,
): TuiTrajectorySnapshot {
  return new TuiTrajectoryProjectionCache().update(events, limit)
}

class TrajectoryFoldState {
  private readonly entries: TuiTrajectoryEntry[] = []
  private readonly turnStarts = new Map<number, number>()
  private readonly stepStarts = new Map<string, number>()
  private readonly toolDispatches = new Map<string, number>()
  private readonly toolParents = new Map<string, string>()
  private readonly toolGroupStarts = new Map<string, number>()
  private readonly compactionStarts = new Map<string, number>()
  private droppedEntries = 0
  private turnCount = 0
  private stepCount = 0
  private totalEvents = 0

  append(event: TuiTrajectorySessionEvent): void {
    this.totalEvents += 1
    if (event.type === 'tool/execution-group') {
      const parent = `${groupKey(event.data.turn, event.data.step, event.data.group)}:start`
      for (const member of event.data.members) this.toolParents.set(String(member.callId), parent)
    }
    const entry = projectEvent(
      event, this.turnStarts, this.stepStarts, this.toolDispatches,
      this.toolParents, this.toolGroupStarts, this.compactionStarts,
    )
    if (entry !== undefined) this.entries.push(Object.freeze(entry))
    if (event.type === 'turn/start') this.turnCount += 1
    if (event.type === 'step/start') this.stepCount += 1
    if (event.type === 'turn/end') this.turnStarts.delete(event.data.turn)
    if (event.type === 'step/end') {
      const key = stepKey(event.data.turn, event.data.step)
      this.stepStarts.delete(key)
    }
    if (event.type === 'tool/result') {
      const callId = String(event.data.message.source.callId)
      this.toolDispatches.delete(callId)
      this.toolParents.delete(callId)
    }
    if (this.entries.length > MAX_LEDGER_ENTRIES + TRIM_BATCH) {
      this.entries.splice(0, TRIM_BATCH)
      this.droppedEntries += TRIM_BATCH
    }
  }

  snapshot(limit: number): TuiTrajectorySnapshot {
    const cap = Math.max(1, Math.min(limit, MAX_LEDGER_ENTRIES))
    const hiddenInMemory = Math.max(0, this.entries.length - cap)
    const bounded = this.entries.slice(this.entries.length - cap)
    const last = bounded.at(-1)
    return Object.freeze({
      entries: Object.freeze(bounded),
      turnCount: this.turnCount,
      stepCount: this.stepCount,
      totalEvents: this.totalEvents,
      omitted: this.droppedEntries + hiddenInMemory,
      ...(bounded[0] === undefined ? {} : { firstSeq: bounded[0].seq }),
      ...(last === undefined ? {} : { lastSeq: last.seq }),
    })
  }
}

/** Append-aware trajectory window; ordinary transcript rendering never reads it while closed. */
export class TuiTrajectoryProjectionCache {
  private state: TrajectoryFoldState | undefined
  private readonly window = new TuiAppendOnlySessionWindow<TuiTrajectorySessionEvent>()

  /** Forget projection and append-window state before a Session switch. */
  reset(): void {
    this.state = undefined
    this.window.reset()
  }

  /**
   * Apply an append-only durable event suffix or rebuild after replacement.
   * @param events - complete current Session event array.
   * @param limit - maximum retained ledger entries.
   * @returns immutable bounded Trajectory snapshot.
   */
  update(events: readonly TuiTrajectorySessionEvent[], limit = MAX_LEDGER_ENTRIES): TuiTrajectorySnapshot {
    const update = this.window.begin(events, this.state === undefined)
    if (update.reset) {
      this.state = new TrajectoryFoldState()
    }
    const state = this.state
    if (state === undefined) throw new Error('trajectory projection state was not initialized')
    for (let index = update.startIndex; index < events.length; index += 1) {
      const event = events[index]
      if (event !== undefined) state.append(event)
    }
    this.window.commit(events)
    return state.snapshot(limit)
  }
}

function stepKey(turn: number, step: number): string {
  return `${turn}:${step}`
}

function groupKey(turn: number, step: number, group: number): string {
  return `group:${turn}:${step}:${group}`
}

function optionalDuration(start: number | undefined, end: number): Partial<Pick<TuiTrajectoryEntry, 'durationMs'>> {
  return start !== undefined ? { durationMs: Math.max(0, end - start) } : {}
}

function boundedInspectorText(text: string): string {
  const safe = terminalSafe(text)
  if (Buffer.byteLength(safe, 'utf8') <= MAX_INSPECTOR_BYTES) return safe
  let low = 0
  let high = safe.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(`${safe.slice(0, middle)}…`, 'utf8') <= MAX_INSPECTOR_BYTES) low = middle
    else high = middle - 1
  }
  return `${safe.slice(0, low)}…`
}

function contentText(content: readonly ContentBlock[]): string {
  const text = content.flatMap((block): string[] => {
    if (block.type === 'text' || block.type === 'reasoning') return [block.text]
    if (block.type === 'image') return [`[image: ${block.attachment.name ?? block.attachment.attachmentId}]`]
    if (block.type === 'tool-call') return [`${block.name} ${block.arguments}`]
    return [contentText(block.content)]
  }).filter(Boolean).join('\n')
  return boundedInspectorText(text)
}

function turnEndDetail(reason: TurnEndReason): string {
  if (reason.kind === 'completed' || reason.kind === 'blocked'
    || reason.kind === 'max-tokens' || reason.kind === 'interrupted') return reason.kind
  if (reason.kind === 'aborted') {
    const cause = reason.reason.kind === 'hook'
      ? `${reason.reason.kind}: ${terminalSafe(reason.reason.reason)}`
      : reason.reason.kind
    return `aborted (${cause})`
  }
  return terminalSafe(`error ${reason.error.code}: ${reason.error.message}`).slice(0, 240)
}

function projectEvent(
  event: TuiTrajectorySessionEvent,
  turnStarts: Map<number, number>,
  stepStarts: Map<string, number>,
  toolDispatches: Map<string, number>,
  toolParents: ReadonlyMap<string, string>,
  toolGroupStarts: Map<string, number>,
  compactionStarts: Map<string, number>,
): TuiTrajectoryEntry | undefined {
  switch (event.type) {
    case 'turn/start': {
      const data = event.data
      turnStarts.set(data.turn, event.time)
      return {
        key: `turn:${data.turn}`,
        kind: 'turn',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        depth: 0,
        boundary: 'start',
        label: `Turn ${data.turn}`,
      }
    }
    case 'turn/end': {
      const data = event.data
      const start = turnStarts.get(data.turn)
      return {
        key: `turn:${data.turn}:end`,
        kind: 'turn',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        depth: 0,
        boundary: 'end',
        label: `Turn ${data.turn} end`,
        detail: turnEndDetail(data.reason),
        ...optionalDuration(start, event.time),
        timing: {
          ...(start === undefined ? {} : { startTime: start }),
          endTime: event.time,
          ...(start === undefined ? {} : { durationMs: Math.max(0, event.time - start) }),
        },
      }
    }
    case 'step/start': {
      const data = event.data
      stepStarts.set(stepKey(data.turn, data.step), event.time)
      return {
        key: `step:${data.turn}:${data.step}`,
        kind: 'step',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        step: data.step,
        parentKey: `turn:${data.turn}`,
        depth: 1,
        boundary: 'start',
        label: `Step ${data.turn}.${data.step}`,
      }
    }
    case 'step/end': {
      const data = event.data
      const start = stepStarts.get(stepKey(data.turn, data.step))
      return {
        key: `step:${data.turn}:${data.step}:end`,
        kind: 'step',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        step: data.step,
        parentKey: `turn:${data.turn}`,
        depth: 1,
        boundary: 'end',
        label: `Step ${data.turn}.${data.step} end`,
        ...optionalDuration(start, event.time),
        timing: {
          ...(start === undefined ? {} : { startTime: start }),
          endTime: event.time,
          ...(start === undefined ? {} : { durationMs: Math.max(0, event.time - start) }),
        },
      }
    }
    case 'user/message': {
      const data = event.data
      const text = contentText(data.content)
      const sourceKind = data.source.kind
      return {
        key: `user:${event.seq}`,
        kind: 'user',
        seq: event.seq,
        time: event.time,
        depth: 0,
        label: text.slice(0, 120),
        input: text,
        ...(sourceKind !== 'user' ? { detail: sourceKind } : {}),
      }
    }
    case 'assistant/message': {
      const data = event.data
      const text = contentText(data.message.content)
      const start = stepStarts.get(stepKey(data.turn, data.step))
      return {
        key: `assistant:${data.turn}:${data.step}:${event.seq}`,
        kind: 'assistant',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        step: data.step,
        parentKey: `step:${data.turn}:${data.step}`,
        depth: 2,
        label: text.slice(0, 120),
        output: text,
        ...(data.usage !== undefined ? { usage: data.usage } : {}),
        ...(data.interrupted ? { interrupted: true } : {}),
        ...optionalDuration(start, event.time),
        timing: {
          ...(start === undefined ? {} : { startTime: start }),
          endTime: event.time,
          ...(start === undefined ? {} : { durationMs: Math.max(0, event.time - start) }),
        },
      }
    }
    case 'tool/execution-group': {
      const data = event.data
      const key = groupKey(data.turn, data.step, data.group)
      const start = toolGroupStarts.get(key)
      if (data.closed) toolGroupStarts.delete(key)
      else toolGroupStarts.set(key, event.time)
      return {
        key: `${key}:${data.closed ? 'end' : 'start'}`,
        kind: 'tool-group',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        step: data.step,
        parentKey: `step:${data.turn}:${data.step}`,
        depth: 2,
        boundary: data.closed ? 'end' : 'start',
        label: `${data.mode} group ${data.group} · ${data.members.length}`,
        detail: data.members.map(member => `${member.name} (${String(member.callId)})`).join('\n'),
        ...(data.closed ? optionalDuration(start, event.time) : {}),
        ...(data.closed ? { timing: {
          ...(start === undefined ? {} : { startTime: start, durationMs: Math.max(0, event.time - start) }),
          endTime: event.time,
        } } : {}),
      }
    }
    case 'tool/call': {
      const data = event.data
      toolDispatches.set(data.callId, event.time)
      return {
        key: `tool-call:${String(data.callId)}`,
        kind: 'tool-call',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        step: data.step,
        callId: String(data.callId),
        parentKey: toolParents.get(String(data.callId)) ?? `step:${data.turn}:${data.step}`,
        depth: toolParents.has(String(data.callId)) ? 3 : 2,
        label: data.name,
        detail: boundedInspectorText(data.arguments).slice(0, 80),
        input: boundedInspectorText(data.arguments),
      }
    }
    case 'tool/result': {
      const data = event.data
      const callId = data.message.source.callId
      const dispatched = toolDispatches.get(callId)
      const text = contentText(data.message.content[0].content)
      return {
        key: `tool-result:${String(callId)}:${event.seq}`,
        kind: 'tool-result',
        seq: event.seq,
        time: event.time,
        turn: data.turn,
        step: data.step,
        callId: String(callId),
        parentKey: `tool-call:${String(callId)}`,
        depth: toolParents.has(String(callId)) ? 4 : 3,
        label: text.slice(0, 120),
        output: text,
        ...(data.error !== undefined ? { error: data.error } : {}),
        ...optionalDuration(dispatched, event.time),
        timing: {
          ...(dispatched === undefined ? {} : { startTime: dispatched }),
          endTime: event.time,
          ...(dispatched === undefined ? {} : {
            durationMs: Math.max(0, event.time - dispatched),
            toolMs: Math.max(0, event.time - dispatched),
          }),
        },
      }
    }
    case 'compaction/start': {
      const data = event.data
      const id = String(data.compactionId)
      compactionStarts.set(id, event.time)
      return {
        key: `compaction:${id}:start`,
        kind: 'compaction',
        seq: event.seq,
        time: event.time,
        ...(data.turn === null ? {} : { turn: data.turn, parentKey: `turn:${data.turn}` }),
        depth: data.turn === null ? 0 : 1,
        boundary: 'start',
        label: 'compaction start',
        detail: `id ${id}${data.turn === null ? ' · standalone' : ` · turn ${data.turn}`}`,
      }
    }
    case 'compaction/summary': {
      const data = event.data
      const id = String(data.compactionId)
      const output = contentText(data.summary)
      return {
        key: `compaction:${id}:summary`, kind: 'compaction', seq: event.seq, time: event.time,
        depth: 0, label: 'compaction summary', output,
        detail: `id ${id} · range ${data.shadowedRange.start}-${data.shadowedRange.end}`
          + ` · ${data.shadowedSeqs.length} items · ~${data.shadowedTokenCount} tokens`
          + ` · ${terminalSafe(data.provider)}/${terminalSafe(data.model)}`,
        ...(data.usage === undefined ? {} : { usage: data.usage }),
      }
    }
    case 'compaction/end': {
      const data = event.data
      const id = String(data.compactionId)
      const start = compactionStarts.get(id)
      compactionStarts.delete(id)
      return {
        key: `compaction:${id}:end`, kind: 'compaction', seq: event.seq, time: event.time,
        ...(data.turn === null ? {} : { turn: data.turn, parentKey: `turn:${data.turn}` }),
        depth: data.turn === null ? 0 : 1,
        boundary: 'end', label: 'compaction end',
        detail: data.error === undefined ? `id ${id}` : boundedInspectorText(data.error),
        ...(data.error === undefined ? {} : { error: { name: 'CompactionError', code: 'COMPACTION_FAILED' } }),
        ...optionalDuration(start, event.time),
        timing: {
          ...(start === undefined ? {} : { startTime: start, durationMs: Math.max(0, event.time - start) }),
          endTime: event.time,
        },
      }
    }
    case 'compaction/prune': {
      const data = event.data
      return {
        key: `compaction:prune:${event.seq}`, kind: 'compaction', seq: event.seq, time: event.time,
        depth: 0, label: 'compaction prune',
        detail: `range ${data.shadowedRange.start}-${data.shadowedRange.end}`
          + ` · ${data.shadowedSeqs.length} items · ~${data.shadowedTokenCount} tokens`,
      }
    }
    default:
      return undefined
  }
}

/**
 * Compute timing facts for a selected trajectory entry within the ledger.
 * @param entries - current visible or complete ledger.
 * @param index - selected entry index.
 * @returns recorded timing facts, or an empty object when selection is absent.
 */
export function trajectoryTimingFacts(
  entries: readonly TuiTrajectoryEntry[],
  index: number,
): TuiTrajectoryTimingFacts {
  const entry = entries[index]
  if (entry === undefined) return {}
  return entry.timing ?? {
    startTime: entry.time,
    ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
  }
}

/** Search and fold the currently loaded ledger without changing its durable source order. */
export function visibleTuiTrajectoryEntries(
  entries: readonly TuiTrajectoryEntry[],
  query: string,
  collapsedTurns: ReadonlySet<number> = new Set(),
  collapsedSteps: ReadonlySet<string> = new Set(),
): readonly TuiTrajectoryEntry[] {
  const normalized = terminalSafe(query).trim().toLocaleLowerCase()
  return Object.freeze(entries.filter((entry) => {
    if (normalized !== '') {
      const text = [entry.kind, entry.label, entry.detail, entry.input, entry.output, entry.callId,
        entry.turn, entry.step, entry.error?.code].filter(value => value !== undefined).join('\n').toLocaleLowerCase()
      return text.includes(normalized)
    }
    if (entry.turn !== undefined && collapsedTurns.has(entry.turn) && entry.kind !== 'turn') return false
    if (entry.turn !== undefined && entry.step !== undefined
      && collapsedSteps.has(stepKey(entry.turn, entry.step)) && entry.kind !== 'step') return false
    return true
  }))
}

/**
 * Preserve semantic selection across older-page prepend and streaming append.
 * @param previous - prior visible ledger.
 * @param next - next visible ledger.
 * @param previousIndex - prior selected index.
 * @param tailFollow - whether selection follows the newest entry.
 * @returns reconciled bounded selection index.
 */
export function reconcileTuiTrajectorySelection(
  previous: readonly TuiTrajectoryEntry[],
  next: readonly TuiTrajectoryEntry[],
  previousIndex: number,
  tailFollow: boolean,
): number {
  if (next.length === 0) return 0
  if (tailFollow) return next.length - 1
  const selected = previous[Math.max(0, Math.min(previousIndex, previous.length - 1))]
  if (selected !== undefined) {
    const matched = next.findIndex(entry => entry.key === selected.key)
    if (matched >= 0) return matched
  }
  return Math.max(0, Math.min(previousIndex, next.length - 1))
}

/**
 * Build one recorded-time overview scale without inventing missing durations.
 * @param entries - ledger entries carrying recorded timestamps.
 * @param cells - requested terminal cell budget.
 * @returns bounded overview scale, or undefined for an empty ledger.
 */
export function createTuiTrajectoryTimelineScale(
  entries: readonly TuiTrajectoryEntry[],
  cells: number,
): TuiTrajectoryTimelineScale | undefined {
  if (entries.length === 0) return undefined
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const entry of entries) {
    const start = entry.timing?.startTime ?? (entry.durationMs === undefined ? entry.time : entry.time - entry.durationMs)
    const end = entry.timing?.endTime ?? entry.time
    min = Math.min(min, start, end)
    max = Math.max(max, start, end)
  }
  return Object.freeze({ min, max, cells: Math.max(3, Math.min(40, Math.floor(cells))) })
}

/**
 * Render a marker for an instant or a span only when a duration is recorded.
 * @param entry - ledger entry to place on the scale.
 * @param scale - recorded-time overview scale.
 * @returns fixed-width marker cells, or an empty string without a scale.
 */
export function formatTuiTrajectoryTimeline(
  entry: TuiTrajectoryEntry,
  scale: TuiTrajectoryTimelineScale | undefined,
): string {
  if (scale === undefined) return ''
  const width = scale.cells
  const range = Math.max(1, scale.max - scale.min)
  const start = entry.timing?.startTime ?? (entry.durationMs === undefined ? entry.time : entry.time - entry.durationMs)
  const end = entry.timing?.endTime ?? entry.time
  const index = (time: number): number => Math.max(0, Math.min(
    width - 1, Math.round((time - scale.min) / range * (width - 1)),
  ))
  const startIndex = index(start)
  const endIndex = index(end)
  const cells = Array.from({ length: width }, () => '·')
  if (entry.durationMs === undefined && entry.timing?.durationMs === undefined) {
    cells[startIndex] = '│'
  } else {
    for (let offset = Math.min(startIndex, endIndex); offset <= Math.max(startIndex, endIndex); offset += 1) {
      cells[offset] = '━'
    }
  }
  return cells.join('')
}

/**
 * Format a duration for compact display.
 * @param ms - recorded milliseconds, when known.
 * @returns compact duration or an unavailable marker.
 */
export function formatTrajectoryDuration(ms: number | undefined): string {
  if (ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

/**
 * Resolve one first-party Trajectory kind label.
 * @param kind - stable ledger kind.
 * @param locale - selected first-party locale.
 * @returns localized display label.
 */
export function trajectoryKindLabel(kind: TuiTrajectoryKind, locale: 'en' | 'zh'): string {
  const labels: Record<TuiTrajectoryKind, Record<'en' | 'zh', string>> = {
    'turn': { en: 'Turn', zh: '轮次' },
    'step': { en: 'Step', zh: '步骤' },
    'user': { en: 'User', zh: '用户' },
    'assistant': { en: 'Assistant', zh: '助手' },
    'tool-group': { en: 'Tool Group', zh: '工具组' },
    'tool-call': { en: 'Tool Call', zh: '工具调用' },
    'tool-result': { en: 'Tool Result', zh: '工具结果' },
    'compaction': { en: 'Compaction', zh: '压缩' },
  }
  return labels[kind][locale]
}
