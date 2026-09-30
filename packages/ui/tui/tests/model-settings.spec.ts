/** TUI model preference survives a real Profile patch restart without changing the shared default. */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { boot, initProfile, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import Settings from '@deepseek-ai/dsh-settings'
import { z } from '../src/host.ts'
import { TUI_SETTINGS_FIELDS } from '../src/theme.tsx'

it('persists a TUI-only model selection through the official Settings owner', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'tui-model-settings-')))
  onTestFinished(() => { rmSync(home, { recursive: true, force: true }) })
  const dir = join(home, 'profiles', 'test')
  initProfile(dir, ['test-bundle'])
  const bundle = join(dir, 'node_modules', 'test-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"test-installation"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: 'default-model', name: 'cordis:model', config: { provider: 'test', model: 'original' } },
    { id: 'first', name: 'cordis:probe', config: { ordinary: 'fixed', token: 'private' } },
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', startedBundles: ['test-bundle'], dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }
  const Probe = {
    Config: z.object({
      ordinary: z.string().required(),
      token: z.string().role('secret').volatile(),
      defaultModel: TUI_SETTINGS_FIELDS.defaultModel.volatile(),
    }),
    apply: () => {},
  }
  const start = async () => {
    const active = await boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), (ctx) => {
      ctx.provide('profileContext', profile)
      ctx.provide('appReady', { onReady: (listener: () => void) => { listener(); return () => {} } })
      Object.assign(ctx.loader.builtins, {
        editor: ConfigEditor, settings: Settings, model: DefaultModel, probe: Probe,
      })
    })
    onTestFinished(async () => { await active.fiber.dispose() })
    return active
  }
  const ctx = await start()
  const shared = { provider: 'test', model: 'original' }
  const selected = () => {
    const descriptor = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === 'first')
    const local = (descriptor?.value as { defaultModel?: typeof shared } | undefined)?.defaultModel
    return local ?? ctx.agentDefaultModel.currentSelection()
  }
  expect(selected()).toEqual(shared)
  const local = { provider: 'lingxi-openai-codex', model: 'gpt-account' }
  const revision = ctx.settings.describe().find(row => row.ns === 'first')!.revision
  await ctx.settings.mutate('first', [{ op: 'set', path: ['defaultModel'], value: local }], revision)
  expect(selected()).toEqual(local)
  expect(ctx.agentDefaultModel.currentSelection()).toEqual(shared)
  expect(readFileSync(profile.patchPath, 'utf8')).toContain('gpt-account')
  await ctx.fiber.dispose()
  const restored = await start()
  const persisted = restored.settings.describe({ redactSecrets: true }).find(row => row.ns === 'first')!
  expect((persisted.value as { defaultModel: typeof local }).defaultModel).toEqual(local)
  await restored.settings.mutate('first', [{ op: 'unset', path: ['defaultModel'] }], persisted.revision)
  expect(restored.agentDefaultModel.currentSelection()).toEqual(shared)
  expect((restored.settings.describe().find(row => row.ns === 'first')!.value as { defaultModel?: unknown }).defaultModel)
    .toBeUndefined()
})
