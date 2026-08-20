/** Trusted descriptor, artifact cache, installed truth, and detached planning. */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  PluginChangePlanId,
  PluginHubError,
  PluginId,
  PluginVersionId,
  type InstalledPlugin,
  type InstalledPluginSnapshot,
  type PluginChangePlan,
  type PluginChangeTarget,
  type PluginHubProgress,
  type PluginVersionId as PluginVersionIdType,
  type PluginId as PluginIdType,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import {
  ProfilePluginError,
  createProfilePluginManager,
  resolveProfilePluginLockPath,
  type ProfilePluginArtifact,
  type ProfilePluginChangePlan,
  type ProfilePluginInstalledSnapshot,
  type ProfilePluginManager,
} from '@lingxi-ai-cn/dsh-profile-plugin-manager'
import { satisfies } from 'semver'
import { list as listTar } from 'tar'
import { verifyCanonicalSignature } from './signature.ts'
import { readCommittedPluginReceipts } from './receipts.ts'

const API_VERSION = 'dsh.plugin-hub/v1'
const MAX_CLOCK_SKEW_MS = 5 * 60_000
const MAX_PACKAGE_MANIFEST_BYTES = 256 * 1024
const ARTIFACT_REDIRECT_LIMIT = 3
const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const INSTALL_LIFECYCLE_SCRIPTS = new Set([
  'preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare',
])

/** Locally pinned signing key and optional activation interval. */
export interface LocalPluginHubTrustedKey {
  /** Stable trust-root identifier that must equal the signed descriptor key id. */
  readonly keyId: string
  /** PEM-encoded Ed25519 public key used for canonical descriptor verification. */
  readonly publicKey: string
  /** Optional ISO 8601 instant before which this trust root is inactive. */
  readonly notBefore?: string
  /** Optional ISO 8601 instant after which this trust root is inactive. */
  readonly notAfter?: string
}

/** Private verified descriptor retained with a detached public plan. */
interface VerifiedInstallDescriptor {
  readonly pluginId: PluginIdType
  readonly versionId: PluginVersionIdType
  readonly packageName: string
  readonly packagePath: string
  readonly version: string
  readonly sourceCommit: string
  readonly dshRange: string
  readonly validationLevel: string
  readonly artifact: {
    readonly url: string
    readonly digest: Buffer
    readonly digestBase64: string
    readonly sizeBytes: number
  }
  readonly lifecycleScripts: readonly string[]
  readonly expiresAt: string
}

/** Provider-private plan state required to stage an exact cached artifact. */
export interface LocalPluginPrivatePlan {
  readonly publicPlan: PluginChangePlan
  readonly managerPlan: ProfilePluginChangePlan
  readonly artifact?: ProfilePluginArtifact
  readonly descriptor?: VerifiedInstallDescriptor
}

/** Dependencies and deployment policy for one trusted local lifecycle. */
export interface LocalPluginInstallOptions {
  readonly profileDir: string
  readonly dataDir: string
  readonly installAnchor: string
  readonly initialBundles: readonly string[]
  readonly dshVersion: string
  readonly trustedKeys: readonly LocalPluginHubTrustedKey[]
  readonly maxArtifactBytes: number
  readonly requestTimeoutMs: number
  readonly planTtlMs: number
  /** Additional loopback artifact origin used only by fixture providers. */
  readonly fixtureArtifactOrigin?: string
  readonly pnpmCommand?: readonly string[]
  readonly now?: () => number
  readonly requestDescriptor: (path: string, signal?: AbortSignal) => Promise<unknown>
  readonly publishProgress?: (progress: PluginHubProgress) => void
}

/** Trusted local installation planner backed by the shared profile manager. */
export class LocalPluginInstallLifecycle {
  /** Shared-lock manager for the configured active profile. */
  readonly manager: ProfilePluginManager
  private readonly plans = new Map<string, LocalPluginPrivatePlan>()
  private readonly now: () => number

