/** Incompatible Session activity must not discard healthy rows or swallow cancellation. */

import { describe, expect, it } from 'vitest'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { SessionId, type SessionRecord } from '../src/host.ts'
import { collectTuiResumeActivity } from '../src/resume-activity.ts'

function record(id: string): SessionRecord {
  return {
    header: { id: SessionId(id), version: SESSION_FORMAT_VERSION, createdAt: 100, isSeeded: false },
    live: false,
    persisted: true,
  }
}

describe('Session picker activity reads', () => {
  it.each([1, 4])('retains healthy rows around an unsupported Session with concurrency %s', async (concurrency) => {
    const records = [record('before'), record('legacy'), record('after')]
    const failure = new Error('subagent/descriptor 0 uses unsupported descriptor version 2')
    const result = await collectTuiResumeActivity(records, async ({ header }) => {
      if (header.id === 'legacy') throw failure
      return header.id === 'before' ? 200 : 300
    }, new AbortController().signal, concurrency)
    expect(result).toEqual([{ time: 200 }, { failure }, { time: 300 }])
  })

  it('rejects cancellation instead of turning it into an incompatible row', async () => {
    const controller = new AbortController()
    const cancellation = new Error('Session Manager closed')
    const visited: string[] = []
    await expect(collectTuiResumeActivity([record('first'), record('next')], async ({ header }) => {
      visited.push(header.id)
      controller.abort(cancellation)
      throw cancellation
    }, controller.signal, 1)).rejects.toBe(cancellation)
    expect(visited).toEqual(['first'])
  })
})
