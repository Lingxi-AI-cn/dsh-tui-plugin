/** Official Agent Preset Registry roster and Settings-owned default selection. */

import { describe, expect, it, vi } from 'vitest'
import {
  collectTuiPresetManager,
  copyTuiPreset,
  deleteTuiPreset,
  readTuiPresetComposition,
  setTuiDefaultPreset,
  tuiPresetMutationErrorMessage,
  TuiPresetIdError,
  validateTuiPresetId,
  type TuiPresetSettings,
} from '../src/preset-manager.ts'
import type { AgentPreset, TuiAgentPresets } from '../src/host.ts'

function preset(overrides: Partial<AgentPreset> & { id: string }): AgentPreset {
  return {
    trust: 'system',
    path: `/presets/${overrides.id}/agent.cordis.yml`,
    ...overrides,
  }
}

function service(
  roster: AgentPreset[],
  defaultId = 'standard',
): TuiAgentPresets {
  return {
    list: vi.fn(async () => roster),
    resolve: vi.fn(async (id?: string) => {
      const found = roster.find(p => p.id === (id ?? defaultId))
      if (!found) throw new Error(`unknown: ${id}`)
      return found
    }),
    mount: vi.fn(),
    recompose: vi.fn(),
    composedPreset: vi.fn(),
    compositionInventory: vi.fn(async () => roster.map(item => ({
      id: item.id,
      trust: item.trust,
      ...item.name === undefined ? {} : { name: item.name },
      isDefault: item.id === defaultId,
      ...item.broken === undefined ? {} : { broken: item.broken },
      rows: item.broken === undefined ? [{
        entryId: 'tools', moduleName: '@deepseek-ai/dsh-tools', enabled: true as const,
      }] : [],
    }))),
    readDocument: vi.fn(async (id: string) => ({
      agentPreset: id, content: `# ${id}\n- row: plugin-a\n- row: plugin-b`,
    })),
    get defaultId() { return defaultId },
  }
}

function settings(revision = 0): TuiPresetSettings & { mutate: ReturnType<typeof vi.fn> } {
  return {
    writable: true,
    describe: vi.fn(() => [{ ns: 'agent-preset-registry' as never, autoGenerate: true,
      schema: {}, value: {}, applies: 'live' as const, revision }]),
    mutate: vi.fn(async () => {}),
  }
}