  /** @param options - fixed profile, Registry, trust, cache, and process policy. */
  constructor(readonly options: LocalPluginInstallOptions) {
    this.now = options.now ?? Date.now
    this.manager = createProfilePluginManager({
      profileDir: options.profileDir,
      lockPath: resolveProfilePluginLockPath(options.profileDir),
      installAnchor: options.installAnchor,
      initialBundles: options.initialBundles,
      processTimeoutMs: 120_000,
      lockTimeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
      terminationGraceMs: 2_000,
      planTtlMs: options.planTtlMs,
      ...options.pnpmCommand === undefined ? {} : { pnpmCommand: options.pnpmCommand },
    })
  }

  /**
   * Read active-profile installed truth without consulting the remote Catalog.
   * @param signal - caller cancellation.
   * @returns public installed state without local filesystem paths.
   */
  async installed(signal?: AbortSignal): Promise<InstalledPluginSnapshot> {
    throwIfAborted(signal)
    await this.manager.initialize(signal)
    const receipts = await readCommittedPluginReceipts(this.options.dataDir)
    return publicInstalled(await this.manager.inspectInstalled(receipts))
  }

  /**
   * Verify a fresh descriptor and artifact before producing a detached plan.
   * @param pluginId - selected opaque plugin id.
   * @param versionId - selected opaque version id.
   * @param signal - caller cancellation.
   * @returns public plan with no URL or local path.
   */
  async planInstall(
    pluginId: PluginIdType,
    versionId: PluginVersionIdType,
    signal?: AbortSignal,
  ): Promise<PluginChangePlan> {
    const operationId = randomId()
    this.progress(operationId, 'verify', 'Verifying signed installation descriptor.')
    const value = await this.options.requestDescriptor(
      `/v1/plugins/${encodeURIComponent(pluginId)}/versions/${encodeURIComponent(versionId)}/install`,
      signal,
    )
    const descriptor = parseAndVerifyDescriptor(value, pluginId, versionId, this.options, this.now())
    this.progress(operationId, 'download', 'Downloading verified plugin artifact.', 0, descriptor.artifact.sizeBytes)
    const artifactPath = await downloadArtifact(descriptor, this.options, signal, (completed) => {
      this.progress(operationId, 'download', 'Downloading verified plugin artifact.', completed, descriptor.artifact.sizeBytes)
    })
    this.progress(operationId, 'verify', 'Checking plugin package identity.')
    const manifest = await readArtifactManifest(artifactPath)
    if (manifest.name !== descriptor.packageName || manifest.version !== descriptor.version) {
      throw new PluginHubError('Artifact package identity does not match the signed descriptor.', 'ARTIFACT_DIGEST_MISMATCH')
    }
    if (!sameStrings(manifest.lifecycleScripts, descriptor.lifecycleScripts)) {
      throw new PluginHubError('Artifact lifecycle scripts do not match the signed descriptor.', 'CONTRACT_UNSUPPORTED')
    }
    const artifact: ProfilePluginArtifact = Object.freeze({
      path: artifactPath,
      packageName: descriptor.packageName,
      version: descriptor.version,
      digest: { algorithm: 'sha512' as const, encoding: 'base64' as const, value: descriptor.artifact.digestBase64 },
      sizeBytes: descriptor.artifact.sizeBytes,
      ...manifest.bundlePatch === undefined ? {} : { bundlePatch: manifest.bundlePatch },
      lifecycleScripts: descriptor.lifecycleScripts,
    })
    const receipts = await readCommittedPluginReceipts(this.options.dataDir)
    const before = await this.manager.inspectInstalled(receipts)
    const existing = before.plugins.find(plugin => plugin.packageName === descriptor.packageName)
    const operation = existing === undefined || existing.health === 'missing-package' ? 'install' : 'update'
    let managerPlan: ProfilePluginChangePlan
    try {
      managerPlan = await this.manager.plan({ operation, artifact }, receipts, signal)
    } catch (error: unknown) {
      throw mapProfileError(error)
    }
    const target: PluginChangeTarget = Object.freeze({
      pluginId,
      versionId,
      packageName: descriptor.packageName,
      version: descriptor.version,
      sourceCommit: descriptor.sourceCommit,
      artifactSizeBytes: descriptor.artifact.sizeBytes,
      artifactDigest: `sha512:${descriptor.artifact.digestBase64}`,
      dshRange: descriptor.dshRange,
      validationLevel: descriptor.validationLevel,
      lifecycleScripts: descriptor.lifecycleScripts,
    })
    const publicPlan = publicPlanFromManager(managerPlan, target)
    this.plans.set(publicPlan.id, Object.freeze({ publicPlan, managerPlan, artifact, descriptor }))
    return publicPlan
  }

