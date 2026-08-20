/**
 * Host-side profile mutation, installed-truth, lock, and pnpm orchestration.
 * The package accepts an explicit profile directory so the CLI, a future local
 * Plugin Hub provider, and staging profiles use one implementation. It never
 * fetches Registry data or renders UI.
 * @module @lingxi-ai-cn/dsh-profile-plugin-manager
 */

import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { constants, createReadStream, existsSync, lstatSync, readFileSync } from 'node:fs'
import {
  cp, mkdir, readFile, rename, rm, stat, writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { runNativeCommand } from '@deepseek-ai/dsh-native-command'
import { TextRetainer } from '@deepseek-ai/dsh-output-retention'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  readProfileManifest,
  resolveBundleDir,
  type ProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import * as yaml from 'js-yaml'
import type {
  ProfilePluginArtifact,
  ProfilePluginChangePlan,
  ProfilePluginInstalled,
  ProfilePluginInstalledSnapshot,
  ProfilePluginLockEntry,
  ProfilePluginLockOptions,
  ProfilePluginLockfile,
  ProfilePluginManagerOptions,
  ProfilePluginMutationResult,
  ProfilePluginOperation,
  ProfilePluginPnpmOptions,
  ProfilePluginPnpmResult,
  ProfilePluginPlanRequest,
  ProfilePluginPlanTarget,
  ProfilePluginProcessIdentity,
  ProfilePluginReceipt,
  ProfilePluginValidation,
} from './types.ts'
import { ProfilePluginError } from './types.ts'

export type * from './types.ts'
export { ProfilePluginError }

const PACKAGE_NAME_PATTERN = /^(?:@[^/@]+\/[^/@]+|[^/@]+)$/u
const DEFAULT_PNPM_COMMAND = ['pnpm'] as const
const LOCK_METADATA_FILENAME = 'owner.json'
const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'
const LOCK_RETRY_INITIAL_MS = 20
const LOCK_RETRY_MAX_MS = 200

interface ProfilePluginLockOwner {
  readonly pid: number
  readonly identity?: string
  readonly transactionId: string
  readonly createdAt: string
  readonly nonce: string
}

/**
 * Convert a relative pnpm path spec to an absolute spec rooted at the user's
 * invoking directory. Registry names and non-path arguments pass unchanged.
 * @param argument - one raw pnpm argument.
 * @param cwd - directory from which the CLI or Host operation started.
 * @returns the anchored argument.
 */
export function anchorProfilePluginSpec(argument: string, cwd: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/u.exec(argument)
  if (match?.groups?.path === undefined) return argument
  return `${match.groups.prefix ?? ''}${resolve(cwd, match.groups.path)}`
}

/**
 * Resolve the shared lock directory for a conventional `$DSH_HOME/profiles`
 * profile. Callers with a different layout should pass the returned path
 * explicitly to the manager instead of deriving a second lock convention.
 * @param profileDir - absolute profile directory.
 * @returns the lock directory path shared by all consumers of that profile.
 */
export function resolveProfilePluginLockPath(profileDir: string): string {
  assertAbsolutePath(profileDir, 'profile directory')
  const name = profileDir.split(sep).filter(Boolean).at(-1)
  if (name === undefined || name === '.' || name === '..') {
    throw new ProfilePluginError('profile directory has no valid name', 'PROFILE_INVALID')
  }
  return join(dirname(dirname(profileDir)), 'plugin-hub', 'locks', `${name}.lock`)
}

/**
 * Hold one atomic directory lock around an asynchronous operation. A live or
 * unverifiable owner is never removed; a dead owner can be reclaimed only
 * after its metadata and process identity prove that it is stale.
 * @param lockPath - exclusive directory path shared by CLI and Host consumers.
 * @param options - cancellation, timeout, and transaction identity.
 * @param timeoutMs - maximum wait for the lock.
 * @param processIdentity - platform process-start identity resolver.
 * @param operation - work performed while the lock is held.
 * @returns the operation result.
 */
export async function withProfilePluginLock<T>(
  lockPath: string,
  options: ProfilePluginLockOptions,
  timeoutMs: number,
  processIdentity: ProfilePluginProcessIdentity = defaultProcessIdentity,
  operation: () => T | Promise<T>,
): Promise<T> {
  assertAbsolutePath(lockPath, 'profile lock')
  assertPositiveInteger(timeoutMs, 'lock timeout')
  const deadline = Date.now() + timeoutMs
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 })
  const identity = await processIdentity(process.pid)
  const owner: ProfilePluginLockOwner = {
    pid: process.pid,
    ...identity === undefined ? {} : { identity },
    transactionId: options.transactionId ?? randomId(),
    createdAt: new Date().toISOString(),
    nonce: randomId(),
  }
  let delay = LOCK_RETRY_INITIAL_MS
  for (;;) {
    throwIfAborted(options.signal)
    try {
      await mkdir(lockPath, { mode: 0o700 })
      try {
        await writeFile(join(lockPath, LOCK_METADATA_FILENAME), JSON.stringify(owner) + '\n', {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        })
      } catch (error: unknown) {
        await removeOwnedDirectory(lockPath)
        throw error
      }
      break
    } catch (error: unknown) {
      if (!isCode(error, 'EEXIST')) throw error
      if (await reclaimStaleLock(lockPath, processIdentity)) continue
    }
    if (Date.now() >= deadline) {
      throw new ProfilePluginError(`profile lock is busy: ${lockPath}`, 'PROFILE_BUSY')
    }
    await waitForRetry(delay, options.signal)
    delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS)
  }

  try {
    return await operation()
  } finally {
    await releaseProfilePluginLock(lockPath, owner.nonce)
  }
}

