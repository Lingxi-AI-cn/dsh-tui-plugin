/** TUI model defaults survive restart without replacing the shared Web selection. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SettingsFile from '@deepseek-ai/dsh-settings-file'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import { afterEach, expect, it } from 'vitest'
import { DEFAULT_TUI_SETTINGS, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA, type TuiSettings } from '../src/theme.tsx'

let root: string | undefined
const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

it('persists a TUI-only default and retains the shared fallback after reset', async () => {
  root = await mkdtemp(join(tmpdir(), 'tui-model-settings-'))
  const path = join(root, 'settings.json')
  const shared = { provider: 'openai-codex', model: 'gpt-official' }
  await writeFile(path, JSON.stringify({ 'agent-default-model': shared, tui: { locale: 'zh' } }))
  const mount = async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SettingsFile, { path, watch: false })
    await ctx.plugin(AgentDefaultModel, { provider: 'deepseek-official', model: 'fallback' })
    let source: () => TuiSettings = () => DEFAULT_TUI_SETTINGS
    ctx.settings.installSection(ctx, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA, DEFAULT_TUI_SETTINGS, {
      setSource: (current) => { source = current }, onChange: () => {},
    })
    return { ctx, selection: () => source().defaultModel ?? ctx.agentDefaultModel.currentSelection() }
  }
  const first = await mount()
  expect(first.selection()).toEqual(shared)
  const enhanced = { provider: 'lingxi-openai-codex', model: 'gpt-account' }
  await first.ctx.settings.update(TUI_SETTINGS_NAMESPACE, { defaultModel: enhanced })
  expect(first.selection()).toEqual(enhanced)
  expect(first.ctx.agentDefaultModel.currentSelection()).toEqual(shared)
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
    'agent-default-model': shared, tui: { locale: 'zh', defaultModel: enhanced },
  })
  await first.ctx.fiber.dispose()
  const restarted = await mount()
  expect(restarted.selection()).toEqual(enhanced)
  await restarted.ctx.settings.replace(TUI_SETTINGS_NAMESPACE, DEFAULT_TUI_SETTINGS)
  expect(restarted.selection()).toEqual(shared)
})
