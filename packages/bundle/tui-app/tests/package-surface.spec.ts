/** Source-manifest and patch closure for the independently published TUI family. */

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import type { Config as PersonaConfig } from '@deepseek-ai/dsh-persona'

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
  readonly dsh?: { readonly bundle?: { readonly patch?: string | readonly string[] } }
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

  it('retains Schedule authorization in the Minimal complete persona', async () => {
    const patches = loadOverlayPatches('TUI Minimal', new URL('../presets/minimal.patch.yml', import.meta.url).pathname)
    const preset = patches.flatMap(patch => patch.insert ?? []).find(row => row.id === 'preset-minimal')
    const config = preset?.config as { plugins: { name: string; config?: PersonaConfig }[] }
    expect(config.plugins.some(row => row.name === '@deepseek-ai/dsh-tool-schedule')).toBe(true)
    const persona = config.plugins.find(row => row.name === '@deepseek-ai/dsh-persona')?.config
    expect(persona?.complete).toBe(true)
    if (persona === undefined) throw new Error('Minimal persona is missing')
    const instruction = "Only create or modify scheduled tasks at the user's explicit request; "
      + 'prior explicit user authorization for the running scheduled task remains valid.'
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      ctx.systemPrompt.section({ name: 'tool:schedule', order: 100, text: instruction })
      ctx.systemPrompt.section({
        name: 'minimal-persona', order: 0, text: persona.prefix, complete: persona.complete === true,
      })
      const assembly = await ctx.systemPrompt.assemble()
      expect(assembly.sections.some(section => section.name === 'tool:schedule')).toBe(false)
      expect(renderPrompt(assembly)).toContain(instruction)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('publishes one same-version Lingxi package family without install hooks or source exports', () => {
    expect(new Set(manifests.map(entry => entry.version))).toEqual(new Set(['0.1.15-rc.1']))
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
    expect(top.files).toEqual(expect.arrayContaining([
      'cordis.patch.yml', 'presets/standard.patch.yml', 'presets/ptc.patch.yml',
      'presets/minimal.patch.yml', 'presets/cordis.patch.yml', 'README.md', 'LICENSE',
    ]))
    expect(Object.keys(top.exports ?? {}).filter(key => key.startsWith('./presets/'))).toEqual([
      './presets/standard.patch.yml', './presets/ptc.patch.yml',
      './presets/minimal.patch.yml', './presets/cordis.patch.yml',
    ])
  })

  it('composes the four official preset declarations after the TUI registry', () => {
    const files = top.dsh?.bundle?.patch
    expect(files).toEqual([
      './cordis.patch.yml', './presets/standard.patch.yml', './presets/ptc.patch.yml',
      './presets/minimal.patch.yml', './presets/cordis.patch.yml',
    ])
    if (!Array.isArray(files)) throw new Error('TUI bundle has no ordered preset patch files')
    const layers = files.map(file => loadOverlayPatches('TUI preset closure', new URL(`../${file}`, import.meta.url).pathname))
    const registry = layers[0]?.flatMap(patch => patch.insert ?? []).find(row => row.id === 'agent-preset-registry')
    expect(registry?.name).toBe('@deepseek-ai/dsh-agent-preset-registry')
    const rows = layers.slice(1).flatMap(layer => layer.flatMap(patch => patch.insert ?? []))
    expect(rows.map(row => row.id)).toEqual(['preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis'])
    expect(rows.every(row => row.name === '@deepseek-ai/dsh-agent-preset')).toBe(true)
    expect(rows.map(row => (row.config as { id?: string } | undefined)?.id))
      .toEqual(['standard', 'ptc', 'minimal', 'cordis'])
    expect(top.peerDependencies).toHaveProperty('@deepseek-ai/dsh-agent-preset')
    expect(top.peerDependencies).toHaveProperty('@deepseek-ai/dsh-tool-executor-ptc')
    expect(top.peerDependencies).not.toHaveProperty('@deepseek-ai/dsh-agent-tool-presentation')
    const ptc = rows.find(row => row.id === 'preset-ptc')?.config as { plugins?: unknown[] } | undefined
    expect(ptc?.plugins).toEqual(expect.arrayContaining([
      { id: 'tool-executor-ptc', name: '@deepseek-ai/dsh-tool-executor-ptc' },
    ]))
    const base = loadOverlayPatches('TUI base', fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-base/cordis.patch.yml')))
    const composed = composeEntries([base, ...layers])
    expect(composed.filter(row => row.id?.startsWith('preset-')).map(row => row.id))
      .toEqual(['preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis'])
    expect(composed.find(row => row.id === 'agent-preset-registry')?.name)
      .toBe('@deepseek-ai/dsh-agent-preset-registry')
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
      'system-prompt', 'hmr',
      'tool-plugin-manager', 'tool-bash', 'tool-pwsh', 'tool-jobs', 'tool-fs', 'tool-fs-search',
      'skill-filesystem', 'tool-skill', 'tool-goal', 'command-goal',
      'plan-mode', 'compaction-basic', 'command-compact', 'tool-result-pruner',
      'tool-subagent-control', 'tool-subagent',
      'tool-subagent-fork', 'workflow-ptc', 'tool-workflow',
      'agent-instructions', 'tool-todo', 'tool-web',
    ]))
    const closure = new Set([top.name, ...Object.keys(top.dependencies ?? {}), ...Object.keys(top.peerDependencies ?? {})])
    const rows = patches.flatMap(entry => entry.insert ?? [])
    const inserted = rows.map(entry => entry.name).filter((name): name is string => name !== undefined)
    expect(inserted.filter(name => name.startsWith('@deepseek-ai/') || name.startsWith('@lingxi-ai-cn/'))
      .filter((name) => {
        const packageName = /^(@[^/]+\/[^/]+)/u.exec(name)?.[1]
        return packageName === undefined || !closure.has(packageName)
      })).toEqual([])
    expect(rows.some(entry => ['code-runtime', 'storage', 'storage-json', 'storage-domain', 'session-projection-cache']
      .includes(entry.id ?? ''))).toBe(false)
    expect(rows.find(entry => entry.id === 'cordis-host-runner')?.name)
      .toBe('@deepseek-ai/dsh-cordis-host-runner')
    expect(rows.find(entry => entry.id === 'agent-preset-registry')).toMatchObject({
      name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'standard' },
    })
    expect(rows.find(entry => entry.id === 'session-controller')?.name)
      .toBe('@deepseek-ai/dsh-api-session-controller')
    expect(rows.find(entry => entry.id === 'workspace')?.name).toBe('@deepseek-ai/dsh-workspace')
    expect(rows.find(entry => entry.id === 'message-feedback')?.name).toBe('@deepseek-ai/dsh-message-feedback')
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