/**
 * Inspect a profile's package manifest, lockfile, resolved manifests, bundle
 * order, and optional Hub receipts. This is the local installed truth; remote
 * Catalog state is deliberately absent.
 * @param profileDir - explicit profile directory.
 * @param receipts - locally persisted Hub receipts, if available.
 * @returns a point-in-time installed snapshot and deterministic revision.
 */
export async function inspectProfileInstalled(
  profileDir: string,
  receipts: readonly ProfilePluginReceipt[] = [],
): Promise<ProfilePluginInstalledSnapshot> {
  assertAbsolutePath(profileDir, 'profile directory')
  const manifestPath = join(profileDir, 'package.json')
  let manifest: ProfileManifest
  try {
    manifest = readProfileManifest('dsh profile manager', profileDir)
  } catch (error: unknown) {
    throw new ProfilePluginError(`cannot read profile manifest ${manifestPath}`, 'PROFILE_INVALID', { cause: error })
  }
  const dependencies = objectStringMap(manifest.dependencies, 'profile dependencies')
  const bundles = stringList(manifest.dsh?.profile?.bundles, 'dsh.profile.bundles')
  const lockfile = await readProfileLockfile(profileDir)
  const receiptMap = new Map(receipts.map(receipt => [receipt.packageName, receipt]))
  const plugins: ProfilePluginInstalled[] = []
  const revisionRecords: unknown[] = []
  for (const [packageName, requested] of Object.entries(dependencies)) {
    assertPackageName(packageName)
    const packagePath = join(profileDir, 'node_modules', packageName)
    const packageManifestPath = join(packagePath, 'package.json')
    const locked = lockfile.importer[packageName]
    const receipt = receiptMap.get(packageName)
    let resolvedPath: string | undefined
    let version: string | undefined
    let bundlePatch: string | undefined
    let health: ProfilePluginInstalled['health'] = 'ok'
    let rawManifest = ''
    try {
      rawManifest = await readFile(packageManifestPath, 'utf8')
      const parsed = parsePackageManifest(rawManifest, packageName)
      resolvedPath = packagePath
      version = parsed.version
      bundlePatch = parsed.bundlePatch
      if (bundlePatch !== undefined && !isSafePackageRelativePath(bundlePatch)) {
        health = 'manifest-invalid'
      } else if (bundlePatch !== undefined && !existsSync(resolve(packagePath, bundlePatch))) {
        health = 'manifest-invalid'
      } else if (bundlePatch !== undefined && !bundles.includes(packageName)) {
        health = 'missing-entry'
      } else if (locked === undefined) {
        health = 'unknown'
      }
    } catch (error: unknown) {
      if (isCode(error, 'ENOENT')) health = 'missing-package'
      else health = 'manifest-invalid'
    }
    const managedReceipt = receipt !== undefined && version !== undefined && receipt.version === version
      ? receipt
      : undefined
    const installed: ProfilePluginInstalled = {
      packageName,
      requested,
      ...version === undefined ? {} : { version },
      ...resolvedPath === undefined ? {} : { resolvedPath },
      ...locked === undefined ? {} : { locked },
      ...bundlePatch === undefined ? {} : { bundlePatch },
      activeBundle: bundles.includes(packageName),
      managed: managedReceipt !== undefined,
      ...managedReceipt?.pluginId === undefined ? {} : { pluginId: managedReceipt.pluginId },
      ...managedReceipt?.versionId === undefined ? {} : { versionId: managedReceipt.versionId },
      ...managedReceipt?.sourceCommit === undefined ? {} : { sourceCommit: managedReceipt.sourceCommit },
      ...managedReceipt?.artifactDigest === undefined ? {} : { artifactDigest: managedReceipt.artifactDigest },
      health,
    }
    plugins.push(Object.freeze(installed))
    revisionRecords.push({
      packageName,
      requested,
      version,
      bundlePatch,
      activeBundle: installed.activeBundle,
      health,
      locked,
      manifestDigest: rawManifest === '' ? undefined : sha256(rawManifest),
    })
  }
  const revision = sha256(stableJson({
    dependencies,
    bundles,
    lockfile: lockfile.digest,
    plugins: revisionRecords,
  }))
  return Object.freeze({
    profileDir,
    revision,
    dependencies: Object.freeze({ ...dependencies }),
    bundles: Object.freeze([...bundles]),
    plugins: Object.freeze(plugins),
    lockfile,
  })
}

/**
 * Reconcile the ordered bundle list against the installed dependency state.
 * Template bundles are preserved; dependency-managed bundle entries are
 * appended in package.json order and removed when their declaration disappears.
 * @param before - installed snapshot immediately before a successful pnpm run.
 * @param profileDir - profile directory whose manifest pnpm changed.
 * @returns one warning per newly added bundle-less dependency.
 */
