/** Packed-manifest Host compatibility checks that run before terminal mutation. */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type {
  TuiHostDiagnosticSnapshot,
  TuiHostPackageDiagnostic,
} from '@lingxi-ai-cn/dsh-tui-runtime'

const PACKAGE_MANIFEST = new URL('../package.json', import.meta.url)
const PROFILE_NAME = 'tui'
const OFFICIAL_DSH_PACKAGE = '@deepseek-ai/dsh'
const SHIPPED_AGENT_PRESET_IDS = Object.freeze(['standard', 'code', 'minimal', 'cordis'])

interface PackageManifest {
  readonly name?: unknown
  readonly version?: unknown
  readonly dependencies?: Readonly<Record<string, unknown>>
  readonly optionalDependencies?: Readonly<Record<string, unknown>>
  readonly peerDependencies?: Readonly<Record<string, unknown>>
}

/** One resolved official package used by the TUI bundle. */
export type TuiHostPackageResolution = TuiHostPackageDiagnostic

/** Complete result retained by startup diagnostics and tests. */
export type TuiHostCompatibilityReport = TuiHostDiagnosticSnapshot

/** Validated installation facts needed by Loader expressions but not ordinary diagnostics. */
export interface TuiHostInstallation {
  readonly diagnostics: TuiHostCompatibilityReport
  readonly presetRoot: string
}

/** Typed startup failure whose message is safe before terminal entry. */
export class TuiHostCompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TuiHostCompatibilityError'
  }
}

function readManifest(path: URL | string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TuiHostCompatibilityError(`TUI compatibility manifest has no ${label}.`)
  }
  return value
}

function profileRoot(): string {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return resolve(dshHome, 'profiles', PROFILE_NAME)
}

function isInside(root: string, candidate: string): boolean {
  const canonicalRoot = existsSync(root) ? realpathSync(root) : resolve(root)
  const path = relative(canonicalRoot, resolve(candidate))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function entrypointPackageManifest(packageName: string): string | undefined {
  const entrypoint = process.argv[1]
  if (entrypoint === undefined || !existsSync(entrypoint)) return undefined
  let cursor = dirname(realpathSync(entrypoint))
  const filesystemRoot = parse(cursor).root
  for (;;) {
    const candidate = join(cursor, 'package.json')
    if (existsSync(candidate)) {
      try {
        if (readManifest(candidate).name === packageName) return realpathSync(candidate)
      } catch {
        // Keep walking: an ancestor manifest can still identify the Host package.
      }
    }
    if (cursor === filesystemRoot) return undefined
    cursor = dirname(cursor)
  }
}

function packageManifestPath(packageName: string, from = import.meta.url): string {
  if (packageName === OFFICIAL_DSH_PACKAGE) {
    const entrypointManifest = entrypointPackageManifest(packageName)
    if (entrypointManifest !== undefined) return entrypointManifest
  }
  const request = createRequire(from)
  for (const searchPath of request.resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName, 'package.json')
    if (existsSync(candidate)) return realpathSync(candidate)
  }
  throw new TuiHostCompatibilityError(`Required Host package ${packageName} is not resolvable.`)
}

function tryPackageManifestPath(packageName: string, from: string): string | undefined {
  try {
    return packageManifestPath(packageName, from)
  } catch (error) {
    if (error instanceof TuiHostCompatibilityError) return undefined
    throw error
  }
}

function resolvedPackage(packageName: string, from?: string): TuiHostPackageResolution {
  const manifestPath = packageManifestPath(packageName, from)
  const manifest = readManifest(manifestPath)
  return Object.freeze({
    name: requiredString(manifest.name, `${packageName} name`),
    version: requiredString(manifest.version, `${packageName} version`),
    manifestPath,
  })
}

function resolvedManifestPackage(manifestPath: string): TuiHostPackageResolution {
  const manifest = readManifest(manifestPath)
  const name = requiredString(manifest.name, `${manifestPath} package name`)
  return Object.freeze({
    name,
    version: requiredString(manifest.version, `${name} version`),
    manifestPath,
  })
}

/** Index only packages reachable from the real DSH CLI dependency graph. */
function hostPackageManifestIndex(officialDshManifest: string): ReadonlyMap<string, string> {
  const byName = new Map<string, string>()
  const visited = new Set<string>()
  const pending = [officialDshManifest]
  while (pending.length > 0) {
    const manifestPath = pending.shift()
    if (manifestPath === undefined || visited.has(manifestPath)) continue
    visited.add(manifestPath)
    const manifest = readManifest(manifestPath)
    if (typeof manifest.name === 'string' && !byName.has(manifest.name)) byName.set(manifest.name, manifestPath)
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    for (const dependency of Object.keys(dependencies).sort()) {
      const child = tryPackageManifestPath(dependency, manifestPath)
      if (child !== undefined && !visited.has(child)) pending.push(child)
    }
  }
  return byName
}

function checkedPresetRoot(
  officialDsh: TuiHostPackageResolution,
  supportedDsh: string,
  activeProfileRoot: string,
): string {
  if (officialDsh.version !== supportedDsh) {
    throw new TuiHostCompatibilityError(
      `Official DSH package is ${officialDsh.version}; expected exactly ${supportedDsh}.`,
    )
  }
  if (isInside(activeProfileRoot, officialDsh.manifestPath)) {
    throw new TuiHostCompatibilityError(
      'Official DSH package resolves from the TUI profile instead of the DSH installation.',
    )
  }
  const candidate = join(officialDsh.manifestPath, '..', 'config', 'agent-presets')
  let root: string
  try {
    root = realpathSync(candidate)
  } catch (error) {
    throw new TuiHostCompatibilityError(
      `Official DSH Agent preset root is unavailable: ${String(error)}`,
    )
  }
  for (const id of SHIPPED_AGENT_PRESET_IDS) {
    for (const file of ['agent.cordis.yml', 'preset.yml']) {
      const path = join(root, id, file)
      if (!existsSync(path) || !statSync(path).isFile()) {
        throw new TuiHostCompatibilityError(`Official DSH Agent preset ${id} is missing ${file}.`)
      }
    }
  }
  return root
}

