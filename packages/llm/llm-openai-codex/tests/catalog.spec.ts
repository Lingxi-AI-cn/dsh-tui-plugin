import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Credential, Models } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { CodexCatalog, DynamicCodexProvider, parseRemoteModels } from '../src/catalog.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempPath(filename: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-catalog-'))
  roots.push(root)
  return join(root, filename)
}

function catalogBody(): object {
  return {
    models: [
      {
        slug: 'gpt-visible-two', display_name: 'GPT Visible Two', description: 'second',
        visibility: 'list', priority: 20, context_window: 222,
        input_modalities: ['text', 'image', 'audio'],
        supported_reasoning_levels: [{ effort: 'high', description: 'deep' }, { effort: 'ultra' }],
      },
      { slug: 'gpt-hidden', visibility: 'hide', priority: 1 },
      { slug: 'gpt-visible-one', visibility: 'list', priority: 10 },
    ],
  }
}

describe('Codex account model catalog', () => {
  it('normalizes untrusted rows and skips duplicates or malformed entries', () => {
    expect(parseRemoteModels({ models: [
      { slug: 'model', visibility: 'list', displayName: 'Model' },
      { slug: 'model', visibility: 'list' },
      { slug: '', visibility: 'list' },
      null,
    ] })).toEqual([{ slug: 'model', visibility: 'list', displayName: 'Model' }])
    expect(() => parseRemoteModels({ models: 'wrong' })).toThrow('models array')
  })

  it('retries one 401 after refresh, filters visible models, and writes a last-good cache', async () => {
    const cachePath = await tempPath('catalog.json')
    let key = 'old-access'
    const getAuth = vi.fn(() => Promise.resolve({ auth: { apiKey: key }, source: 'OAuth' }))
    const models = { getAuth } as unknown as Models
    const provider = new DynamicCodexProvider(openaiCodexProvider())
    const requests: RequestInit[] = []
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      requests.push(init ?? {})
      if (requests.length === 1) return Promise.resolve(new Response('', { status: 401 }))
      return Promise.resolve(new Response(JSON.stringify(catalogBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    }) as typeof fetch
    const catalog = new CodexCatalog(models, provider, cachePath, '9.8.7', fetchImpl)
    const credential = (): Promise<Credential> => Promise.resolve({
      type: 'oauth', access: key, refresh: 'refresh', expires: Date.now() + 60_000, accountId: 'acct-1',
    })
    const refresh = vi.fn(() => { key = 'new-access'; return Promise.resolve() })
    catalog.bindCredentials(credential, refresh)

    await catalog.refresh(true)

    expect(refresh).toHaveBeenCalledOnce()
    expect(provider.getModels().map(model => model.id)).toEqual(['gpt-visible-one', 'gpt-visible-two'])
    expect(provider.getModels()[1]).toMatchObject({
      name: 'GPT Visible Two', contextWindow: 222, input: ['text', 'image'],
      thinkingLevelMap: { high: 'high' },
    })
    expect(catalog.description('gpt-visible-two')).toBe('second')
    const firstHeaders = new Headers(requests[0]?.headers)
    const secondHeaders = new Headers(requests[1]?.headers)
    expect(firstHeaders.get('authorization')).toBe('Bearer old-access')
    expect(secondHeaders.get('authorization')).toBe('Bearer new-access')
    expect(secondHeaders.get('chatgpt-account-id')).toBe('acct-1')
    expect(secondHeaders.get('version')).toBe('9.8.7')
    const cached = JSON.parse(await readFile(cachePath, 'utf8')) as unknown
    expect(cached).toMatchObject({ version: 1, clientVersion: '9.8.7' })
    if (process.platform !== 'win32') expect((await stat(cachePath)).mode & 0o077).toBe(0)
  })

  it('loads a valid cache and retains it when remote discovery fails', async () => {
    const cachePath = await tempPath('catalog.json')
    const seedProvider = new DynamicCodexProvider(openaiCodexProvider())
    const seedModels = { getAuth: () => Promise.resolve(undefined) } as unknown as Models
    const neverFetch: typeof fetch = () => Promise.reject(new Error('unexpected fetch'))
    const seed = new CodexCatalog(seedModels, seedProvider, cachePath, '1', neverFetch)
    const remote = catalogBody()
    const authenticated = { getAuth: () => Promise.resolve({ auth: { apiKey: 'access' } }) } as unknown as Models
    const writer = new CodexCatalog(authenticated, seedProvider, cachePath, '1', vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(remote), { status: 200 }))))
    writer.bindCredentials(
      () => Promise.resolve({ type: 'oauth', access: 'access', refresh: 'refresh', expires: 1, accountId: 'acct' }),
      () => Promise.resolve(),
    )
    await writer.refresh(true)

    const provider = new DynamicCodexProvider(openaiCodexProvider())
    const reports: string[] = []
    const catalog = new CodexCatalog(
      authenticated, provider, cachePath, '1',
      vi.fn(() => Promise.reject(new Error('offline'))),
      (message) => { reports.push(message) },
    )
    catalog.bindCredentials(
      () => Promise.resolve({ type: 'oauth', access: 'access', refresh: 'refresh', expires: 1, accountId: 'acct' }),
      () => Promise.resolve(),
    )

    await catalog.refresh(true)

    expect(provider.getModels().map(model => model.id)).toEqual(['gpt-visible-one', 'gpt-visible-two'])
    expect(reports).toEqual(['OpenAI Codex kept its last-good model catalog after refresh failed'])
    await seed.refresh()
  })
})
