/** Maintenance handoff, generation activation, ready markers, and startup recovery. */

import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PluginHubError,
  type PluginMaintenanceHandoff,
  type PluginTransactionId,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import {
  inspectProfileInstalled,
  resolveProfilePluginLockPath,
  withProfilePluginLock,
} from '@lingxi-ai-cn/dsh-profile-plugin-manager'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { LocalPluginInstallLifecycle } from './install.ts'
import {
  readJournal,
  transactionPaths,
  writeJsonDurable,
  type LocalPluginRelaunchRequest,
  type LocalPluginTransactionJournal,
  type LocalPluginTransactionPaths,
} from './transactions.ts'

const MAINTENANCE_JOURNAL_ENV = 'DSH_PLUGIN_MAINTENANCE_JOURNAL'
const MAINTENANCE_NONCE_ENV = 'DSH_PLUGIN_MAINTENANCE_NONCE'
const DEFAULT_PARENT_EXIT_TIMEOUT_MS = 30_000
const DEFAULT_READY_TIMEOUT_MS = 30_000
const HANDOFF_START_TIMEOUT_MS = 5_000
const POLL_MS = 50
const ENV_ALLOWLIST = new Set([
  'COLORTERM', 'FORCE_COLOR', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'LOGNAME', 'NO_COLOR',
  'PATH', 'SHELL', 'TERM', 'TMPDIR', 'USER', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  'XDG_STATE_HOME', 'DSH_HOME', 'DSH_TELEMETRY_DISABLED',
])

/** Test overrides for the maintenance process and trusted relaunch descriptor. */
export interface LocalPluginMaintenanceOptions {
  /** Test-only argv prefix that replaces the built maintenance helper command. */
  readonly maintenanceCommand?: readonly string[]
  /** Test-only trusted relaunch request that replaces the current DSH invocation. */
  readonly relaunch?: LocalPluginRelaunchRequest
  /** Test-only base environment supplied to the maintenance helper. */
  readonly environment?: NodeJS.ProcessEnv
}

interface PendingMaintenanceBoot {
  readonly journal: string
  readonly nonce: string
}

/** Provider-side owner for helper startup and relaunched-TUI readiness. */
export class LocalPluginMaintenanceController {
  private readonly pendingBoot: PendingMaintenanceBoot | undefined

  /**
   * @param lifecycle - trusted active-profile lifecycle.
   * @param options - test-only process overrides; production derives the current DSH invocation.
   */
  constructor(
    readonly lifecycle: LocalPluginInstallLifecycle,
    readonly options: LocalPluginMaintenanceOptions = {},
  ) {
    this.pendingBoot = pendingBoot(options.environment ?? process.env)
  }

  /**
   * Start the detached helper and wait until it owns the shared profile lock.
   * @param transactionId - exact staged transaction id.
   * @param signal - cancellation before helper ownership transfers.
   * @returns durable waiting handoff.
   */
  async createHandoff(
    transactionId: PluginTransactionId,
    signal?: AbortSignal,
  ): Promise<PluginMaintenanceHandoff> {
    throwIfAborted(signal)
    const paths = transactionPaths(this.lifecycle.options.dataDir, transactionId)
    const journal = await readJournal(paths.journal)
    validateJournalPaths(journal, paths, this.lifecycle.options.profileDir)
    if (journal.state !== 'staged' || journal.afterRevision === undefined) {
      throw new PluginHubError('Plugin transaction is not ready for activation.', 'HANDOFF_FAILED')
    }
    const active = await this.lifecycle.manager.inspectInstalled()
    const staging = await inspectProfileInstalled(paths.stagingProfile)
    if (active.revision !== journal.beforeRevision || staging.revision !== journal.afterRevision) {
      throw new PluginHubError('Profile changed before activation handoff.', 'PROFILE_CHANGED')
    }
    const nonce = randomBytes(32).toString('hex')
    const relaunch = validateRelaunch(this.options.relaunch ?? currentRelaunch())
    const handoff: LocalPluginTransactionJournal = {
      ...journal,
      state: 'handoff-ready',
      updatedAt: new Date().toISOString(),
      handoffNonce: nonce,
      readyMarker: paths.readyMarker,
      relaunch,
    }
    await writeJsonDurable(paths.journal, handoff)
    const command = [...(this.options.maintenanceCommand ?? defaultMaintenanceCommand())]
    const executable = command.shift()
    if (executable === undefined) throw new PluginHubError('Maintenance helper is not configured.', 'HANDOFF_FAILED')
    let child: ChildProcess
    try {
      child = spawn(executable, [
        ...command,
        '--journal', paths.journal,
        '--nonce', nonce,
        '--parent-pid', String(process.pid),
      ], {
        cwd: relaunch.cwd,
        env: relaunch.env,
        detached: process.platform !== 'win32',
        shell: false,
        stdio: 'inherit',
        windowsHide: false,
      })
    } catch (error: unknown) {
      await writeHandoffFailure(paths, handoff, error)
      throw new PluginHubError('Maintenance helper could not be started.', 'HANDOFF_FAILED', { cause: error })
    }
    try {
      await waitForSpawn(child)
      await waitForJournalState(paths.journal, 'waiting-for-old-process', HANDOFF_START_TIMEOUT_MS, child, signal)
      child.unref()
      return Object.freeze({
        transactionId,
        state: 'waiting-for-old-process',
        createdAt: new Date().toISOString(),
      })
    } catch (error: unknown) {
      await terminateChild(child)
      await writeHandoffFailure(paths, handoff, error)
      if (error instanceof PluginHubError) throw error
      throw new PluginHubError('Maintenance helper did not accept the handoff.', 'HANDOFF_FAILED', { cause: error })
    }
  }