function compatibilityMessage(
  installed: string,
  supported: string,
  tuiVersion: string,
  detail: string,
): string {
  return [
    detail,
    `Installed DSH: ${installed}`,
    `Supported DSH: ${supported}`,
    `TUI package: ${tuiVersion}`,
    `Profile: ${PROFILE_NAME}`,
    `Recovery: dsh plugin --profile ${PROFILE_NAME} add --save-exact @lingxi-ai-cn/dsh-tui@${tuiVersion}`,
  ].join('\n')
}

/**
 * Validate already-resolved packages against one packed TUI manifest.
 * `workspace:*` is accepted only for the source checkout; `pnpm pack` replaces
 * it with an exact version before any user can install the package.
 * @param tuiManifest - source or packed top-level manifest.
 * @param packages - resolved official package facts.
 * @param activeProfileRoot - profile directory whose packages cannot own Host peers.
 * @returns validated compatibility report.
 */
export function validateTuiHostCompatibility(
  tuiManifest: PackageManifest,
  packages: readonly TuiHostPackageResolution[],
  activeProfileRoot: string,
): TuiHostCompatibilityReport {
  const tuiVersion = requiredString(tuiManifest.version, 'package version')
  const peerDependencies = tuiManifest.peerDependencies ?? {}
  const byName = new Map(packages.map(entry => [entry.name, entry]))
  const appBoot = byName.get('@deepseek-ai/dsh-app-boot')
  const installedDsh = appBoot?.version ?? 'unknown'
  const supportedDsh = peerDependencies['@deepseek-ai/dsh-app-boot']
  const supportedDshText = requiredString(supportedDsh, '@deepseek-ai/dsh-app-boot peer version')

  for (const [name, rawExpected] of Object.entries(peerDependencies)) {
    const expected = requiredString(rawExpected, `${name} peer version`)
    const actual = byName.get(name)
    if (actual === undefined) {
      throw new TuiHostCompatibilityError(compatibilityMessage(
        installedDsh,
        supportedDshText,
        tuiVersion,
        `Required Host package ${name} is missing.`,
      ))
    }
    if (!expected.startsWith('workspace:') && actual.version !== expected) {
      throw new TuiHostCompatibilityError(compatibilityMessage(
        installedDsh,
        supportedDshText,
        tuiVersion,
        `Host package ${name} is ${actual.version}; expected exactly ${expected}.`,
      ))
    }
    if (isInside(activeProfileRoot, actual.manifestPath)) {
      throw new TuiHostCompatibilityError(compatibilityMessage(
        installedDsh,
        supportedDshText,
        tuiVersion,
        `Host package ${name} resolves from the TUI profile instead of the DSH installation.`,
      ))
    }
  }

  return Object.freeze({
    compatibility: 'compatible',
    dshVersion: installedDsh,
    supportedDshVersion: supportedDshText,
    tuiVersion,
    profile: PROFILE_NAME,
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    packages: Object.freeze(packages.map(entry => Object.freeze({ ...entry }))),
    agentPresetIds: SHIPPED_AGENT_PRESET_IDS,
    recoveryCommand: `dsh plugin --profile ${PROFILE_NAME} add --save-exact @lingxi-ai-cn/dsh-tui@${tuiVersion}`,
  })
}

/**
 * Resolve and validate every Host peer named by the top-level package manifest.
 * @returns frozen report after all versions and paths pass.
 */
function inspectTuiHostInstallation(): TuiHostInstallation {
  const tuiManifest = readManifest(PACKAGE_MANIFEST)
  const peerDependencies = tuiManifest.peerDependencies ?? {}
  const officialDsh = resolvedPackage(OFFICIAL_DSH_PACKAGE)
  const hostPackages = hostPackageManifestIndex(officialDsh.manifestPath)
  const packages = Object.keys(peerDependencies).sort().map((name) => {
    const manifestPath = hostPackages.get(name)
    if (manifestPath === undefined) {
      throw new TuiHostCompatibilityError(`Required Host package ${name} is not reachable from ${OFFICIAL_DSH_PACKAGE}.`)
    }
    return resolvedManifestPackage(manifestPath)
  })
  const activeProfileRoot = profileRoot()
  const diagnostics = validateTuiHostCompatibility(
    tuiManifest,
    [...packages, officialDsh],
    activeProfileRoot,
  )
  const presetRoot = checkedPresetRoot(officialDsh, diagnostics.dshVersion, activeProfileRoot)
  return Object.freeze({ diagnostics, presetRoot })
}

/** Fail startup before command parsing or terminal negotiation on an unsupported Host. */
export function assertTuiHostCompatibility(): TuiHostCompatibilityReport {
  return inspectTuiHostInstallation().diagnostics
}

/** Resolve the verified official preset root alongside the bounded Host diagnostics. */
export function assertTuiHostInstallation(): TuiHostInstallation {
  return inspectTuiHostInstallation()
}
