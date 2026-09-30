import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DynamicCodexProvider } from '../src/catalog.ts'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  FileCredentialStore,
  installOpenAICodexRc8AuthenticationBridge,
  OpenAICodexAdapter,
  resolveSpec,
} from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
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
      type: 'oauth', access: 'access', refresh: 'refresh', expires: Date.now() + 60 * 60_000, accountId: 'acct',
    }))
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ models: [{
      slug: 'gpt-account', display_name: 'GPT Account', description: 'Account-visible model',
      visibility: 'list', priority: 1, context_window: 123_456, input_modalities: ['text'],
    }] }), { status: 200 })))
    const adapter = new OpenAICodexAdapter(spec, fetchImpl)

    expect(await adapter.authentication('lingxi-openai-codex')).toEqual({
      configured: true,
      source: 'OAuth',
      methods: [{ id: 'oauth', name: 'Sign in with ChatGPT' }],
      canLogout: true,
    })
    expect(await adapter.listModels('lingxi-openai-codex')).toEqual([{
      provider: 'lingxi-openai-codex', id: 'gpt-account', name: 'GPT Account',
      inputModalities: ['text'], description: 'Account-visible model',
    }])
    expect(await adapter.resolveModel('lingxi-openai-codex', 'gpt-account')).toMatchObject({
      provider: 'lingxi-openai-codex', id: 'gpt-account', context: { contextWindow: 123_456 },
    })
    expect(fetchImpl).toHaveBeenCalled()
    await adapter.logout('lingxi-openai-codex')
    expect(await adapter.authentication('lingxi-openai-codex')).toMatchObject({ configured: false })
  })

  it('resolves durable image attachments at request time', async () => {
    const spec = resolveSpec({ dshHome: await home() })
    const credentials = new FileCredentialStore(spec.credentialsPath)
    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', access: 'access', refresh: 'refresh', expires: Date.now() + 60 * 60_000, accountId: 'acct',
    }))
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ models: [{
      slug: 'gpt-image', display_name: 'GPT Image', visibility: 'list', priority: 1,
      context_window: 123_456, input_modalities: ['text', 'image'],
    }] }), { status: 200 })))
    const resolverError = new Error('attachment resolver reached')
    const resolveAttachments = vi.fn(() => { throw resolverError })
    const adapter = new OpenAICodexAdapter(spec, fetchImpl, undefined, resolveAttachments)
    const drain = async (): Promise<void> => {
      for await (const _chunk of adapter.stream({
        provider: 'lingxi-openai-codex',
        model: 'gpt-image',
        messages: [createUserMessage({
          content: [{
            type: 'image',
            attachment: {
              attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
              mediaType: 'image/png',
              bytes: 1,
              width: 1,
              height: 1,
            },
          }],
          source: { kind: 'test' },
        })],
      })) { /* drain */ }
    }

    await expect(drain()).rejects.toBe(resolverError)
    expect(resolveAttachments).toHaveBeenCalledOnce()
  })

  it('maps direct and prepared streams to pi-ai without accepting the official route', async () => {
    const spec = resolveSpec({ dshHome: await home() })
    const credentials = new FileCredentialStore(spec.credentialsPath)
    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', access: 'access', refresh: 'refresh', expires: Date.now() + 3600_000, accountId: 'acct',
    }))
    const adapter = new OpenAICodexAdapter(spec, async () => new Response(JSON.stringify({ models: [{
      slug: 'gpt-account', visibility: 'list',
    }] })))
    const reached = new Error('mock provider transport')
    const transport = vi.spyOn(DynamicCodexProvider.prototype, 'streamSimple').mockImplementation(() => { throw reached })
    const options = { provider: 'lingxi-openai-codex', model: 'gpt-account', messages: [] }
    const drain = async (stream: AsyncIterable<unknown>) => { for await (const _chunk of stream) { /* drain */ } }
    await drain(adapter.stream(options))
    const prepared = await adapter.prepareCall(options.provider, options.model)
    expect(prepared.model.provider).toBe('lingxi-openai-codex')
    await drain(prepared.stream(options))
    expect(transport).toHaveBeenCalledTimes(2)
    for (const [model] of transport.mock.calls) expect(model).toMatchObject({ provider: 'openai-codex', id: 'gpt-account' })
    await expect(adapter.listModels('openai-codex')).rejects.toMatchObject({ code: 'NO_ADAPTER' })
    await expect(adapter.prepareCall('openai-codex', 'gpt-account')).rejects.toMatchObject({ code: 'NO_ADAPTER' })
    await expect(adapter.logout('openai-codex')).rejects.toMatchObject({ code: 'AUTH_UNSUPPORTED' })
    expect(await credentials.read('openai-codex')).toBeDefined()
  })

  it('bridges authentication on official rc8 without overriding a newer Host', async () => {
    const adapter = new OpenAICodexAdapter(resolveSpec({ dshHome: await home() }))
    const legacyHost: {
      authentication?: (provider: string) => Promise<unknown>
      login?: (provider: string, method: string, interaction: never) => Promise<void>
      logout?: (provider: string) => Promise<void>
    } = {}
    const dispose = installOpenAICodexRc8AuthenticationBridge(legacyHost, adapter)

    await expect(legacyHost.authentication?.('lingxi-openai-codex')).resolves.toMatchObject({
      configured: false,
      methods: [{ id: 'oauth', name: 'Sign in with ChatGPT' }],
      canLogout: true,
    })
    await expect(legacyHost.authentication?.('deepseek-official')).resolves.toEqual({ configured: true, methods: [] })
    await expect(legacyHost.login?.('deepseek-official', 'oauth', undefined as never)).rejects.toMatchObject({
      code: 'AUTH_UNSUPPORTED',
    })
    await expect(legacyHost.logout?.('deepseek-official')).rejects.toMatchObject({ code: 'AUTH_UNSUPPORTED' })
    dispose?.()
    expect(legacyHost).toEqual({})

    const authentication = vi.fn(() => Promise.resolve({ configured: true, methods: [] }))
    const login = vi.fn(() => Promise.resolve())
    const logout = vi.fn(() => Promise.resolve())
    const newerHost = { authentication, login, logout }
    expect(installOpenAICodexRc8AuthenticationBridge(newerHost, adapter)).toBeUndefined()
    expect(newerHost).toEqual({ authentication, login, logout })
  })
})
