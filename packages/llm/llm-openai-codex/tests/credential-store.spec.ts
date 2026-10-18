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

describe('queued credential cancellation', () => {
  it('does not persist a file-store login cancelled while waiting for another mutation', async () => {
    const credentials = await store()
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    const first = credentials.modify('openai-codex', async () => {
      entered.resolve(undefined)
      await release.promise
      return { type: 'api_key', key: 'original' }
    })
    await entered.promise
    const controller = new AbortController()
    const cancelled = new Error('login cancelled')
    const mutate = vi.fn(async () => ({ type: 'api_key' as const, key: 'cancelled' }))
    const queued = credentials.modify('openai-codex', mutate, { signal: controller.signal })
    const rejected = expect(queued).rejects.toBe(cancelled)
    controller.abort(cancelled)
    release.resolve(undefined)
    await first
    await rejected
    expect(mutate).not.toHaveBeenCalled()
    expect(await credentials.read('openai-codex')).toEqual({ type: 'api_key', key: 'original' })
  })

  it('does not start a Harness mutation after cancellation while its record owner was busy', async () => {
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    let saved: CredentialRecord | undefined
    const provider = {
      async modifyRecord(
        _key: CredentialKey,
        mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
      ) {
        entered.resolve(undefined)
        await release.promise
        saved = await mutate(undefined)
        return saved
      },
    } as CredentialProvider
    const credentials = new HarnessCredentialStore(provider)
    const controller = new AbortController()
    const cancelled = new Error('login cancelled')
    const mutate = vi.fn(async () => ({ type: 'api_key' as const, key: 'cancelled' }))
    const pending = credentials.modify('openai-codex', mutate, { signal: controller.signal })
    const rejected = expect(pending).rejects.toBe(cancelled)
    await entered.promise
    controller.abort(cancelled)
    release.resolve(undefined)
    await rejected
    expect(mutate).not.toHaveBeenCalled()
    expect(saved).toBeUndefined()
  })

  it('persists a rotated file-store grant when its mutation has already started', async () => {
    const credentials = await store()
    const controller = new AbortController()
    const rotated = { type: 'oauth' as const, access: 'next-access', refresh: 'next-refresh', expires: 123 }
    await credentials.modify('openai-codex', async () => {
      controller.abort(new Error('caller stopped waiting'))
      return rotated
    }, { signal: controller.signal })
    expect(await credentials.read('openai-codex')).toEqual(rotated)
  })

  it('persists a rotated Harness grant when its mutation has already started', async () => {
    let saved: CredentialRecord | undefined
    const provider = {
      async modifyRecord(
        _key: CredentialKey,
        mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
      ) {
        saved = await mutate(undefined)
        return saved
      },
    } as CredentialProvider
    const controller = new AbortController()
    const rotated = { type: 'oauth' as const, access: 'next-access', refresh: 'next-refresh', expires: 123 }
    await new HarnessCredentialStore(provider).modify('openai-codex', async () => {
      controller.abort(new Error('caller stopped waiting'))
      return rotated
    }, { signal: controller.signal })
    expect(saved).toEqual({ kind: 'grant', payload: rotated })
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
