import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileCredentialStore } from '../src/credential-store.ts'

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