export async function reconcileProfilePluginBundles(
  before: ProfilePluginInstalledSnapshot,
  profileDir: string,
): Promise<readonly string[]> {
  const after = readProfileManifest('dsh profile manager', profileDir)
  const dependencies = objectStringMap(after.dependencies, 'profile dependencies')
  const bundles = stringList(after.dsh?.profile?.bundles, 'dsh.profile.bundles')
  const beforeDependencies = new Set(Object.keys(before.dependencies))
  const dependencySet = new Set(Object.keys(dependencies))
  const warnings: string[] = []
  let changed = false
  for (const packageName of Object.keys(dependencies)) {
    const bundlePatch = await readInstalledBundlePatch(profileDir, packageName)
    if (bundlePatch !== undefined && !bundles.includes(packageName)) {
      bundles.push(packageName)
      changed = true
    } else if (bundlePatch === undefined && !beforeDependencies.has(packageName)) {
      warnings.push(
        `${packageName} declares no dsh.bundle; it remains a plain dependency and is not a profile layer`,
      )
    }
  }
  for (const packageName of [...bundles]) {
    const dependencyManaged = beforeDependencies.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName)
      && (await readInstalledBundlePatch(profileDir, packageName)) !== undefined
    if (dependencyManaged && !stillBundle) {
      bundles.splice(bundles.indexOf(packageName), 1)
      changed = true
    }
  }
  if (changed) {
    const next: ProfileManifest = {
      ...after,
      dsh: { ...after.dsh, profile: { ...after.dsh?.profile, bundles } },
    }
    await writeFileAtomic(join(profileDir, 'package.json'), JSON.stringify(next, undefined, 2) + '\n', {
      mode: 0o600,
      dirMode: 0o700,
    })
  }
  return Object.freeze(warnings)
}

/**
 * Run profile operations and exact artifact mutations behind one shared lock.
 * The manager never accepts a mutable package specification for typed install
 * or update; the only package-manager argv it constructs is an absolute local
 * artifact path or a validated package name for remove.
 */
export class ProfilePluginManager {
  private readonly options: ProfilePluginManagerOptions
  private readonly now: () => number

  /**
   * @param options - explicit profile, lock, process, output, and plan policy.
   */
  constructor(options: ProfilePluginManagerOptions) {
    assertAbsolutePath(options.profileDir, 'profile directory')
    assertAbsolutePath(options.lockPath, 'profile lock')
    assertPositiveInteger(options.processTimeoutMs, 'process timeout')
    assertPositiveInteger(options.lockTimeoutMs, 'lock timeout')
    assertPositiveInteger(options.maxOutputBytes, 'output limit')
    assertPositiveInteger(options.terminationGraceMs, 'termination grace')
    assertPositiveInteger(options.planTtlMs, 'plan lifetime')
    this.options = { ...options, initialBundles: [...options.initialBundles] }
    this.now = options.now ?? Date.now
  }

  /**
   * Initialize the explicit profile under the shared lock if it is absent.
   * @param signal - cancellation while waiting for the profile lock.
   */
  async initialize(signal?: AbortSignal): Promise<void> {
    await this.withLock(lockOptions(signal), () => {
      initProfile(this.options.profileDir, this.options.initialBundles)
    })
  }

  /**
   * Read installed truth without invoking pnpm or mutating the profile.
   * @param receipts - optional local Hub receipts used to mark managed packages.
   * @returns the current profile-local installed snapshot.
   */
  async inspectInstalled(receipts: readonly ProfilePluginReceipt[] = []): Promise<ProfilePluginInstalledSnapshot> {
    return inspectProfileInstalled(this.options.profileDir, receipts)
  }

  /**
   * Create an immutable, expiring plan. Planning acquires the same lock as
   * mutation so the captured revision cannot be half-written by the CLI.
   * @param request - install/update exact artifact or remove package request.
   * @param receipts - optional local Hub receipts used for the baseline.
   * @param signal - cancellation while waiting for the profile lock.
   * @returns detached plan containing before state and expected bundle order.
   */
  async plan(
    request: ProfilePluginPlanRequest,
    receipts: readonly ProfilePluginReceipt[] = [],
    signal?: AbortSignal,
  ): Promise<ProfilePluginChangePlan> {
    return this.withLock(lockOptions(signal), async () => {
      initProfile(this.options.profileDir, this.options.initialBundles)
      const before = await inspectProfileInstalled(this.options.profileDir, receipts)
      const targetPackageName = request.operation === 'remove' ? request.packageName : request.artifact.packageName
      assertPackageName(targetPackageName)
      const existing = before.plugins.find(plugin => plugin.packageName === targetPackageName)
      if (request.operation === 'install' && existing !== undefined && existing.health !== 'missing-package') {
        throw new ProfilePluginError(`package ${targetPackageName} is already installed`, 'PROFILE_INVALID')
      }
      if (request.operation === 'update' && (existing === undefined || existing.health === 'missing-package')) {
        throw new ProfilePluginError(`package ${targetPackageName} is not installed`, 'PROFILE_INVALID')
      }
      if (request.operation === 'remove' && existing === undefined) {
        throw new ProfilePluginError(`package ${targetPackageName} is not installed`, 'PROFILE_INVALID')
      }
      const afterBundles = [...before.bundles]
      const artifact = request.operation === 'remove' ? undefined : detachArtifact(request.artifact)
      const bundlePatch = artifact?.bundlePatch
      if (request.operation === 'remove' || bundlePatch === undefined) {
        const index = afterBundles.indexOf(targetPackageName)
        if (index >= 0) afterBundles.splice(index, 1)
      } else if (!afterBundles.includes(targetPackageName)) {
        afterBundles.push(targetPackageName)
      }
      const risks = ['The active profile changes only after this plan is staged and activated.']
      if (artifact?.lifecycleScripts !== undefined && artifact.lifecycleScripts.length > 0) {
        risks.push(`Lifecycle scripts: ${artifact.lifecycleScripts.join(', ')}`)
      }
      if (!sameStringArray(afterBundles, before.bundles)) risks.push('The ordered dsh.profile.bundles list changes.')
      const created = this.now()
      const createdAt = new Date(created).toISOString()
      let target: ProfilePluginPlanTarget | undefined
      if (request.operation !== 'remove') {
        const exactArtifact = artifact as ProfilePluginArtifact
        target = Object.freeze({
          packageName: exactArtifact.packageName,
          version: exactArtifact.version,
          artifact: exactArtifact,
          ...exactArtifact.bundlePatch === undefined ? {} : { bundlePatch: exactArtifact.bundlePatch },
          lifecycleScripts: Object.freeze([...(exactArtifact.lifecycleScripts ?? [])]),
        })
      }
      return Object.freeze({
        planId: randomId(),
        operation: request.operation,
        profileRevision: before.revision,
        createdAt,
        expiresAt: new Date(created + this.options.planTtlMs).toISOString(),
        packageName: targetPackageName,
        ...target === undefined ? {} : { target },
        before,
        afterBundles: Object.freeze(afterBundles),
        restartRequired: true as const,
        risks: Object.freeze(risks),
      })
    })
  }

