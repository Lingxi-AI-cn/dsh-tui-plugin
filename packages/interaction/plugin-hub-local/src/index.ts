/** Local HTTPS Registry and trusted profile lifecycle provider. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { PROFILE_TEMPLATES, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@lingxi-ai-cn/dsh-plugin-hub'
import type {
  InstalledPluginSnapshot, PluginAdvisorySummary, PluginChangePlan, PluginChangePlanId, PluginCurationSummary, PluginDetail,
  PluginCatalogSort, PluginCategory, PluginDiscoveryMetadataSource, PluginDiscoveryRepository, PluginDiscoveryRepositoryPage,
  PluginDiscoverySearchRequest, PluginHubProvider, PluginHubStatus, PluginId,
  PluginMaintenanceHandoff, PluginPackageKind,
  PluginSearchPage, PluginSearchRequest, PluginSummary, PluginTransactionId,
  PluginVersionId, StagedPluginTransaction,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import {
  PLUGIN_HUB_API_VERSION, PluginHubError, PluginId as makePluginId,
  PluginVersionId as makeVersionId,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import { LocalPluginInstallLifecycle, type LocalPluginHubTrustedKey } from './install.ts'
import {
  LocalPluginMaintenanceController,
  type LocalPluginMaintenanceOptions,
} from './maintenance.ts'
import { verifyCanonicalSignature } from './signature.ts'
import type { PluginVersionSummary } from '@lingxi-ai-cn/dsh-plugin-hub'
import { LocalPluginTransactionController } from './transactions.ts'

export { recoverPluginHubProfile, runMaintenanceHandoff } from './maintenance.ts'

export const name = 'plugin-hub-local'
export const inject = ['pluginHub']

const MAX_QUERY_LENGTH = 160
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_ARTIFACT_BYTES = 100 * 1024 * 1024
const DEFAULT_PLAN_TTL_MS = 5 * 60_000
const MAX_REDIRECTS = 3
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))
const DSH_VERSION = readPackageVersion()

function readPackageVersion(): string {
  const version = (JSON.parse(readFileSync(INSTALL_ANCHOR, 'utf8')) as { version?: unknown }).version
  if (typeof version !== 'string') throw new Error('plugin-hub-local package version is missing')
  return version
}

/** One deployment-owned Ed25519 snapshot trust root. */
export interface PluginHubTrustedKey extends LocalPluginHubTrustedKey {
  /** Key validity begins at this RFC 3339 timestamp. */
  readonly notBefore?: string
  /** Key validity ends at this RFC 3339 timestamp. */
  readonly notAfter?: string
}

/** Deployment configuration for one local provider. */
export interface Config {
  /** Registry base URL. Omit to leave this optional provider unmounted. */
  readonly registryUrl?: string
  /** Fixed profile label reserved for later mutation stages. */
  readonly profile?: 'tui'
  /** Enable the downstream-only in-process profile maintenance lifecycle. */
  readonly profileMutations?: boolean
  /** Permit HTTP only for explicit loopback fixture servers. */
  readonly allowLoopbackHttp?: boolean
  /** Request wall-clock timeout. */
  readonly requestTimeoutMs?: number
  /** Maximum bytes retained from one JSON response. */
  readonly maxResponseBytes?: number
  /** Maximum accepted compressed artifact bytes. */
  readonly maxArtifactBytes?: number
  /** Detached install-plan lifetime. */
  readonly planTtlMs?: number
  /** Initial trust roots for signed snapshot verification. */
  readonly trustedKeys?: readonly PluginHubTrustedKey[]
  /** Test-only fixture catalog; when present no network is used. */
  readonly fixture?: FixtureCatalog
  /** Test-only explicit profile directory. */
  readonly profileDir?: string
  /** Test-only explicit Plugin Hub data directory. */
  readonly dataDir?: string
  /** Test-only no-shell pnpm executable and prefix argv. */
  readonly pnpmCommand?: readonly string[]
  /** Test-only clock. */
  readonly now?: () => number
  /** Test-only maintenance helper command. */
  readonly maintenanceCommand?: readonly string[]
  /** Test-only trusted relaunch descriptor. */
  readonly relaunch?: LocalPluginMaintenanceOptions['relaunch']
  /** Test-only maintenance relaunch environment. */
  readonly maintenanceEnvironment?: NodeJS.ProcessEnv
}

export const Config = z.object({
  registryUrl: z.string(),
  profile: z.union(['tui'] as const).default('tui'),
  profileMutations: z.boolean().default(false),
  allowLoopbackHttp: z.boolean().default(false),
  requestTimeoutMs: z.number().step(1).min(100).default(DEFAULT_TIMEOUT_MS),
  maxResponseBytes: z.number().step(1).min(1024).default(DEFAULT_MAX_RESPONSE_BYTES),
  maxArtifactBytes: z.number().step(1).min(1024).default(DEFAULT_MAX_ARTIFACT_BYTES),
  planTtlMs: z.number().step(1).min(1000).default(DEFAULT_PLAN_TTL_MS),
  trustedKeys: z.array(z.object({
    keyId: z.string(), publicKey: z.string(), notBefore: z.string(), notAfter: z.string(),
  })).max(32),
}) as unknown as z<Config>

/** In-memory fixture source used by REAL composition tests and local development. */
export interface FixtureCatalog {
  /** Catalog revision reported by fixture responses. */
  readonly revision?: number
  /** RFC 3339 catalog generation timestamp. */
  readonly generatedAt?: string
  /** Search rows exposed by the fixture provider. */
  readonly items: readonly PluginSummary[]
  /** Optional discovered repository rows shown by the separate discovery view. */
  readonly repositories?: readonly PluginDiscoveryRepository[]
  /** Optional full detail records keyed by opaque plugin id. */
  readonly details?: Readonly<Record<string, PluginDetail>>
}