  /**
   * Create an offline removal plan from active-profile truth.
   * @param packageName - exact installed dependency name.
   * @param signal - caller cancellation.
   * @returns public detached removal plan.
   */
  async planRemove(packageName: string, signal?: AbortSignal): Promise<PluginChangePlan> {
    let managerPlan: ProfilePluginChangePlan
    try {
      const receipts = await readCommittedPluginReceipts(this.options.dataDir)
      managerPlan = await this.manager.plan({ operation: 'remove', packageName }, receipts, signal)
    } catch (error: unknown) {
      throw mapProfileError(error)
    }
    const publicPlan = publicPlanFromManager(managerPlan)
    this.plans.set(publicPlan.id, Object.freeze({ publicPlan, managerPlan }))
    return publicPlan
  }

  /**
   * Resolve a provider-issued plan for staging and reject expiry.
   * @param planId - opaque public plan id.
   * @returns provider-private verified plan.
   */
  privatePlan(planId: string): LocalPluginPrivatePlan {
    const plan = this.plans.get(planId)
    if (plan === undefined) throw new PluginHubError('Plugin change plan was not found.', 'PLAN_EXPIRED')
    if (this.now() >= Date.parse(plan.publicPlan.expiresAt)) {
      this.plans.delete(planId)
      throw new PluginHubError('Plugin change plan has expired.', 'PLAN_EXPIRED')
    }
    return plan
  }

  /**
   * Remove a provider-private plan after staging or cancellation.
   * @param planId - opaque plan id to forget.
   */
  deletePlan(planId: string): void { this.plans.delete(planId) }

  private progress(
    operationId: string,
    phase: PluginHubProgress['phase'],
    message: string,
    completed?: number,
    total?: number,
  ): void {
    this.options.publishProgress?.({ operationId, phase, message,
      ...completed === undefined ? {} : { completed }, ...total === undefined ? {} : { total } })
  }
}

function publicPlanFromManager(
  plan: ProfilePluginChangePlan,
  target?: PluginChangeTarget,
): PluginChangePlan {
  return Object.freeze({
    id: PluginChangePlanId(plan.planId),
    operation: plan.operation,
    profileRevision: plan.profileRevision,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    packageName: plan.packageName,
    ...target === undefined ? {} : { target },
    before: publicInstalled(plan.before),
    afterBundles: Object.freeze([...plan.afterBundles]),
    restartRequired: true,
    risks: Object.freeze([...plan.risks, 'Plugins run with DSH Host process permissions.']),
  })
}

function publicInstalled(snapshot: ProfilePluginInstalledSnapshot): InstalledPluginSnapshot {
  return Object.freeze({
    profileRevision: snapshot.revision,
    bundles: Object.freeze([...snapshot.bundles]),
    plugins: Object.freeze(snapshot.plugins.map((plugin): InstalledPlugin => Object.freeze({
      packageName: plugin.packageName,
      ...plugin.version === undefined ? {} : { version: plugin.version },
      activeBundle: plugin.activeBundle,
      managed: plugin.managed,
      ...plugin.pluginId === undefined ? {} : { pluginId: PluginId(plugin.pluginId) },
      ...plugin.versionId === undefined ? {} : { versionId: PluginVersionId(plugin.versionId) },
      ...plugin.sourceCommit === undefined ? {} : { sourceCommit: plugin.sourceCommit },
      ...plugin.artifactDigest === undefined ? {} : { artifactDigest: plugin.artifactDigest },
      health: plugin.health,
    }))),
  })
}

