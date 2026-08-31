/** Read-only terminal projection of the official Session Schedule owner. */

import type { ScheduleRecord } from './host.ts'
import { terminalSafe } from './sanitize.ts'

/** One active Schedule row, ordered by its next owner-supplied target. */
export interface TuiScheduleRow {
  readonly record: ScheduleRecord
  readonly id: string
  readonly prompt: string
  readonly kind: ScheduleRecord['kind']
  readonly scheduledAt: string
  readonly targetMs: number
  readonly state: 'scheduled' | 'overdue'
  readonly intervalSeconds: number | undefined
}

/** Explicit source state prevents a missing projection from looking like zero schedules. */
export interface TuiScheduleSnapshot {
  readonly sourceState: 'ready' | 'unavailable' | 'error'
  readonly rows: readonly TuiScheduleRow[]
  readonly error: string | undefined
}

/** Frozen initial state used before a compatible projection is observed. */
export const TUI_SCHEDULES_UNAVAILABLE: TuiScheduleSnapshot = Object.freeze({
  sourceState: 'unavailable',
  rows: Object.freeze([]),
  error: undefined,
})

/**
 * Project active Schedule records without interpreting or mutating their durable stream.
 * @param records - official `schedule` projection, or undefined when the owner is absent.
 * @param now - wall-clock decision point used only for the overdue label.
 * @returns bounded, terminal-safe rows in next-target order.
 */
export function collectTuiSchedules(
  records: readonly ScheduleRecord[] | undefined,
  now = Date.now(),
): TuiScheduleSnapshot {
  if (records === undefined) return TUI_SCHEDULES_UNAVAILABLE
  try {
    const rows = records.map((record): TuiScheduleRow => {
      const targetMs = Date.parse(record.scheduledAt)
      if (!Number.isFinite(targetMs)) throw new Error('Schedule owner returned an invalid target timestamp')
      return Object.freeze({
        record,
        id: terminalSafe(String(record.id)),
        prompt: terminalSafe(record.prompt),
        kind: record.kind,
        scheduledAt: terminalSafe(record.scheduledAt),
        targetMs,
        state: targetMs <= now ? 'overdue' : 'scheduled',
        intervalSeconds: record.kind === 'every' ? record.everySeconds : undefined,
      })
    }).sort((a, b) => a.targetMs - b.targetMs || a.id.localeCompare(b.id))
    return Object.freeze({ sourceState: 'ready', rows: Object.freeze(rows), error: undefined })
  } catch (error) {
    return Object.freeze({
      sourceState: 'error',
      rows: Object.freeze([]),
      error: terminalSafe(error instanceof Error ? error.message : String(error)),
    })
  }
}
