import { describe, expect, it, vi } from 'vitest'
import { SESSION_FORMAT_VERSION, SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { preflightTuiSessionStorage } from '../src/storage-preflight.ts'

function persistence(headers: readonly { version: number; id: string }[]) {
  const list = vi.fn(async () => headers.map(header => ({
    version: header.version,
    id: SessionId(header.id),
    createdAt: 1,
    cwd: '/workspace',
  })))
  const locate = vi.fn((header: SessionHeader) => ({
    kind: 'jsonl' as const,
    path: `/sessions/${header.id}/session.jsonl.zstd`,
  }))
  const owner = {
    name: 'session-persistence-jsonl',
    supportsRawArtifacts: true,
    list,
    locate,
  } as unknown as SessionPersistence
  return { owner, list }
}

describe('TUI Session storage preflight', () => {
  it('accepts metadata in the current logical Session format without loading content', async () => {
    const { owner, list } = persistence([{ version: SESSION_FORMAT_VERSION, id: 'current' }])
    await expect(preflightTuiSessionStorage(owner)).resolves.toEqual({
      backend: 'session-persistence-jsonl',
      expectedFormat: SESSION_FORMAT_VERSION,
      compatibleSessions: 1,
      supportsRawArtifacts: true,
    })
    expect(list).toHaveBeenCalledOnce()
  })

  it('fails closed with a backup location for incompatible metadata', async () => {
    const { owner } = persistence([{ version: SESSION_FORMAT_VERSION + 1, id: 'future' }])
    await expect(preflightTuiSessionStorage(owner)).rejects.toThrow(
      /Back up: \/sessions\/future\/session\.jsonl\.zstd/u,
    )
  })

  it('contains backend listing failures and refuses to write', async () => {
    const { owner, list } = persistence([])
    list.mockRejectedValueOnce(new Error('encoding mismatch'))
    await expect(preflightTuiSessionStorage(owner)).rejects.toThrow(
      /encoding mismatch.*will not write to the store/u,
    )
  })
})
