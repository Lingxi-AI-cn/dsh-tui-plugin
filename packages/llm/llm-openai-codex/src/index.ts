/**
 * OpenAI Codex ChatGPT-OAuth adapter with persistent credentials and account model discovery.
 * @module @lingxi-ai-cn/dsh-llm-openai-codex
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createModels, type AuthEvent, type AuthInteraction, type AuthPrompt, type Models } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { join, resolve } from 'node:path'
import { CodexCatalog, DynamicCodexProvider, OPENAI_CODEX_PROVIDER } from './catalog.ts'
import { FileCredentialStore } from './credential-store.ts'

export const name = 'llm-openai-codex'
export const inject = ['llm']

/** Default idle interval while one Codex stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default request-level bound on base64-encoded image history. */
export const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024

/** OpenAI Codex OAuth storage and catalog configuration. */
export interface Config {
  /** Harness home used by default storage paths. */
  dshHome?: string
  /** Owner-only OAuth credential JSON path. */
  credentialsPath?: string
  /** Last-good account model catalog path. */
  modelCachePath?: string
  /** Codex catalog protocol client version. */
  clientVersion?: string
  /** Maximum idle interval while one provider stream read is outstanding. */
  streamIdleTimeoutMs?: number
  /** Maximum base64-encoded image payload retained in one request. */
  maxRequestImageBytes?: number
}

export const Config: z<Config> = z.object({
  dshHome: z.string(),
  credentialsPath: z.string(),
  modelCachePath: z.string(),
  clientVersion: z.string().default('0.146.0'),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  maxRequestImageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_REQUEST_IMAGE_BYTES),
})

interface ResolvedSpec {
  credentialsPath: string
  modelCachePath: string
  clientVersion: string
  streamIdleTimeoutMs: number
  maxRequestImageBytes: number
}

type OpenAICodexAuthenticationPrompt = {
  signal?: AbortSignal
} & ({
  type: 'text' | 'secret' | 'manual-code'
  message: string
  placeholder?: string
} | {
  type: 'select'
  message: string
  options: readonly { id: string; label: string; description?: string }[]
})

type OpenAICodexAuthenticationEvent =
  | { type: 'info' | 'progress'; message: string }
  | { type: 'auth-url'; url: string; instructions?: string }
  | {
    type: 'device-code'
    userCode: string
    verificationUri: string
    intervalSeconds?: number
    expiresInSeconds?: number
  }

interface OpenAICodexAuthenticationInteraction {
  signal?: AbortSignal
  prompt(prompt: OpenAICodexAuthenticationPrompt): Promise<string>
  notify(event: OpenAICodexAuthenticationEvent): void
}

interface OpenAICodexAuthenticationInfo {
  configured: boolean
  source?: string
  methods: readonly { id: string; name: string }[]
  canLogout?: boolean
}

interface OpenAICodexRc8AuthenticationHost {
  authentication?: (provider: string) => Promise<OpenAICodexAuthenticationInfo>
  login?: (provider: string, method: string, interaction: OpenAICodexAuthenticationInteraction) => Promise<void>
  logout?: (provider: string) => Promise<void>
}

/**
 * Resolve default paths and reject an empty compatibility version.
 * @param config - raw plugin configuration.
 * @returns absolute storage paths and the catalog compatibility version.
 */
