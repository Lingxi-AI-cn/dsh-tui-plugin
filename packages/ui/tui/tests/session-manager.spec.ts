import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
/** Session Manager metadata joins, archive filtering, and Workspace projection. */

import { describe, expect, it } from 'vitest'
import { SessionId, type SessionRecord, type TuiWorkspace, type TuiWorkspaceId } from '../src/host.ts'
import {
  collectTuiWorkspaceRows, projectTuiSessionManager,
} from '../src/session-manager.ts'
import { summarizeTuiResumeCandidate } from '../src/resume.ts'

const workspaceId = (value: string): TuiWorkspaceId => value as TuiWorkspaceId

function candidate(id: string, cwd: string | undefined, title: string, current = false, updatedAt = 200) {
  const record: SessionRecord = {
    header: {
      version: SESSION_FORMAT_VERSION,
      id: SessionId(id),
      createdAt: 100,
      isSeeded: false,
      ...(cwd === undefined ? {} : { cwd }),
    },
    live: current,
    persisted: true,
  }
  return summarizeTuiResumeCandidate(
    record,
    title,
    updatedAt,
    current ? record.header.id : SessionId('current'),
    '/repo/current',
    [],
    false,
    undefined,
    { id: 'standard', label: 'Standard' },
  )
}

function workspace(overrides: Partial<TuiWorkspace> = {}): TuiWorkspace {
  return {
    id: workspaceId('workspace-a'),
    path: '/repo/a',
    title: '同名项目',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    sessionIds: [SessionId('a')],
    setTitle: async () => {},
    attachSession: async () => {},
    insertSessionBefore: async () => {},
    detachSession: async () => {},
    status: async () => 'ok',
    ...overrides,
  }
}

