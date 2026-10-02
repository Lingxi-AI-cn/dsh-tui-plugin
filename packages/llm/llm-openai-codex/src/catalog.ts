/** Dynamic ChatGPT-account Codex catalog with a last-good local cache. */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  Api, ApiStreamOptions, TranscriptContext as PiContext, Credential, Model, Models, Provider,
  SimpleStreamOptions, ThinkingLevelMap,
} from '@earendil-works/pi-ai'
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** Stable pi-ai identity and legacy credential id; not the public Harness route. */
export const OPENAI_CODEX_PROVIDER = 'openai-codex'
const MODELS_URL = 'https://chatgpt.com/backend-api/codex/models'
const MAX_CATALOG_BYTES = 2 * 1024 * 1024
const THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/** Validated provider response metadata retained in the derivative catalog cache. */
export interface RemoteCodexModel {
  slug: string
  displayName?: string
  description?: string
  visibility: string
  priority?: number
  contextWindow?: number
  inputModalities?: Array<'text' | 'image'>
  reasoning?: Array<{ effort: string; description?: string }>
  defaultReasoning?: string
}

interface CacheDocument {
  version: 1
  clientVersion: string
  fetchedAt: string
  models: RemoteCodexModel[]
}

type Fetch = typeof fetch
type ReportError = (message: string, error?: unknown) => void

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * Parse and normalize one untrusted Codex catalog response or cache document model array.
 * @param value - decoded JSON response or cache document.
 * @returns deduplicated valid model rows in source order.
 */
export function parseRemoteModels(value: unknown): RemoteCodexModel[] {
  const root = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  const rawModels = root?.models
  if (!Array.isArray(rawModels)) throw new TypeError('Codex model catalog must contain a models array')
  const seen = new Set<string>()
  const models: RemoteCodexModel[] = []
  for (const raw of rawModels) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const model = raw as Record<string, unknown>
    const slug = optionalString(model.slug)
    const visibility = optionalString(model.visibility)
    if (slug === undefined || visibility === undefined || seen.has(slug)) continue
    seen.add(slug)
    const rawModalities = model.input_modalities ?? model.inputModalities
    const modalities = Array.isArray(rawModalities)
      ? rawModalities.filter((item): item is 'text' | 'image' => item === 'text' || item === 'image')
      : undefined
    const rawReasoning = model.supported_reasoning_levels ?? model.reasoning
    const reasoning = Array.isArray(rawReasoning)
      ? rawReasoning.flatMap((item) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
        const effort = optionalString((item as Record<string, unknown>).effort)
        if (effort === undefined) return []
        const description = optionalString((item as Record<string, unknown>).description)
        return [{ effort, ...description === undefined ? {} : { description } }]
      })
      : undefined
    const displayName = optionalString(model.display_name ?? model.displayName)
    const description = optionalString(model.description)
    const priority = optionalPositiveInteger(model.priority)
    const contextWindow = optionalPositiveInteger(model.context_window ?? model.contextWindow)
    const defaultReasoning = optionalString(model.default_reasoning_level ?? model.defaultReasoning)
    models.push({
      slug,
      visibility,
      ...displayName === undefined ? {} : { displayName },
      ...description === undefined ? {} : { description },
      ...priority === undefined ? {} : { priority },
      ...contextWindow === undefined ? {} : { contextWindow },
      ...modalities === undefined || modalities.length === 0 ? {} : { inputModalities: modalities },
      ...reasoning === undefined || reasoning.length === 0 ? {} : { reasoning },
      ...defaultReasoning === undefined ? {} : { defaultReasoning },
    })
  }
  return models
}

function selectedModels(models: readonly RemoteCodexModel[]): RemoteCodexModel[] {
  return models.filter(model => model.visibility === 'list').sort((left, right) =>
    (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER)
      || left.slug.localeCompare(right.slug))
}

