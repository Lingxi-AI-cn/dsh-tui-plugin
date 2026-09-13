import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import PluginHubRuntime, { PluginId, PluginVersionId } from '@lingxi-ai-cn/dsh-plugin-hub'
import { afterEach, describe, expect, it } from 'vitest'
import { create as createTar } from 'tar'
import { apply } from '../src/index.ts'
import { canonicalJson } from '../src/signature.ts'

const NOW = Date.parse('2026-08-18T12:00:00.000Z')
const fakePnpm = fileURLToPath(new URL('./fixtures/fake-pnpm.mjs', import.meta.url))
const maintenanceAccept = fileURLToPath(new URL('./fixtures/maintenance-accept.mjs', import.meta.url))
const homes: string[] = []
const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => { resolve() }))
  }
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('trusted Plugin Hub installation planning', () => {
  it('verifies and caches an exact artifact without mutating the active profile', async () => {
    const fixture = await createFixture()
    const ctx = await createContext(fixture)
    const before = readFileSync(join(fixture.profileDir, 'package.json'), 'utf8')

    const plan = await ctx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture'))

    expect(plan).toMatchObject({
      operation: 'install', packageName: '@fixture/plugin', restartRequired: true,
      target: {
        version: '1.2.3', sourceCommit: 'abc123', artifactSizeBytes: fixture.artifact.byteLength,
        dshRange: '^0.1.0-rc.5', validationLevel: 'manifest-valid',
      },
      afterBundles: ['@deepseek-ai/dsh-base', '@lingxi-ai-cn/dsh-tui', '@fixture/plugin'],
    })
    expect(plan.target).not.toHaveProperty('url')
    expect(plan.target).not.toHaveProperty('path')
    expect(readFileSync(join(fixture.profileDir, 'package.json'), 'utf8')).toBe(before)
    await expect(ctx.pluginHub.installed()).resolves.toMatchObject({ plugins: [] })
    expect(readFileSync(join(fixture.dataDir, 'artifacts', 'sha512', `${fixture.digest.toString('hex')}.tgz`)))
      .toEqual(fixture.artifact)
    await ctx.fiber.dispose()
  })

  it('rejects unknown keys and signed-payload tampering', async () => {
    const unknown = await createFixture({ configuredPublicKey: 'unknown' })
    const unknownCtx = await createContext(unknown)
    await expect(unknownCtx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code: 'SIGNATURE_INVALID' })
    await unknownCtx.fiber.dispose()

    const tampered = await createFixture({ tamperAfterSigning: true })
    const tamperedCtx = await createContext(tampered)
    await expect(tamperedCtx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code: 'SIGNATURE_INVALID' })
    await tamperedCtx.fiber.dispose()
  })

  it('stages and validates an exact artifact while the active profile stays byte-identical', async () => {
    const fixture = await createFixture()
    const ctx = await createContext(fixture)
    const activeBefore = readFileSync(join(fixture.profileDir, 'package.json'), 'utf8')
    const plan = await ctx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture'))

    const staged = await ctx.pluginHub.stage(plan.id)

    expect(readFileSync(join(fixture.profileDir, 'package.json'), 'utf8')).toBe(activeBefore)
    const stagingProfile = join(fixture.dataDir, 'staging', staged.id, 'profile')
    expect(readFileSync(join(stagingProfile, 'package.json'), 'utf8')).toContain('@fixture/plugin')
    expect(readFileSync(join(stagingProfile, 'node_modules', '@fixture/plugin', 'package.json'), 'utf8'))
      .toContain('1.2.3')
    expect(JSON.parse(readFileSync(join(fixture.dataDir, 'transactions', staged.id, 'journal.json'), 'utf8')))
      .toMatchObject({ state: 'staged', beforeRevision: plan.profileRevision, afterRevision: staged.afterRevision })

    await ctx.pluginHub.discard(staged.id)
    expect(existsSync(stagingProfile)).toBe(false)
    expect(JSON.parse(readFileSync(join(fixture.dataDir, 'transactions', staged.id, 'journal.json'), 'utf8')))
      .toMatchObject({ state: 'discarded' })
    await ctx.fiber.dispose()
  })

  it('hands a staged transaction to the provider-owned maintenance controller', async () => {
    const fixture = await createFixture()
    const ctx = await createContext(fixture, {
      maintenanceCommand: [process.execPath, maintenanceAccept],
      relaunch: { executable: process.execPath, args: [fakePnpm], cwd: fixture.home, env: {} },
    })
    const plan = await ctx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture'))
    const staged = await ctx.pluginHub.stage(plan.id)
    const activeBefore = readFileSync(join(fixture.profileDir, 'package.json'), 'utf8')

    await expect(ctx.pluginHub.createMaintenanceHandoff(staged.id)).resolves.toMatchObject({
      transactionId: staged.id,
      state: 'waiting-for-old-process',
    })

    expect(readFileSync(join(fixture.profileDir, 'package.json'), 'utf8')).toBe(activeBefore)
    expect(JSON.parse(readFileSync(join(fixture.dataDir, 'transactions', staged.id, 'journal.json'), 'utf8')))
      .toMatchObject({ state: 'waiting-for-old-process' })
    await ctx.fiber.dispose()
  })

  it('fails staging on profile drift or pnpm build policy without changing the active profile', async () => {
    const drifted = await createFixture()
    const driftedCtx = await createContext(drifted)
    const driftedPlan = await driftedCtx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture'))
    const manifestPath = join(drifted.profileDir, 'package.json')
    const changedManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies: Record<string, string>
    }
    changedManifest.dependencies['user-change'] = '1.0.0'
    const changed = `${JSON.stringify(changedManifest, undefined, 2)}\n`
    writeFileSync(manifestPath, changed)
    await expect(driftedCtx.pluginHub.stage(driftedPlan.id)).rejects.toMatchObject({ code: 'PROFILE_CHANGED' })
    expect(readFileSync(manifestPath, 'utf8')).toBe(changed)
    await driftedCtx.fiber.dispose()

    const blocked = await createFixture()
    const blockedCtx = await createContext(blocked, { pnpmCommand: [process.execPath, fakePnpm, '--fail'] })
    const blockedPlan = await blockedCtx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture'))
    const blockedBefore = readFileSync(join(blocked.profileDir, 'package.json'), 'utf8')
    await expect(blockedCtx.pluginHub.stage(blockedPlan.id)).rejects.toMatchObject({ code: 'BUILD_NOT_ALLOWED' })
    expect(readFileSync(join(blocked.profileDir, 'package.json'), 'utf8')).toBe(blockedBefore)
    const transactions = readdirSync(join(blocked.dataDir, 'transactions'))
    expect(transactions).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(blocked.dataDir, 'transactions', transactions[0]!, 'journal.json'), 'utf8')))
      .toMatchObject({ state: 'failed', error: { code: 'BUILD_NOT_ALLOWED' } })
    await blockedCtx.fiber.dispose()
  })

  it.each([
    ['expired', { expiresAt: '2026-08-18T11:59:59.000Z' }, 'DESCRIPTOR_EXPIRED'],
    ['wrong surface', { surfaces: ['headless'] }, 'SURFACE_INCOMPATIBLE'],
    ['incompatible DSH', { dsh: '>=9.0.0' }, 'DSH_INCOMPATIBLE'],
    ['TUI version is not the Host version', { dsh: '=0.1.11-rc.2' }, 'DSH_INCOMPATIBLE'],
  ] as const)('rejects a %s descriptor before profile mutation', async (_label, overrides, code) => {
    const fixture = await createFixture({ descriptorOverrides: overrides })
    const ctx = await createContext(fixture)
    await expect(ctx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code })
    await ctx.fiber.dispose()
  })

  it('rejects digest mismatches, oversized descriptors, and redirect escapes', async () => {
    const mismatched = await createFixture({ signedDigest: Buffer.alloc(64, 7) })
    const mismatchCtx = await createContext(mismatched)
    await expect(mismatchCtx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code: 'ARTIFACT_DIGEST_MISMATCH' })
    await mismatchCtx.fiber.dispose()

    const oversized = await createFixture({ signedSizeOffset: 10_000 })
    const oversizedCtx = await createContext(oversized, { maxArtifactBytes: 1024 })
    await expect(oversizedCtx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code: 'ARTIFACT_TOO_LARGE' })
    await oversizedCtx.fiber.dispose()

    const redirected = await createFixture({ artifactRedirect: 'https://example.com/plugin.tgz' })
    const redirectCtx = await createContext(redirected)
    await expect(redirectCtx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
    await redirectCtx.fiber.dispose()
  })

  it.each([
    ['VERSION_NOT_INSTALLABLE', 'VERSION_NOT_INSTALLABLE'],
    ['QUARANTINED', 'PLUGIN_QUARANTINED'],
  ] as const)('preserves Registry %s installation races', async (registryCode, expectedCode) => {
    const fixture = await createFixture({ registryError: registryCode })
    const ctx = await createContext(fixture)
    await expect(ctx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code: expectedCode })
    await ctx.fiber.dispose()
  })
})