  /**
   * Mark a relaunched active profile ready after the TUI has mounted.
   * A normal process without maintenance environment is a no-op.
   * @param signal - caller cancellation while the helper publishes boot state.
   */
  async markReady(signal?: AbortSignal): Promise<void> {
    if (this.pendingBoot === undefined) return
    const { journal: journalPath, nonce } = this.pendingBoot
    const journal = await waitForBootPending(journalPath, nonce, signal)
    const paths = pathsFromJournalLocation(journalPath)
    validateJournalPaths(journal, paths, this.lifecycle.options.profileDir)
    if (journal.newPid !== process.pid || journal.afterRevision === undefined) {
      throw new PluginHubError('Maintenance ready marker does not belong to this process.', 'HANDOFF_FAILED')
    }
    const active = await this.lifecycle.manager.inspectInstalled()
    if (active.revision !== journal.afterRevision) {
      throw new PluginHubError('Relaunched profile revision does not match the staged transaction.', 'PROFILE_CHANGED')
    }
    await writeJsonDurable(paths.readyMarker, {
      transactionId: journal.transactionId,
      nonce,
      pid: process.pid,
      profileRevision: active.revision,
      readyAt: new Date().toISOString(),
    })
  }
}

/** Maintenance binary request parsed from fixed argv flags. */
export interface RunMaintenanceRequest {
  readonly journal: string
  readonly nonce: string
  readonly parentPid: number
}

/** Testable timeout policy for the package-owned maintenance process. */
export interface RunMaintenanceOptions {
  readonly parentExitTimeoutMs?: number
  readonly readyTimeoutMs?: number
}

/**
 * Activate one authenticated staged generation and restore the old generation on boot failure.
 * @param request - exact journal, nonce, and old-process identity.
 * @param options - bounded wait overrides used by tests.
 */
