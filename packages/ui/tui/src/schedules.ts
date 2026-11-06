/** Read-only terminal projection of the official Host-wide Schedule owner. */

import type { ScheduleCatalogEntry, ScheduleListResult } from './host.ts'
import { terminalSafe } from './sanitize.ts'

/** One Schedule catalog row in owner-supplied page order. */
export interface TuiScheduleRow {
  readonly record: ScheduleCatalogEntry
  readonly id: string
  readonly title: string
  readonly prompt: string
  readonly targetKind: ScheduleCatalogEntry['target']['kind']
  readonly targetSessionId: string | undefined
  readonly kind: ScheduleCatalogEntry['kind']
  readonly scheduledAt: string
  readonly targetMs: number
  readonly state: 'scheduled' | 'overdue' | 'paused' | 'ended'
  readonly intervalSeconds: number | undefined
}

/** Explicit source state prevents a missing projection from looking like zero schedules. */
export interface TuiScheduleSnapshot {
  readonly sourceState: 'ready' | 'unavailable' | 'error'
  readonly rows: readonly TuiScheduleRow[]
  readonly error: string | undefined
  readonly page?: Pick<ScheduleListResult, 'shown' | 'total' | 'limit' | 'offset'>
}

/** Frozen initial state used before a compatible projection is observed. */
export const TUI_SCHEDULES_UNAVAILABLE: TuiScheduleSnapshot = Object.freeze({
  sourceState: 'unavailable',
  rows: Object.freeze([]),
  error: undefined,
})

/**
 * Project one bounded Host-wide Schedule page without interpreting or mutating their durable stream.
 * @param page - official `schedule` list result, or undefined when the owner is absent.
 * @param now - wall-clock decision point used only for the overdue label.
 * @returns bounded, terminal-safe rows in owner order, with pagination disclosure.
 */
export function collectTuiSchedules(
  page: ScheduleListResult | undefined,
  now = Date.now(),
): TuiScheduleSnapshot {
  if (page === undefined) return TUI_SCHEDULES_UNAVAILABLE
  try {
    const rows = page.items.map((record): TuiScheduleRow => {
      const targetMs = Date.parse(record.scheduledAt)
      if (!Number.isFinite(targetMs)) throw new Error('Schedule owner returned an invalid target timestamp')
      return Object.freeze({
        record,
        id: terminalSafe(String(record.id)),
        title: terminalSafe(record.title),
        prompt: terminalSafe(record.prompt),
        targetKind: record.target.kind,
        targetSessionId: record.target.kind === 'new' ? undefined : terminalSafe(record.target.sessionId),
        kind: record.kind,
        scheduledAt: terminalSafe(record.scheduledAt),
        targetMs,
        state: record.status === 'active' ? (targetMs <= now ? 'overdue' : 'scheduled') : record.status,
        intervalSeconds: record.kind === 'every' ? record.everySeconds : undefined,
      })
    })
    return Object.freeze({ sourceState: 'ready', rows: Object.freeze(rows), error: undefined,
      page: { shown: page.shown, total: page.total, limit: page.limit, offset: page.offset } })
  } catch (error) {
    return Object.freeze({
      sourceState: 'error',
      rows: Object.freeze([]),
      error: terminalSafe(error instanceof Error ? error.message : String(error)),
    })
  }
}
