/** TUI app flag parsing through the ordinary launcher command-line provider. */

import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { internals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { tuiHostDiagnosticsFromStartup } from '@lingxi-ai-cn/dsh-tui-runtime'
import * as tuiApp from '../src/index.ts'
import { apply as applyStartup, TUI_STARTUP_SERVICE, type TuiStartupValues } from '../src/startup.ts'

const originalInternals = { ...internals }
afterEach(() => { Object.assign(internals, originalInternals) })

function isStartupValues(value: unknown): value is TuiStartupValues {
  return typeof value === 'object' && value !== null
    && tuiHostDiagnosticsFromStartup(value) !== undefined
    && 'presetRoot' in value && typeof value.presetRoot === 'string'
    && (!('resume' in value) || typeof value.resume === 'string')
}

async function parse(args: string[]): Promise<{ value?: TuiStartupValues; exits: number[]; output: string }> {
  const exits: number[] = []
  let output = ''
  const sink = { write: (chunk: string) => { output += chunk; return true } }
  internals.stdout = sink
  internals.stderr = sink
  const ctx = new Context()
  provideCmdline(ctx, { args, exit: (code) => { exits.push(code) } })
  applyStartup(ctx)
  const value: unknown = ctx.get(TUI_STARTUP_SERVICE)
  await ctx.fiber.dispose()
  if (value !== undefined && !isStartupValues(value)) throw new Error('tuiStartup published an invalid test value')
  return { ...value === undefined ? {} : { value }, exits, output }
}

describe('TUI command-line provider', () => {
  it('provides a fresh or resumed startup value', async () => {
    const fresh = await parse([])
    expect(fresh).toMatchObject({
      value: {
        diagnostics: {
          compatibility: 'compatible', profile: 'tui',
          agentPresetIds: ['standard', 'code', 'minimal', 'cordis'],
        },
      },
      exits: [],
    })
    expect(fresh.value?.presetRoot).toContain('config/agent-presets')
    const resumed = await parse(['--resume', 'session-a'])
    expect(resumed).toMatchObject({
      value: {
        diagnostics: { compatibility: 'compatible', profile: 'tui' },
        resume: 'session-a',
      },
      exits: [],
    })
    expect(resumed.value?.presetRoot).toContain('config/agent-presets')
  })

  it('prints app-owned help without publishing startup', async () => {
    const result = await parse(['--help'])
    expect(result.output).toContain('dsh --profile tui')
    expect(result.value).toBeUndefined()
    expect(result.exits).toEqual([0])
  })
})

describe('TUI bundle plugin', () => {
  it('ships the verified read-only Plugin Hub registry and trust root', () => {
    const patches = loadOverlayPatches('tui-app test', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
    const rows = patches.flatMap(patch => patch.insert ?? [])
    expect(rows.find(row => row.id === 'plugin-hub')?.name).toBe('@lingxi-ai-cn/dsh-plugin-hub')
    const local = rows.find(row => row.id === 'plugin-hub-local')
    expect(local?.name).toBe('@lingxi-ai-cn/dsh-plugin-hub-local')
    const config = local?.config as { profile?: unknown; profileMutations?: unknown; registryUrl?: unknown; trustedKeys?: unknown }
    expect(config.profile).toBe('tui')
    expect(config.profileMutations).toBe(false)
    expect(config.registryUrl).toBe('https://redshell-ai.com:9000')
    expect(Array.isArray(config.trustedKeys)).toBe(true)
    const trustedKey = (config.trustedKeys as unknown[] | undefined)?.[0]
    expect(trustedKey).toMatchObject({ keyId: 'registry-2026-08' })
    const publicKey = (trustedKey as { publicKey?: unknown } | undefined)?.publicKey
    expect(typeof publicKey).toBe('string')
    expect(publicKey as string).toContain('MCowBQYDK2VwAyEA')
  })

  it('survives Loader namespace unwrapping and registers its model-visible surface section', async () => {
    expect('default' in tuiApp).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(tuiApp)).toBe(tuiApp)

    const ctx = new Context()
    tuiApp.apply(ctx)
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(section => section.name === 'harness:source')?.text)
      .toContain('DeepSeek Harness implementation checkout')
    expect(assembly.sections.find(section => section.name === 'app:tui-surface')?.text)
      .toContain('native DeepSeek Harness terminal UI')
    await ctx.fiber.dispose()
  })
})