export function resolveSpec(config: Config): ResolvedSpec {
  const home = resolveDshHome(config.dshHome)
  const clientVersion = config.clientVersion ?? '0.146.0'
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  const maxRequestImageBytes = config.maxRequestImageBytes ?? DEFAULT_MAX_REQUEST_IMAGE_BYTES
  if (clientVersion.trim().length === 0) throw new TypeError('llm-openai-codex clientVersion must not be empty')
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new TypeError(`llm-openai-codex streamIdleTimeoutMs must be positive and no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  if (!Number.isSafeInteger(maxRequestImageBytes) || maxRequestImageBytes <= 0) {
    throw new TypeError('llm-openai-codex maxRequestImageBytes must be a positive safe integer')
  }
  return {
    credentialsPath: resolve(config.credentialsPath ?? join(home, 'oauth', 'openai-codex.json')),
    modelCachePath: resolve(config.modelCachePath ?? join(home, 'model-catalogs', 'openai-codex.json')),
    clientVersion,
    streamIdleTimeoutMs,
    maxRequestImageBytes,
  }
}

function authPrompt(prompt: AuthPrompt): OpenAICodexAuthenticationPrompt {
  if (prompt.type === 'select') return { type: 'select', message: prompt.message, options: prompt.options, ...prompt.signal === undefined ? {} : { signal: prompt.signal } }
  const type = prompt.type === 'manual_code' ? 'manual-code' : prompt.type
  return {
    type,
    message: prompt.message,
    ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
    ...prompt.signal === undefined ? {} : { signal: prompt.signal },
  }
}

function authEvent(event: AuthEvent): OpenAICodexAuthenticationEvent {
  if (event.type === 'auth_url') return { type: 'auth-url', url: event.url, ...event.instructions === undefined ? {} : { instructions: event.instructions } }
  if (event.type === 'device_code') {
    return {
      type: 'device-code', userCode: event.userCode, verificationUri: event.verificationUri,
      ...event.intervalSeconds === undefined ? {} : { intervalSeconds: event.intervalSeconds },
      ...event.expiresInSeconds === undefined ? {} : { expiresInSeconds: event.expiresInSeconds },
    }
  }
  return { type: event.type, message: event.message }
}

function piInteraction(interaction: OpenAICodexAuthenticationInteraction): AuthInteraction {
  return {
    ...interaction.signal === undefined ? {} : { signal: interaction.signal },
    prompt: prompt => interaction.prompt(authPrompt(prompt)),
    notify: (event) => { interaction.notify(authEvent(event)) },
  }
}

/** OpenAI Codex adapter over pi-ai's stream and OAuth implementations. */
export class OpenAICodexAdapter extends PiAiAdapter {
  private readonly collection: Models
  private readonly catalog: CodexCatalog

  /**
   * @param spec - validated storage, catalog, timeout, and request-image limits.
   * @param fetchImpl - account catalog transport.
   * @param reportError - non-fatal catalog warning sink.
   * @param resolveAttachments - request-time durable attachment lookup from the active Host.
   */
  constructor(
    spec: ResolvedSpec,
    fetchImpl: typeof fetch = fetch,
    reportError?: (message: string, error?: unknown) => void,
    resolveAttachments?: () => AttachmentStore | undefined,
  ) {
    const credentials = new FileCredentialStore(spec.credentialsPath)
    const provider = new DynamicCodexProvider(openaiCodexProvider())
    const collection = createModels({ credentials })
    collection.setProvider(provider)
    const profile: ResolvedPiAiProviderProfile = Object.freeze({
      provider: OPENAI_CODEX_PROVIDER,
      displayName: OPENAI_CODEX_PROVIDER,
      streamIdleTimeoutMs: spec.streamIdleTimeoutMs,
      maxRequestImageBytes: spec.maxRequestImageBytes,
      retryPolicy: resolveRetryPolicy(undefined, 'llm-openai-codex.retryPolicy'),
      configuredMaxTokens: new Map(),
      piProvider: provider,
    })
    const profiles = new Map([[OPENAI_CODEX_PROVIDER, profile]])
    const catalog = new CodexCatalog(collection, provider, spec.modelCachePath, spec.clientVersion, fetchImpl, reportError)
    catalog.bindCredentials(
      () => credentials.read(OPENAI_CODEX_PROVIDER),
      async (signal) => {
        await credentials.modify(OPENAI_CODEX_PROVIDER, async (current) => {
          if (current?.type !== 'oauth') throw new LlmError('OpenAI Codex is not signed in', 'AUTH_REQUIRED')
          const oauth = provider.auth.oauth
          if (oauth === undefined) throw new LlmError('OpenAI Codex OAuth implementation is unavailable', 'AUTH_UNSUPPORTED')
          return oauth.refresh(current, signal)
        })
      },
    )
    super({
      profiles: () => profiles,
      resolveApiKey: async () => (await collection.getAuth(OPENAI_CODEX_PROVIDER))?.auth.apiKey,
      ...resolveAttachments === undefined ? {} : { resolveAttachments },
    })
    this.collection = collection
    this.catalog = catalog
  }

  async authentication(provider: string): Promise<OpenAICodexAuthenticationInfo> {
    if (provider !== OPENAI_CODEX_PROVIDER) return { configured: true, methods: [] }
    const check = await this.collection.checkAuth(provider)
    return {
      configured: check !== undefined,
      ...check?.source === undefined ? {} : { source: check.source },
      methods: [{ id: 'oauth', name: 'Sign in with ChatGPT' }],
      canLogout: true,
    }
  }

  async login(provider: string, method: string, interaction: OpenAICodexAuthenticationInteraction): Promise<void> {
    if (provider !== OPENAI_CODEX_PROVIDER || method !== 'oauth') {
      throw new LlmError(`provider "${provider}" offers no authentication method "${method}"`, 'AUTH_UNSUPPORTED')
    }
    await this.collection.login(provider, 'oauth', piInteraction(interaction))
    await this.catalog.refresh(true, interaction.signal)
  }

  async logout(provider: string): Promise<void> {
    if (provider !== OPENAI_CODEX_PROVIDER) {
      throw new LlmError(`provider "${provider}" offers no persisted authentication`, 'AUTH_UNSUPPORTED')
    }
    await this.collection.logout(provider)
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (provider !== OPENAI_CODEX_PROVIDER) return super.listModels(provider)
    if (await this.collection.checkAuth(provider) === undefined) return []
    await this.catalog.refresh(false)
    const models = await super.listModels(provider)
    return models.map((model) => {
      const description = this.catalog.description(model.id)
      return { ...model, ...description === undefined ? {} : { description } }
    })
  }

  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    if (provider !== OPENAI_CODEX_PROVIDER) return super.resolveModel(provider, model, signal)
    try {
      return await super.resolveModel(provider, model, signal)
    } catch (error: unknown) {
      if (!(error instanceof LlmError) || error.code !== 'UNKNOWN_MODEL') throw error
      await this.catalog.refresh(true, signal)
      return super.resolveModel(provider, model, signal)
    }
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.provider === OPENAI_CODEX_PROVIDER) await this.catalog.refresh(false, options.signal)
    yield* super.stream(options)
  }
}

/**
 * Add the optional authentication seam missing from official DSH rc.8.
 *
 * Newer Hosts already route these calls through their adapter registry and are
 * left untouched. The rc.8 fallback owns only the Codex route; other registered
 * providers retain the TUI's legacy "configured, no login action" behavior.
 * The returned disposer removes only methods still owned by this bridge.
 *
 * @param runtime - active Host LLM service instance.
 * @param adapter - this package's registered Codex adapter.
 * @returns a disposer when the rc.8 bridge was installed, otherwise undefined.
 */
export function installOpenAICodexRc8AuthenticationBridge(
  runtime: object,
  adapter: Pick<OpenAICodexAdapter, 'authentication' | 'login' | 'logout'>,
): (() => void) | undefined {
  const host = runtime as OpenAICodexRc8AuthenticationHost
  if (typeof host.authentication === 'function' || typeof host.login === 'function'
    || typeof host.logout === 'function') return undefined

  const authentication = (provider: string): Promise<OpenAICodexAuthenticationInfo> => provider === OPENAI_CODEX_PROVIDER
    ? adapter.authentication(provider)
    : Promise.resolve({ configured: true, methods: [] })
  const login = (
    provider: string,
    method: string,
    interaction: OpenAICodexAuthenticationInteraction,
  ): Promise<void> => {
    if (provider !== OPENAI_CODEX_PROVIDER) {
      return Promise.reject(new LlmError(
        `provider "${provider}" offers no interactive authentication`,
        'AUTH_UNSUPPORTED',
      ))
    }
    return adapter.login(provider, method, interaction)
  }
  const logout = (provider: string): Promise<void> => {
    if (provider !== OPENAI_CODEX_PROVIDER) {
      return Promise.reject(new LlmError(
        `provider "${provider}" offers no persisted authentication`,
        'AUTH_UNSUPPORTED',
      ))
    }
    return adapter.logout(provider)
  }
  Object.defineProperties(host, {
    authentication: { configurable: true, value: authentication },
    login: { configurable: true, value: login },
    logout: { configurable: true, value: logout },
  })
  return () => {
    if (Object.getOwnPropertyDescriptor(host, 'authentication')?.value === authentication) delete host.authentication
    if (Object.getOwnPropertyDescriptor(host, 'login')?.value === login) delete host.login
    if (Object.getOwnPropertyDescriptor(host, 'logout')?.value === logout) delete host.logout
  }
}

/** Register the authenticated OpenAI Codex provider route. */
export function apply(ctx: Context, config: Config): void {
  const adapter = new OpenAICodexAdapter(resolveSpec(config), fetch, (message, error) => {
    ctx.logger.warn(message)
    if (error !== undefined) ctx.logger.warn(error)
  }, () => ctx.get('attachments'))
  ctx.llm.registerAdapter([OPENAI_CODEX_PROVIDER], adapter)
  const disposeBridge = installOpenAICodexRc8AuthenticationBridge(ctx.llm, adapter)
  if (disposeBridge !== undefined) ctx.effect(() => disposeBridge, 'llm-openai-codex: rc8 authentication bridge')
}

export { FileCredentialStore, OPENAI_CODEX_PROVIDER }
export type { RemoteCodexModel } from './catalog.ts'