function piModel(
  remote: RemoteCodexModel,
  fallback: ReadonlyMap<string, Model<Api>>,
  template: Model<Api>,
): Model<Api> {
  const known = fallback.get(remote.slug)
  const thinkingLevelMap: ThinkingLevelMap = {}
  for (const level of remote.reasoning ?? []) {
    if (THINKING_LEVELS.has(level.effort)) thinkingLevelMap[level.effort as keyof ThinkingLevelMap] = level.effort
  }
  const base = known ?? template
  return {
    ...base,
    id: remote.slug,
    name: remote.displayName ?? known?.name ?? remote.slug,
    provider: OPENAI_CODEX_PROVIDER,
    contextWindow: remote.contextWindow ?? base.contextWindow,
    input: remote.inputModalities ?? [...base.input],
    reasoning: (remote.reasoning?.length ?? 0) > 0 || base.reasoning,
    ...Object.keys(thinkingLevelMap).length === 0 ? {} : { thinkingLevelMap },
  }
}

async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  for (;;) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > MAX_CATALOG_BYTES) {
      await reader.cancel('Codex model catalog exceeded size limit')
      throw new LlmError('Codex model catalog exceeded 2 MiB', 'DISCOVERY_FAILED')
    }
    text += decoder.decode(part.value, { stream: true })
  }
  return text + decoder.decode()
}

/** Mutable provider wrapper whose model list advances only after a validated refresh. */
export class DynamicCodexProvider implements Provider {
  readonly baseUrl: string
  private current: readonly Model<Api>[]

  constructor(private readonly base: Provider) {
    if (base.baseUrl === undefined) throw new TypeError('OpenAI Codex provider is missing its base URL')
    this.baseUrl = base.baseUrl
    this.current = [...base.getModels()]
  }

  get id(): string { return this.base.id }
  get name(): string { return this.base.name }
  get auth(): Provider['auth'] {
    return {
      ...this.base.auth,
      apiKey: {
        name: 'OpenAI Codex OAuth access token',
        resolve: ({ credential }) => Promise.resolve(credential?.key === undefined ? undefined : {
          auth: { apiKey: credential.key },
          source: 'OpenAI Codex OAuth',
        }),
      },
    }
  }
  getModels(): readonly Model<Api>[] { return this.current }
  /**
   * Replace the visible snapshot after its complete source response passes validation.
   * @param models - complete validated model snapshot in selector order.
   */
  replaceModels(models: readonly Model<Api>[]): void { this.current = Object.freeze([...models]) }
  filterModels(models: readonly Model<Api>[], credential: Credential | undefined): readonly Model<Api>[] {
    return this.base.filterModels?.(models, credential) ?? models
  }
  stream<T extends Api>(model: Model<T>, context: PiContext, options?: ApiStreamOptions<T>) {
    return this.base.stream(model, context, options)
  }
  streamSimple(model: Model<Api>, context: PiContext, options?: SimpleStreamOptions) {
    return this.base.streamSimple(model, context, options)
  }
}

/** Loads, refreshes, validates, and caches one OpenAI Codex account catalog. */
export class CodexCatalog {
  private loaded = false
  private metadata = new Map<string, RemoteCodexModel>()

  constructor(
    private readonly models: Models,
    private readonly provider: DynamicCodexProvider,
    private readonly cachePath: string,
    private readonly clientVersion: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly reportError: ReportError = () => undefined,
  ) {}

  /**
   * Return the last validated selector description for one model id.
   * @param model - exact provider model id.
   * @returns account-catalog description, when advertised.
   */
  description(model: string): string | undefined {
    return this.metadata.get(model)?.description
  }

  private apply(remote: readonly RemoteCodexModel[]): void {
    const selected = selectedModels(remote)
    if (selected.length === 0) return
    const baseline = new Map(this.provider.getModels().map(model => [model.id, model]))
    const template = baseline.get('gpt-5.6-terra') ?? baseline.values().next().value
    if (template === undefined) throw new LlmError('OpenAI Codex provider has no baseline model template', 'INVALID_CATALOG')
    this.metadata = new Map(selected.map(model => [model.slug, model]))
    this.provider.replaceModels(selected.map(model => piModel(model, baseline, template)))
  }