  /**
   * Apply a still-current plan, using exact typed mutation and shared locking.
   * @param plan - detached plan whose revision and expiry must still be valid.
   * @param signal - cancellation for lock waiting and pnpm execution.
   * @param receipts - optional local Hub receipts used for installed snapshots.
   * @returns the profile state before and after the successful mutation.
   */
  async applyPlan(
    plan: ProfilePluginChangePlan,
    signal?: AbortSignal,
    receipts: readonly ProfilePluginReceipt[] = [],
  ): Promise<ProfilePluginMutationResult> {
    if (this.now() >= Date.parse(plan.expiresAt)) {
      throw new ProfilePluginError(`profile plugin plan ${plan.planId} has expired`, 'PLAN_EXPIRED')
    }
    return this.withLock(lockOptions(signal, plan.planId), async () => {
      if (this.now() >= Date.parse(plan.expiresAt)) {
        throw new ProfilePluginError(`profile plugin plan ${plan.planId} has expired`, 'PLAN_EXPIRED')
      }
      if (plan.before.profileDir !== this.options.profileDir) {
        throw new ProfilePluginError('profile plugin plan belongs to a different profile', 'PROFILE_CHANGED')
      }
      initProfile(this.options.profileDir, this.options.initialBundles)
      const current = await inspectProfileInstalled(this.options.profileDir, receipts)
      if (current.revision !== plan.profileRevision) {
        throw new ProfilePluginError('profile changed after this plan was created', 'PROFILE_CHANGED')
      }
      if (plan.operation === 'remove') return this.mutateUnlocked('remove', plan.packageName, undefined, signal, receipts)
      const artifact = plan.target?.artifact
      if (artifact === undefined) throw new ProfilePluginError('install plan has no artifact', 'INVALID_ARTIFACT')
      return this.mutateUnlocked(plan.operation, artifact.packageName, artifact, signal, receipts)
    })
  }

  /**
   * Install one exact local artifact.
   * @param artifact - verified package identity and absolute local file.
   * @param signal - cancellation for lock waiting and pnpm execution.
   * @param receipts - optional local Hub receipts used for installed snapshots.
   * @returns the profile state before and after the successful install.
   */
  async installExact(
    artifact: ProfilePluginArtifact,
    signal?: AbortSignal,
    receipts: readonly ProfilePluginReceipt[] = [],
  ): Promise<ProfilePluginMutationResult> {
    return this.withLock(lockOptions(signal), async () => {
      initProfile(this.options.profileDir, this.options.initialBundles)
      return this.mutateUnlocked('install', artifact.packageName, artifact, signal, receipts)
    })
  }

  /**
   * Update one package to one exact local artifact.
   * @param artifact - verified package identity and absolute local file.
   * @param signal - cancellation for lock waiting and pnpm execution.
   * @param receipts - optional local Hub receipts used for installed snapshots.
   * @returns the profile state before and after the successful update.
   */
  async updateExact(
    artifact: ProfilePluginArtifact,
    signal?: AbortSignal,
    receipts: readonly ProfilePluginReceipt[] = [],
  ): Promise<ProfilePluginMutationResult> {
    return this.withLock(lockOptions(signal), async () => {
      initProfile(this.options.profileDir, this.options.initialBundles)
      return this.mutateUnlocked('update', artifact.packageName, artifact, signal, receipts)
    })
  }

  /**
   * Remove one validated package name and reconcile the bundle order.
   * @param packageName - exact dependency name to remove.
   * @param signal - cancellation for lock waiting and pnpm execution.
   * @param receipts - optional local Hub receipts used for installed snapshots.
   * @returns the profile state before and after the successful removal.
   */
  async removePackage(
    packageName: string,
    signal?: AbortSignal,
    receipts: readonly ProfilePluginReceipt[] = [],
  ): Promise<ProfilePluginMutationResult> {
    assertPackageName(packageName)
    return this.withLock(lockOptions(signal), async () => {
      initProfile(this.options.profileDir, this.options.initialBundles)
      return this.mutateUnlocked('remove', packageName, undefined, signal, receipts)
    })
  }

  /**
   * Forward a CLI pnpm invocation through the shared lock. Output is always
   * retained under the configured byte budget; consumers may also forward it.
   * @param args - raw pnpm argv, with relative path specs anchored to cwd.
   * @param options - cancellation and output forwarding.
   * @returns bounded process outcome and reconciliation warnings.
   */
  async runPnpm(
    args: readonly string[],
    options: ProfilePluginPnpmOptions = {},
  ): Promise<ProfilePluginPnpmResult> {
    const invocationCwd = options.invocationCwd ?? process.cwd()
    return this.withLock(lockOptions(options.signal), async () => {
      initProfile(this.options.profileDir, this.options.initialBundles)
      const before = await inspectProfileInstalled(this.options.profileDir)
      const result = await this.spawnPnpm(
        args.map(argument => anchorProfilePluginSpec(argument, invocationCwd)),
        options,
      )
      if (result.aborted) throw new ProfilePluginError('pnpm operation was cancelled', 'OPERATION_ABORTED')
      if (result.timedOut) throw new ProfilePluginError('pnpm operation timed out', 'OPERATION_TIMEOUT')
      if (result.exitCode !== 0) return result
      const warnings = await reconcileProfilePluginBundles(before, this.options.profileDir)
      return { ...result, warnings }
    })
  }

