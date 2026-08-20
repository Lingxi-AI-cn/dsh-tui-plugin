import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync, lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync,
} from 'node:fs'
import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  anchorProfilePluginSpec,
  inspectProfileInstalled,
  ProfilePluginManager,
  resolveProfilePluginLockPath,
  withProfilePluginLock,
  type ProfilePluginArtifact,
  type ProfilePluginManagerOptions,
} from '../src/index.ts'

const fakePnpm = fileURLToPath(new URL('./fixtures/fake-pnpm.mjs', import.meta.url))
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-profile-plugins-'))
  roots.push(root)
  return root
}

function manager(root: string, overrides: Partial<ProfilePluginManagerOptions> = {}): ProfilePluginManager {
  const profileDir = join(root, 'profiles', 'tui')
  return new ProfilePluginManager({
    profileDir,
    lockPath: resolveProfilePluginLockPath(profileDir),
    initialBundles: [],
    pnpmCommand: [process.execPath, fakePnpm],
    processTimeoutMs: 2_000,
    lockTimeoutMs: 200,
    maxOutputBytes: 128,
    terminationGraceMs: 20,
    planTtlMs: 60_000,
    ...overrides,
  })
}

async function artifact(
  root: string,
  packageName: string,
  version: string,
  bundlePatch?: string,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<ProfilePluginArtifact> {
  const path = join(root, `${packageName.replaceAll('/', '-')}-${version}.tgz`)
  const content = JSON.stringify({ name: packageName, version, ...bundlePatch === undefined ? {} : { bundlePatch }, ...extra })
  await writeFile(path, content)
  return {
    path,
    packageName,
    version,
    digest: { algorithm: 'sha512', encoding: 'hex', value: createHash('sha512').update(content).digest('hex') },
    sizeBytes: (await stat(path)).size,
    ...bundlePatch === undefined ? {} : { bundlePatch },
  }
}

describe('profile plugin path and lock conventions', () => {
  it('anchors only relative filesystem specifications', () => {
    expect(anchorProfilePluginSpec('.', '/work/plugin')).toBe('/work/plugin')
    expect(anchorProfilePluginSpec('file:../bundle', '/work/plugin')).toBe('file:/work/bundle')
    expect(anchorProfilePluginSpec('link:./bundle', '/work/plugin')).toBe('link:/work/plugin/bundle')
    expect(anchorProfilePluginSpec('@scope/pkg@1.0.0', '/work/plugin')).toBe('@scope/pkg@1.0.0')
  })

  it('fails closed on a live lock and reclaims a mismatched process identity', async () => {
    const root = scratch()
    const profileDir = join(root, 'profiles', 'tui')
    const lockPath = resolveProfilePluginLockPath(profileDir)
    await mkdir(lockPath, { recursive: true })
    await writeFile(join(lockPath, 'owner.json'), JSON.stringify({
      pid: process.pid,
      identity: 'same-process',
      transactionId: 'other',
      createdAt: new Date().toISOString(),
      nonce: 'other',
    }))
    const busy = manager(root, { lockTimeoutMs: 30, processIdentity: async () => 'same-process' })
    await expect(busy.initialize()).rejects.toMatchObject({ code: 'PROFILE_BUSY' })

    await writeFile(join(lockPath, 'owner.json'), JSON.stringify({
      pid: process.pid,
      identity: 'old-process',
      transactionId: 'stale',
      createdAt: new Date().toISOString(),
      nonce: 'stale',
    }))
    const reclaiming = manager(root, { processIdentity: async () => 'new-process' })
    await reclaiming.initialize()
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toContain('dsh-profile-tui')
  })
})

describe('installed truth and detached plans', () => {
  it('plans without mutation, rejects profile drift, and enforces expiry', async () => {
    const root = scratch()
    let now = Date.parse('2026-08-18T00:00:00.000Z')
    const profileManager = manager(root, { now: () => now, planTtlMs: 1_000 })
    const bundle = await artifact(root, 'planned-bundle', '1.0.0', './cordis.patch.yml')
    const plan = await profileManager.plan({ operation: 'install', artifact: bundle })
    expect(plan).toMatchObject({
      operation: 'install',
      packageName: 'planned-bundle',
      restartRequired: true,
      afterBundles: ['planned-bundle'],
    })
    expect(Object.isFrozen(plan.target)).toBe(true)
    expect(Object.isFrozen(plan.target?.artifact)).toBe(true)
    expect((await profileManager.inspectInstalled()).plugins).toEqual([])

    const manifestPath = join(root, 'profiles', 'tui', 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { description?: string }
    manifest.description = 'concurrent edit'
    await writeFile(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
    // Unrelated manifest prose is outside the profile revision.
    await expect(profileManager.applyPlan(plan)).resolves.toMatchObject({ operation: 'install' })

    const update = await artifact(root, 'planned-bundle', '2.0.0', './cordis.patch.yml')
    const stale = await profileManager.plan({ operation: 'update', artifact: update })
    const nextManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
    nextManifest.dependencies['concurrent-package'] = '1.0.0'
    await writeFile(manifestPath, JSON.stringify(nextManifest, undefined, 2) + '\n')
    await expect(profileManager.applyPlan(stale)).rejects.toMatchObject({ code: 'PROFILE_CHANGED' })

    delete nextManifest.dependencies['concurrent-package']
    await writeFile(manifestPath, JSON.stringify(nextManifest, undefined, 2) + '\n')
    const expiring = await profileManager.plan({ operation: 'update', artifact: update })
    now += 1_000
    await expect(profileManager.applyPlan(expiring)).rejects.toMatchObject({ code: 'PLAN_EXPIRED' })
  })

  it('rechecks plan expiry after waiting for the shared lock', async () => {
    const root = scratch()
    let now = Date.parse('2026-08-18T00:00:00.000Z')
    const processIdentity = async (): Promise<string> => 'test-process'
    const profileManager = manager(root, { now: () => now, planTtlMs: 1_000, processIdentity, lockTimeoutMs: 1_000 })
    const bundle = await artifact(root, 'waiting-bundle', '1.0.0', './cordis.patch.yml')
    const plan = await profileManager.plan({ operation: 'install', artifact: bundle })
    const lockPath = resolveProfilePluginLockPath(join(root, 'profiles', 'tui'))
    let releaseLock: (() => void) | undefined
    let lockAcquired: (() => void) | undefined
    const release = new Promise<void>((resolveRelease) => { releaseLock = resolveRelease })
    const acquired = new Promise<void>((resolveAcquired) => { lockAcquired = resolveAcquired })
    const holder = withProfilePluginLock(lockPath, {}, 1_000, processIdentity, async () => {
      lockAcquired?.()
      await release
    })
    await acquired
    const applying = profileManager.applyPlan(plan)
    now += 1_000
    releaseLock?.()
    await holder
    await expect(applying).rejects.toMatchObject({ code: 'PLAN_EXPIRED' })
  })

  it('derives managed truth from profile files and local receipts', async () => {
    const root = scratch()
    const profileManager = manager(root)
    const bundle = await artifact(root, '@example/bundle', '1.2.3', './cordis.patch.yml')
    await profileManager.installExact(bundle)
    const snapshot = await profileManager.inspectInstalled([{
      packageName: '@example/bundle',
      version: '1.2.3',
      pluginId: 'plg_1',
      versionId: 'ver_1',
      sourceCommit: 'abc123',
      artifactDigest: 'sha512-fixture',
    }])
    expect(snapshot.plugins).toEqual([expect.objectContaining({
      packageName: '@example/bundle',
      version: '1.2.3',
      activeBundle: true,
      managed: true,
      pluginId: 'plg_1',
      health: 'ok',
    })])
    expect(snapshot.plugins[0]?.locked?.integrity).toBe('sha512-1.2.3')
    expect(snapshot.bundles).toEqual(['@example/bundle'])
    expect(snapshot.lockfile.present).toBe(true)
  })
})

describe('typed profile mutations', () => {
  it('installs and removes an exact local tarball through real pnpm', async () => {
    const root = scratch()
    const packageDir = join(root, 'real-package')
    await mkdir(packageDir)
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({
      name: 'real-profile-bundle',
      version: '1.0.0',
      files: ['cordis.patch.yml'],
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, undefined, 2) + '\n')
    await writeFile(join(packageDir, 'cordis.patch.yml'), '[]\n')
    execFileSync('pnpm', ['pack', '--pack-destination', root], { cwd: packageDir, stdio: 'pipe' })
    const tarball = join(root, 'real-profile-bundle-1.0.0.tgz')
    const bytes = await readFile(tarball)
    const profileManager = manager(root, {
      pnpmCommand: ['pnpm'],
      processTimeoutMs: 30_000,
      maxOutputBytes: 16 * 1024,
    })
    const exact: ProfilePluginArtifact = {
      path: tarball,
      packageName: 'real-profile-bundle',
      version: '1.0.0',
      bundlePatch: './cordis.patch.yml',
      sizeBytes: bytes.byteLength,
      digest: { algorithm: 'sha512', encoding: 'hex', value: createHash('sha512').update(bytes).digest('hex') },
    }
    expect((await profileManager.installExact(exact)).after.plugins[0]).toMatchObject({
      packageName: 'real-profile-bundle',
      version: '1.0.0',
      health: 'ok',
      activeBundle: true,
    })
    expect((await profileManager.removePackage('real-profile-bundle')).after.plugins).toEqual([])
  }, 60_000)

  it('reconciles bundle gains, losses, deterministic order, and remove', async () => {
    const root = scratch()
    const profileManager = manager(root)
    const plain = await artifact(root, 'evolving-plugin', '1.0.0')
    const first = await profileManager.installExact(plain)
    expect(first.warnings).toEqual([
      'evolving-plugin declares no dsh.bundle; it remains a plain dependency and is not a profile layer',
    ])
    expect(first.after.bundles).toEqual([])

    const bundle = await artifact(root, 'evolving-plugin', '2.0.0', './cordis.patch.yml')
    expect((await profileManager.updateExact(bundle)).after.bundles).toEqual(['evolving-plugin'])
    const second = await artifact(root, 'second-bundle', '1.0.0', './cordis.patch.yml')
    expect((await profileManager.installExact(second)).after.bundles).toEqual(['evolving-plugin', 'second-bundle'])
    const plainAgain = await artifact(root, 'evolving-plugin', '3.0.0')
    expect((await profileManager.updateExact(plainAgain)).after.bundles).toEqual(['second-bundle'])
    expect((await profileManager.removePackage('second-bundle')).after.plugins).toEqual([
      expect.objectContaining({ packageName: 'evolving-plugin', version: '3.0.0' }),
    ])
  })

  it('rejects a changed artifact digest and classifies blocked builds', async () => {
    const root = scratch()
    const profileManager = manager(root)
    const changed = await artifact(root, 'changed-bundle', '1.0.0', './cordis.patch.yml')
    await writeFile(changed.path, 'tampered')
    await expect(profileManager.installExact(changed)).rejects.toMatchObject({ code: 'INVALID_ARTIFACT' })

    const blocked = await artifact(root, 'blocked-bundle', '1.0.0', './cordis.patch.yml', { failBuild: true })
    await expect(profileManager.installExact(blocked)).rejects.toMatchObject({ code: 'BUILD_NOT_ALLOWED' })

    const stdoutFailure = await artifact(root, 'stdout-failure', '1.0.0', undefined, { failStdout: true })
    const failure = await profileManager.installExact(stdoutFailure).catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'PNPM_FAILED' })
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('ordinary pnpm failure written to stdout')
  })
})

describe('pnpm orchestration', () => {
  it('retains bounded diagnostics and preserves nonzero exit facts', async () => {
    const root = scratch()
    const profileManager = manager(root, { maxOutputBytes: 64 })
    const output = await profileManager.runPnpm(['emit'])
    expect(Buffer.byteLength(output.stdout)).toBeLessThanOrEqual(64)
    expect(Buffer.byteLength(output.stderr)).toBeLessThanOrEqual(64)
    expect(output.stdoutOmittedBytes).toBeGreaterThan(0)
    expect(output.stderrOmittedBytes).toBeGreaterThan(0)
    const failed = await profileManager.runPnpm(['fail'])
    expect(failed).toMatchObject({ exitCode: 7, timedOut: false, aborted: false })
    expect(failed.stderr).toContain('ordinary pnpm failure')
  })

  it('cancels and times out an asynchronous process, then releases the lock', async () => {
    const root = scratch()
    const profileManager = manager(root)
    const controller = new AbortController()
    await expect(profileManager.runPnpm(['hang'], {
      signal: controller.signal,
      onStdout: () => { controller.abort(new Error('cancel fixture')) },
    })).rejects.toMatchObject({ code: 'OPERATION_ABORTED' })
    await expect(profileManager.runPnpm(['emit'])).resolves.toMatchObject({ exitCode: 0 })

    const timingOut = manager(root, { processTimeoutMs: 30 })
    await expect(timingOut.runPnpm(['hang'])).rejects.toMatchObject({ code: 'OPERATION_TIMEOUT' })
  })

  it('reports a missing pnpm executable', async () => {
    const root = scratch()
    const profileManager = manager(root, { pnpmCommand: [join(root, 'missing-pnpm')] })
    await expect(profileManager.runPnpm(['root'])).rejects.toMatchObject({ code: 'PNPM_UNAVAILABLE' })
  })
})

describe('materialization and validation', () => {
  it('copies symlinks without following them and validates the detached profile', async () => {
    const root = scratch()
    const profileManager = manager(root)
    await profileManager.initialize()
    const outside = join(root, 'outside.txt')
    await writeFile(outside, 'outside')
    const sourceLink = join(root, 'profiles', 'tui', 'outside-link')
    await symlink(outside, sourceLink)
    const destination = join(root, 'staging', 'profile')
    await profileManager.materializeProfile(destination)
    expect(lstatSync(join(destination, 'outside-link')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(destination, 'outside-link'))).toBe(outside)
    expect(await profileManager.validateProfile(destination)).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects nested destinations and pre-cancelled materialization', async () => {
    const root = scratch()
    const profileManager = manager(root)
    await profileManager.initialize()
    await expect(profileManager.materializeProfile(join(root, 'profiles', 'tui', 'nested')))
      .rejects.toMatchObject({ code: 'PROFILE_INVALID' })
    const controller = new AbortController()
    controller.abort()
    await expect(profileManager.materializeProfile(join(root, 'staging', 'cancelled'), controller.signal))
      .rejects.toMatchObject({ code: 'OPERATION_ABORTED' })
  })

  it('reports missing packages from profile-local installed truth', async () => {
    const root = scratch()
    const profileManager = manager(root)
    await profileManager.initialize()
    const manifestPath = join(root, 'profiles', 'tui', 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
    manifest.dependencies.missing = '1.0.0'
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
    expect((await inspectProfileInstalled(join(root, 'profiles', 'tui'))).plugins[0]).toMatchObject({
      packageName: 'missing',
      health: 'missing-package',
    })
  })

  it('holds the shared lock while materializing and rejects unsafe dependency names', async () => {
    const root = scratch()
    const processIdentity = async (): Promise<string> => 'test-process'
    const profileManager = manager(root, { processIdentity, lockTimeoutMs: 30 })
    await profileManager.initialize()
    const lockPath = resolveProfilePluginLockPath(join(root, 'profiles', 'tui'))
    const destination = join(root, 'staging', 'locked')
    await withProfilePluginLock(lockPath, {}, 1_000, processIdentity, async () => {
      await expect(profileManager.materializeProfile(destination)).rejects.toMatchObject({ code: 'PROFILE_BUSY' })
    })
    expect(existsSync(destination)).toBe(false)

    const manifestPath = join(root, 'profiles', 'tui', 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
    manifest.dependencies['../outside'] = '1.0.0'
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
    await expect(profileManager.inspectInstalled()).rejects.toMatchObject({ code: 'PROFILE_INVALID' })
  })
})