function parseAndVerifyDescriptor(
  value: unknown,
  selectedPluginId: PluginIdType,
  selectedVersionId: PluginVersionIdType,
  options: LocalPluginInstallOptions,
  now: number,
): VerifiedInstallDescriptor {
  const envelope = requiredObject(value, 'install descriptor')
  if (envelope.apiVersion !== API_VERSION) {
    throw new PluginHubError('Registry API version is unsupported.', 'CONTRACT_UNSUPPORTED')
  }
  const keyId = requiredString(envelope.keyId, 'keyId')
  const signature = requiredString(envelope.signature, 'signature')
  const key = options.trustedKeys.find(candidate => candidate.keyId === keyId)
  if (key === undefined || !keyActive(key, now)) {
    throw new PluginHubError('Installation descriptor signing key is not trusted.', 'SIGNATURE_INVALID')
  }
  verifyCanonicalSignature({ apiVersion: API_VERSION, descriptor: envelope.descriptor }, signature, key.publicKey,
    'Installation descriptor')
  const descriptor = requiredObject(envelope.descriptor, 'descriptor')
  const pluginId = requiredString(descriptor.pluginId, 'descriptor.pluginId')
  const versionId = requiredString(descriptor.versionId, 'descriptor.versionId')
  if (pluginId !== selectedPluginId || versionId !== selectedVersionId) {
    throw new PluginHubError('Installation descriptor does not match the selected plugin version.', 'VERSION_NOT_INSTALLABLE')
  }
  const issuedAt = requiredTimestamp(descriptor.issuedAt, 'descriptor.issuedAt')
  const expiresAt = requiredTimestamp(descriptor.expiresAt, 'descriptor.expiresAt')
  if (expiresAt <= issuedAt || issuedAt > now + MAX_CLOCK_SKEW_MS || now >= expiresAt) {
    throw new PluginHubError('Installation descriptor has expired or has invalid validity dates.', 'DESCRIPTOR_EXPIRED')
  }
  const source = requiredObject(descriptor.source, 'descriptor.source')
  const artifact = requiredObject(descriptor.artifact, 'descriptor.artifact')
  const digest = requiredObject(artifact.digest, 'descriptor.artifact.digest')
  const requirements = requiredObject(descriptor.requirements, 'descriptor.requirements')
  const validation = requiredObject(descriptor.validation, 'descriptor.validation')
  if (artifact.kind !== 'npm-tarball' || digest.algorithm !== 'sha512') {
    throw new PluginHubError('Installation artifact policy is unsupported.', 'CONTRACT_UNSUPPORTED')
  }
  const sizeBytes = requiredPositiveInteger(artifact.sizeBytes, 'descriptor.artifact.sizeBytes')
  if (sizeBytes > options.maxArtifactBytes) {
    throw new PluginHubError('Installation artifact exceeds the local size limit.', 'ARTIFACT_TOO_LARGE')
  }
  const surfaces = requiredStringArray(requirements.surfaces, 'descriptor.requirements.surfaces')
  if (!surfaces.includes('tui')) throw new PluginHubError('Plugin does not declare the TUI surface.', 'SURFACE_INCOMPATIBLE')
  const dshRange = requirements.dsh
  if (typeof dshRange !== 'string' || !satisfies(options.dshVersion, dshRange, { includePrerelease: true })) {
    throw new PluginHubError('Plugin is incompatible with this DSH version.', 'DSH_INCOMPATIBLE')
  }
  const lifecycleScripts = requiredStringArray(requirements.lifecycleScripts,
    'descriptor.requirements.lifecycleScripts')
  const digestBytes = decodeSha512(requiredString(digest.value, 'descriptor.artifact.digest.value'))
  return Object.freeze({
    pluginId: PluginId(pluginId),
    versionId: PluginVersionId(versionId),
    packageName: requiredString(descriptor.packageName, 'descriptor.packageName'),
    packagePath: requiredString(descriptor.packagePath, 'descriptor.packagePath'),
    version: requiredString(descriptor.version, 'descriptor.version'),
    sourceCommit: requiredString(source.commit, 'descriptor.source.commit'),
    dshRange,
    validationLevel: requiredString(validation.level, 'descriptor.validation.level'),
    artifact: Object.freeze({
      url: validateArtifactUrl(
        requiredString(artifact.url, 'descriptor.artifact.url'),
        options.fixtureArtifactOrigin,
      ).toString(),
      digest: digestBytes,
      digestBase64: digestBytes.toString('base64'),
      sizeBytes,
    }),
    lifecycleScripts,
    expiresAt: new Date(expiresAt).toISOString(),
  })
}

