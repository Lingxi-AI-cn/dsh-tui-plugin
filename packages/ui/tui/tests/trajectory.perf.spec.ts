/** Bounded performance evidence for large native-TUI trajectory ledgers. */

import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  projectTuiTrajectory, reconcileTuiTrajectorySelection,
  TuiTrajectoryProjectionCache, visibleTuiTrajectoryEntries,
} from '../src/trajectory.ts'

function turnEvents(count: number): readonly SessionEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'turn/start' as const,
    seq: index + 1,
    time: index,
    data: { turn: index + 1 },
  }))
}

describe('native TUI trajectory large-ledger budget', () => {
  it.each([10_000, 100_000])('projects and searches %i events within a generous regression budget', (count) => {
    const events = turnEvents(count)
    const started = performance.now()
    const snapshot = projectTuiTrajectory(events, count)
    const projectedMs = performance.now() - started
    const searchStarted = performance.now()
    const matches = visibleTuiTrajectoryEntries(snapshot.entries, `Turn ${count}`)
    const searchMs = performance.now() - searchStarted

    expect(snapshot.entries).toHaveLength(count)
    expect(snapshot.omitted).toBe(0)
    expect(matches).toHaveLength(1)
    expect(projectedMs).toBeLessThan(5_000)
    expect(searchMs).toBeLessThan(2_000)
  })

  it('loads older rows and appends a 100k-event suffix without a full re-fold', () => {
    const events = turnEvents(100_000)
    const cache = new TuiTrajectoryProjectionCache()
    const initialStarted = performance.now()
    const tail = cache.update(events, 256)
    const initialMs = performance.now() - initialStarted

    const olderStarted = performance.now()
    const older = cache.update(events, 10_000)
    const olderMs = performance.now() - olderStarted
    const selected = reconcileTuiTrajectorySelection(tail.entries, older.entries, 0, false)

    const appendedEvent = {
      type: 'turn/start' as const,
      seq: 100_001,
      time: 100_000,
      data: { turn: 100_001 },
    } as SessionEvent
    const appendStarted = performance.now()
    const appended = cache.update([...events, appendedEvent], 10_000)
    const appendMs = performance.now() - appendStarted

    expect(older.entries[selected]?.key).toBe(tail.entries[0]?.key)
    expect(appended.entries.at(-1)?.turn).toBe(100_001)
    expect(initialMs).toBeLessThan(5_000)
    expect(olderMs).toBeLessThan(1_000)
    expect(appendMs).toBeLessThan(1_000)
  })
})