export async function runMaintenanceHandoff(
  request: RunMaintenanceRequest,
  options: RunMaintenanceOptions = {},
): Promise<void> {
  const paths = pathsFromJournalLocation(request.journal)
  await assertPrivateJournal(paths)
  let journal = await readJournal(paths.journal)
  validateJournalPaths(journal, paths, journal.activeProfile)
  if (journal.state !== 'handoff-ready' || journal.handoffNonce !== request.nonce
    || journal.ownerPid !== request.parentPid || journal.relaunch === undefined
    || journal.afterRevision === undefined || journal.readyMarker !== paths.readyMarker) {
    throw new PluginHubError('Maintenance handoff authentication failed.', 'HANDOFF_FAILED')
  }
  const relaunch = journal.relaunch
  const lockPath = resolveProfilePluginLockPath(journal.activeProfile)
  await withProfilePluginLock(lockPath, { transactionId: journal.transactionId }, 5_000, undefined, async () => {
    journal = await readJournal(paths.journal)
    if (journal.state !== 'handoff-ready' || journal.handoffNonce !== request.nonce) {
      throw new PluginHubError('Maintenance transaction changed before lock ownership.', 'HANDOFF_FAILED')
    }
    journal = await updateJournal(paths, journal, { state: 'waiting-for-old-process' })
    await waitForProcessExit(request.parentPid, options.parentExitTimeoutMs ?? DEFAULT_PARENT_EXIT_TIMEOUT_MS)
    const active = await inspectProfileInstalled(journal.activeProfile)
    const staging = await inspectProfileInstalled(paths.stagingProfile)
    if (active.revision !== journal.beforeRevision || staging.revision !== journal.afterRevision) {
      throw new PluginHubError('Profile changed before maintenance activation.', 'PROFILE_CHANGED')
    }
    let launched: LaunchedProfile | undefined
    try {
      await mkdir(dirname(paths.oldGenerationProfile), { recursive: true, mode: 0o700 })
      await rename(journal.activeProfile, paths.oldGenerationProfile)
      journal = await updateJournal(paths, journal, { state: 'old-moved' })
      await rename(paths.stagingProfile, journal.activeProfile)
      journal = await updateJournal(paths, journal, { state: 'new-active' })
      await unlink(paths.readyMarker).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
      launched = await launchProfile(relaunch, paths, request.nonce)
      journal = await updateJournal(paths, journal, { state: 'boot-pending', newPid: launched.pid })
      const ready = await waitForReady(paths.readyMarker, journal, launched,
        options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS)
      if (!ready) throw new PluginHubError('Relaunched TUI exited before its ready marker.', 'HANDOFF_FAILED')
      if (journal.receipt !== undefined) {
        await writeJsonDurable(paths.receipt, { ...journal.receipt, committedAt: new Date().toISOString() })
      }
      await updateJournal(paths, journal, { state: 'committed' })
      launched.child.unref()
    } catch (error: unknown) {
      if (launched !== undefined) await terminateChild(launched.child)
      const restored = await restoreOldGeneration(paths, journal)
      if (restored) await launchRestoredProfile(relaunch)
      throw error
    }
  })
}

/**
 * Recover an interrupted TUI generation swap before the launcher loads or initializes its profile.
 * @param home - resolved DSH home.
 * @param profile - fixed shipped profile name.
 */
export async function recoverPluginHubProfile(home: string, profile: 'tui'): Promise<void> {
  const activeProfile = resolveProfileDir(profile, home)
  const boot = pendingBoot(process.env)
  if (boot !== undefined) {
    const paths = pathsFromJournalLocation(boot.journal)
    const journal = await readJournal(paths.journal)
    validateJournalPaths(journal, paths, activeProfile)
    if (journal.handoffNonce !== boot.nonce || (journal.state !== 'new-active' && journal.state !== 'boot-pending')) {
      throw new PluginHubError('Relaunch maintenance context is invalid.', 'HANDOFF_FAILED')
    }
    const active = await inspectProfileInstalled(activeProfile)
    if (journal.afterRevision === undefined || active.revision !== journal.afterRevision) {
      throw new PluginHubError('Relaunched active profile does not match the maintenance journal.', 'PROFILE_CHANGED')
    }
    return
  }
  const transactionRoot = join(home, 'plugin-hub', 'transactions')
  let entries
  try { entries = await readdir(transactionRoot, { withFileTypes: true }) } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const candidates: { paths: LocalPluginTransactionPaths; journal: LocalPluginTransactionJournal }[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[0-9a-f]{32}$/u.test(entry.name)) continue
    const paths = transactionPaths(join(home, 'plugin-hub'), entry.name)
    const journal = await readJournal(paths.journal)
    validateJournalPaths(journal, paths, activeProfile)
    if (needsRecovery(journal.state)) candidates.push({ paths, journal })
  }
  if (candidates.length > 1) {
    throw new PluginHubError('Multiple incomplete Plugin Hub transactions require manual recovery.', 'HANDOFF_FAILED')
  }
  const candidate = candidates[0]
  if (candidate === undefined) return
  await withProfilePluginLock(resolveProfilePluginLockPath(activeProfile),
    { transactionId: candidate.journal.transactionId }, 5_000, undefined, async () => {
      const current = await readJournal(candidate.paths.journal)
      await recoverInterrupted(candidate.paths, current)
    })
}