interface FixtureOptions {
  readonly configuredPublicKey?: 'unknown'
  readonly tamperAfterSigning?: boolean
  readonly descriptorOverrides?: {
    readonly expiresAt?: string
    readonly surfaces?: readonly string[]
    readonly dsh?: string
  }
  readonly signedDigest?: Buffer
  readonly signedSizeOffset?: number
  readonly artifactRedirect?: string
  readonly registryError?: 'VERSION_NOT_INSTALLABLE' | 'QUARANTINED'
}

interface Fixture {
  readonly home: string
  readonly profileDir: string
  readonly dataDir: string
  readonly artifact: Buffer
  readonly digest: Buffer
  readonly port: number
  readonly publicKey: string
}

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const home = mkdtempSync(join(tmpdir(), 'dsh-plugin-install-'))
  homes.push(home)
  const packageRoot = join(home, 'tar-root', 'package')
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@fixture/plugin', version: '1.2.3', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(packageRoot, 'cordis.patch.yml'), '[]\n')
  const artifactPath = join(home, 'plugin.tgz')
  await createTar({ file: artifactPath, cwd: join(home, 'tar-root'), gzip: true, portable: true }, ['package'])
  const artifact = readFileSync(artifactPath)
  const digest = createHash('sha512').update(artifact).digest()
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  let responseBody = ''
  const server = createServer((request, response) => {
    if (request.url === '/artifact.tgz') {
      if (options.artifactRedirect !== undefined) {
        response.statusCode = 302
        response.setHeader('location', options.artifactRedirect)
        response.end()
      } else {
        response.end(artifact)
      }
      return
    }
    response.setHeader('content-type', 'application/json')
    if (options.registryError !== undefined) {
      response.statusCode = 409
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', error: {
        code: options.registryError, message: 'fixture race', requestId: 'request-fixture',
      } }))
      return
    }
    response.end(responseBody)
  })
  servers.push(server)
  const port = await listen(server)
  const overrides = options.descriptorOverrides
  const descriptor = {
    pluginId: 'plg_fixture', versionId: 'ver_fixture', packageName: '@fixture/plugin', packagePath: 'packages/plugin',
    version: '1.2.3', source: { repository: 'fixture/repository', commit: 'abc123' },
    artifact: { kind: 'npm-tarball', url: `http://127.0.0.1:${port}/artifact.tgz`,
      digest: { algorithm: 'sha512', value: (options.signedDigest ?? digest).toString('base64') },
      sizeBytes: artifact.byteLength + (options.signedSizeOffset ?? 0) },
    requirements: { surfaces: overrides?.surfaces ?? ['tui'], dsh: overrides?.dsh ?? '^0.1.0-rc.5', lifecycleScripts: [] },
    validation: { level: 'manifest-valid', validatorVersion: 'fixture' }, catalogRevision: 1,
    issuedAt: '2026-08-18T11:59:00.000Z', expiresAt: overrides?.expiresAt ?? '2026-08-18T12:05:00.000Z',
  }
  const signed = { apiVersion: 'dsh.plugin-hub/v1', descriptor }
  const signature = sign(null, Buffer.from(canonicalJson(signed)), privateKey).toString('base64url')
  if (options.tamperAfterSigning === true) descriptor.source.commit = 'tampered'
  responseBody = JSON.stringify({ ...signed, keyId: 'fixture-key', signature })
  return {
    home,
    profileDir: join(home, 'profiles', 'tui'),
    dataDir: join(home, 'plugin-hub'),
    artifact,
    digest,
    port,
    publicKey: options.configuredPublicKey === 'unknown'
      ? generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' }).toString()
      : publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  }
}