  /**
   * Materialize a complete profile copy for a future staging generation.
   * @param destination - separate absolute directory that must not already exist.
   * @param signal - cancellation checked throughout the recursive copy.
   */
  async materializeProfile(destination: string, signal?: AbortSignal): Promise<void> {
    assertAbsolutePath(destination, 'staging profile')
    if (destination === this.options.profileDir || isWithin(destination, this.options.profileDir)
      || isWithin(this.options.profileDir, destination)) {
      throw new ProfilePluginError('staging profile must be separate from the active profile', 'PROFILE_INVALID')
    }
    await this.withLock(lockOptions(signal), async () => {
      throwIfAborted(signal)
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      try {
        await cp(this.options.profileDir, destination, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
          errorOnExist: true,
          force: false,
          preserveTimestamps: true,
          mode: constants.COPYFILE_FICLONE,
          filter: () => {
            signal?.throwIfAborted()
            return true
          },
        })
      } catch (error: unknown) {
        await removeOwnedDirectory(destination)
        if (isAbortError(error) || signal?.aborted === true) {
          throw new ProfilePluginError('profile materialization was cancelled', 'OPERATION_ABORTED', { cause: error })
        }
        throw new ProfilePluginError('profile materialization failed', 'PROFILE_INVALID', { cause: error })
      }
    })
  }

  /**
   * Validate manifests, lockfile, resolved packages, bundle patches, and user patch presence.
   * @param profileDir - explicit profile to validate, defaulting to the managed profile.
   * @returns the installed snapshot and all detected validation errors.
   */
  async validateProfile(profileDir = this.options.profileDir): Promise<ProfilePluginValidation> {
    const snapshot = await inspectProfileInstalled(profileDir)
    const errors: string[] = []
    for (const plugin of snapshot.plugins) {
      if (plugin.health !== 'ok') errors.push(`${plugin.packageName}: ${plugin.health}`)
    }
    if (!existsSync(join(profileDir, PROFILE_PATCH_FILENAME))) errors.push('profile patch layer is missing')
    for (const bundle of snapshot.bundles) {
      if (snapshot.dependencies[bundle] !== undefined) continue
      if (this.options.installAnchor === undefined) {
        errors.push(`${bundle}: bundle is not a profile dependency and has no installation anchor`)
        continue
      }
      try {
        const packageDir = resolveBundleDir('dsh profile manager', bundle, this.options.installAnchor, profileDir)
        const patch = parsePackageManifest(readFileSync(join(packageDir, 'package.json'), 'utf8'), bundle).bundlePatch
        if (patch === undefined || !existsSync(resolve(packageDir, patch))) errors.push(`${bundle}: bundle patch is missing`)
      } catch (error: unknown) {
        errors.push(`${bundle}: ${String(error)}`)
      }
    }
    return Object.freeze({ snapshot, valid: errors.length === 0, errors: Object.freeze(errors) })
  }

  private async mutateUnlocked(
    operation: ProfilePluginOperation,
    packageName: string,
    artifact: ProfilePluginArtifact | undefined,
    signal: AbortSignal | undefined,
    receipts: readonly ProfilePluginReceipt[],
  ): Promise<ProfilePluginMutationResult> {
    assertPackageName(packageName)
    const before = await inspectProfileInstalled(this.options.profileDir, receipts)
    const current = before.plugins.find(plugin => plugin.packageName === packageName)
    if (operation === 'install' && current !== undefined && current.health !== 'missing-package') {
      throw new ProfilePluginError(`package ${packageName} is already installed`, 'PROFILE_INVALID')
    }
    if (operation === 'update' && (current === undefined || current.health === 'missing-package')) {
      throw new ProfilePluginError(`package ${packageName} is not installed`, 'PROFILE_INVALID')
    }
    if (operation === 'remove' && current === undefined) {
      throw new ProfilePluginError(`package ${packageName} is not installed`, 'PROFILE_INVALID')
    }
    let checkedArtifact: ProfilePluginArtifact | undefined
    let args: string[]
    if (operation === 'remove') {
      args = ['remove', packageName]
    } else {
      if (artifact === undefined) throw new ProfilePluginError('typed install requires an artifact', 'INVALID_ARTIFACT')
      checkedArtifact = await verifyArtifact(artifact)
      args = ['add', '--save-exact', checkedArtifact.path]
    }
    const pnpm = await this.spawnPnpm(args, spawnOptions(signal))
    if (pnpm.aborted) throw new ProfilePluginError('pnpm operation was cancelled', 'OPERATION_ABORTED')
    if (pnpm.timedOut) throw new ProfilePluginError('pnpm operation timed out', 'OPERATION_TIMEOUT')
    if (pnpm.exitCode !== 0) throw classifyPnpmFailure(pnpm)
    const warnings = await reconcileProfilePluginBundles(before, this.options.profileDir)
    const after = await inspectProfileInstalled(this.options.profileDir, receipts)
    const installed = after.plugins.find(plugin => plugin.packageName === packageName)
    if (operation !== 'remove'
      && (installed === undefined
        || installed.version !== checkedArtifact?.version
        || installed.bundlePatch !== checkedArtifact?.bundlePatch
        || installed.health !== 'ok')) {
      throw new ProfilePluginError(`pnpm did not install the exact package ${packageName}@${checkedArtifact?.version}`, 'PNPM_FAILED')
    }
    return { operation, before, after, pnpm: { ...pnpm, warnings }, warnings }
  }

  private async spawnPnpm(args: readonly string[], options: ProfilePluginPnpmOptions): Promise<ProfilePluginPnpmResult> {
    const command = [...(this.options.pnpmCommand ?? DEFAULT_PNPM_COMMAND)]
    const executable = command.shift()
    if (executable === undefined) throw new ProfilePluginError('pnpm executable is not configured', 'PNPM_UNAVAILABLE')
    const stdout = new TextRetainer({ kind: 'tail', maxBytes: this.options.maxOutputBytes })
    const stderr = new TextRetainer({ kind: 'tail', maxBytes: this.options.maxOutputBytes })
    let timedOut = false
    let aborted = false
    let terminating = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(executable, [...command, ...args], {
        cwd: this.options.profileDir,
        env: this.options.env,
        detached: process.platform !== 'win32',
        windowsHide: true,
        shell: false,
        stdio: [options.inheritStdin === true ? 'inherit' : 'ignore', 'pipe', 'pipe'],
      })
    } catch (error: unknown) {
      throw new ProfilePluginError(`pnpm could not be started: ${String(error)}`, 'PNPM_UNAVAILABLE', { cause: error })
    }
    const terminate = (): void => {
      if (terminating || child.exitCode !== null || child.signalCode !== null) return
      terminating = true
      try {
        if (process.platform === 'win32') child.kill('SIGTERM')
        else if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
      } catch { /* process exit raced cancellation */ }
      killTimer = setTimeout(() => {
        try {
          if (process.platform === 'win32') child.kill('SIGKILL')
          else if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
        } catch { /* process exit raced escalation */ }
      }, this.options.terminationGraceMs)
    }
    const onAbort = (): void => { aborted = true; terminate() }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted === true) onAbort()
    const timeout = setTimeout(() => { timedOut = true; terminate() }, this.options.processTimeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout.push(chunk)
      if (options.forwardOutput === true) process.stdout.write(chunk)
      options.onStdout?.(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk)
      if (options.forwardOutput === true) process.stderr.write(chunk)
      options.onStderr?.(chunk)
    })
    return new Promise((resolveResult, rejectResult) => {
      let spawnError: unknown
      child.once('error', (error) => { spawnError = error })
      child.once('close', (exitCode, signal) => {
        clearTimeout(timeout)
        if (killTimer !== undefined) clearTimeout(killTimer)
        options.signal?.removeEventListener('abort', onAbort)
        if (spawnError !== undefined) {
          const code = (spawnError as NodeJS.ErrnoException).code
          rejectResult(new ProfilePluginError(
            code === 'ENOENT' ? 'pnpm was not found on PATH' : `pnpm could not be started: ${errorMessage(spawnError)}`,
            'PNPM_UNAVAILABLE',
            { cause: spawnError },
          ))
          return
        }
        const retainedStdout = stdout.finish()
        const retainedStderr = stderr.finish()
        resolveResult({
          exitCode,
          signal,
          stdout: retainedStdout.text,
          stderr: retainedStderr.text,
          stdoutOmittedBytes: retainedStdout.omittedBytes.kind === 'exact' ? retainedStdout.omittedBytes.count : 0,
          stderrOmittedBytes: retainedStderr.omittedBytes.kind === 'exact' ? retainedStderr.omittedBytes.count : 0,
          timedOut,
          aborted,
          warnings: Object.freeze([]),
        })
      })
    })
  }

  private withLock<T>(options: ProfilePluginLockOptions, operation: () => T | Promise<T>): Promise<T> {
    return withProfilePluginLock(
      this.options.lockPath,
      options,
      this.options.lockTimeoutMs,
      this.options.processIdentity,
      operation,
    ).catch((error: unknown) => {
      if (error instanceof ProfilePluginError) throw error
      if (isAbortError(error)) throw new ProfilePluginError('profile operation was cancelled', 'OPERATION_ABORTED', { cause: error })
      throw error
    })
  }
}