function currentRelaunch(): LocalPluginRelaunchRequest {
  const executable = process.execPath
  const args = process.argv.slice(1)
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && (ENV_ALLOWLIST.has(key) || key.startsWith('LC_'))) env[key] = value
  }
  return { executable, args: Object.freeze(args), cwd: process.cwd(), env: Object.freeze(env) }
}

function validateRelaunch(value: LocalPluginRelaunchRequest): LocalPluginRelaunchRequest {
  if (!isAbsolute(value.executable) || !isAbsolute(value.cwd) || value.args.length === 0 || value.args.length > 64
    || value.args.some(argument => argument.length > 4096 || argument.includes('\0'))
    || Object.entries(value.env).some(([key, item]) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || item.includes('\0'))) {
    throw new PluginHubError('Current DSH invocation cannot be safely relaunched.', 'HANDOFF_FAILED')
  }
  return Object.freeze({ executable: value.executable, args: Object.freeze([...value.args]), cwd: value.cwd,
    env: Object.freeze({ ...value.env }) })
}

function defaultMaintenanceCommand(): readonly string[] {
  if (import.meta.url.endsWith('.ts')) {
    return [process.execPath, '--import', 'tsx/esm', fileURLToPath(new URL('./maintenance-bin.ts', import.meta.url))]
  }
  return [process.execPath, fileURLToPath(new URL('./maintenance-bin.js', import.meta.url))]
}

function pendingBoot(environment: NodeJS.ProcessEnv): PendingMaintenanceBoot | undefined {
  const journal = environment[MAINTENANCE_JOURNAL_ENV]
  const nonce = environment[MAINTENANCE_NONCE_ENV]
  if (journal === undefined && nonce === undefined) return undefined
  if (journal === undefined || nonce === undefined || !isAbsolute(journal) || !/^[0-9a-f]{64}$/u.test(nonce)) {
    throw new PluginHubError('Maintenance relaunch environment is invalid.', 'HANDOFF_FAILED')
  }
  return { journal, nonce }
}

function pathsFromJournalLocation(journal: string): LocalPluginTransactionPaths {
  if (!isAbsolute(journal) || basename(journal) !== 'journal.json') {
    throw new PluginHubError('Maintenance journal path is invalid.', 'HANDOFF_FAILED')
  }
  const transactionId = basename(dirname(journal))
  const transactionRoot = dirname(dirname(journal))
  if (basename(transactionRoot) !== 'transactions') {
    throw new PluginHubError('Maintenance journal path is invalid.', 'HANDOFF_FAILED')
  }
  const paths = transactionPaths(dirname(transactionRoot), transactionId)
  if (resolve(paths.journal) !== resolve(journal)) {
    throw new PluginHubError('Maintenance journal path is invalid.', 'HANDOFF_FAILED')
  }
  return paths
}

function validateJournalPaths(
  journal: LocalPluginTransactionJournal,
  paths: LocalPluginTransactionPaths,
  activeProfile: string,
): void {
  if (journal.transactionId !== basename(paths.transactionDir)
    || resolve(journal.activeProfile) !== resolve(activeProfile)
    || resolve(journal.stagingProfile) !== resolve(paths.stagingProfile)
    || resolve(journal.oldGenerationProfile) !== resolve(paths.oldGenerationProfile)
    || resolve(journal.failedGenerationProfile) !== resolve(paths.failedGenerationProfile)) {
    throw new PluginHubError('Plugin transaction journal paths are invalid.', 'HANDOFF_FAILED')
  }
}

async function assertPrivateJournal(paths: LocalPluginTransactionPaths): Promise<void> {
  for (const path of [paths.transactionDir, paths.journal]) {
    const stats = await lstat(path)
    if ((path === paths.transactionDir && !stats.isDirectory())
      || (path === paths.journal && !stats.isFile()) || stats.isSymbolicLink()
      || (process.platform !== 'win32' && (stats.mode & 0o077) !== 0)
      || (process.getuid !== undefined && stats.uid !== process.getuid())) {
      throw new PluginHubError('Maintenance journal permissions are unsafe.', 'HANDOFF_FAILED')
    }
  }
}

