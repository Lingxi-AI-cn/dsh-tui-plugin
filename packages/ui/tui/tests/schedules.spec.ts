/** Active Schedule projection into terminal-native read-only rows. */

import { describe, expect, it } from 'vitest'
import type { ScheduleRecord } from '@deepseek-ai/dsh-schedule/client'
import { collectTuiSchedules } from '../src/schedules.ts'

function record(value: ScheduleRecord): ScheduleRecord {
  return value
}

describe('TUI Schedule projection', () => {
  it('distinguishes a missing owner from a ready empty projection', () => {
    expect(collectTuiSchedules(undefined)).toMatchObject({ sourceState: 'unavailable', rows: [] })
    expect(collectTuiSchedules([])).toMatchObject({ sourceState: 'ready', rows: [] })
  })

  it('orders after, at, and every rows and computes overdue at the view boundary', () => {
    const now = Date.parse('2026-08-31T03:00:00.000Z')
    const snapshot = collectTuiSchedules([
      record({ id: 'every' as never, kind: 'every', prompt: 'repeat', everySeconds: 600,
        scheduledAt: '2026-08-31T03:10:00.000Z' }),
      record({ id: 'after' as never, kind: 'after', prompt: 'late', afterSeconds: 30,
        scheduledAt: '2026-08-31T02:59:00.000Z' }),
      record({ id: 'at' as never, kind: 'at', prompt: 'meet', scheduledAt: '2026-08-31T03:05:00.000Z' }),
    ], now)
    expect(snapshot.sourceState).toBe('ready')
    expect(snapshot.rows.map(row => [row.id, row.state])).toEqual([
      ['after', 'overdue'], ['at', 'scheduled'], ['every', 'scheduled'],
    ])
    expect(snapshot.rows[2]?.intervalSeconds).toBe(600)
  })

  it('sanitizes owner text and contains corrupt projection values', () => {
    const ready = collectTuiSchedules([record({
      id: 'safe' as never, kind: 'at', prompt: 'hello\u001b[31m', scheduledAt: '2026-09-01T00:00:00.000Z',
    })], 0)
    expect(ready.rows[0]?.prompt).toContain('hello')
    expect(ready.rows[0]?.prompt).not.toContain('\u001b')

    const corrupt = collectTuiSchedules([{
      id: 'bad', kind: 'at', prompt: 'x', scheduledAt: 'not-a-time',
    } as unknown as ScheduleRecord])
    expect(corrupt.sourceState).toBe('error')
    expect(corrupt.rows).toEqual([])
    expect(corrupt.error).toContain('invalid target timestamp')
  })
})