/**
 * Create a manager with the shipped base bundle for a generic profile.
 * @param options - explicit manager policy with an optional initial bundle list.
 * @returns a manager for the supplied profile and shared lock.
 */
export function createProfilePluginManager(options: Omit<ProfilePluginManagerOptions, 'initialBundles'> & {
  readonly initialBundles?: readonly string[]
}): ProfilePluginManager {
  return new ProfilePluginManager({ ...options, initialBundles: options.initialBundles ?? DEFAULT_PROFILE_BUNDLES })
}

async function readProfileLockfile(profileDir: string): Promise<ProfilePluginLockfile> {
  const path = join(profileDir, 'pnpm-lock.yaml')
  let raw: string
  try { raw = await readFile(path, 'utf8') } catch (error: unknown) {
    if (isCode(error, 'ENOENT')) return Object.freeze({ present: false, importer: Object.freeze({}) })
    throw new ProfilePluginError(`cannot read profile lockfile ${path}`, 'PROFILE_INVALID', { cause: error })
  }
  let parsed: unknown
  try { parsed = yaml.load(raw) } catch (error: unknown) {
    throw new ProfilePluginError(`profile lockfile ${path} is invalid`, 'PROFILE_INVALID', { cause: error })
  }
  if (!isRecord(parsed)) throw new ProfilePluginError(`profile lockfile ${path} is invalid`, 'PROFILE_INVALID')
  const importers = isRecord(parsed.importers) ? parsed.importers : {}
  const root = isRecord(importers['.']) ? importers['.'] : {}
  const importer: Record<string, ProfilePluginLockEntry> = {}
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const values = isRecord(root[section]) ? root[section] : {}
    for (const [name, value] of Object.entries(values)) {
      if (importer[name] !== undefined) continue
      if (typeof value === 'string') importer[name] = Object.freeze({ version: value })
      else if (isRecord(value)) {
        const version = typeof value.version === 'string' ? value.version : undefined
        const specifier = typeof value.specifier === 'string' ? value.specifier : undefined
        const resolution = findPackageResolution(parsed.packages, name, version)
        importer[name] = Object.freeze({
          ...specifier === undefined ? {} : { specifier },
          ...version === undefined ? {} : { version },
          ...resolution?.integrity === undefined ? {} : { integrity: resolution.integrity },
          ...resolution?.key === undefined ? {} : { resolution: resolution.key },
        })
      }
    }
  }
  return Object.freeze({ present: true, importer: Object.freeze(importer), digest: sha256(raw) })
}

