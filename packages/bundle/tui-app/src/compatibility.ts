/** Packed-manifest Host compatibility checks that run before terminal mutation. */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'

const PACKAGE_MANIFEST = new URL('../package.json', import.meta.url)
const PROFILE_NAME = 'tui'

interface PackageManifest {
  readonly name?: unknown
  readonly version?: unknown
  readonly peerDependencies?: Readonly<Record<string, unknown>>
}

/** One resolved official package used by the TUI bundle. */
export interface TuiHostPackageResolution {
  /** Exact npm package name. */
  readonly name: string
  /** Installed package version. */
  readonly version: string
  /** Canonical package.json path. */
  readonly manifestPath: string
}

/** Complete result retained by startup diagnostics and tests. */
export interface TuiHostCompatibilityReport {
  /** Installed DSH release, represented by the app-boot package. */
  readonly dshVersion: string
  /** TUI bundle release. */
  readonly tuiVersion: string
  /** Fixed profile identity required by this bundle. */
  readonly profile: typeof PROFILE_NAME
  /** Official packages resolved outside the profile installation. */
  readonly packages: readonly TuiHostPackageResolution[]
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

function packageManifestPath(packageName: string): string {
  const request = createRequire(import.meta.url)
  for (const searchPath of request.resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName, 'package.json')
    if (existsSync(candidate)) return realpathSync(candidate)
  }
  throw new TuiHostCompatibilityError(`Required Host package ${packageName} is not resolvable.`)
}

function resolvedPackage(packageName: string): TuiHostPackageResolution {
  const manifestPath = packageManifestPath(packageName)
  const manifest = readManifest(manifestPath)
  return {
    name: requiredString(manifest.name, `${packageName} name`),
    version: requiredString(manifest.version, `${packageName} version`),
    manifestPath,
  }
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

  return {
    dshVersion: installedDsh,
    tuiVersion,
    profile: PROFILE_NAME,
    packages: Object.freeze([...packages]),
  }
}

/**
 * Resolve and validate every Host peer named by the top-level package manifest.
 * @returns frozen report after all versions and paths pass.
 */
function inspectTuiHostCompatibility(): TuiHostCompatibilityReport {
  const tuiManifest = readManifest(PACKAGE_MANIFEST)
  const peerDependencies = tuiManifest.peerDependencies ?? {}
  const packages = Object.keys(peerDependencies).sort().map(resolvedPackage)
  return validateTuiHostCompatibility(tuiManifest, packages, profileRoot())
}

/** Fail startup before command parsing or terminal negotiation on an unsupported Host. */
export function assertTuiHostCompatibility(): void {
  inspectTuiHostCompatibility()
}
