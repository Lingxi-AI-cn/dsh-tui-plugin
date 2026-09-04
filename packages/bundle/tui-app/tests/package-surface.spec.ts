/** Source-manifest and patch closure for the independently published TUI family. */

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const ROOT = new URL('../../../..', import.meta.url)
const PACKAGE_DIRS = Object.freeze([
  'packages/bundle/tui-app',
  'packages/llm/llm-openai-codex',
  'packages/ui/tui',
  'packages/host/session-export',
  'packages/interaction/plugin-hub',
  'packages/interaction/plugin-hub-local',
  'packages/boot/profile-plugin-manager',
])
const REPOSITORY = 'git+https://github.com/Lingxi-AI-cn/dsh-tui-plugin.git'

interface PackageManifest {
  readonly name: string
  readonly version: string
  readonly bin?: unknown
  readonly scripts?: Readonly<Record<string, string>>
  readonly files?: readonly string[]
  readonly exports?: Readonly<Record<string, unknown>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>
  readonly repository?: { readonly url?: string }
}

function manifest(directory: string): PackageManifest {
  return JSON.parse(readFileSync(new URL(`${directory}/package.json`, ROOT), 'utf8')) as PackageManifest
}

function sourceFiles(directory: string): readonly string[] {
  const output: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (['.ts', '.tsx'].includes(extname(entry.name))) output.push(child)
    }
  }
  visit(new URL(`${directory}/src`, ROOT).pathname)
  return output
}

describe('post-install TUI package surface', () => {
  const manifests = PACKAGE_DIRS.map(directory => manifest(directory))
  const top = manifests[0]!

  it('publishes one same-version Lingxi package family without install hooks or source exports', () => {
    expect(new Set(manifests.map(entry => entry.version))).toEqual(new Set(['0.1.8-rc.1']))
    for (const entry of manifests) {
      expect(entry.name).toMatch(/^@lingxi-ai-cn\/dsh-/u)
      expect(entry.repository?.url).toBe(REPOSITORY)
      expect(entry.bin).toBeUndefined()
      expect(entry.scripts).toBeUndefined()
      expect(Object.keys(entry.exports ?? {})).not.toContain('./src/*')
      expect(Object.values(entry.files ?? []).some(path => path.startsWith('src/'))).toBe(false)
      for (const [name, spec] of Object.entries({ ...entry.dependencies, ...entry.peerDependencies })) {
        if (name.startsWith('@lingxi-ai-cn/dsh-')) expect(spec).toBe('workspace:*')
      }
    }
    expect(top.files).toEqual(expect.arrayContaining(['cordis.patch.yml', 'README.md', 'LICENSE']))
  })

  it('keeps every official package as an exact packed peer supplied by the DSH installation', () => {
    const topPeers = new Set(Object.keys(top.peerDependencies ?? {}))
    for (const entry of manifests) {
      expect(Object.keys(entry.dependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/'))).toEqual([])
      for (const name of Object.keys(entry.peerDependencies ?? {})) {
        if (name.startsWith('@deepseek-ai/')) expect(topPeers.has(name)).toBe(true)
      }
    }
  })

  it('marks installation-supplied peers optional only for package-manager resolution', () => {
    for (const entry of manifests) {
      const installationPeers = Object.keys(entry.peerDependencies ?? {})
        .filter(name => !name.startsWith('@lingxi-ai-cn/'))
        .sort()
      expect(Object.keys(entry.peerDependenciesMeta ?? {}).sort()).toEqual(installationPeers)
      for (const name of installationPeers) {
        expect(entry.peerDependenciesMeta?.[name]).toEqual({ optional: true })
      }
    }
  })

  it('centralizes official imports in the reviewed Host adapters', () => {
    for (const directory of ['packages/bundle/tui-app', 'packages/ui/tui']) {
      const violations = sourceFiles(directory).filter(path => !path.endsWith('/host.ts')
        && !path.endsWith('/extensions.ts')).flatMap((path) => {
        const source = readFileSync(path, 'utf8')
        return /(?:from|import)\s+['"]@deepseek-ai\//u.test(source) ? [path] : []
      })
      expect(violations).toEqual([])
    }
  })

  it('ships a patch whose inserted packages are in the public dependency or Host-peer closure', () => {
    const patches = loadOverlayPatches('post-install package surface', new URL('../cordis.patch.yml', import.meta.url).pathname)
    const overrides = new Set(patches.filter(entry => entry.id !== undefined).map(entry => entry.id))
    expect(overrides).toEqual(new Set([
      'system-prompt', 'hmr', 'tools',
      'tool-bash', 'tool-pwsh', 'tool-jobs', 'tool-fs', 'tool-fs-search',
      'tool-str-replace-editor', 'skill-filesystem', 'tool-skill', 'tool-goal', 'command-goal',
      'plan-mode', 'compaction-basic', 'command-compact', 'tool-result-pruner',
      'tool-subagent-control', 'tool-subagent-list-agents', 'tool-subagent',
      'tool-subagent-fork', 'workflow-worker-thread', 'tool-workflow', 'tool-ralph',
      'agent-instructions', 'tool-todo', 'tool-web',
    ]))
    const closure = new Set([top.name, ...Object.keys(top.dependencies ?? {}), ...Object.keys(top.peerDependencies ?? {})])
    const rows = patches.flatMap(entry => entry.insert ?? [])
    const inserted = rows.map(entry => entry.name).filter((name): name is string => name !== undefined)
    expect(inserted.filter(name => name.startsWith('@deepseek-ai/') || name.startsWith('@lingxi-ai-cn/'))
      .filter(name => ![...closure].some(owner => name === owner || name.startsWith(`${owner}/`))
        && !name.startsWith(`${top.name}/`))).toEqual([])
    expect(rows.some(entry => entry.id === 'code-runtime'
      && entry.name === '@deepseek-ai/dsh-code-runtime-worker-thread')).toBe(true)
    expect(rows.find(entry => entry.id === 'cordis-host-runner')?.name)
      .toBe('@deepseek-ai/dsh-cordis-host-runner')
    expect(rows.find(entry => entry.id === 'agent-presets')).toMatchObject({
      name: '@deepseek-ai/dsh-agent-presets',
      config: { default: 'standard', includeShippedRoot: true, includeUserRoot: true },
    })
    expect(rows.find(entry => entry.id === 'message-feedback')?.name)
      .toBe('@deepseek-ai/dsh-message-feedback')
    expect(rows.find(entry => entry.id === 'directory-picker')).toMatchObject({
      name: '@deepseek-ai/dsh-host-directory-picker-browse', config: { maxEntries: 1000 },
    })
    expect(rows.find(entry => entry.id === 'host-plugin-inventory')?.name)
      .toBe('@deepseek-ai/dsh-host-plugin-inventory')
    expect(rows.some(entry => entry.id === 'tool-ask-user')).toBe(false)
    expect(rows.find(entry => entry.id === 'plugin-hub-local')?.config)
      .toMatchObject({ profile: 'tui', profileMutations: false })
  })
})
