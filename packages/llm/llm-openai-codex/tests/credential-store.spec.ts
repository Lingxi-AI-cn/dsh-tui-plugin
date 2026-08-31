import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type {
  CredentialKey, CredentialProvider, CredentialRecord, CredentialRecordEntry,
} from '@deepseek-ai/dsh-credentials'
import {
  FileCredentialStore,
  HarnessCredentialStore,
  openAICodexCredentialKey,
} from '../src/credential-store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function store(): Promise<FileCredentialStore> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-auth-'))
  roots.push(root)
  return new FileCredentialStore(join(root, 'nested', 'oauth.json'))
}

describe('FileCredentialStore', () => {
  it('persists cloned OAuth credentials owner-only and deletes them', async () => {
    const credentials = await store()
    const saved = await credentials.modify('openai-codex', async (current) => {
      expect(current).toBeUndefined()
      return {
        type: 'oauth', access: 'access', refresh: 'refresh', expires: 123, accountId: 'acct',
      }
    })
    expect(saved).toMatchObject({ type: 'oauth', accountId: 'acct' })
    expect(await credentials.list()).toEqual([{ providerId: 'openai-codex', type: 'oauth' }])
    const read = await credentials.read('openai-codex')
    expect(read).toEqual(saved)
    if (read !== undefined) read.type = 'api_key'
    expect(await credentials.read('openai-codex')).toEqual(saved)
    expect(JSON.parse(await readFile(credentials.filename, 'utf8'))).toMatchObject({ version: 1 })
    if (process.platform !== 'win32') expect((await stat(credentials.filename)).mode & 0o077).toBe(0)

    await credentials.delete('openai-codex')
    expect(await credentials.read('openai-codex')).toBeUndefined()
    expect(await credentials.list()).toEqual([])
  })

  it('serializes concurrent modifications and treats undefined as no change', async () => {
    const credentials = await store()
    const first = credentials.modify('openai-codex', async () => ({
      type: 'api_key', key: 'first',
    }))
    const second = credentials.modify('openai-codex', async current => ({
      type: 'api_key', key: `${current?.type === 'api_key' ? current.key : 'missing'}-second`,
    }))
    await Promise.all([first, second])
    const unchanged = await credentials.modify('openai-codex', async () => undefined)
    expect(unchanged).toEqual({ type: 'api_key', key: 'first-second' })
  })
})

describe('HarnessCredentialStore', () => {
  it('stores OAuth and API-key values in the official scoped record owner', async () => {
    const records = new Map<CredentialKey, CredentialRecord>()
    const provider = {
      readRecord: vi.fn(async (key: CredentialKey): Promise<CredentialRecord | undefined> => records.get(key)),
      listRecords: vi.fn(async (): Promise<readonly CredentialRecordEntry[]> => (
        [...records].map(([key, record]) => ({ key, kind: record.kind }))
      )),
      modifyRecord: vi.fn(async (
        key: CredentialKey,
        mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
      ): Promise<CredentialRecord | undefined> => {
        const next = await mutate(records.get(key))
        if (next !== undefined) records.set(key, next)
        return next ?? records.get(key)
      }),
      deleteRecord: vi.fn(async (key: CredentialKey) => { records.delete(key) }),
    } as unknown as CredentialProvider
    const credentials = new HarnessCredentialStore(provider)
    const key = openAICodexCredentialKey('openai-codex')

    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', access: 'access', refresh: 'refresh', expires: 123, accountId: 'acct',
    }))
    expect(records.get(key)).toEqual({
      kind: 'grant',
      payload: { type: 'oauth', access: 'access', refresh: 'refresh', expires: 123, accountId: 'acct' },
    })
    expect(await credentials.read('openai-codex')).toMatchObject({ type: 'oauth', accountId: 'acct' })
    expect(await credentials.list()).toEqual([{ providerId: 'openai-codex', type: 'oauth' }])

    await credentials.modify('openai-codex', async () => ({ type: 'api_key', key: 'secret' }))
    expect(records.get(key)).toEqual({ kind: 'api-key', key: 'secret' })
    expect(await credentials.list()).toEqual([{ providerId: 'openai-codex', type: 'api_key' }])
    await credentials.delete('openai-codex')
    expect(records.has(key)).toBe(false)
  })

  it('ignores records owned by other credential scopes', async () => {
    const provider = {
      listRecords: vi.fn(async () => [{
        key: 'llm-pi-ai/openai-codex', kind: 'grant',
      }]),
    } as unknown as CredentialProvider
    await expect(new HarnessCredentialStore(provider).list()).resolves.toEqual([])
  })
})
