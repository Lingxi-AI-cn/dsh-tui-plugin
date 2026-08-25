import { describe, expect, it } from 'vitest'
import { TuiAppendOnlySessionWindow } from '../src/session-window.ts'

describe('shared append-only Session window', () => {
  it('advances an exact prefix and rebuilds for replay, prepend, or reconnect identity', () => {
    const one = { seq: 1 }
    const two = { seq: 2 }
    const window = new TuiAppendOnlySessionWindow<object>()
    expect(window.begin([one])).toEqual({ reset: false, startIndex: 0 })
    window.commit([one])
    expect(window.begin([one, two])).toEqual({ reset: false, startIndex: 1 })
    window.commit([one, two])

    const replayedOne = { seq: 1 }
    expect(window.begin([replayedOne, two])).toEqual({ reset: true, startIndex: 0 })
    window.commit([replayedOne, two])
    expect(window.begin([{ seq: 0 }, replayedOne, two])).toEqual({ reset: true, startIndex: 0 })
    window.commit([{ seq: 0 }, replayedOne, two])
    expect(window.begin([], true)).toEqual({ reset: true, startIndex: 0 })
  })
})
