/** Durable staging transactions for verified Plugin Hub plans. */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import {
  PluginHubError,
  PluginTransactionId,
  type PluginChangePlanId,
  type PluginHubProgress,
  type PluginTransactionId as PluginTransactionIdType,
  type StagedPluginTransaction,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import {
  createProfilePluginManager,
  inspectProfileInstalled,
} from '@lingxi-ai-cn/dsh-profile-plugin-manager'
import {
  composeEntries, loadOverlayPatches, PROFILE_PATCH_FILENAME, resolveBundleDir,
  type ProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { LocalPluginInstallLifecycle, mapProfileError } from './install.ts'
import {
  readCommittedPluginReceipts,
  type LocalPluginTransactionReceipt,
} from './receipts.ts'

const JOURNAL_VERSION = 1
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{32}$/u
const PLAN_ID_PATTERN = /^[0-9a-f]{24}$/u
const REVISION_PATTERN = /^[0-9a-f]{64}$/u

/** Durable states before and during maintenance activation. */
type LocalPluginTransactionState =
  | 'preparing' | 'staged' | 'discarded' | 'failed'
  | 'handoff-ready' | 'waiting-for-old-process' | 'old-moved'
  | 'new-active' | 'boot-pending' | 'committed'
  | 'restoring' | 'restored' | 'recovery-failed'

const TRANSACTION_STATES = new Set<LocalPluginTransactionState>([
  'preparing', 'staged', 'discarded', 'failed', 'handoff-ready', 'waiting-for-old-process',
  'old-moved', 'new-active', 'boot-pending', 'committed', 'restoring', 'restored', 'recovery-failed',
])

/** Trusted relaunch facts captured from the running DSH process. */
export interface LocalPluginRelaunchRequest {
  /** Absolute executable path for the trusted DSH process. */
  readonly executable: string
  /** Exact arguments following the executable in the captured invocation. */
  readonly args: readonly string[]
  /** Working directory restored for the relaunched DSH process. */
  readonly cwd: string
  /** Allowlisted environment restored for the relaunched DSH process. */
  readonly env: Readonly<Record<string, string>>
}

/** Complete durable recovery state for one local transaction. */
export interface LocalPluginTransactionJournal {
  readonly version: typeof JOURNAL_VERSION
  readonly transactionId: string
  readonly planId: string
  readonly state: LocalPluginTransactionState
  readonly operation: 'install' | 'update' | 'remove'
  readonly packageName: string
  readonly ownerPid: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly activeProfile: string
  readonly stagingProfile: string
  readonly oldGenerationProfile: string
  readonly failedGenerationProfile: string
  readonly beforeRevision: string
  readonly afterRevision?: string
  readonly receipt?: LocalPluginTransactionReceipt
  readonly handoffNonce?: string
  readonly readyMarker?: string
  readonly relaunch?: LocalPluginRelaunchRequest
  readonly newPid?: number
  readonly error?: { readonly code: string; readonly message: string }
}

/** Canonical private paths for one transaction id. */
export interface LocalPluginTransactionPaths {
  readonly transactionDir: string
  readonly journal: string
  readonly plan: string
  readonly receipt: string
  readonly stagingProfile: string
  readonly oldGenerationProfile: string
  readonly failedGenerationProfile: string
  readonly readyMarker: string
}

/** Stage verified private plans without changing the active profile. */
export class LocalPluginTransactionController {
  /** @param lifecycle - trusted planner and active-profile manager. */
  constructor(readonly lifecycle: LocalPluginInstallLifecycle) {}

  /**
   * Materialize, mutate, and validate one inactive staging generation.
   * @param planId - provider-issued detached plan id.
   * @param signal - cancellation through copy and pnpm work.
   * @returns durable staged transaction.
   */
  async stage(planId: PluginChangePlanId, signal?: AbortSignal): Promise<StagedPluginTransaction> {
    const privatePlan = this.lifecycle.privatePlan(planId)
    const transactionId = randomId()
    const paths = transactionPaths(this.lifecycle.options.dataDir, transactionId)
    const createdAt = new Date(this.now()).toISOString()
    let journal: LocalPluginTransactionJournal = {
      version: JOURNAL_VERSION,
      transactionId,
      planId,
      state: 'preparing',
      operation: privatePlan.publicPlan.operation,
      packageName: privatePlan.publicPlan.packageName,
      ownerPid: process.pid,
      createdAt,
      updatedAt: createdAt,
      activeProfile: this.lifecycle.options.profileDir,
      stagingProfile: paths.stagingProfile,
      oldGenerationProfile: paths.oldGenerationProfile,
      failedGenerationProfile: paths.failedGenerationProfile,
      beforeRevision: privatePlan.publicPlan.profileRevision,
    }
    await writeJsonDurable(paths.journal, journal)
    await writeJsonDurable(paths.plan, privatePlan.publicPlan)
    try {
      this.progress(transactionId, 'materialize', 'Creating inactive profile generation.')
      await this.lifecycle.manager.materializeProfile(paths.stagingProfile, signal)
      const baseline = await inspectProfileInstalled(paths.stagingProfile)
      if (baseline.revision !== privatePlan.publicPlan.profileRevision) {
        throw new PluginHubError('Staging profile does not match the confirmed profile revision.', 'PROFILE_CHANGED')
      }
      const stageManager = createProfilePluginManager({
        profileDir: paths.stagingProfile,
        lockPath: join(this.lifecycle.options.dataDir, 'locks', `staging-${transactionId}.lock`),
        initialBundles: this.lifecycle.options.initialBundles,
        installAnchor: this.lifecycle.options.installAnchor,
        processTimeoutMs: 120_000,
        lockTimeoutMs: 5_000,
        maxOutputBytes: 64 * 1024,
        terminationGraceMs: 2_000,
        planTtlMs: this.lifecycle.options.planTtlMs,
        ...this.lifecycle.options.pnpmCommand === undefined
          ? {}
          : { pnpmCommand: this.lifecycle.options.pnpmCommand },
      })
      const request = privatePlan.managerPlan.operation === 'remove'
        ? { operation: 'remove' as const, packageName: privatePlan.managerPlan.packageName }
        : { operation: privatePlan.managerPlan.operation, artifact: requiredArtifact(privatePlan.artifact) }
      const receipts = await readCommittedPluginReceipts(this.lifecycle.options.dataDir)
      const stagePlan = await stageManager.plan(request, receipts, signal)
      if (stagePlan.profileRevision !== privatePlan.publicPlan.profileRevision) {
        throw new PluginHubError('Staging profile changed before mutation.', 'PROFILE_CHANGED')
      }
      this.progress(transactionId, 'mutate', 'Installing exact artifact in inactive profile.')
      const result = await stageManager.applyPlan(stagePlan, signal, receipts)
      this.progress(transactionId, 'validate', 'Validating inactive profile generation.')
      const validation = await stageManager.validateProfile()
      if (!validation.valid) {
        throw new PluginHubError(`Staging profile is invalid: ${validation.errors.join('; ')}`, 'PROFILE_INVALID')
      }
      if (!sameStrings(validation.snapshot.bundles, privatePlan.publicPlan.afterBundles)) {
        throw new PluginHubError('Staging bundle order differs from the confirmed plan.', 'PROFILE_INVALID')
      }
      validateComposition(paths.stagingProfile, validation.snapshot.bundles, this.lifecycle.options.installAnchor)
      const afterRevision = result.after.revision
      const receipt = createReceipt(privatePlan, transactionId, afterRevision)
      journal = {
        ...journal,
        state: 'staged',
        updatedAt: new Date(this.now()).toISOString(),
        afterRevision,
        ...receipt === undefined ? {} : { receipt },
      }
      await writeJsonDurable(paths.journal, journal)
      this.lifecycle.deletePlan(planId)
      return Object.freeze({
        id: PluginTransactionId(transactionId),
        planId,
        operation: journal.operation,
        packageName: journal.packageName,
        beforeRevision: journal.beforeRevision,
        afterRevision,
        createdAt,
        restartRequired: true,
      })
    } catch (error: unknown) {
      const failure = mapStageError(error)
      journal = { ...journal, state: 'failed', updatedAt: new Date(this.now()).toISOString(),
        error: { code: failure.code, message: failure.message.slice(0, 2048) } }
      await writeJsonDurable(paths.journal, journal).catch(() => undefined)
      await removeOwnedTree(paths.stagingProfile, this.lifecycle.options.dataDir).catch(() => undefined)
      throw failure
    }
  }

  /**
   * Discard one staged generation without changing the active profile.
   * @param transactionId - provider-issued transaction id.
   * @param signal - caller cancellation before filesystem mutation.
   */
  async discard(transactionId: PluginTransactionIdType, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    const paths = transactionPaths(this.lifecycle.options.dataDir, transactionId)
    const journal = await readJournal(paths.journal)
    if (journal.state !== 'staged' && journal.state !== 'failed') {
      throw new PluginHubError('Plugin transaction can no longer be discarded.', 'STAGE_FAILED')
    }
    await removeOwnedTree(paths.stagingProfile, this.lifecycle.options.dataDir)
    await writeJsonDurable(paths.journal, {
      ...journal,
      state: 'discarded',
      updatedAt: new Date(this.now()).toISOString(),
    } satisfies LocalPluginTransactionJournal)
  }

  private now(): number { return this.lifecycle.options.now?.() ?? Date.now() }

  private progress(transactionId: string, phase: PluginHubProgress['phase'], message: string): void {
    this.lifecycle.options.publishProgress?.({ operationId: transactionId, phase, message })
  }
}

/**
 * Resolve fixed transaction-owned paths without trusting journal path fields.
 * @param dataDir - configured private Plugin Hub data directory.
 * @param transactionId - provider-issued random transaction id.
 * @returns canonical paths for journal, staging, and generations.
 */
export function transactionPaths(dataDir: string, transactionId: string): LocalPluginTransactionPaths {
  if (!isAbsolute(dataDir) || !TRANSACTION_ID_PATTERN.test(transactionId)) {
    throw new PluginHubError('Plugin transaction id is invalid.', 'STAGE_FAILED')
  }
  const transactionDir = join(dataDir, 'transactions', transactionId)
  return Object.freeze({
    transactionDir,
    journal: join(transactionDir, 'journal.json'),
    plan: join(transactionDir, 'plan.json'),
    receipt: join(transactionDir, 'receipt.json'),
    stagingProfile: join(dataDir, 'staging', transactionId, 'profile'),
    oldGenerationProfile: join(dataDir, 'generations', `${transactionId}-old`, 'profile'),
    failedGenerationProfile: join(dataDir, 'generations', `${transactionId}-failed`, 'profile'),
    readyMarker: join(transactionDir, 'ready.json'),
  })
}

/**
 * Parse and validate one package-owned transaction journal.
 * @param path - exact journal path derived by {@link transactionPaths}.
 * @returns validated journal.
 */
export async function readJournal(path: string): Promise<LocalPluginTransactionJournal> {
  let parsed: unknown
  try { parsed = JSON.parse(await readFile(path, 'utf8')) } catch (error: unknown) {
    throw new PluginHubError('Plugin transaction journal is unavailable.', 'STAGE_FAILED', { cause: error })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PluginHubError('Plugin transaction journal is invalid.', 'STAGE_FAILED')
  }
  const journal = parsed as Record<string, unknown>
  if (journal.version !== JOURNAL_VERSION || typeof journal.transactionId !== 'string'
    || !TRANSACTION_ID_PATTERN.test(journal.transactionId) || typeof journal.planId !== 'string'
    || !PLAN_ID_PATTERN.test(journal.planId) || !isTransactionState(journal.state)
    || !isOperation(journal.operation) || !boundedString(journal.packageName, 1, 214)
    || !positiveSafeInteger(journal.ownerPid) || !validTimestamp(journal.createdAt)
    || !validTimestamp(journal.updatedAt) || !absoluteString(journal.activeProfile)
    || !absoluteString(journal.stagingProfile) || !absoluteString(journal.oldGenerationProfile)
    || !absoluteString(journal.failedGenerationProfile) || !revision(journal.beforeRevision)
    || !optionalRevision(journal.afterRevision) || !optionalReceipt(journal.receipt)
    || !optionalNonce(journal.handoffNonce) || !optionalAbsoluteString(journal.readyMarker)
    || !optionalRelaunch(journal.relaunch) || !optionalPositiveSafeInteger(journal.newPid)
    || !optionalError(journal.error)) {
    throw new PluginHubError('Plugin transaction journal is invalid.', 'STAGE_FAILED')
  }
  return journal as unknown as LocalPluginTransactionJournal
}

/**
 * Atomically replace a private JSON record and fsync its file and parent.
 * @param path - exact package-owned record path.
 * @param value - complete JSON value.
 */
export async function writeJsonDurable(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(`${JSON.stringify(value, undefined, 2)}\n`, 'utf8')
    await file.sync()
    await file.close()
    await rename(temporary, path)
    const parent = await open(dirname(path), 'r')
    try { await parent.sync() } finally { await parent.close() }
  } catch (error: unknown) {
    await file.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

function requiredArtifact(artifact: ReturnType<LocalPluginInstallLifecycle['privatePlan']>['artifact']): NonNullable<typeof artifact> {
  if (artifact === undefined) throw new PluginHubError('Install plan has no verified artifact.', 'STAGE_FAILED')
  return artifact
}

function createReceipt(
  plan: ReturnType<LocalPluginInstallLifecycle['privatePlan']>,
  transactionId: string,
  afterRevision: string,
): LocalPluginTransactionReceipt | undefined {
  if (plan.publicPlan.operation === 'remove' || plan.publicPlan.target === undefined) return undefined
  return Object.freeze({
    transactionId,
    operation: plan.publicPlan.operation,
    packageName: plan.publicPlan.target.packageName,
    version: plan.publicPlan.target.version,
    pluginId: plan.publicPlan.target.pluginId,
    versionId: plan.publicPlan.target.versionId,
    sourceCommit: plan.publicPlan.target.sourceCommit,
    artifactDigest: plan.publicPlan.target.artifactDigest,
    beforeRevision: plan.publicPlan.profileRevision,
    afterRevision,
  })
}

function mapStageError(error: unknown): PluginHubError {
  const mapped = mapProfileError(error)
  if (mapped.code === 'PROFILE_BUSY' || mapped.code === 'PROFILE_CHANGED' || mapped.code === 'PLAN_EXPIRED'
    || mapped.code === 'PNPM_UNAVAILABLE' || mapped.code === 'PNPM_FAILED' || mapped.code === 'BUILD_NOT_ALLOWED'
    || mapped.code === 'PROFILE_INVALID' || mapped.code === 'OPERATION_ABORTED') return mapped
  return new PluginHubError(mapped.message, 'STAGE_FAILED', { cause: mapped })
}

async function removeOwnedTree(path: string, dataDir: string): Promise<void> {
  const inside = relative(dataDir, path)
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new PluginHubError('Transaction path is outside Plugin Hub data.', 'STAGE_FAILED')
  }
  try {
    const stats = await lstat(path)
    if (stats.isSymbolicLink()) await unlink(path)
    else if (stats.isDirectory()) await rm(path, { recursive: true })
    else await unlink(path)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isTransactionState(value: unknown): value is LocalPluginTransactionState {
  return typeof value === 'string' && TRANSACTION_STATES.has(value as LocalPluginTransactionState)
}

function isOperation(value: unknown): value is LocalPluginTransactionJournal['operation'] {
  return value === 'install' || value === 'update' || value === 'remove'
}

function boundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum && !value.includes('\0')
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function absoluteString(value: unknown): value is string {
  return boundedString(value, 1, 4096) && isAbsolute(value)
}

function optionalAbsoluteString(value: unknown): boolean { return value === undefined || absoluteString(value) }
function revision(value: unknown): value is string { return typeof value === 'string' && REVISION_PATTERN.test(value) }
function optionalRevision(value: unknown): boolean { return value === undefined || revision(value) }
function optionalNonce(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value))
}
function optionalPositiveSafeInteger(value: unknown): boolean { return value === undefined || positiveSafeInteger(value) }

function optionalRelaunch(value: unknown): boolean {
  if (value === undefined) return true
  if (!isRecord(value) || !absoluteString(value.executable) || !absoluteString(value.cwd)
    || !Array.isArray(value.args) || value.args.length === 0 || value.args.length > 64
    || value.args.some(argument => !boundedString(argument, 0, 4096)) || !isRecord(value.env)) return false
  return Object.entries(value.env).every(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)
    && boundedString(item, 0, 32_768))
}

function optionalReceipt(value: unknown): boolean {
  if (value === undefined) return true
  return isRecord(value) && typeof value.transactionId === 'string'
    && TRANSACTION_ID_PATTERN.test(value.transactionId) && isOperation(value.operation)
    && boundedString(value.packageName, 1, 214) && boundedString(value.version, 1, 256)
    && revision(value.beforeRevision) && revision(value.afterRevision)
    && (value.committedAt === undefined || validTimestamp(value.committedAt))
    && optionalBoundedString(value.pluginId, 512) && optionalBoundedString(value.versionId, 512)
    && optionalBoundedString(value.sourceCommit, 512) && optionalBoundedString(value.artifactDigest, 1024)
}

function optionalError(value: unknown): boolean {
  return value === undefined || (isRecord(value)
    && boundedString(value.code, 1, 128) && boundedString(value.message, 1, 2048))
}

function optionalBoundedString(value: unknown, maximum: number): boolean {
  return value === undefined || boundedString(value, 1, maximum)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateComposition(profileDir: string, bundles: readonly string[], installAnchor: string): void {
  try {
    const layers = bundles.map((packageName) => {
      const packageDir = resolveBundleDir('dsh plugin hub', packageName, installAnchor, profileDir)
      const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as ProfileManifest
      const patch = manifest.dsh?.bundle?.patch
      if (patch === undefined) throw new Error(`bundle ${packageName} declares no patch`)
      return loadOverlayPatches('dsh plugin hub', join(packageDir, patch))
    })
    layers.push(loadOverlayPatches('dsh plugin hub', join(profileDir, PROFILE_PATCH_FILENAME)))
    composeEntries(layers)
  } catch (error: unknown) {
    throw new PluginHubError('Staging profile composition cannot be loaded.', 'PROFILE_INVALID', { cause: error })
  }
}
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new PluginHubError('Plugin transaction was cancelled.', 'OPERATION_ABORTED')
}
function randomId(): string { return randomBytes(16).toString('hex') }