function findPackageResolution(packages: unknown, packageName: string, version: string | undefined): {
  readonly key: string
  readonly integrity?: string
} | undefined {
  if (!isRecord(packages)) return undefined
  const prefix = `${packageName}@`
  for (const [key, value] of Object.entries(packages)) {
    if (!key.startsWith(prefix) || !isRecord(value)) continue
    const resolution = isRecord(value.resolution) ? value.resolution : {}
    const integrity = typeof resolution.integrity === 'string' ? resolution.integrity : undefined
    if (version === undefined || key.includes(`@${version}`) || value.version === version) {
      return { key, ...integrity === undefined ? {} : { integrity } }
    }
  }
  return undefined
}

async function readInstalledBundlePatch(profileDir: string, packageName: string): Promise<string | undefined> {
  try {
    const parsed = parsePackageManifest(await readFile(join(profileDir, 'node_modules', packageName, 'package.json'), 'utf8'), packageName)
    if (parsed.bundlePatch === undefined || !isSafePackageRelativePath(parsed.bundlePatch)) return undefined
    if (!existsSync(resolve(profileDir, 'node_modules', packageName, parsed.bundlePatch))) return undefined
    return parsed.bundlePatch
  } catch { return undefined }
}

function parsePackageManifest(raw: string, expectedName: string): { readonly version: string; readonly bundlePatch?: string } {
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed) || parsed.name !== expectedName || typeof parsed.version !== 'string' || parsed.version === '') {
    throw new Error(`package manifest for ${expectedName} is invalid`)
  }
  const dsh = isRecord(parsed.dsh) ? parsed.dsh : {}
  const bundle = isRecord(dsh.bundle) ? dsh.bundle : {}
  const patch = bundle.patch
  if (patch !== undefined && typeof patch !== 'string') throw new Error(`dsh.bundle.patch for ${expectedName} is invalid`)
  return { version: parsed.version, ...patch === undefined ? {} : { bundlePatch: patch } }
}

function validateArtifact(artifact: ProfilePluginArtifact): ProfilePluginArtifact {
  assertAbsolutePath(artifact.path, 'artifact')
  assertPackageName(artifact.packageName)
  if (artifact.version === '') throw new ProfilePluginError('artifact version is empty', 'INVALID_ARTIFACT')
  if (artifact.sizeBytes !== undefined && (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 0)) {
    throw new ProfilePluginError('artifact size is invalid', 'INVALID_ARTIFACT')
  }
  if (artifact.bundlePatch !== undefined && !isSafePackageRelativePath(artifact.bundlePatch)) {
    throw new ProfilePluginError('artifact bundle patch must be package-relative', 'INVALID_ARTIFACT')
  }
  return artifact
}

function detachArtifact(artifact: ProfilePluginArtifact): ProfilePluginArtifact {
  const checked = validateArtifact(artifact)
  const digest = checked.digest === undefined ? undefined : Object.freeze({ ...checked.digest })
  return Object.freeze({
    ...checked,
    ...digest === undefined ? {} : { digest },
    ...checked.lifecycleScripts === undefined
      ? {}
      : { lifecycleScripts: Object.freeze([...checked.lifecycleScripts]) },
  })
}

async function verifyArtifact(artifact: ProfilePluginArtifact): Promise<ProfilePluginArtifact> {
  const checked = validateArtifact(artifact)
  let info
  try {
    info = await stat(checked.path)
    if (!info.isFile() || lstatSync(checked.path).isSymbolicLink()) throw new Error('artifact is not a regular file')
  } catch (error: unknown) {
    throw new ProfilePluginError(`artifact ${checked.path} is unavailable`, 'INVALID_ARTIFACT', { cause: error })
  }
  if (checked.sizeBytes !== undefined && info.size !== checked.sizeBytes) {
    throw new ProfilePluginError('artifact size changed before installation', 'INVALID_ARTIFACT')
  }
  if (checked.digest !== undefined) {
    const digest = await digestFile(checked.path)
    const expected = checked.digest.encoding === 'hex' ? digest.toString('hex') : digest.toString('base64')
    if (expected !== checked.digest.value) throw new ProfilePluginError('artifact digest changed before installation', 'INVALID_ARTIFACT')
  }
  return checked
}

async function digestFile(path: string): Promise<Buffer> {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) {
    if (!Buffer.isBuffer(chunk)) throw new ProfilePluginError('artifact stream returned non-binary data', 'INVALID_ARTIFACT')
    hash.update(chunk)
  }
  return hash.digest()
}

function classifyPnpmFailure(result: ProfilePluginPnpmResult): ProfilePluginError {
  const output = [result.stderr, result.stdout].filter(value => value !== '').join('\n')
  const diagnostic = boundedDiagnostic(output)
  if (/allowBuilds|approve-builds|blocked.*build|build script/iu.test(output)) {
    return new ProfilePluginError(`pnpm blocked a lifecycle build${diagnostic}`, 'BUILD_NOT_ALLOWED')
  }
  return new ProfilePluginError(`pnpm failed with exit code ${String(result.exitCode)}${diagnostic}`, 'PNPM_FAILED')
}