async function downloadArtifact(
  descriptor: VerifiedInstallDescriptor,
  options: LocalPluginInstallOptions,
  signal: AbortSignal | undefined,
  onProgress: (completed: number) => void,
): Promise<string> {
  const cacheDir = join(options.dataDir, 'artifacts', 'sha512')
  const tempDir = join(options.dataDir, 'artifacts', '.tmp')
  await mkdir(cacheDir, { recursive: true, mode: 0o700 })
  await mkdir(tempDir, { recursive: true, mode: 0o700 })
  const destination = join(cacheDir, `${descriptor.artifact.digest.toString('hex')}.tgz`)
  if (await validCachedArtifact(destination, descriptor)) return destination
  const temporary = join(tempDir, `${randomId()}.tgz`)
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  const controller = new AbortController()
  const abortState = { caller: false, timedOut: false }
  const onAbort = (): void => { abortState.caller = true; controller.abort(signal?.reason) }
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => { abortState.timedOut = true; controller.abort(new Error('artifact download timeout')) },
    options.requestTimeoutMs)
  const hash = createHash('sha512')
  let completed = 0
  try {
    signal?.throwIfAborted()
    let current = validateArtifactUrl(descriptor.artifact.url, options.fixtureArtifactOrigin)
    let response: Response | undefined
    for (let redirects = 0; redirects <= ARTIFACT_REDIRECT_LIMIT; redirects += 1) {
      response = await fetch(current, { redirect: 'manual', signal: controller.signal })
      if (response.status < 300 || response.status >= 400) break
      const location = response.headers.get('location')
      if (location === null || redirects === ARTIFACT_REDIRECT_LIMIT) {
        throw new PluginHubError('Artifact redirect limit exceeded.', 'REGISTRY_UNAVAILABLE')
      }
      current = validateArtifactUrl(new URL(location, current).toString(), options.fixtureArtifactOrigin)
    }
    if (response === undefined || !response.ok || response.body === null) {
      throw new PluginHubError('Installation artifact is unavailable.', 'REGISTRY_UNAVAILABLE')
    }
    const declared = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > descriptor.artifact.sizeBytes) {
      throw new PluginHubError('Installation artifact exceeds its signed size.', 'ARTIFACT_TOO_LARGE')
    }
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        completed += value.byteLength
        if (completed > descriptor.artifact.sizeBytes || completed > options.maxArtifactBytes) {
          throw new PluginHubError('Installation artifact exceeds its signed size.', 'ARTIFACT_TOO_LARGE')
        }
        hash.update(value)
        await handle.write(value)
        onProgress(completed)
      }
    } finally { reader.releaseLock() }
    if (completed !== descriptor.artifact.sizeBytes) {
      throw new PluginHubError('Installation artifact size does not match its descriptor.', 'ARTIFACT_DIGEST_MISMATCH')
    }
    const actual = hash.digest()
    if (!timingSafeEqual(actual, descriptor.artifact.digest)) {
      throw new PluginHubError('Installation artifact digest does not match its descriptor.', 'ARTIFACT_DIGEST_MISMATCH')
    }
    await handle.sync()
    await handle.close()
    try {
      await link(temporary, destination)
    } catch (error: unknown) {
      if (!isCode(error, 'EEXIST') || !(await validCachedArtifact(destination, descriptor))) throw error
    }
    await unlink(temporary)
    return destination
  } catch (error: unknown) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    if (abortState.caller) throw new PluginHubError('Plugin installation planning was cancelled.', 'OPERATION_ABORTED', { cause: error })
    if (abortState.timedOut) throw new PluginHubError('Installation artifact download timed out.', 'REGISTRY_UNAVAILABLE', { cause: error })
    if (error instanceof PluginHubError) throw error
    throw new PluginHubError('Installation artifact download failed.', 'REGISTRY_UNAVAILABLE', { cause: error })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function validCachedArtifact(path: string, descriptor: VerifiedInstallDescriptor): Promise<boolean> {
  try {
    const stats = await lstat(path)
    if (!stats.isFile() || stats.size !== descriptor.artifact.sizeBytes) return false
    const hash = createHash('sha512')
    for await (const chunk of createReadStream(path)) {
      if (!Buffer.isBuffer(chunk)) throw new Error('artifact stream returned non-buffer data')
      hash.update(chunk)
    }
    return timingSafeEqual(hash.digest(), descriptor.artifact.digest)
  } catch (error: unknown) {
    if (isCode(error, 'ENOENT')) return false
    throw error
  }
}