async function createContext(
  fixture: Fixture,
  overrides: {
    readonly maxArtifactBytes?: number
    readonly pnpmCommand?: readonly string[]
    readonly maintenanceCommand?: readonly string[]
    readonly relaunch?: {
      readonly executable: string
      readonly args: readonly string[]
      readonly cwd: string
      readonly env: Readonly<Record<string, string>>
    }
  } = {},
): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(PluginHubRuntime)
  apply(ctx, {
    registryUrl: `http://127.0.0.1:${fixture.port}`,
    profileMutations: true,
    allowLoopbackHttp: true,
    trustedKeys: [{ keyId: 'fixture-key', publicKey: fixture.publicKey }],
    profileDir: fixture.profileDir,
    dataDir: fixture.dataDir,
    pnpmCommand: [process.execPath, fakePnpm],
    now: () => NOW,
    ...overrides,
  })
  await ctx.pluginHub.installed()
  // These unit fixtures own local bundle manifests; the Vitest launcher is not a DSH installation.
  for (const name of ['@deepseek-ai/dsh-base', '@lingxi-ai-cn/dsh-tui']) {
    const directory = join(fixture.profileDir, 'node_modules', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(directory, 'cordis.patch.yml'), '[]\n')
  }
  return ctx
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture server did not bind TCP')
  return address.port
}
