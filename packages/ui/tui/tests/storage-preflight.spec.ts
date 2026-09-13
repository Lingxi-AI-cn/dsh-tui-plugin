import { describe, expect, it, vi } from 'vitest'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { preflightTuiSessionStorage } from '../src/storage-preflight.ts'

function persistence(headers: readonly { version: number; id: string }[]) {
  const list = vi.fn(async () => headers.map(header => ({ revision: 'fixture', header: {
    version: header.version,
    id: SessionId(header.id),
    createdAt: 1,
    cwd: '/workspace', isSeeded: false,
  } })))
  const owner = {
    name: 'session-persistence-jsonl',
    supportsRawArtifacts: false,
    list,
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
      supportsRawArtifacts: false,
    })
    expect(list).toHaveBeenCalledOnce()
  })

  it('fails closed with storage backup guidance for incompatible metadata', async () => {
    const { owner, list } = persistence([])
    list.mockRejectedValueOnce(new Error('unsupported Session format 4'))
    await expect(preflightTuiSessionStorage(owner)).rejects.toThrow(
      /Back up the configured Session store/u,
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