interface ArtifactManifest {
  readonly name: string
  readonly version: string
  readonly bundlePatch?: string
  readonly lifecycleScripts: readonly string[]
}

async function readArtifactManifest(path: string): Promise<ArtifactManifest> {
  const reads: Promise<string>[] = []
  let manifestError: PluginHubError | undefined
  await listTar({
    file: path,
    strict: true,
    filter: entryPath => entryPath === 'package/package.json',
    onReadEntry: (entry) => {
      if (entry.type !== 'File' || entry.size > MAX_PACKAGE_MANIFEST_BYTES || reads.length > 0) {
        entry.resume()
        manifestError = new PluginHubError('Artifact package manifest is invalid.', 'CONTRACT_UNSUPPORTED')
        return
      }
      reads.push(new Promise<string>((resolveRead, rejectRead) => {
        const chunks: Buffer[] = []
        let bytes = 0
        entry.on('data', (chunk: Buffer) => {
          bytes += chunk.byteLength
          if (bytes <= MAX_PACKAGE_MANIFEST_BYTES) chunks.push(chunk)
        })
        entry.on('end', () => {
          if (bytes > MAX_PACKAGE_MANIFEST_BYTES) rejectRead(new PluginHubError('Artifact package manifest is too large.', 'CONTRACT_UNSUPPORTED'))
          else resolveRead(Buffer.concat(chunks).toString('utf8'))
        })
        entry.on('error', rejectRead)
      }))
    },
  })
  if (manifestError !== undefined) throw manifestError
  if (reads.length !== 1) throw new PluginHubError('Artifact has no unique package manifest.', 'CONTRACT_UNSUPPORTED')
  const rawManifest = reads[0]
  if (rawManifest === undefined) throw new PluginHubError('Artifact has no package manifest.', 'CONTRACT_UNSUPPORTED')
  let parsed: unknown
  try { parsed = JSON.parse(await rawManifest) } catch (error: unknown) {
    throw new PluginHubError('Artifact package manifest is invalid.', 'CONTRACT_UNSUPPORTED', { cause: error })
  }
  const manifest = requiredObject(parsed, 'artifact package manifest')
  const dsh = manifest.dsh === undefined ? {} : requiredObject(manifest.dsh, 'artifact package dsh')
  const bundle = dsh.bundle === undefined ? {} : requiredObject(dsh.bundle, 'artifact package dsh.bundle')
  const bundlePatch = bundle.patch
  if (bundlePatch !== undefined && (typeof bundlePatch !== 'string' || !safePackagePath(bundlePatch))) {
    throw new PluginHubError('Artifact bundle patch path is invalid.', 'CONTRACT_UNSUPPORTED')
  }
  const scripts = manifest.scripts === undefined ? {} : requiredObject(manifest.scripts, 'artifact package scripts')
  const lifecycleScripts = Object.keys(scripts).filter(script => INSTALL_LIFECYCLE_SCRIPTS.has(script)).sort()
  return Object.freeze({
    name: requiredString(manifest.name, 'artifact package name'),
    version: requiredString(manifest.version, 'artifact package version'),
    ...bundlePatch === undefined ? {} : { bundlePatch },
    lifecycleScripts: Object.freeze(lifecycleScripts),
  })
}

