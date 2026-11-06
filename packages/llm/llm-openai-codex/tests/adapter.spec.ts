import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DynamicCodexProvider } from '../src/catalog.ts'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId, AttachmentStore, ImageVariantId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageAttachmentLimits, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import {
  Config,
  FileCredentialStore,
  installOpenAICodexRc8AuthenticationBridge,
  OpenAICodexAdapter,
  resolveSpec,
} from '../src/index.ts'

class RequestImageStore extends AttachmentStore {
  readonly imageLimits: ImageAttachmentLimits = {
    maxImageBytes: 1, maxImagesPerMessage: 1, maxMessageImageBytes: 1,
    maxImagePixels: 1, maxImageDimension: 1, mediaTypes: ['image/png'],
  }

  validateImage(): Promise<void> { return Promise.reject(new Error('not used')) }
  saveImage(): Promise<ImageAttachmentRef> { return Promise.reject(new Error('not used')) }
  readImage(ref: ImageAttachmentRef) { return Promise.resolve({ ref, data: Uint8Array.of(1) }) }
  override readImageRequest(ref: ImageAttachmentRef): Promise<RequestImageAttachment> {
    return Promise.resolve({
      variantId: ImageVariantId(`sha256:${'b'.repeat(64)}`), attachment: ref,
      data: Uint8Array.of(1), mediaType: ref.mediaType, bytes: 1,
      width: ref.width, height: ref.height, depth: 'uchar', space: 'srgb', hasAlpha: true,
    })
  }
}

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
      maxRequestImages: 50,
      imageOffloadCountQuantum: 10,
    })
    expect(() => resolveSpec({ dshHome, clientVersion: ' ' })).toThrow('must not be empty')
    expect(() => resolveSpec({ dshHome, streamIdleTimeoutMs: 0 })).toThrow('streamIdleTimeoutMs')
    expect(() => resolveSpec({ dshHome, maxRequestImageBytes: 1.5 })).toThrow('maxRequestImageBytes')
  })

  it('resolves schema defaults and clamps only an omitted image offload quantum', async () => {
    const dshHome = await home()
    expect(resolveSpec(Config({ dshHome }))).toMatchObject({ maxRequestImages: 50, imageOffloadCountQuantum: 10 })
    expect(resolveSpec(Config({ dshHome, maxRequestImages: 4 }))).toMatchObject({
      maxRequestImages: 4, imageOffloadCountQuantum: 4,
    })
    expect(resolveSpec(Config({ dshHome, maxRequestImages: 60, imageOffloadCountQuantum: 3 })))
      .toMatchObject({ maxRequestImages: 60, imageOffloadCountQuantum: 3 })
    for (const value of [0, -1, 1.5]) {
      expect(() => Config({ dshHome, maxRequestImages: value })).toThrow()
      expect(() => Config({ dshHome, imageOffloadCountQuantum: value })).toThrow()
    }
    expect(() => resolveSpec(Config({ dshHome, maxRequestImages: 4, imageOffloadCountQuantum: 5 })))
      .toThrow('no greater than maxRequestImages')
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid image count limits (%s) before constructing an adapter', async (value) => {
      const dshHome = await home()
      expect(() => resolveSpec({ dshHome, maxRequestImages: value })).toThrow('maxRequestImages')
      expect(() => resolveSpec({ dshHome, imageOffloadCountQuantum: value })).toThrow('imageOffloadCountQuantum')
    },
  )

  it.each([
    { config: {}, count: 51, offload: 10 },
    { config: { maxRequestImages: 3, imageOffloadCountQuantum: 2 }, count: 4, offload: 2 },
    { config: { maxRequestImages: 3 }, count: 3, offload: 0 },
    { config: { maxRequestImages: 60 }, count: 51, offload: 0 },
  ])('forwards image count configuration $config to direct and prepared calls', async ({ config, count, offload }) => {
    const spec = resolveSpec({ dshHome: await home(), ...config })
    const credentials = new FileCredentialStore(spec.credentialsPath)
    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', access: 'access', refresh: 'refresh', expires: Date.now() + 3600_000, accountId: 'acct',
    }))
    const ctx = new Context()
    const attachments = new RequestImageStore(ctx)
    const adapter = new OpenAICodexAdapter(spec, async () => new Response(JSON.stringify({ models: [{
      slug: 'gpt-image', visibility: 'list', input_modalities: ['text', 'image'],
    }] })), undefined, () => attachments)
    const transport = vi.spyOn(DynamicCodexProvider.prototype, 'streamSimple')
      .mockImplementation(() => { throw new Error('mock provider transport') })
    const options = {
      provider: 'lingxi-openai-codex', model: 'gpt-image',
      messages: Array.from({ length: count }, () => createUserMessage({
        content: [{ type: 'image', attachment: {
          attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
          mediaType: 'image/png', bytes: 1, width: 1, height: 1,
        } }],
        source: { kind: 'test' },
      })),
    }
    const drain = async (stream: AsyncIterable<unknown>) => { for await (const _chunk of stream) { /* drain */ } }
    try {
      const prepared = await adapter.prepareCall(options.provider, options.model)
      expect(prepared.model.provider).toBe('lingxi-openai-codex')
      for (const stream of [adapter.stream(options), prepared.stream(options)]) {
        if (offload > 0) {
          await expect(drain(stream)).rejects.toMatchObject({ code: 'IMAGE_OFFLOAD_REQUIRED', failure: { offloadImages: offload } })
        } else {
          await drain(stream)
        }
      }
      expect(transport).toHaveBeenCalledTimes(offload > 0 ? 0 : 2)
    } finally {
      await adapter.dispose()
      await ctx.fiber.dispose()
    }
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
      supported_reasoning_levels: [{ effort: 'high' }],
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
      reasoning: { efforts: [{ id: 'high', name: 'High' }] },
      systemPromptUpdate: 'in-history', toolUpdate: 'addition-only',
    })
    const drain = async (): Promise<void> => {
      for await (const _chunk of adapter.stream({
        provider: 'lingxi-openai-codex', model: 'gpt-account', messages: [], reasoningEffort: ReasoningEffortId('low'),
      })) { /* drain */ }
    }
    await expect(drain()).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(fetchImpl).toHaveBeenCalled()
    await adapter.logout('lingxi-openai-codex')
    expect(await adapter.authentication('lingxi-openai-codex')).toMatchObject({ configured: false })
  })

  it('maps image targets through the enhanced route and retains official conversation capabilities', async () => {
    const adapter = new OpenAICodexAdapter(resolveSpec({ dshHome: await home() }))
    const image = {
      attachmentId: AttachmentId(`sha256:${'b'.repeat(64)}`),
      mediaType: 'image/png' as const, bytes: 2 * 1024 * 1024, width: 4096, height: 4096,
    }
    expect(adapter.imageRequestTarget('lingxi-openai-codex', 'gpt-5.6-terra', image)).toEqual({
      width: 2048, height: 2048, maxBytes: 1024 * 1024,
    })
    expect(() => adapter.imageRequestTarget('openai-codex', 'gpt-5.6-terra', image))
      .toThrow('Codex adapter does not own provider')
    expect(() => adapter.imageRequestTarget('lingxi-openai-codex', 'missing', image))
      .toThrow('has no configured model')
    expect(await adapter.resolveModel('lingxi-openai-codex', 'gpt-5.6-terra')).toMatchObject({
      provider: 'lingxi-openai-codex', systemPromptUpdate: 'in-history', toolUpdate: 'addition-only',
    })
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