function boundedDiagnostic(text: string): string {
  return text === '' ? '' : `: ${text.replace(/\s+/gu, ' ').trim().slice(-512)}`
}

async function reclaimStaleLock(lockPath: string, processIdentity: ProfilePluginProcessIdentity): Promise<boolean> {
  const owner = await readLockOwner(lockPath)
  if (owner === undefined) return false
  const alive = await processIsOwnerAlive(owner, processIdentity)
  if (alive) return false
  const stalePath = `${lockPath}.stale-${randomId()}`
  try {
    await rename(lockPath, stalePath)
  } catch (error: unknown) {
    if (isCode(error, 'ENOENT')) return true
    return false
  }
  await removeOwnedDirectory(stalePath)
  return true
}

async function readLockOwner(lockPath: string): Promise<ProfilePluginLockOwner | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(lockPath, LOCK_METADATA_FILENAME), 'utf8')) as Partial<ProfilePluginLockOwner>
    if (!Number.isInteger(parsed.pid) || typeof parsed.nonce !== 'string' || typeof parsed.transactionId !== 'string') return undefined
    return parsed as ProfilePluginLockOwner
  } catch { return undefined }
}

async function processIsOwnerAlive(owner: ProfilePluginLockOwner, processIdentity: ProfilePluginProcessIdentity): Promise<boolean> {
  let alive = true
  try { process.kill(owner.pid, 0) } catch (error: unknown) {
    alive = isCode(error, 'EPERM')
  }
  if (!alive) return false
  const identity = await processIdentity(owner.pid)
  if (identity === undefined || owner.identity === undefined) return true
  return identity === owner.identity
}

async function releaseProfilePluginLock(lockPath: string, nonce: string): Promise<void> {
  const owner = await readLockOwner(lockPath)
  if (owner?.nonce !== nonce) return
  try {
    if (lstatSync(lockPath).isSymbolicLink()) return
  } catch { return }
  await rm(lockPath, { recursive: true, force: true })
}

async function defaultProcessIdentity(pid: number): Promise<string | undefined> {
  if (process.platform === 'linux') {
    try {
      const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      const afterCommand = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      const startTicks = afterCommand[19]
      return startTicks === undefined ? undefined : `linux:${bootId}:${startTicks}`
    } catch { return undefined }
  }
  if (process.platform === 'darwin') {
    try {
      const result = await runNativeCommand('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], new AbortController().signal)
      const value = result.stdout.trim()
      return value === '' ? undefined : `darwin:${value}`
    } catch { return undefined }
  }
  return undefined
}

async function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolveRetry, rejectRetry) => {
    const abort = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      rejectRetry(new ProfilePluginError('profile operation was cancelled', 'OPERATION_ABORTED', { cause: signal?.reason }))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolveRetry()
    }, delay)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted === true) abort()
  })
}

function objectStringMap(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new ProfilePluginError(`${label} must be an object`, 'PROFILE_INVALID')
  const output: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new ProfilePluginError(`${label}.${key} must be a string`, 'PROFILE_INVALID')
    output[key] = item
  }
  return output
}

function stringList(value: unknown, label: string): string[] {
  if (value === undefined) return []
  if (!isStringArray(value)) {
    throw new ProfilePluginError(`${label} must be a string array`, 'PROFILE_INVALID')
  }
  return [...value]
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
function randomId(): string { return randomBytes(12).toString('hex') }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown): item is string => typeof item === 'string')
}
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}
function isCode(error: unknown, code: string): boolean { return (error as NodeJS.ErrnoException | null)?.code === code }
function isAbortError(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError' }
function assertAbsolutePath(path: string, label: string): void {
  if (!isAbsolute(path) || path === dirname(path)) throw new ProfilePluginError(`${label} must be a non-root absolute path`, 'PROFILE_INVALID')
}
function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ProfilePluginError(`${label} must be a positive integer`, 'PROFILE_INVALID')
}
function assertPackageName(name: string): void {
  if (!PACKAGE_NAME_PATTERN.test(name)) throw new ProfilePluginError(`invalid package name ${JSON.stringify(name)}`, 'PROFILE_INVALID')
}
function isSafePackageRelativePath(path: string): boolean {
  if (path === '' || isAbsolute(path) || path.includes('\\')) return false
  const segments = path.split('/').filter(segment => segment !== '.' && segment !== '')
  return segments.length > 0 && !segments.includes('..')
}
function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
function isWithin(child: string, parent: string): boolean {
  const suffix = relative(parent, child)
  return suffix !== '' && !suffix.startsWith(`..${sep}`) && suffix !== '..' && !isAbsolute(suffix)
}
async function removeOwnedDirectory(path: string): Promise<void> {
  try {
    if (!lstatSync(path).isSymbolicLink()) await rm(path, { recursive: true, force: true })
  } catch (error: unknown) {
    if (!isCode(error, 'ENOENT')) throw error
  }
}

function lockOptions(signal?: AbortSignal, transactionId?: string): ProfilePluginLockOptions {
  return {
    ...signal === undefined ? {} : { signal },
    ...transactionId === undefined ? {} : { transactionId },
  }
}

function spawnOptions(signal?: AbortSignal): ProfilePluginPnpmOptions {
  return signal === undefined ? {} : { signal }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new ProfilePluginError('profile operation was cancelled', 'OPERATION_ABORTED', { cause: signal.reason })
  }
}