function validateArtifactUrl(value: string, fixtureOrigin?: string): URL {
  let url: URL
  try { url = new URL(value) } catch (error: unknown) {
    throw new PluginHubError('Installation artifact URL is invalid.', 'CONTRACT_UNSUPPORTED', { cause: error })
  }
  const fixtureAllowed = fixtureOrigin !== undefined && url.origin === fixtureOrigin
    && url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '::1' || url.hostname === '[::1]')
  if ((url.origin !== NPM_REGISTRY_ORIGIN && !fixtureAllowed)
    || url.username !== '' || url.password !== '' || url.hash !== '') {
    throw new PluginHubError('Installation artifact URL is outside the trusted Registry policy.', 'CONTRACT_UNSUPPORTED')
  }
  return url
}

function decodeSha512(value: string): Buffer {
  let digest: Buffer
  if (/^[0-9a-fA-F]{128}$/u.test(value)) digest = Buffer.from(value, 'hex')
  else {
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/u.test(value)) {
      throw new PluginHubError('Installation artifact digest is invalid.', 'CONTRACT_UNSUPPORTED')
    }
    digest = Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64')
  }
  if (digest.byteLength !== 64) throw new PluginHubError('Installation artifact digest is invalid.', 'CONTRACT_UNSUPPORTED')
  return digest
}

function keyActive(key: LocalPluginHubTrustedKey, now: number): boolean {
  const notBefore = key.notBefore === undefined ? undefined : Date.parse(key.notBefore)
  const notAfter = key.notAfter === undefined ? undefined : Date.parse(key.notAfter)
  return (notBefore === undefined || (Number.isFinite(notBefore) && now >= notBefore))
    && (notAfter === undefined || (Number.isFinite(notAfter) && now < notAfter))
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  }
  return value as Record<string, unknown>
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  }
  return value
}
function requiredStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  }
  const items: unknown[] = value
  if (items.length > 32 || items.some(item => typeof item !== 'string')) {
    throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  }
  return Object.freeze(items.map(item => item as string))
}
function requiredTimestamp(value: unknown, field: string): number {
  const parsed = Date.parse(requiredString(value, field))
  if (!Number.isFinite(parsed)) throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  return parsed
}
function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new PluginHubError(`Registry field ${field} is invalid.`, 'CONTRACT_UNSUPPORTED')
  }
  return value
}
function safePackagePath(value: string): boolean {
  if (value === '' || value.includes('\\')) return false
  const normalized = resolve('/', value)
  return normalized.startsWith('/') && !value.startsWith('/') && !value.split('/').includes('..')
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index])
}
function randomId(): string { return randomBytes(16).toString('hex') }
function isCode(error: unknown, code: string): boolean { return (error as NodeJS.ErrnoException | undefined)?.code === code }
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new PluginHubError('Plugin operation was cancelled.', 'OPERATION_ABORTED')
}

/**
 * Map profile-manager error categories into the provider-neutral taxonomy.
 * @param error - profile operation failure.
 * @returns stable public Plugin Hub failure.
 */
export function mapProfileError(error: unknown): PluginHubError {
  if (!(error instanceof ProfilePluginError)) {
    return error instanceof PluginHubError
      ? error
      : new PluginHubError('Local profile operation failed.', 'PROFILE_INVALID', { cause: error })
  }
  const code = error.code === 'PROFILE_BUSY' ? 'PROFILE_BUSY'
    : error.code === 'PROFILE_CHANGED' ? 'PROFILE_CHANGED'
      : error.code === 'PLAN_EXPIRED' ? 'PLAN_EXPIRED'
        : error.code === 'PNPM_UNAVAILABLE' ? 'PNPM_UNAVAILABLE'
          : error.code === 'PNPM_FAILED' ? 'PNPM_FAILED'
            : error.code === 'BUILD_NOT_ALLOWED' ? 'BUILD_NOT_ALLOWED'
              : error.code === 'OPERATION_ABORTED' ? 'OPERATION_ABORTED'
                : 'PROFILE_INVALID'
  return new PluginHubError(error.message, code, { cause: error })
}