async function updateJournal(
  paths: LocalPluginTransactionPaths,
  journal: LocalPluginTransactionJournal,
  update: Partial<LocalPluginTransactionJournal>,
): Promise<LocalPluginTransactionJournal> {
  const next = { ...journal, ...update, updatedAt: new Date().toISOString() }
  await writeJsonDurable(paths.journal, next)
  return next
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (processAlive(pid)) {
    if (Date.now() >= deadline) throw new PluginHubError('Old TUI did not exit before maintenance timeout.', 'HANDOFF_FAILED')
    await delay(POLL_MS)
  }
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

interface LaunchedProfile {
  readonly child: ChildProcess
  readonly pid: number
  readonly exited: Promise<void>
}

async function launchProfile(
  relaunch: LocalPluginRelaunchRequest,
  paths: LocalPluginTransactionPaths,
  nonce: string,
): Promise<LaunchedProfile> {
  const child = spawn(relaunch.executable, relaunch.args, {
    cwd: relaunch.cwd,
    env: { ...relaunch.env, [MAINTENANCE_JOURNAL_ENV]: paths.journal, [MAINTENANCE_NONCE_ENV]: nonce },
    detached: process.platform !== 'win32',
    shell: false,
    stdio: 'inherit',
    windowsHide: false,
  })
  await waitForSpawn(child)
  const pid = child.pid
  if (pid === undefined) throw new PluginHubError('Relaunched TUI has no process id.', 'HANDOFF_FAILED')
  const exited = new Promise<void>((resolveExit) => { child.once('exit', () => { resolveExit() }) })
  return { child, pid, exited }
}

async function launchRestoredProfile(relaunch: LocalPluginRelaunchRequest): Promise<void> {
  const child = spawn(relaunch.executable, relaunch.args, {
    cwd: relaunch.cwd,
    env: relaunch.env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: 'inherit',
    windowsHide: false,
  })
  await waitForSpawn(child)
  child.unref()
}

async function waitForReady(
  marker: string,
  journal: LocalPluginTransactionJournal,
  launched: LaunchedProfile,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await readReadyMarker(marker)
    if (value !== undefined && value.transactionId === journal.transactionId
      && value.nonce === journal.handoffNonce && value.pid === launched.pid
      && value.profileRevision === journal.afterRevision) return true
    if (Date.now() >= deadline) {
      throw new PluginHubError('Relaunched TUI did not become ready before timeout.', 'HANDOFF_FAILED')
    }
    const outcome = await Promise.race([launched.exited.then(() => 'exit' as const), delay(POLL_MS).then(() => 'poll' as const)])
    if (outcome === 'exit') return false
  }
}

async function readReadyMarker(path: string): Promise<{
  transactionId?: unknown
  nonce?: unknown
  pid?: unknown
  profileRevision?: unknown
} | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return typeof value === 'object' && value !== null ? value : undefined
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return undefined
    throw error
  }
}

async function restoreOldGeneration(
  paths: LocalPluginTransactionPaths,
  journal: LocalPluginTransactionJournal,
): Promise<boolean> {
  if (!(await pathExists(paths.oldGenerationProfile))) {
    await updateJournal(paths, journal, { state: 'failed', error: { code: 'HANDOFF_FAILED', message: 'Activation failed before the old profile moved.' } })
    return false
  }
  let restoring = await updateJournal(paths, journal, { state: 'restoring' })
  if (await pathExists(journal.activeProfile)) {
    await mkdir(dirname(paths.failedGenerationProfile), { recursive: true, mode: 0o700 })
    if (await pathExists(paths.failedGenerationProfile)) {
      restoring = await updateJournal(paths, restoring, { state: 'recovery-failed',
        error: { code: 'HANDOFF_FAILED', message: 'Failed generation destination already exists.' } })
      throw new PluginHubError(restoring.error?.message ?? 'Profile recovery failed.', 'HANDOFF_FAILED')
    }
    await rename(journal.activeProfile, paths.failedGenerationProfile)
  }
  await rename(paths.oldGenerationProfile, journal.activeProfile)
  await updateJournal(paths, restoring, { state: 'restored' })
  return true
}