  private async loadCache(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const text = await readFile(this.cachePath, 'utf8')
      const parsed = JSON.parse(text) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
        || (parsed as { version?: unknown }).version !== 1) return
      this.apply(parseRemoteModels(parsed))
    } catch (error: unknown) {
      if (!isENOENT(error)) this.reportError('OpenAI Codex ignored an invalid cached model catalog', error)
    }
  }

  private async save(remote: RemoteCodexModel[]): Promise<void> {
    const document: CacheDocument = {
      version: 1,
      clientVersion: this.clientVersion,
      fetchedAt: new Date().toISOString(),
      models: remote,
    }
    await mkdir(dirname(this.cachePath), { recursive: true, mode: 0o700 })
    await withFileLock(this.cachePath, () => writeFileAtomic(
      this.cachePath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 },
    ))
  }

  private async request(access: string, accountId: string, signal?: AbortSignal): Promise<Response> {
    const url = new URL(MODELS_URL)
    url.searchParams.set('client_version', this.clientVersion)
    return this.fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${access}`,
        'chatgpt-account-id': accountId,
        version: this.clientVersion,
        originator: 'pi',
        'OpenAI-Beta': 'responses=experimental',
        ...attributionHeaders(),
      },
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Refresh from the authenticated endpoint; any failure retains the last-good cache or baseline.
   * @param force - query even when a cached catalog has already loaded.
   * @param signal - caller cancellation for credential refresh and network I/O.
   */
  async refresh(force = false, signal?: AbortSignal): Promise<void> {
    await this.loadCache()
    if (!force && this.metadata.size > 0) return
    let raw = await this.models.getAuth(OPENAI_CODEX_PROVIDER)
    if (raw === undefined) return
    const persisted = await this.credentialReader()
    if (persisted?.type !== 'oauth' || typeof persisted.accountId !== 'string'
      || raw.auth.apiKey === undefined || raw.auth.apiKey.length === 0) return
    let response: Response
    try {
      response = await this.request(raw.auth.apiKey, persisted.accountId, signal)
      if (response.status === 401) {
        await this.forceRefresh(signal)
        raw = await this.models.getAuth(OPENAI_CODEX_PROVIDER)
        const refreshed = await this.credentialReader()
        if (raw?.auth.apiKey !== undefined && refreshed?.type === 'oauth' && typeof refreshed.accountId === 'string') {
          response = await this.request(raw.auth.apiKey, refreshed.accountId, signal)
        }
      }
      if (!response.ok) {
        this.reportError(`OpenAI Codex model discovery returned HTTP ${response.status}`)
        return
      }
      const remote = parseRemoteModels(JSON.parse(await readBounded(response)))
      if (selectedModels(remote).length === 0) return
      this.apply(remote)
      await this.save(remote)
    } catch (error: unknown) {
      if (signal?.aborted) throw new LlmError('Codex model discovery aborted by caller', 'ABORTED', { cause: error })
      this.reportError('OpenAI Codex kept its last-good model catalog after refresh failed', error)
    }
  }

  private credentialReader: () => Promise<Credential | undefined> = () => Promise.resolve(undefined)
  private forceRefresh: (signal?: AbortSignal) => Promise<void> = () => Promise.resolve()

  /**
   * Install credential callbacks without exposing the store on the Models collection.
   * @param read - read the persisted account id without resolving request auth.
   * @param refresh - force-refresh the stored OAuth credential after a 401.
   */
  bindCredentials(
    read: () => Promise<Credential | undefined>,
    refresh: (signal?: AbortSignal) => Promise<void>,
  ): void {
    this.credentialReader = read
    this.forceRefresh = refresh
  }
}