describe('native TUI Preset Manager', () => {
  it('projects declared presets with current, default, and Settings capability flags', async () => {
    const roster = [
      preset({ id: 'standard', name: 'Standard', trust: 'system', order: 0 }),
      preset({ id: 'minimal', name: 'Minimal', trust: 'system', order: 2 }),
      preset({ id: 'my-preset', name: 'My Preset', trust: 'user' }),
      preset({ id: 'broken-one', trust: 'user', broken: 'unparsable YAML' }),
    ]
    const snapshot = await collectTuiPresetManager(service(roster), 'standard', 'en', settings())

    expect(snapshot.defaultPresetId).toBe('standard')
    expect(snapshot.defaultRevision).toBe(0)
    expect(snapshot.currentPresetId).toBe('standard')
    expect(snapshot.authorable).toBe(false)
    expect(snapshot.compositionState).toBe('ready')
    expect(snapshot.rows).toHaveLength(4)

    const standard = snapshot.rows[0]!
    expect(typeof standard.name).toBe('string')
    expect(standard).toMatchObject({
      trust: 'declared',
      current: true,
      isDefault: true,
      canCopy: false,
      canDelete: false,
      canSetDefault: false,
      composition: { rows: [{ entryId: 'tools', moduleName: '@deepseek-ai/dsh-tools', enabled: true }] },
    })

    const minimal = snapshot.rows[1]!
    expect(minimal).toMatchObject({
      trust: 'declared',
      current: false,
      isDefault: false,
      canCopy: false,
      canDelete: false,
      canSetDefault: true,
    })

    const broken = snapshot.rows.find(r => r.preset.id === 'broken-one')!
    expect(broken).toMatchObject({
      broken: 'unparsable YAML',
      canCopy: false,
      canDelete: false,
      canSetDefault: false,
    })

    const userPreset = snapshot.rows.find(r => r.preset.id === 'my-preset')!
    expect(userPreset).toMatchObject({
      trust: 'declared',
      canCopy: false,
      canDelete: false,
      canSetDefault: true,
    })
  })

  it('validates preset ids against the required pattern and existing roster', () => {
    const existing = ['standard', 'minimal', 'code']
    expect(validateTuiPresetId('  my-custom  ', existing)).toBe('my-custom')
    expect(validateTuiPresetId('a1-preset', existing)).toBe('a1-preset')

    expect(() => validateTuiPresetId('', existing)).toThrow(TuiPresetIdError)
    expect(() => validateTuiPresetId('  ', existing)).toThrow(TuiPresetIdError)
    expect(() => validateTuiPresetId('My Preset', existing)).toThrow(TuiPresetIdError)
    expect(() => validateTuiPresetId('../escape', existing)).toThrow(TuiPresetIdError)
    expect(() => validateTuiPresetId('-leading', existing)).toThrow(TuiPresetIdError)
    expect(() => validateTuiPresetId('standard', existing)).toThrow(TuiPresetIdError)

    let failure: unknown
    try { validateTuiPresetId('standard', existing) } catch (e) { failure = e }
    expect(failure).toBeInstanceOf(TuiPresetIdError)
    expect((failure as TuiPresetIdError).code).toBe('id-taken')
  })

  it('refuses directory authoring that the official registry does not provide', async () => {
    const svc = service([preset({ id: 'standard', trust: 'system' })])
    await expect(copyTuiPreset(svc, 'standard', 'my-copy', 'My Copy')).rejects.toThrow(/unavailable/u)
    await expect(deleteTuiPreset(svc, 'standard')).rejects.toThrow(/unavailable/u)
  })

  it('sets a valid future default through Settings at the observed revision', async () => {
    const svc = service([preset({ id: 'standard' }), preset({ id: 'minimal' }), preset({ id: 'broken', broken: 'error' })])
    const owner = settings(7)
    await setTuiDefaultPreset(svc, owner, 'minimal', 7)
    expect(owner.mutate).toHaveBeenCalledWith('agent-preset-registry', [
      { op: 'set', path: ['selectedDefault'], value: 'minimal' },
    ], 7)
    await expect(setTuiDefaultPreset(svc, owner, 'missing', 7)).rejects.toThrow(/unknown or broken/u)
    await expect(setTuiDefaultPreset(svc, owner, 'broken', 7)).rejects.toThrow(/unknown or broken/u)
    await expect(setTuiDefaultPreset(svc, owner, 'minimal', undefined)).rejects.toThrow(/read-only/u)
  })

  it('reads and bounds composition text', async () => {
    const svc = service([preset({ id: 'standard', trust: 'system' })])
    const preview = await readTuiPresetComposition(svc, 'standard')
    expect(preview.text).toContain('# standard')
    expect(preview.truncated).toBe(false)

    const longText = 'x'.repeat(5_000)
    const longSvc = { ...svc, readDocument: vi.fn(async () => ({ agentPreset: 'standard', content: longText })) }
    const truncated = await readTuiPresetComposition(longSvc, 'standard')
    expect(truncated.truncated).toBe(true)
    expect(truncated.text.length).toBeLessThanOrEqual(4_096)
  })

  it('reports non-authorable deployments that cannot copy', async () => {
    const svc = service([preset({ id: 'standard', trust: 'system' })])
    const snapshot = await collectTuiPresetManager(svc, 'standard', 'en')
    expect(snapshot.authorable).toBe(false)
    expect(snapshot.rows[0]!.canCopy).toBe(false)
  })

  it('keeps structured composition capability absence and owner failure distinct', async () => {
    const base = service([preset({ id: 'standard', trust: 'system' })])
    const unavailable = Object.fromEntries(Object.entries(base)
      .filter(([name]) => name !== 'compositionInventory')) as unknown as TuiAgentPresets
    const unavailableSnapshot = await collectTuiPresetManager(unavailable, 'standard', 'en')
    expect(unavailableSnapshot.compositionState).toBe('unavailable')
    expect(unavailableSnapshot.rows[0]?.composition).toBeUndefined()

    const failed = { ...base, compositionInventory: vi.fn(async () => { throw new Error('private path') }) }
    const failedSnapshot = await collectTuiPresetManager(failed, 'standard', 'en')
    expect(failedSnapshot.compositionState).toBe('error')
    expect(failedSnapshot.rows[0]?.composition).toBeUndefined()
  })

  it('hides default mutation when Settings or its registry entry is unavailable', async () => {
    const registry = service([
      preset({ id: 'standard', trust: 'system' }),
      preset({ id: 'minimal', trust: 'system' }),
    ])
    const snapshot = await collectTuiPresetManager(registry, 'standard', 'en')
    expect(snapshot.defaultRevision).toBeUndefined()
    expect(snapshot.rows.every(row => !row.canSetDefault)).toBe(true)
    await expect(setTuiDefaultPreset(registry, undefined, 'minimal', 1)).rejects.toThrow(/read-only/u)
    const missing = { ...settings(), describe: vi.fn(() => []) as TuiPresetSettings['describe'] }
    expect((await collectTuiPresetManager(registry, 'standard', 'en', missing)).rows.every(row => !row.canSetDefault)).toBe(true)
  })

  it('maps owner races and read-only settings without leaking implementation errors', () => {
    expect(tuiPresetMutationErrorMessage({ code: 'SETTINGS_CONFLICT' }, 'setDefault', 'en'))
      .toContain('changed elsewhere')
    expect(tuiPresetMutationErrorMessage(new Error('preset already exists'), 'copy', 'zh'))
      .toContain('已被占用')
    expect(tuiPresetMutationErrorMessage(
      new Error('preset default is read-only because settings are unavailable'), 'setDefault', 'en',
    )).toContain('read-only')
    expect(tuiPresetMutationErrorMessage(new Error('private filesystem detail'), 'copy', 'zh'))
      .toBe('无法复制 preset，当前草稿已保留。')
  })
})