async function recoverInterrupted(
  paths: LocalPluginTransactionPaths,
  journal: LocalPluginTransactionJournal,
): Promise<void> {
  validateJournalPaths(journal, paths, journal.activeProfile)
  if (journal.state === 'boot-pending' && journal.afterRevision !== undefined && journal.newPid !== undefined) {
    const marker = await readReadyMarker(paths.readyMarker)
    if (marker?.transactionId === journal.transactionId && marker.nonce === journal.handoffNonce
      && marker.pid === journal.newPid && marker.profileRevision === journal.afterRevision) {
      const active = await inspectProfileInstalled(journal.activeProfile)
      if (active.revision !== journal.afterRevision) {
        throw new PluginHubError('Ready transaction does not match the active profile.', 'PROFILE_CHANGED')
      }
      if (journal.receipt !== undefined) {
        await writeJsonDurable(paths.receipt, { ...journal.receipt, committedAt: new Date().toISOString() })
      }
      await updateJournal(paths, journal, { state: 'committed' })
      return
    }
  }
  if (journal.state === 'restoring' && await pathExists(journal.activeProfile)
    && !(await pathExists(paths.oldGenerationProfile))) {
    const active = await inspectProfileInstalled(journal.activeProfile)
    if (active.revision === journal.beforeRevision) {
      await updateJournal(paths, journal, { state: 'restored' })
      return
    }
  }
  if (journal.state === 'handoff-ready' || journal.state === 'waiting-for-old-process') {
    if (await pathExists(journal.activeProfile)) {
      const active = await inspectProfileInstalled(journal.activeProfile)
      if (active.revision !== journal.beforeRevision) {
        throw new PluginHubError('Pre-activation recovery found an unexpected active profile.', 'PROFILE_CHANGED')
      }
      await updateJournal(paths, journal, { state: 'restored' })
      return
    }
  }
  if (await restoreOldGeneration(paths, journal)) return
  throw new PluginHubError('Plugin transaction recovery could not determine the active generation.', 'HANDOFF_FAILED')
}

function needsRecovery(state: LocalPluginTransactionJournal['state']): boolean {
  return state === 'handoff-ready' || state === 'waiting-for-old-process' || state === 'old-moved'
    || state === 'new-active' || state === 'boot-pending' || state === 'restoring'
}

async function waitForBootPending(
  journalPath: string,
  nonce: string,
  signal?: AbortSignal,
): Promise<LocalPluginTransactionJournal> {
  const deadline = Date.now() + HANDOFF_START_TIMEOUT_MS
  for (;;) {
    throwIfAborted(signal)
    const journal = await readJournal(journalPath)
    if (journal.handoffNonce !== nonce) throw new PluginHubError('Maintenance nonce changed.', 'HANDOFF_FAILED')
    if (journal.state === 'boot-pending') return journal
    if (Date.now() >= deadline) throw new PluginHubError('Maintenance helper did not publish boot state.', 'HANDOFF_FAILED')
    await delay(POLL_MS)
  }
}

async function waitForJournalState(
  journalPath: string,
  state: LocalPluginTransactionJournal['state'],
  timeoutMs: number,
  child: ChildProcess,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    throwIfAborted(signal)
    const journal = await readJournal(journalPath)
    if (journal.state === state) return
    if (child.exitCode !== null || child.signalCode !== null || journal.state === 'failed') {
      throw new PluginHubError('Maintenance helper exited before accepting the handoff.', 'HANDOFF_FAILED')
    }
    await delay(POLL_MS)
  }
  throw new PluginHubError('Maintenance helper handoff timed out.', 'HANDOFF_FAILED')
}

async function waitForSpawn(child: ChildProcess): Promise<void> {
  if (child.pid !== undefined) return
  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once('spawn', resolveSpawn)
    child.once('error', rejectSpawn)
  })
}

async function writeHandoffFailure(
  paths: LocalPluginTransactionPaths,
  journal: LocalPluginTransactionJournal,
  error: unknown,
): Promise<void> {
  await updateJournal(paths, journal, { state: 'failed', error: {
    code: 'HANDOFF_FAILED', message: (error instanceof Error ? error.message : String(error)).slice(0, 2048),
  } }).catch(() => undefined)
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolveExit) => { child.once('exit', () => { resolveExit() }) })
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch { /* child exit raced termination */ }
  if (await Promise.race([exited.then(() => true), delay(2_000).then(() => false)])) return
  try {
    if (process.platform === 'win32') child.kill('SIGKILL')
    else process.kill(-child.pid, 'SIGKILL')
  } catch { /* child exit raced escalation */ }
  await Promise.race([exited, delay(2_000)])
}

async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new PluginHubError('Plugin maintenance was cancelled.', 'OPERATION_ABORTED')
}
function delay(ms: number): Promise<void> { return new Promise(resolveDelay => setTimeout(resolveDelay, ms)) }
