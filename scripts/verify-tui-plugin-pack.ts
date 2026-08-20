/** Pack and audit the complete independently published TUI package family. */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const VERSION = '0.1.0-rc.8'
const PACKAGE_DIRS = Object.freeze([
  'packages/boot/profile-plugin-manager',
  'packages/interaction/plugin-hub',
  'packages/host/session-export',
  'packages/interaction/plugin-hub-local',
  'packages/ui/tui',
  'packages/bundle/tui-app',
])

interface PackedManifest {
  readonly name: string
  readonly version: string
  readonly main?: string
  readonly types?: string
  readonly bin?: unknown
  readonly scripts?: Readonly<Record<string, string>>
  readonly exports?: Readonly<Record<string, unknown>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}

function fail(message: string): never {
  throw new Error(`verify-tui-plugin-pack: ${message}`)
}

function assertExactSpecs(manifest: PackedManifest): void {
  for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    if (/^(?:workspace|file|link):/u.test(spec)) fail(`${manifest.name} retains local protocol ${name}@${spec}`)
    if ((name.startsWith('@lingxi-ai-cn/dsh-') || name.startsWith('@deepseek-ai/dsh-')) && spec !== VERSION) {
      fail(`${manifest.name} must pin ${name} exactly to ${VERSION}, got ${spec}`)
    }
    if (name.startsWith('@deepseek-ai/') && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(spec)) {
      fail(`${manifest.name} must pin Host peer ${name} to one exact version, got ${spec}`)
    }
  }
}

function exportTargets(value: unknown): readonly string[] {
  if (typeof value === 'string') return value.startsWith('./') ? [value.slice(2)] : []
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(exportTargets)
}

const temporary = mkdtempSync(join(tmpdir(), 'dsh-tui-pack-audit-'))
try {
  for (const directory of PACKAGE_DIRS) {
    const packDir = join(temporary, 'tarballs')
    mkdirSync(packDir, { recursive: true })
    const before = new Set(existsSync(packDir) ? readdirSync(packDir) : [])
    execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
      cwd: join(ROOT, directory),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const tarball = readdirSync(packDir).find(entry => entry.endsWith('.tgz') && !before.has(entry))
    if (tarball === undefined) fail(`${directory} did not produce one tarball`)
    const extracted = join(temporary, directory.replaceAll('/', '-'))
    mkdirSync(extracted, { recursive: true })
    execFileSync('tar', ['-xzf', join(packDir, tarball), '-C', extracted], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const packageRoot = join(extracted, 'package')
    const packed = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as PackedManifest
    if (packed.version !== VERSION) fail(`${packed.name} has version ${packed.version}`)
    if (!packed.name.startsWith('@lingxi-ai-cn/dsh-')) fail(`${packed.name} is outside the public TUI scope`)
    if (packed.bin !== undefined || packed.scripts !== undefined) fail(`${packed.name} exposes a bin or lifecycle scripts`)
    assertExactSpecs(packed)

    const files = readdirSync(packageRoot, { recursive: true, encoding: 'utf8' })
      .map(path => path.replaceAll('\\', '/'))
    if (files.some(path => path.startsWith('src/') || path.endsWith('.map'))) {
      fail(`${packed.name} contains source or source-map payloads`)
    }
    for (const file of files.filter(path => path.endsWith('.js'))) {
      const source = readFileSync(join(packageRoot, file), 'utf8')
      const imports = [...source.matchAll(/(?:from\s+|import\s*\()\s*['"](?<path>\.\/[^'"]+)['"]/gu)]
      for (const match of imports) {
        const target = match.groups?.path
        if (target !== undefined && !existsSync(join(dirname(join(packageRoot, file)), target))) {
          fail(`${packed.name} ${file} imports absent packed chunk ${target}`)
        }
      }
    }
    for (const target of [packed.main, packed.types, ...exportTargets(packed.exports)]) {
      if (target !== undefined && !existsSync(join(packageRoot, target))) {
        fail(`${packed.name} export target ${target} is absent from the tarball`)
      }
    }
    if (packed.name === '@lingxi-ai-cn/dsh-tui') {
      for (const required of ['README.md', 'LICENSE', 'cordis.patch.yml']) {
        if (!existsSync(join(packageRoot, required))) fail(`${packed.name} omits ${required}`)
      }
    }
  }
  process.stdout.write(`verify-tui-plugin-pack: ${PACKAGE_DIRS.length} exact package tarballs passed\n`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