/**
 * Create a deterministic fixture provider without opening a network connection.
 * @param catalog - immutable fixture catalog.
 * @returns provider implementing the Plugin Hub read-only contract.
 */
export function createFixturePluginHubProvider(catalog: FixtureCatalog): PluginHubProvider {
  const items = Object.freeze(catalog.items.map(freezeSummary))
  const details = new Map(Object.entries(catalog.details ?? {})
    .map(([id, detail]) => [id, freezeDetail(detail)] as const))
  return {
    id: 'fixture',
    profileMutations: false,
    status(): Promise<PluginHubStatus> {
      return Promise.resolve({ apiVersion: PLUGIN_HUB_API_VERSION, catalogRevision: catalog.revision ?? 1,
        generatedAt: catalog.generatedAt, stale: false, source: 'fixture' })
    },
    search(request: PluginSearchRequest): Promise<PluginSearchPage> {
      return Promise.resolve().then(() => {
        const normalized = normalizeRequest(request)
        return filterSearchPage({ apiVersion: PLUGIN_HUB_API_VERSION, catalogRevision: catalog.revision ?? 1, items }, normalized)
      })
    },
    searchRepositories(request: PluginDiscoverySearchRequest): Promise<PluginDiscoveryRepositoryPage> {
      const limit = Math.max(1, Math.min(50, request.limit ?? 20))
      const items = catalog.repositories ?? []
      return Promise.resolve({ apiVersion: PLUGIN_HUB_API_VERSION, catalogRevision: catalog.revision ?? 1,
        items: Object.freeze(items.slice(0, limit)), ...(items.length > limit ? { nextCursor: 'fixture:repositories:next' } : {}) })
    },
    plugin(pluginId: PluginId): Promise<PluginDetail> {
      const detail = details.get(pluginId) ?? items.find(item => item.id === pluginId)
      if (detail === undefined) {
        return Promise.reject(new PluginHubError(`Plugin ${pluginId} was not found.`, 'PLUGIN_NOT_FOUND'))
      }
      return Promise.resolve(freezeDetail(isPluginDetail(detail)
        ? detail
        : { ...detail, versions: detail.latestVersion === undefined ? [] : [detail.latestVersion] }))
    },
    ...unsupportedLifecycle(),
  }
}