describe('native TUI Session Manager projection', () => {
  it('keeps an incompatible row and its disabled reason beside a resumable Session', () => {
    const reason = 'subagent/descriptor 0 uses unsupported descriptor version 2'
    const projected = projectTuiSessionManager([
      candidate('healthy', '/repo/a', 'Healthy'),
      { ...candidate('legacy', '/repo/a', 'Historical'), disabledReason: reason },
    ], [], [], { archive: 'all' })
    expect(projected.sessions).toHaveLength(2)
    expect(projected.sessions[0]?.candidate.disabledReason).toBeUndefined()
    expect(projected.sessions[1]?.candidate).toMatchObject({ title: 'Historical', disabledReason: reason })
  })

  it('retains duplicate display names while joining by stable Workspace id membership', async () => {
    const roster = await collectTuiWorkspaceRows([
      workspace(),
      workspace({
        id: workspaceId('workspace-b'), path: '/other/a', sessionIds: [SessionId('b')],
      }),
    ])
    const projected = projectTuiSessionManager([
      candidate('a', '/repo/a', 'Alpha'),
      candidate('b', '/other/a', 'Beta'),
      candidate('orphan', undefined, '无目录'),
    ], roster, [], { archive: 'all', currentSessionId: SessionId('a') })

    expect(projected.workspaces.map(row => row.title)).toEqual(['同名项目', '同名项目'])
    expect(projected.sessions.map(row => ({
      id: row.candidate.record.header.id, workspaceId: row.workspaceId, current: row.current,
    }))).toEqual([
      { id: 'a', workspaceId: 'workspace-a', current: true },
      { id: 'b', workspaceId: 'workspace-b', current: false },
      { id: 'orphan', workspaceId: undefined, current: false },
    ])
  })

  it('filters archive state and searches title, Workspace, cwd, and id metadata only', async () => {
    const roster = await collectTuiWorkspaceRows([workspace()])
    const candidates = [
      candidate('a', '/repo/a', 'Release 计划'),
      candidate('archived', '/repo/old', 'Historical'),
    ]
    expect(projectTuiSessionManager(candidates, roster, [SessionId('archived')], {
      archive: 'active', query: '计划',
    }).sessions.map(row => row.candidate.record.header.id)).toEqual(['a'])
    expect(projectTuiSessionManager(candidates, roster, [SessionId('archived')], {
      archive: 'archived', query: 'ARCH',
    }).sessions.map(row => row.candidate.record.header.id)).toEqual(['archived'])
    expect(projectTuiSessionManager(candidates, roster, [SessionId('archived')], {
      archive: 'all', query: '/repo/old',
    }).sessions.map(row => row.candidate.record.header.id)).toEqual(['archived'])
    expect(projectTuiSessionManager(candidates, roster, [], {
      archive: 'all', query: '同名项目', contentSearchAvailable: false,
    })).toMatchObject({ contentSearchAvailable: false, sessions: [{ workspaceTitle: '同名项目' }] })
  })

  it('bounds complete results and preserves missing-directory Workspace facts', async () => {
    const roster = await collectTuiWorkspaceRows([workspace({ status: async () => 'missing-dir' })])
    const projected = projectTuiSessionManager([
      candidate('a', '/repo/a', 'A'), candidate('b', '/repo/a', 'B'), candidate('c', '/repo/a', 'C'),
    ], roster, [], { archive: 'all', limit: 2 })
    expect(projected.sessions).toHaveLength(2)
    expect(projected.omitted).toBe(1)
    expect(projected.workspaces[0]?.status).toBe('missing-dir')
  })

  it('supports workspace scope, stable sorting, grouping, and more than 500 sessions', async () => {
    const roster = await collectTuiWorkspaceRows([
      workspace({ sessionIds: [SessionId('current-a'), SessionId('later-a')] }),
      workspace({
        id: workspaceId('workspace-b'), title: 'Beta', path: '/repo/b',
        sessionIds: [SessionId('b')],
      }),
    ])
    const many = Array.from({ length: 1_001 }, (_, index) => candidate(
      index === 0 ? 'current-a' : `session-${String(index).padStart(4, '0')}`,
      index === 0 ? '/repo/current' : '/repo/other',
      index === 0 ? 'Current' : `Session ${index}`,
    ))
    const scoped = projectTuiSessionManager(many, roster, [], {
      scope: 'workspace', archive: 'all', currentSessionId: SessionId('current-a'),
    })
    expect(scoped.sessions.map(row => row.candidate.record.header.id)).toEqual(['current-a'])

    const all = projectTuiSessionManager(many, roster, [], {
      scope: 'all', archive: 'all', sort: 'title', groupByWorkspace: true,
    })
    expect(all.sessions).toHaveLength(1_001)
    expect(all.omitted).toBe(0)
    expect(all.sessions.some(row => row.groupStart)).toBe(true)
    for (const title of new Set(all.sessions.map(row => row.workspaceTitle))) {
      const rows = all.sessions.filter(row => row.workspaceTitle === title)
      expect(rows.map(row => row.candidate.title)).toEqual(
        [...rows.map(row => row.candidate.title)].sort((a, b) => a.localeCompare(b)),
      )
    }
  })

  it('keeps grouped Workspaces contiguous and bounds metadata query work to 500 units', async () => {
    const roster = await collectTuiWorkspaceRows([
      workspace({ title: 'Alpha', sessionIds: [SessionId('a-new'), SessionId('a-old')] }),
      workspace({
        id: workspaceId('workspace-b'), title: 'Beta', path: '/repo/b',
        sessionIds: [SessionId('b-new'), SessionId('b-old')],
      }),
    ])
    const projected = projectTuiSessionManager([
      candidate('b-new', '/repo/b', 'B new', false, 400),
      candidate('a-old', '/repo/a', 'A old', false, 100),
      candidate('b-old', '/repo/b', 'B old', false, 200),
      candidate('a-new', '/repo/a', 'A new', false, 300),
    ], roster, [], { archive: 'all', groupByWorkspace: true, sort: 'updated-desc' })
    expect(projected.sessions.map(row => row.candidate.record.header.id)).toEqual([
      'a-new', 'a-old', 'b-new', 'b-old',
    ])
    expect(projected.sessions.filter(row => row.groupStart).map(row => row.workspaceTitle)).toEqual(['Alpha', 'Beta'])

    const prefix = 'x'.repeat(500)
    const bounded = projectTuiSessionManager([
      candidate('bounded', '/repo/a', `${prefix} suffix`),
    ], roster, [], { archive: 'all', query: `${prefix}ignored-after-limit` })
    expect(bounded.sessions.map(row => row.candidate.record.header.id)).toEqual(['bounded'])
  })
})
