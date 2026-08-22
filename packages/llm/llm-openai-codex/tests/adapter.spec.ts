import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FileCredentialStore,
  installOpenAICodexRc8AuthenticationBridge,
  OpenAICodexAdapter,
  resolveSpec,
} from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-adapter-'))
  roots.push(root)
  return root
}

describe('OpenAICodexAdapter', () => {
  it('resolves owned defaults and rejects an empty compatibility version', async () => {
    const dshHome = await home()
    expect(resolveSpec({ dshHome })).toEqual({
      credentialsPath: join(dshHome, 'oauth', 'openai-codex.json'),
      modelCachePath: join(dshHome, 'model-catalogs', 'openai-codex.json'),
      clientVersion: '0.146.0',
      streamIdleTimeoutMs: 300_000,
      maxRequestImageBytes: 20 * 1024 * 1024,
    })
    expect(() => resolveSpec({ dshHome, clientVersion: ' ' })).toThrow('must not be empty')
    expect(() => resolveSpec({ dshHome, streamIdleTimeoutMs: 0 })).toThrow('streamIdleTimeoutMs')
    expect(() => resolveSpec({ dshHome, maxRequestImageBytes: 1.5 })).toThrow('maxRequestImageBytes')
  })

  it('reports persisted OAuth state and enriches its dynamic model list', async () => {
    const spec = resolveSpec({ dshHome: await home() })
    const credentials = new FileCredentialStore(spec.credentialsPath)
    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', access: 'access', refresh: 'refresh', expires: Date.now() + 60_000, accountId: 'acct',
    }))
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ models: [{
      slug: 'gpt-account', display_name: 'GPT Account', description: 'Account-visible model',
      visibility: 'list', priority: 1, context_window: 123_456, input_modalities: ['text'],
    }] }), { status: 200 })))
    const adapter = new OpenAICodexAdapter(spec, fetchImpl)

    expect(await adapter.authentication('openai-codex')).toEqual({
      configured: true,
      source: 'OAuth',
      methods: [{ id: 'oauth', name: 'Sign in with ChatGPT' }],
    })
    expect(await adapter.listModels('openai-codex')).toEqual([{
      provider: 'openai-codex', id: 'gpt-account', name: 'GPT Account',
      inputModalities: ['text'], description: 'Account-visible model',
    }])
    expect(await adapter.resolveModel('openai-codex', 'gpt-account')).toMatchObject({
      provider: 'openai-codex', id: 'gpt-account', context: { contextWindow: 123_456 },
    })
    expect(fetchImpl).toHaveBeenCalled()
    await adapter.logout('openai-codex')
    expect(await adapter.authentication('openai-codex')).toMatchObject({ configured: false })
  })

  it('bridges authentication on official rc8 without overriding a newer Host', async () => {
    const adapter = new OpenAICodexAdapter(resolveSpec({ dshHome: await home() }))
    const legacyHost: {
      authentication?: (provider: string) => Promise<unknown>
      login?: (provider: string, method: string, interaction: never) => Promise<void>
    } = {}
    const dispose = installOpenAICodexRc8AuthenticationBridge(legacyHost, adapter)

    await expect(legacyHost.authentication?.('openai-codex')).resolves.toMatchObject({
      configured: false,
      methods: [{ id: 'oauth', name: 'Sign in with ChatGPT' }],
    })
    await expect(legacyHost.authentication?.('deepseek-official')).resolves.toEqual({ configured: true, methods: [] })
    await expect(legacyHost.login?.('deepseek-official', 'oauth', undefined as never)).rejects.toMatchObject({
      code: 'AUTH_UNSUPPORTED',
    })
    dispose?.()
    expect(legacyHost).toEqual({})

    const authentication = vi.fn(() => Promise.resolve({ configured: true, methods: [] }))
    const login = vi.fn(() => Promise.resolve())
    const newerHost = { authentication, login }
    expect(installOpenAICodexRc8AuthenticationBridge(newerHost, adapter)).toBeUndefined()
    expect(newerHost).toEqual({ authentication, login })
  })
})
