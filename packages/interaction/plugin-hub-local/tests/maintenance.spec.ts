import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectProfileInstalled } from '@lingxi-ai-cn/dsh-profile-plugin-manager'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalPluginInstallLifecycle } from '../src/install.ts'
import {
  LocalPluginMaintenanceController,
  recoverPluginHubProfile,
  runMaintenanceHandoff,
} from '../src/maintenance.ts'
import { readCommittedPluginReceipts } from '../src/receipts.ts'
import {
  transactionPaths,
  writeJsonDurable,
  type LocalPluginTransactionJournal,
} from '../src/transactions.ts'

const RELAUNCH = fileURLToPath(new URL('./fixtures/maintenance-relaunch.mjs', import.meta.url))
const DEAD_PID = 2_000_000_000
const NONCE = 'a'.repeat(64)
const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('Plugin Hub profile maintenance', () => {
  it('swaps generations, commits an exact ready boot, and publishes managed installed truth', async () => {
    const fixture = await createTransaction('handoff-ready')

    await runMaintenanceHandoff(request(fixture), { parentExitTimeoutMs: 100, readyTimeoutMs: 5_000 })

    expect(profileLabel(fixture.activeProfile)).toBe('after')
    expect(profileLabel(fixture.paths.oldGenerationProfile)).toBe('before')
    expect(readJournalState(fixture.paths.journal)).toBe('committed')
    const receipts = await readCommittedPluginReceipts(fixture.dataDir)
    const installed = await inspectProfileInstalled(fixture.activeProfile, receipts)
    expect(installed.plugins).toEqual([expect.objectContaining({
      packageName: '@fixture/plugin', version: '2.0.0', managed: true, pluginId: 'plg_fixture',
    })])
  })

  it('restores and relaunches the old generation when the new process exits before ready', async () => {
    const fixture = await createTransaction('handoff-ready', 'fail')

    await expect(runMaintenanceHandoff(request(fixture), {
      parentExitTimeoutMs: 100,
      readyTimeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'HANDOFF_FAILED' })

    expect(profileLabel(fixture.activeProfile)).toBe('before')
    expect(profileLabel(fixture.paths.failedGenerationProfile)).toBe('after')
    expect(readJournalState(fixture.paths.journal)).toBe('restored')
    await expect.poll(() => existsSync(fixture.restoreLog)).toBe(true)
  })

  it.each(['first-rename', 'second-rename', 'restore-final-rename'] as const)(
    'recovers deterministically after the %s crash point',
    async (crashPoint) => {
      const fixture = await createTransaction(crashPoint === 'restore-final-rename' ? 'restoring' : 'waiting-for-old-process')
      renameSync(fixture.activeProfile, fixture.paths.oldGenerationProfile)
      if (crashPoint !== 'first-rename') {
        renameSync(fixture.paths.stagingProfile, fixture.activeProfile)
        await rewriteJournal(fixture, crashPoint === 'second-rename' ? 'old-moved' : 'restoring')
      }
      if (crashPoint === 'restore-final-rename') {
        renameSync(fixture.activeProfile, fixture.paths.failedGenerationProfile)
        renameSync(fixture.paths.oldGenerationProfile, fixture.activeProfile)
      }

      await recoverPluginHubProfile(fixture.home, 'tui')

      expect(profileLabel(fixture.activeProfile)).toBe('before')
      expect(readJournalState(fixture.paths.journal)).toBe('restored')
    },
  )

  it('rolls a ready boot forward when the helper stopped before recording commit', async () => {
    const fixture = await createTransaction('boot-pending')
    renameSync(fixture.activeProfile, fixture.paths.oldGenerationProfile)
    renameSync(fixture.paths.stagingProfile, fixture.activeProfile)
    await writeJsonDurable(fixture.paths.readyMarker, {
      transactionId: fixture.journal.transactionId,
      nonce: NONCE,
      pid: 4242,
      profileRevision: fixture.afterRevision,
      readyAt: new Date().toISOString(),
    })

    await recoverPluginHubProfile(fixture.home, 'tui')

    expect(profileLabel(fixture.activeProfile)).toBe('after')
    expect(readJournalState(fixture.paths.journal)).toBe('committed')
  })

  it('publishes the exact ready marker from a relaunched TUI process', async () => {
    const fixture = await createTransaction('boot-pending')
    renameSync(fixture.activeProfile, fixture.paths.oldGenerationProfile)
    renameSync(fixture.paths.stagingProfile, fixture.activeProfile)
    await writeJsonDurable(fixture.paths.journal, {
      ...fixture.journal,
      state: 'boot-pending',
      newPid: process.pid,
    })
    const lifecycle = lifecycleFor(fixture)
    const controller = new LocalPluginMaintenanceController(lifecycle, { environment: {
      DSH_PLUGIN_MAINTENANCE_JOURNAL: fixture.paths.journal,
      DSH_PLUGIN_MAINTENANCE_NONCE: NONCE,
    } })

    await controller.markReady()

    expect(JSON.parse(readFileSync(fixture.paths.readyMarker, 'utf8'))).toMatchObject({
      transactionId: fixture.journal.transactionId,
      nonce: NONCE,
      pid: process.pid,
      profileRevision: fixture.afterRevision,
    })
  })

  it('rejects forged handoff identity, paths, and journal permissions before mutation', async () => {
    const wrongNonce = await createTransaction('handoff-ready')
    await expect(runMaintenanceHandoff({ ...request(wrongNonce), nonce: 'b'.repeat(64) }))
      .rejects.toMatchObject({ code: 'HANDOFF_FAILED' })
    expect(profileLabel(wrongNonce.activeProfile)).toBe('before')

    const wrongPath = await createTransaction('handoff-ready')
    await writeJsonDurable(wrongPath.paths.journal, {
      ...wrongPath.journal,
      stagingProfile: join(wrongPath.home, 'forged-profile'),
    })
    await expect(runMaintenanceHandoff(request(wrongPath))).rejects.toMatchObject({ code: 'HANDOFF_FAILED' })
    expect(profileLabel(wrongPath.activeProfile)).toBe('before')

    if (process.platform !== 'win32') {
      const unsafe = await createTransaction('handoff-ready')
      chmodSync(unsafe.paths.journal, 0o644)
      await expect(runMaintenanceHandoff(request(unsafe))).rejects.toMatchObject({ code: 'HANDOFF_FAILED' })
      expect(profileLabel(unsafe.activeProfile)).toBe('before')
    }
  })
})

interface TransactionFixture {
  readonly home: string
  readonly dataDir: string
  readonly activeProfile: string
  readonly restoreLog: string
  readonly afterRevision: string
  readonly paths: ReturnType<typeof transactionPaths>
  readonly journal: LocalPluginTransactionJournal
}

async function createTransaction(
  state: LocalPluginTransactionJournal['state'],
  mode = 'ready',
): Promise<TransactionFixture> {
  const home = mkdtempSync(join(tmpdir(), 'dsh-plugin-maintenance-'))
  homes.push(home)
  const dataDir = join(home, 'plugin-hub')
  const activeProfile = join(home, 'profiles', 'tui')
  const transactionId = '1'.repeat(32)
  const paths = transactionPaths(dataDir, transactionId)
  writeProfile(activeProfile, 'before', false)
  writeProfile(paths.stagingProfile, 'after', true)
  mkdirSync(dirname(paths.oldGenerationProfile), { recursive: true, mode: 0o700 })
  mkdirSync(dirname(paths.failedGenerationProfile), { recursive: true, mode: 0o700 })
  const beforeRevision = (await inspectProfileInstalled(activeProfile)).revision
  const afterRevision = (await inspectProfileInstalled(paths.stagingProfile)).revision
  const restoreLog = join(home, 'restored.log')
  const journal: LocalPluginTransactionJournal = {
    version: 1,
    transactionId,
    planId: '2'.repeat(24),
    state,
    operation: 'install',
    packageName: '@fixture/plugin',
    ownerPid: DEAD_PID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeProfile,
    stagingProfile: paths.stagingProfile,
    oldGenerationProfile: paths.oldGenerationProfile,
    failedGenerationProfile: paths.failedGenerationProfile,
    beforeRevision,
    afterRevision,
    handoffNonce: NONCE,
    readyMarker: paths.readyMarker,
    relaunch: {
      executable: process.execPath,
      args: [RELAUNCH],
      cwd: home,
      env: { FIXTURE_MODE: mode, FIXTURE_RESTORE_LOG: restoreLog },
    },
    ...state === 'boot-pending' ? { newPid: 4242 } : {},
    receipt: {
      transactionId,
      operation: 'install',
      packageName: '@fixture/plugin',
      version: '2.0.0',
      pluginId: 'plg_fixture',
      versionId: 'ver_fixture',
      sourceCommit: 'abc123',
      artifactDigest: 'sha512:fixture',
      beforeRevision,
      afterRevision,
    },
  }
  await writeJsonDurable(paths.journal, journal)
  return { home, dataDir, activeProfile, restoreLog, afterRevision, paths, journal }
}

function writeProfile(profileDir: string, label: string, withPlugin: boolean): void {
  mkdirSync(profileDir, { recursive: true, mode: 0o700 })
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({
    name: `fixture-${label}`,
    private: true,
    dependencies: withPlugin ? { '@fixture/plugin': '2.0.0' } : {},
    dsh: { profile: { bundles: withPlugin ? ['@fixture/plugin'] : [] } },
  }, undefined, 2)}\n`)
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n')
  if (withPlugin) {
    const packageDir = join(profileDir, 'node_modules', '@fixture/plugin')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: '@fixture/plugin', version: '2.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), '[]\n')
  }
}

function request(fixture: TransactionFixture): {
  readonly journal: string
  readonly nonce: string
  readonly parentPid: number
} {
  return { journal: fixture.paths.journal, nonce: NONCE, parentPid: DEAD_PID }
}

function lifecycleFor(fixture: TransactionFixture): LocalPluginInstallLifecycle {
  return new LocalPluginInstallLifecycle({
    profileDir: fixture.activeProfile,
    dataDir: fixture.dataDir,
    installAnchor: fileURLToPath(new URL('../package.json', import.meta.url)),
    initialBundles: [],
    dshVersion: '0.1.0',
    trustedKeys: [],
    maxArtifactBytes: 1024,
    requestTimeoutMs: 100,
    planTtlMs: 1_000,
    requestDescriptor: () => Promise.reject(new Error('unused fixture descriptor')),
  })
}

async function rewriteJournal(
  fixture: TransactionFixture,
  state: LocalPluginTransactionJournal['state'],
): Promise<void> {
  await writeJsonDurable(fixture.paths.journal, { ...fixture.journal, state })
}

function readJournalState(path: string): string {
  return (JSON.parse(readFileSync(path, 'utf8')) as { state: string }).state
}

function profileLabel(path: string): string {
  return (JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as { name: string }).name.replace('fixture-', '')
}
