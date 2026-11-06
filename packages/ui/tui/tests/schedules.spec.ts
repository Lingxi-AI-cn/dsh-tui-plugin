/** Host-wide Schedule catalog projection into terminal-native read-only rows. */

import { describe, expect, it } from 'vitest'
import type { ScheduleCatalogEntry, ScheduleListResult } from '@deepseek-ai/dsh-schedule/client'
import { tuiMessage } from '../src/locale.ts'
import { collectTuiSchedules } from '../src/schedules.ts'

function record(id: string, status: ScheduleCatalogEntry['status'] = 'active'): ScheduleCatalogEntry {
  return {
    id: id as ScheduleCatalogEntry['id'], kind: 'every', title: id, prompt: id,
    everySeconds: 600, scheduledAt: '2026-08-31T03:00:00.000Z',
    target: { kind: 'new', create: {} }, involvedSessionIds: [], status,
  }
}

function page(items: ScheduleCatalogEntry[]): ScheduleListResult {
  return { items, shown: items.length, total: items.length, limit: 100, offset: 0 }
}

describe('TUI Schedule projection', () => {
  it('distinguishes a missing owner from a ready empty catalog page', () => {
    expect(collectTuiSchedules(undefined)).toMatchObject({ sourceState: 'unavailable', rows: [] })
    expect(collectTuiSchedules(page([]))).toMatchObject({ sourceState: 'ready', rows: [],
      page: { shown: 0, total: 0, limit: 100, offset: 0 } })
  })

  it('preserves owner ordering and page bounds rather than claiming a complete Session list', () => {
    const snapshot = collectTuiSchedules({ ...page([record('z'), record('a')]), total: 250 }, 0)
    expect(snapshot.rows.map(row => row.id)).toEqual(['z', 'a'])
    expect(snapshot.page).toEqual({ shown: 2, total: 250, limit: 100, offset: 0 })
    expect(snapshot.rows[0]?.intervalSeconds).toBe(600)
    expect(snapshot.rows[0]?.state).toBe('scheduled')
  })

  it('marks only active tasks overdue, including at the exact target instant', () => {
    const snapshot = collectTuiSchedules(page([
      record('active'), record('paused', 'paused'), record('ended', 'ended'),
    ]), Date.parse('2026-08-31T03:00:00.000Z'))
    expect(snapshot.rows.map(row => [row.id, row.state])).toEqual([
      ['active', 'overdue'], ['paused', 'paused'], ['ended', 'ended'],
    ])
  })

  it('projects recurrence rules without inventing a fixed interval', () => {
    const recurring: ScheduleCatalogEntry = {
      id: 'rrule' as ScheduleCatalogEntry['id'], kind: 'rrule', title: 'Daily', prompt: 'Review',
      rrule: 'DTSTART:20260831T030000Z\nRRULE:FREQ=DAILY', scheduledAt: '2026-08-31T03:00:00.000Z',
      target: { kind: 'new', create: {} }, involvedSessionIds: [], status: 'active',
    }
    const snapshot = collectTuiSchedules(page([recurring]), 0)
    expect(snapshot.rows[0]).toMatchObject({ kind: 'rrule', state: 'scheduled', intervalSeconds: undefined })
  })

  it('describes existing, reserved reusable, and per-occurrence Session destinations', () => {
    const targets: ScheduleCatalogEntry['target'][] = [
      { kind: 'session', sessionId: 'existing' as never },
      { kind: 'new_once', sessionId: 'reserved' as never, create: {} },
      { kind: 'new', create: {} },
    ]
    const snapshot = collectTuiSchedules(page(targets.map((target, index) => ({
      ...record(String(index)), target,
    }))), 0)
    expect(snapshot.rows.map(row => [row.targetKind, row.targetSessionId])).toEqual([
      ['session', 'existing'], ['new_once', 'reserved'], ['new', undefined],
    ])
    expect(snapshot.rows.map(row => tuiMessage('en', `schedules.destination.${row.targetKind}`, {
      session: row.targetSessionId ?? '',
    }))).toEqual([
      'Delivery: existing Session existing',
      'Delivery: create reserved Session reserved once, then reuse it',
      'Delivery: a new Session for every occurrence',
    ])
    expect(snapshot.rows.map(row => tuiMessage('zh', `schedules.destination.${row.targetKind}`, {
      session: row.targetSessionId ?? '',
    }))).toEqual([
      '投递：已有 Session existing',
      '投递：首次创建预留 Session reserved，之后复用',
      '投递：每次执行新建一个 Session',
    ])
  })

  it('sanitizes task titles and both existing and reserved destination ids', () => {
    const snapshot = collectTuiSchedules(page(['session', 'new_once'].map((kind): ScheduleCatalogEntry => ({
      ...record('safe'), title: 'Title\u001b[31m',
      target: kind === 'session'
        ? { kind: 'session', sessionId: 'existing\u001b[2J' as never }
        : { kind: 'new_once', sessionId: 'reserved\u001b[2J' as never, create: {} },
    }))), 0)
    for (const row of snapshot.rows) {
      expect(row.title).toContain('Title')
      expect(row.title).not.toContain('\u001b')
      expect(row.targetSessionId).not.toContain('\u001b')
      expect(tuiMessage('en', `schedules.destination.${row.targetKind}`, {
        session: row.targetSessionId ?? '',
      })).not.toContain('\u001b')
    }
  })

  it('sanitizes owner text and contains invalid timestamps without discarding lifecycle state', () => {
    const ready = collectTuiSchedules(page([{ ...record('safe'), prompt: 'hello\u001b[31m' }]), 0)
    expect(ready.rows[0]?.prompt).toContain('hello')
    expect(ready.rows[0]?.prompt).not.toContain('\u001b')
    const corrupt = collectTuiSchedules(page([{ ...record('bad'), scheduledAt: 'not-a-time' }]))
    expect(corrupt.sourceState).toBe('error')
    expect(corrupt.rows).toEqual([])
    expect(corrupt.error).toContain('invalid target timestamp')
  })
})