/**
 * Register the configured local provider, or deliberately do nothing when deployment config is absent.
 * @param ctx - context carrying the Plugin Hub service.
 * @param config - deployment or fixture configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const provider = config.fixture === undefined
    ? config.registryUrl === undefined ? undefined : new LocalRegistryProvider(
      config,
      (progress) => { ctx.pluginHub.publishProgress(progress) },
    )
    : createFixturePluginHubProvider(config.fixture)
  if (provider !== undefined) ctx.pluginHub.registerProvider(provider)
}

class LocalRegistryProvider implements PluginHubProvider {
  readonly id = 'registry'
  readonly profileMutations: boolean
  private readonly baseUrl: URL
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly trustedKeys: ReadonlyMap<string, string>
  private readonly lifecycle: LocalPluginInstallLifecycle
  private readonly transactions: LocalPluginTransactionController
  private readonly maintenance: LocalPluginMaintenanceController
  private readonly cache = new Map<string, { readonly etag?: string; readonly value: unknown }>()
  private readonly lastPages = new Map<string, PluginSearchPage>()
  private lastPage: PluginSearchPage | undefined
  private readonly details = new Map<string, PluginDetail>()

  constructor(
    private readonly config: Config,
    publishProgress: NonNullable<LocalPluginInstallLifecycle['options']['publishProgress']>,
  ) {
    if (config.registryUrl === undefined) throw new PluginHubError('Registry URL is not configured.', 'REGISTRY_UNAVAILABLE')
    this.baseUrl = validateRegistryUrl(config.registryUrl, config.allowLoopbackHttp === true)
    this.profileMutations = config.profileMutations === true
    this.timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    this.trustedKeys = new Map((config.trustedKeys ?? []).map(key => [key.keyId, key.publicKey]))
    const home = resolveDshHome()
    this.lifecycle = new LocalPluginInstallLifecycle({
      profileDir: config.profileDir ?? resolveProfileDir(config.profile ?? 'tui', home),
      dataDir: config.dataDir ?? join(home, 'plugin-hub'),
      installAnchor: INSTALL_ANCHOR,
      initialBundles: PROFILE_TEMPLATES.tui ?? ['@deepseek-ai/dsh-base', '@lingxi-ai-cn/dsh-tui'],
      dshVersion: DSH_VERSION,
      trustedKeys: config.trustedKeys ?? [],
      maxArtifactBytes: config.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
      requestTimeoutMs: this.timeoutMs,
      planTtlMs: config.planTtlMs ?? DEFAULT_PLAN_TTL_MS,
      ...config.allowLoopbackHttp === true ? { fixtureArtifactOrigin: this.baseUrl.origin } : {},
      ...config.pnpmCommand === undefined ? {} : { pnpmCommand: config.pnpmCommand },
      ...config.now === undefined ? {} : { now: config.now },
      requestDescriptor: (path, signal) => this.request(path, undefined, signal, false),
      publishProgress,
    })
    this.transactions = new LocalPluginTransactionController(this.lifecycle)
    this.maintenance = new LocalPluginMaintenanceController(this.lifecycle, {
      ...config.maintenanceCommand === undefined ? {} : { maintenanceCommand: config.maintenanceCommand },
      ...config.relaunch === undefined ? {} : { relaunch: config.relaunch },
      ...config.maintenanceEnvironment === undefined ? {} : { environment: config.maintenanceEnvironment },
    })
  }

  async status(signal?: AbortSignal): Promise<PluginHubStatus> {
    try {
      const value = await this.request('/v1/meta', undefined, signal)
      const meta = parseMeta(value)
      return { apiVersion: PLUGIN_HUB_API_VERSION, ...(meta.catalogRevision === undefined ? {} : { catalogRevision: meta.catalogRevision }),
        ...meta.generatedAt === undefined ? {} : { generatedAt: meta.generatedAt }, stale: false, source: 'registry' }
    } catch (error: unknown) {
      if (isAbort(error)) throw error
      if (!isUnavailable(error) || this.lastPage === undefined) throw error
      return { apiVersion: PLUGIN_HUB_API_VERSION, catalogRevision: this.lastPage.catalogRevision,
        generatedAt: undefined, stale: true, source: 'cache' }
    }
  }

  async search(request: PluginSearchRequest, signal?: AbortSignal): Promise<PluginSearchPage> {
    const normalized = normalizeRequest(request)
    try {
      const query = new URLSearchParams()
      if (normalized.query !== undefined) query.set('q', normalized.query)
      if (normalized.surface !== undefined) query.set('surface', normalized.surface)
      if (normalized.dshVersion !== undefined) query.set('dshVersion', normalized.dshVersion)
      if (normalized.verification !== undefined) query.set('verification', normalized.verification)
      if (normalized.installable !== undefined) query.set('installable', String(normalized.installable))
      if (normalized.category !== undefined) query.set('category', normalized.category)
      if (normalized.kind !== undefined) query.set('kind', normalized.kind)
      if (normalized.language !== undefined) query.set('language', normalized.language)
      if (normalized.sort !== undefined) query.set('sort', normalized.sort)
      if (normalized.cursor !== undefined) query.set('cursor', normalized.cursor)
      query.set('limit', String(normalized.limit))
      const value = await this.request('/v1/plugins', query, signal)
      const page = parseSearchPage(value)
      this.lastPage = page
      this.lastPages.set(searchCacheKey(normalized), page)
      return page
    } catch (error: unknown) {
      if (isAbort(error)) throw error
      if (!isUnavailable(error)) throw error
      const fallback = this.lastPages.get(searchCacheKey(normalized))
      if (fallback === undefined) {
        try {
          const snapshot = await this.request('/v1/catalog/snapshot', undefined, signal)
          verifySnapshot(snapshot, this.trustedKeys)
          const page = filterSearchPage(parseSnapshotPage(snapshot), normalized)
          this.lastPage = page
          this.lastPages.set(searchCacheKey(normalized), page)
          return { ...page, stale: true }
        } catch (snapshotError: unknown) {
          if (isAbort(snapshotError)) throw snapshotError
          if (snapshotError instanceof PluginHubError
            && (snapshotError.code === 'SIGNATURE_INVALID' || snapshotError.code === 'CONTRACT_UNSUPPORTED')) {
            throw snapshotError
          }
          throw error
        }
      }
      return { ...fallback, stale: true }
    }
  }

  async searchRepositories(request: PluginDiscoverySearchRequest, signal?: AbortSignal): Promise<PluginDiscoveryRepositoryPage> {
    const query = new URLSearchParams()
    if (request.query !== undefined) query.set('q', boundedQuery(request.query))
    if (request.state !== undefined) query.set('state', request.state)
    if (request.scanStatus !== undefined) query.set('scanStatus', request.scanStatus)
    if (request.sort !== undefined) query.set('sort', request.sort)
    if (request.cursor !== undefined) query.set('cursor', request.cursor)
    query.set('limit', String(boundedLimit(request.limit)))
    const value = await this.request('/v1/discovery/repositories', query, signal)
    return parseDiscoveryPage(value)
  }

  async plugin(pluginId: PluginId, signal?: AbortSignal): Promise<PluginDetail> {
    const cached = this.details.get(pluginId)
    try {
      const value = await this.request(`/v1/plugins/${encodeURIComponent(pluginId)}`, undefined, signal)
      const detail = parseDetail(value)
      this.details.set(pluginId, detail)
      return detail
    } catch (error: unknown) {
      if (isAbort(error) || !isUnavailable(error) || cached === undefined) throw error
      return cached
    }
  }

  installed(signal?: AbortSignal): Promise<InstalledPluginSnapshot> {
    return this.lifecycle.installed(signal)
  }

  planInstall(
    pluginId: PluginId,
    versionId: PluginVersionId,
    signal?: AbortSignal,
  ): Promise<PluginChangePlan> {
    if (!this.profileMutations) return Promise.reject(lifecycleUnavailable())
    return this.lifecycle.planInstall(pluginId, versionId, signal)
  }

  planRemove(packageName: string, signal?: AbortSignal): Promise<PluginChangePlan> {
    if (!this.profileMutations) return Promise.reject(lifecycleUnavailable())
    return this.lifecycle.planRemove(packageName, signal)
  }

  stage(planId: PluginChangePlanId, signal?: AbortSignal): Promise<StagedPluginTransaction> {
    if (!this.profileMutations) return Promise.reject(lifecycleUnavailable())
    return this.transactions.stage(planId, signal)
  }

  discard(transactionId: PluginTransactionId, signal?: AbortSignal): Promise<void> {
    if (!this.profileMutations) return Promise.reject(lifecycleUnavailable())
    return this.transactions.discard(transactionId, signal)
  }

  createMaintenanceHandoff(
    transactionId: PluginTransactionId,
    signal?: AbortSignal,
  ): Promise<PluginMaintenanceHandoff> {
    if (!this.profileMutations) return Promise.reject(lifecycleUnavailable())
    return this.maintenance.createHandoff(transactionId, signal)
  }

  markMaintenanceReady(signal?: AbortSignal): Promise<void> {
    if (!this.profileMutations) return Promise.resolve()
    return this.maintenance.markReady(signal)
  }

  private async request(
    path: string,
    query: URLSearchParams | undefined,
    signal?: AbortSignal,
    useCache = true,
  ): Promise<unknown> {
    const url = new URL(path, this.baseUrl)
    if (query !== undefined) url.search = query.toString()
    const key = url.toString()
    const cached = useCache ? this.cache.get(key) : undefined
    let current = url
    const controller = new AbortController()
    const abortState = { caller: false }
    let timeoutError: Error | undefined
    const timer = setTimeout(() => {
      timeoutError = new Error('Plugin Hub request timed out')
      controller.abort(timeoutError)
    }, this.timeoutMs)
    const onAbort = (): void => {
      abortState.caller = true
      controller.abort(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      try {
        signal?.throwIfAborted()
      } catch (error: unknown) {
        abortState.caller = true
        throw error
      }
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        const init: RequestInit = { redirect: 'manual', signal: controller.signal }
        if (cached?.etag !== undefined) init.headers = { 'If-None-Match': cached.etag }
        const response = await fetch(current, init)
        if (response.status === 304 && cached !== undefined) return cached.value
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (location === null || redirect === MAX_REDIRECTS) throw new PluginHubError('Registry redirect limit exceeded.', 'REGISTRY_UNAVAILABLE')
          const redirected = validateRegistryUrl(new URL(location, current).toString(), this.config.allowLoopbackHttp === true)
          if (redirected.origin !== this.baseUrl.origin) throw new PluginHubError('Registry redirect host is not trusted.', 'REGISTRY_UNAVAILABLE')
          current = redirected
          continue
        }
        if (!response.ok) throw await registryResponseError(response, this.maxBytes)
        const value = parseJson(await readResponseBytes(response, this.maxBytes))
        assertApiVersion(value)
        const etag = response.headers.get('etag')
        if (useCache) this.cache.set(key, etag === null ? { value } : { etag, value })
        return value
      }
    } catch (error: unknown) {
      if (abortState.caller) {
        throw new PluginHubError('Plugin Hub request was aborted.', 'OPERATION_ABORTED', { cause: error })
      }
      if (timeoutError !== undefined) {
        throw new PluginHubError('Registry request timed out.', 'REGISTRY_UNAVAILABLE', { cause: error })
      }
      if (error instanceof PluginHubError) throw error
      throw new PluginHubError('Registry request failed.', 'REGISTRY_UNAVAILABLE', { cause: error })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    throw new PluginHubError('Registry redirect limit exceeded.', 'REGISTRY_UNAVAILABLE')
  }
}

async function registryResponseError(response: Response, maxBytes: number): Promise<PluginHubError> {
  let code: unknown
  let requestId: unknown
  try {
    const value = objectOrEmpty(parseJson(await readResponseBytes(response, maxBytes)))
    const error = objectOrEmpty(value.error)
    code = error.code
    requestId = error.requestId
  } catch {
    code = undefined
    requestId = undefined
  }
  const suffix = typeof requestId === 'string' ? ` Request ${boundedText(requestId, 128)}.` : ''
  if (code === 'VERSION_NOT_INSTALLABLE') {
    return new PluginHubError(`Plugin version is no longer installable.${suffix}`, 'VERSION_NOT_INSTALLABLE')
  }
  if (code === 'QUARANTINED') {
    return new PluginHubError(`Plugin is quarantined.${suffix}`, 'PLUGIN_QUARANTINED')
  }
  if (code === 'INVALID_CURSOR') {
    return new PluginHubError(`Plugin catalog cursor is invalid.${suffix}`, 'INVALID_CURSOR')
  }
  if (response.status === 404 || code === 'NOT_FOUND') {
    return new PluginHubError(`Plugin was not found.${suffix}`, 'PLUGIN_NOT_FOUND')
  }
  return new PluginHubError(`Registry request failed (${response.status}).${suffix}`, 'REGISTRY_UNAVAILABLE')
}

function lifecycleUnavailable(): PluginHubError {
  return new PluginHubError('Plugin Hub profile management is unavailable.', 'CONTRACT_UNSUPPORTED')
}

function unsupportedLifecycle(): Pick<PluginHubProvider,
  'installed' | 'planInstall' | 'planRemove' | 'stage' | 'discard'
  | 'createMaintenanceHandoff' | 'markMaintenanceReady'> {
  return {
    installed: () => Promise.reject(lifecycleUnavailable()),
    planInstall: () => Promise.reject(lifecycleUnavailable()),
    planRemove: () => Promise.reject(lifecycleUnavailable()),
    stage: () => Promise.reject(lifecycleUnavailable()),
    discard: () => Promise.reject(lifecycleUnavailable()),
    createMaintenanceHandoff: () => Promise.reject(lifecycleUnavailable()),
    markMaintenanceReady: () => Promise.resolve(),
  }
}

function validateRegistryUrl(raw: string, allowLoopbackHttp: boolean): URL {
  let url: URL
  try { url = new URL(raw) } catch (error) { throw new PluginHubError('Registry URL is invalid.', 'REGISTRY_UNAVAILABLE', { cause: error }) }
  if (url.protocol !== 'https:' && !(allowLoopbackHttp && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new PluginHubError('Registry URL must use HTTPS.', 'REGISTRY_UNAVAILABLE')
  }
  return url
}

function parseJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch (error) {
    throw new PluginHubError('Registry returned invalid JSON.', 'CONTRACT_UNSUPPORTED', { cause: error })
  }
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) throw new PluginHubError('Registry response is too large.', 'CONTRACT_UNSUPPORTED')
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new PluginHubError('Registry response is too large.', 'CONTRACT_UNSUPPORTED')
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}

function assertApiVersion(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || (value as { apiVersion?: unknown }).apiVersion !== PLUGIN_HUB_API_VERSION) {
    throw new PluginHubError('Registry API version is unsupported.', 'CONTRACT_UNSUPPORTED')
  }
}

function parseMeta(value: unknown): { catalogRevision?: number; generatedAt?: string } {
  assertApiVersion(value)
  const catalogRevision = numberOrUndefined(value.catalogRevision)
  const generatedAt = stringOrUndefined(value.generatedAt)
  return { ...catalogRevision === undefined ? {} : { catalogRevision }, ...generatedAt === undefined ? {} : { generatedAt } }
}

function parseSearchPage(value: unknown): PluginSearchPage {
  assertApiVersion(value)
  const data = requiredObject(value.data, 'data')
  if (!Array.isArray(data.items)) throw new PluginHubError('Registry data.items is invalid.', 'CONTRACT_UNSUPPORTED')
  const rawItems = data.items
  if (rawItems.length > 50) throw new PluginHubError('Registry data.items exceeds the requested page limit.', 'CONTRACT_UNSUPPORTED')
  const nextCursor = stringOrUndefined(data.nextCursor)
  return { apiVersion: PLUGIN_HUB_API_VERSION, catalogRevision: requiredRevision(value.catalogRevision),
    items: Object.freeze(rawItems.map(parseSummary)), ...(nextCursor === undefined ? {} : { nextCursor }) }
}

function parseDiscoveryPage(value: unknown): PluginDiscoveryRepositoryPage {
  assertApiVersion(value)
  const data = requiredObject(value.data, 'data')
  if (!Array.isArray(data.items) || data.items.length > 50) throw new PluginHubError('Registry discovery data.items is invalid.', 'CONTRACT_UNSUPPORTED')
  const nextCursor = stringOrUndefined(data.nextCursor)
  return { apiVersion: PLUGIN_HUB_API_VERSION, catalogRevision: requiredRevision(value.catalogRevision),
    items: Object.freeze(data.items.map(parseDiscoveryRepository)), ...(nextCursor === undefined ? {} : { nextCursor }) }
}

function parseDiscoveryRepository(value: unknown): PluginDiscoveryRepository {
  const raw = requiredObject(value, 'discovery repository')
  const repository = requiredObject(raw.repository, 'discovery repository.repository')
  const sync = requiredObject(raw.sync, 'discovery repository.sync')
  const scan = requiredObject(raw.scan, 'discovery repository.scan')
  const packages = requiredObject(raw.packages, 'discovery repository.packages')
  const published = requiredObject(raw.published, 'discovery repository.published')
  const catalogState = raw.catalogState
  const scanStatus = scan.status
  if (!isDiscoveryRepositoryState(catalogState) || !isDiscoveryScanStatus(scanStatus)) throw new PluginHubError('Registry discovery state is invalid.', 'CONTRACT_UNSUPPORTED')
  if (raw.installable !== false) throw new PluginHubError('Registry discovery repository is installable.', 'CONTRACT_UNSUPPORTED')
  return Object.freeze({
    id: boundedText(requiredString(raw.id, 'discovery repository.id'), 128),
    repository: Object.freeze({ provider: requiredString(repository.provider, 'discovery repository.provider'), providerId: stringOrUndefined(repository.providerId), fullName: boundedText(requiredString(repository.fullName, 'discovery repository.fullName'), 512), url: requiredString(repository.url, 'discovery repository.url'), primaryLanguage: optionalBoundedString(repository.primaryLanguage, 'discovery repository.primaryLanguage', 128) ?? null }),
    stars: requiredNonNegativeNumber(raw.stars, 'discovery repository.stars'), forks: requiredNonNegativeNumber(raw.forks, 'discovery repository.forks'), topics: requiredStringArrayLimit(raw.topics, 'discovery repository.topics', 64),
    catalogState, stateReason: optionalBoundedString(raw.stateReason, 'discovery repository.stateReason', 512) ?? null,
    observedAt: requiredString(raw.observedAt, 'discovery repository.observedAt'),
    installable: false,
    sync: Object.freeze({ headSha: optionalBoundedString(sync.headSha, 'discovery repository.sync.headSha', 64) ?? null, lastSeenAt: requiredString(sync.lastSeenAt, 'discovery repository.sync.lastSeenAt'), lastSyncedAt: optionalBoundedString(sync.lastSyncedAt, 'discovery repository.sync.lastSyncedAt', 64) ?? null }),
    scan: Object.freeze({ status: scanStatus, scannerVersion: optionalBoundedString(scan.scannerVersion, 'discovery repository.scan.scannerVersion', 128) ?? null, sourceCommit: optionalBoundedString(scan.sourceCommit, 'discovery repository.scan.sourceCommit', 64) ?? null, packageCount: requiredNonNegativeNumber(scan.packageCount, 'discovery repository.scan.packageCount'), updatedAt: optionalBoundedString(scan.updatedAt, 'discovery repository.scan.updatedAt', 64) ?? null, errorCode: optionalBoundedString(scan.errorCode, 'discovery repository.scan.errorCode', 64) ?? null, errorSummary: optionalBoundedString(scan.errorSummary, 'discovery repository.scan.errorSummary', 512) ?? null, rejectionCodes: requiredStringArrayLimit(scan.rejectionCodes, 'discovery repository.scan.rejectionCodes', 32) }),
    packages: Object.freeze({ total: requiredNonNegativeNumber(packages.total, 'discovery repository.packages.total'), active: requiredNonNegativeNumber(packages.active, 'discovery repository.packages.active'), rejected: requiredNonNegativeNumber(packages.rejected, 'discovery repository.packages.rejected') }),
    published: Object.freeze({ projectionCount: requiredNonNegativeNumber(published.projectionCount, 'discovery repository.published.projectionCount'), installableCount: requiredNonNegativeNumber(published.installableCount, 'discovery repository.published.installableCount'), revision: optionalNonNegativeNumber(published.revision) }),
  })
}

function parseSnapshotPage(value: unknown): PluginSearchPage {
  assertApiVersion(value)
  const raw = objectOrEmpty(value)
  if (!Array.isArray(raw.plugins)) throw new PluginHubError('Registry snapshot plugins are invalid.', 'CONTRACT_UNSUPPORTED')
  const rawItems = raw.plugins
  return { apiVersion: PLUGIN_HUB_API_VERSION, catalogRevision: requiredRevision(raw.catalogRevision),
    items: Object.freeze(rawItems.map(parseSummary)) }
}

function parseDetail(value: unknown): PluginDetail {
  assertApiVersion(value)
  const raw = objectOrEmpty(value.data)
  const summary = parseSummary({ ...raw, verification: raw.verification ?? parseDetailVerification(raw) })
  const versions = Array.isArray(raw.versions)
    ? raw.versions.map(parseVersion)
    : summary.latestVersion === undefined ? [] : [summary.latestVersion]
  const quarantine = raw.quarantine === undefined || raw.quarantine === null
    ? undefined
    : requiredObject(raw.quarantine, 'quarantine')
  if (quarantine !== undefined && typeof quarantine.active !== 'boolean') {
    throw new PluginHubError('Registry quarantine.active is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  const os = parseOs(raw.os)
  const curation = parseCuration(raw.curation)
  const advisories = parseAdvisories(raw.advisories)
  return Object.freeze({
    ...summary,
    packagePath: stringOrUndefined(raw.packagePath),
    readme: stringOrUndefined(raw.readme),
    versions: Object.freeze(versions),
    ...(os === undefined ? {} : { os }),
    ...(curation === undefined ? {} : { curation }),
    ...(advisories === undefined ? {} : { advisories }),
    quarantined: raw.quarantined === true || raw.state === 'quarantined' || quarantine?.active === true,
  })
}

function parseOs(value: unknown): PluginDetail['os'] {
  if (value === undefined || value === null) return undefined
  const raw = requiredObject(value, 'os')
  return Object.freeze({
    declared: requiredStringArray(raw.declared, 'os.declared'),
    verified: requiredStringArray(raw.verified, 'os.verified'),
  })
}

function parseCuration(value: unknown): PluginCurationSummary | undefined {
  if (value === undefined || value === null) return undefined
  const raw = requiredObject(value, 'curation')
  const notes = optionalBoundedString(raw.notes, 'curation.notes', 2048)
  return Object.freeze({
    policyRevision: boundedText(requiredString(raw.policyRevision, 'curation.policyRevision'), 128),
    curatedAt: boundedText(requiredString(raw.curatedAt, 'curation.curatedAt'), 64),
    ...(notes === undefined ? {} : { notes }),
  })
}

function parseAdvisories(value: unknown): readonly PluginAdvisorySummary[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length > 32) {
    throw new PluginHubError('Registry advisories are invalid.', 'CONTRACT_UNSUPPORTED')
  }
  return Object.freeze(value.map((entry, index) => {
    const raw = requiredObject(entry, `advisories[${index}]`)
    const severity = raw.severity
    if (severity !== 'low' && severity !== 'moderate' && severity !== 'high' && severity !== 'critical') {
      throw new PluginHubError('Registry advisory severity is invalid.', 'CONTRACT_UNSUPPORTED')
    }
    const recommendedAction = optionalBoundedString(
      raw.recommendedAction, `advisories[${index}].recommendedAction`, 2048,
    )
    return Object.freeze({
      id: boundedText(requiredString(raw.id, `advisories[${index}].id`), 128),
      severity,
      reason: boundedText(requiredString(raw.reason, `advisories[${index}].reason`), 4096),
      ...(recommendedAction === undefined ? {} : { recommendedAction }),
    })
  }))
}

function parseDetailVerification(raw: Record<string, unknown>): PluginSummary['verification'] {
  if (raw.curation !== undefined && raw.curation !== null) {
    if (typeof raw.curation !== 'object' || Array.isArray(raw.curation)) {
      throw new PluginHubError('Registry curation is invalid.', 'CONTRACT_UNSUPPORTED')
    }
    return { level: 'curated', status: 'passed' }
  }
  if (raw.validationMatrix === undefined) return { level: 'discovered', status: 'unknown' }
  if (!Array.isArray(raw.validationMatrix) || raw.validationMatrix.length > 32) {
    throw new PluginHubError('Registry validationMatrix is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  let best: PluginSummary['verification'] | undefined
  let bestRank = -1
  for (const value of raw.validationMatrix) {
    const row = requiredObject(value, 'validationMatrix entry')
    const level = detailVerificationLevel(row.level)
    const status = row.status
    if (status !== 'passed' && status !== 'failed' && status !== 'unknown') {
      throw new PluginHubError('Registry validationMatrix status is invalid.', 'CONTRACT_UNSUPPORTED')
    }
    const rank = verificationRank(level)
    if (rank > bestRank) {
      best = { level, status }
      bestRank = rank
    }
  }
  return best ?? { level: 'discovered', status: 'unknown' }
}

function detailVerificationLevel(value: unknown): PluginSummary['verification']['level'] {
  if (value === 'manifest') return 'manifest-valid'
  if (value === 'install') return 'install-verified'
  if (value === 'tui-boot') return 'tui-boot-verified'
  if (isVerificationLevel(value)) return value
  throw new PluginHubError('Registry validationMatrix level is invalid.', 'CONTRACT_UNSUPPORTED')
}

function verificationRank(level: PluginSummary['verification']['level']): number {
  return level === 'curated' ? 4 : level === 'tui-boot-verified' ? 3 : level === 'install-verified' ? 2 : level === 'manifest-valid' ? 1 : 0
}

function parseSummary(value: unknown): PluginSummary {
  const raw = requiredObject(value, 'plugin')
  const repository = requiredObject(raw.repository, 'repository')
  const surfaces = requiredObject(raw.surfaces, 'surfaces')
  const compatibility = requiredObject(raw.compatibility, 'compatibility')
  const verification = requiredObject(raw.verification, 'verification')
  if (compatibility.match !== 'compatible' && compatibility.match !== 'incompatible' && compatibility.match !== 'unknown') {
    throw new PluginHubError('Registry compatibility.match is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  if (!isVerificationLevel(verification.level)) {
    throw new PluginHubError('Registry verification.level is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  if (verification.status !== 'passed' && verification.status !== 'failed' && verification.status !== 'unknown') {
    throw new PluginHubError('Registry verification.status is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  const latest = raw.latestVersion === undefined || raw.latestVersion === null ? undefined : parseVersion(raw.latestVersion)
  const categories = parseCategories(raw.categories)
  const categorySource = parseMetadataSource(raw.categorySource, 'categorySource')
  const kind = parsePackageKind(raw.kind, 'kind')
  const kindSource = parseMetadataSource(raw.kindSource, 'kindSource')
  const primaryLanguage = optionalBoundedString(repository.primaryLanguage, 'repository.primaryLanguage', 128)
  return Object.freeze({ id: makePluginId(requiredString(raw.id, 'plugin id')), packageName: requiredString(raw.packageName, 'package name'),
    displayName: requiredString(raw.displayName, 'display name'), summary: boundedText(requiredText(raw.summary, 'summary'), 4096),
    repository: Object.freeze({ provider: requiredString(repository.provider, 'repository provider'), providerId: stringOrUndefined(repository.providerId),
      fullName: requiredString(repository.fullName, 'repository name'), url: requiredString(repository.url, 'repository URL'),
      ...(primaryLanguage === undefined ? {} : { primaryLanguage }),
      ...(optionalBoolean(repository.archived, 'repository.archived') === undefined ? {} : { archived: repository.archived as boolean }) }),
    ...(categories === undefined ? {} : { categories }),
    ...(categorySource === undefined ? {} : { categorySource }),
    ...(kind === undefined ? {} : { kind }),
    ...(kindSource === undefined ? {} : { kindSource }),
    surfaces: Object.freeze({ declared: requiredStringArray(surfaces.declared, 'surfaces.declared'),
      verified: requiredStringArray(surfaces.verified, 'surfaces.verified') }),
    compatibility: Object.freeze({ dsh: stringOrUndefined(compatibility.dsh), match: compatibility.match }),
    verification: Object.freeze({ level: verification.level, status: verification.status }),
    latestVersion: latest,
    license: stringOrUndefined(raw.license),
    stars: numberOrUndefined(raw.metrics && objectOrEmpty(raw.metrics).stars),
    updatedAt: stringOrUndefined(raw.updatedAt ?? (raw.metrics && objectOrEmpty(raw.metrics).updatedAt)),
  }) as PluginSummary
}

function parseVersion(value: unknown): PluginVersionSummary {
  const raw = requiredObject(value, 'version')
  if (typeof raw.installable !== 'boolean') {
    throw new PluginHubError('Registry version installable flag is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  return Object.freeze({
    id: makeVersionId(requiredString(raw.id, 'version id')),
    version: stringOrUndefined(raw.version),
    sourceCommit: stringOrUndefined(raw.sourceCommit),
    publishedAt: stringOrUndefined(raw.publishedAt),
    installable: raw.installable,
    reason: stringOrUndefined(raw.reason),
  })
}

function normalizeRequest(request: PluginSearchRequest): PluginSearchRequest & { readonly limit: number } {
  return {
    ...request,
    ...(request.query === undefined ? {} : { query: boundedQuery(request.query) }),
    ...(request.language === undefined ? {} : { language: request.language.trim().slice(0, 128) }),
    sort: normalizeSort(request.sort),
    limit: boundedLimit(request.limit),
  }
}
function searchCacheKey(request: PluginSearchRequest & { readonly limit: number }): string {
  return JSON.stringify({ query: request.query ?? '', surface: request.surface, dshVersion: request.dshVersion,
    verification: request.verification, installable: request.installable, category: request.category, kind: request.kind,
    language: request.language, sort: request.sort ?? 'relevance', cursor: request.cursor, limit: request.limit })
}
function filterSearchPage(page: PluginSearchPage, request: PluginSearchRequest & { readonly limit: number }): PluginSearchPage {
  const query = request.query?.toLocaleLowerCase() ?? ''
  const filtered = page.items.filter(item => (query === ''
    || `${item.packageName} ${item.displayName} ${item.summary}`.toLocaleLowerCase().includes(query))
    && (request.surface === undefined || item.surfaces.declared.includes(request.surface))
    && (request.verification === undefined || item.verification.level === request.verification)
    && (request.installable === undefined || item.latestVersion?.installable === request.installable)
    && (request.category === undefined || item.categories?.includes(request.category) === true)
    && (request.kind === undefined || item.kind === request.kind)
    && (request.language === undefined || item.repository.primaryLanguage?.toLocaleLowerCase() === request.language.toLocaleLowerCase()))
  const sort = normalizeSort(request.sort)
  const ordered = sortCatalogItems(filtered, sort)
  const start = parseFixtureCursor(request.cursor, sort)
  const items = ordered.slice(start, start + request.limit)
  return { ...page, items: Object.freeze(items),
    ...(start + items.length < ordered.length ? { nextCursor: fixtureCursor(sort, start + items.length) } : {}) }
}
function normalizeSort(value: PluginCatalogSort | undefined): PluginCatalogSort { return value ?? 'relevance' }
function fixtureCursor(sort: PluginCatalogSort, offset: number): string { return `fixture:${sort}:${offset}` }
function parseFixtureCursor(cursor: string | undefined, sort: PluginCatalogSort): number {
  if (cursor === undefined) return 0
  const prefix = `fixture:${sort}:`
  if (!cursor.startsWith(prefix)) throw new PluginHubError('Plugin catalog cursor is invalid.', 'INVALID_CURSOR')
  const offset = Number(cursor.slice(prefix.length))
  if (!Number.isSafeInteger(offset) || offset < 0) throw new PluginHubError('Plugin catalog cursor is invalid.', 'INVALID_CURSOR')
  return offset
}
function sortCatalogItems(items: readonly PluginSummary[], sort: PluginCatalogSort): readonly PluginSummary[] {
  if (sort === 'relevance') return items
  return [...items].sort((left, right) => {
    const difference = sortValue(right, sort) - sortValue(left, sort)
    return difference !== 0 ? difference : String(left.id).localeCompare(String(right.id))
  })
}
function sortValue(item: PluginSummary, sort: Exclude<PluginCatalogSort, 'relevance'>): number {
  if (sort === 'stars') return item.stars !== undefined && Number.isFinite(item.stars) ? item.stars : -1
  const value = sort === 'updated' ? item.updatedAt : item.latestVersion?.publishedAt ?? item.updatedAt
  const timestamp = value === undefined ? Number.NEGATIVE_INFINITY : Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}
function boundedQuery(value: string | undefined): string { return (value ?? '').trim().slice(0, MAX_QUERY_LENGTH) }
function boundedLimit(value: number | undefined): number {
  return Math.max(1, Math.min(50, Number.isSafeInteger(value) && value !== undefined ? value : 20))
}
function objectOrEmpty(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {} }
function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  }
  return value as Record<string, unknown>
}
function requiredString(value: unknown, field: string): string { if (typeof value !== 'string' || value.length === 0) throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED'); return value }
function requiredText(value: unknown, field: string): string { if (typeof value !== 'string') throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED'); return value }
function stringOrUndefined(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function numberOrUndefined(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function requiredNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  return value
}
function optionalNonNegativeNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null
  return requiredNonNegativeNumber(value, 'discovery repository.published.revision')
}
function requiredRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PluginHubError('Registry catalog revision is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  return value
}
function requiredStringArray(value: unknown, field: string): readonly string[] {
  return requiredStringArrayLimit(value, field, 16)
}
function requiredStringArrayLimit(value: unknown, field: string, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  }
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length > 128) {
      throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
    }
    items.push(item)
  }
  return Object.freeze(items)
}
function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  return value
}
function optionalBoundedString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  return boundedText(value, max)
}
function parseCategories(value: unknown): readonly PluginCategory[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length > 11) throw new PluginHubError('Registry categories are invalid.', 'CONTRACT_UNSUPPORTED')
  const categories: PluginCategory[] = []
  for (const category of value) {
    if (!isPluginCategory(category)) throw new PluginHubError('Registry category is invalid.', 'CONTRACT_UNSUPPORTED')
    if (!categories.includes(category)) categories.push(category)
  }
  return Object.freeze(categories)
}
function parseMetadataSource(value: unknown, field: string): PluginDiscoveryMetadataSource | undefined {
  if (value === undefined || value === null) return undefined
  if (!isMetadataSource(value)) throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  return value
}
function parsePackageKind(value: unknown, field: string): PluginPackageKind | undefined {
  if (value === undefined || value === null) return undefined
  if (!isPackageKind(value)) throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  return value
}
function boundedText(value: string, max: number): string { return value.slice(0, max) }
function isVerificationLevel(value: unknown): value is PluginSummary['verification']['level'] { return value === 'discovered' || value === 'manifest-valid' || value === 'install-verified' || value === 'tui-boot-verified' || value === 'curated' }
function isPluginCategory(value: unknown): value is PluginCategory {
  return value === 'communication' || value === 'vision' || value === 'browser' || value === 'interface' || value === 'agent'
    || value === 'development' || value === 'data' || value === 'automation' || value === 'integration' || value === 'theme' || value === 'other'
}
function isPackageKind(value: unknown): value is PluginPackageKind {
  return value === 'plugin' || value === 'bundle' || value === 'skill' || value === 'tool' || value === 'integration'
}
function isMetadataSource(value: unknown): value is PluginDiscoveryMetadataSource {
  return value === 'author' || value === 'curator' || value === 'automatic'
}
function isDiscoveryRepositoryState(value: unknown): value is PluginDiscoveryRepository['catalogState'] {
  return value === 'candidate' || value === 'active' || value === 'missing' || value === 'quarantined' || value === 'rejected'
}
function isDiscoveryScanStatus(value: unknown): value is PluginDiscoveryRepository['scan']['status'] {
  return value === 'never' || value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'superseded'
}
function freezeSummary(summary: PluginSummary): PluginSummary { return Object.freeze(summary) }
function freezeDetail(detail: PluginDetail): PluginDetail {
  return Object.freeze({ ...detail, versions: Object.freeze([...detail.versions]) })
}
function isAbort(error: unknown): boolean { return error instanceof PluginHubError && error.code === 'OPERATION_ABORTED' }
function isUnavailable(error: unknown): boolean { return error instanceof PluginHubError && error.code === 'REGISTRY_UNAVAILABLE' }
function isPluginDetail(value: PluginSummary | PluginDetail): value is PluginDetail { return 'versions' in value }

function verifySnapshot(value: unknown, trustedKeys: ReadonlyMap<string, string>): void {
  assertApiVersion(value)
  const keyId = requiredString(value.keyId, 'snapshot key id')
  const signature = requiredString(value.signature, 'snapshot signature')
  const publicKey = trustedKeys.get(keyId)
  if (publicKey === undefined) throw new PluginHubError('Catalog snapshot signing key is not trusted.', 'SIGNATURE_INVALID')
  const unsigned = { ...value }
  delete unsigned.signature
  verifyCanonicalSignature(unsigned, signature, publicKey, 'Catalog snapshot')
}
