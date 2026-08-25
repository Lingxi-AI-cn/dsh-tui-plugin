/** Agent Preset Manager roster projection, validation, copy, and delete. */

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
  setDefault = vi.fn(async () => {}),
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
    read: vi.fn(async (id: string) => `# ${id}\n- row: plugin-a\n- row: plugin-b`),
    copy: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    setDefault,
    get defaultId() { return defaultId },
    defaultRevision: 0,
    authorable: true,
    roots: [{ path: '/system', trust: 'system' as const }, { path: '~/.agent-presets', trust: 'user' as const }],
  }
}

describe('native TUI Preset Manager', () => {
  it('projects system and user presets with current, default, and capability flags', async () => {
    const roster = [
      preset({ id: 'standard', name: 'Standard', trust: 'system', order: 0 }),
      preset({ id: 'minimal', name: 'Minimal', trust: 'system', order: 2 }),
      preset({ id: 'my-preset', name: 'My Preset', trust: 'user' }),
      preset({ id: 'broken-one', trust: 'user', broken: 'unparsable YAML' }),
    ]
    const snapshot = await collectTuiPresetManager(service(roster), 'standard', 'en')

    expect(snapshot.defaultPresetId).toBe('standard')
    expect(snapshot.defaultRevision).toBe(0)
    expect(snapshot.currentPresetId).toBe('standard')
    expect(snapshot.authorable).toBe(true)
    expect(snapshot.rows).toHaveLength(4)

    const standard = snapshot.rows[0]!
    expect(typeof standard.name).toBe('string')
    expect(standard).toMatchObject({
      trust: 'system',
      current: true,
      isDefault: true,
      canCopy: true,
      canDelete: false,
      canSetDefault: false,
    })

    const minimal = snapshot.rows[1]!
    expect(minimal).toMatchObject({
      trust: 'system',
      current: false,
      isDefault: false,
      canCopy: true,
      canDelete: false,
      canSetDefault: true,
    })

    const broken = snapshot.rows.find(r => r.preset.id === 'broken-one')!
    expect(broken).toMatchObject({
      broken: 'unparsable YAML',
      canCopy: false,
      canDelete: true,
      canSetDefault: false,
    })

    const userPreset = snapshot.rows.find(r => r.preset.id === 'my-preset')!
    expect(userPreset).toMatchObject({
      trust: 'user',
      canCopy: true,
      canDelete: true,
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

  it('copies an existing preset through the Host service', async () => {
    const svc = service([preset({ id: 'standard', trust: 'system' })])
    const result = await copyTuiPreset(svc, 'standard', 'my-copy', 'My Copy')
    expect(result).toEqual({ id: 'my-copy' })
    expect(svc.copy).toHaveBeenCalledWith('standard', 'my-copy', 'My Copy')
  })

  it('deletes a user-owned preset through the Host service', async () => {
    const svc = service([preset({ id: 'custom', trust: 'user' })])
    await deleteTuiPreset(svc, 'custom')
    expect(svc.remove).toHaveBeenCalledWith('custom')
  })

  it('sets the future default through the owner at the roster revision', async () => {
    const setDefault = vi.fn(async () => {})
    const svc = service([preset({ id: 'standard' }), preset({ id: 'minimal' })], 'standard', setDefault)
    await setTuiDefaultPreset(svc, 'minimal', 7)
    expect(setDefault).toHaveBeenCalledWith('minimal', 7)
    await expect(setTuiDefaultPreset(svc, 'minimal', undefined)).rejects.toThrow(/read-only/u)
  })

  it('reads and bounds composition text', async () => {
    const svc = service([preset({ id: 'standard', trust: 'system' })])
    const preview = await readTuiPresetComposition(svc, 'standard')
    expect(preview.text).toContain('# standard')
    expect(preview.truncated).toBe(false)

    const longText = 'x'.repeat(5_000)
    const longSvc = { ...svc, read: vi.fn(async () => longText) }
    const truncated = await readTuiPresetComposition(longSvc, 'standard')
    expect(truncated.truncated).toBe(true)
    expect(truncated.text.length).toBeLessThanOrEqual(4_096)
  })

  it('reports non-authorable deployments that cannot copy', async () => {
    const svc = { ...service([preset({ id: 'standard', trust: 'system' })]), authorable: false }
    const snapshot = await collectTuiPresetManager(svc, 'standard', 'en')
    expect(snapshot.authorable).toBe(false)
    expect(snapshot.rows[0]!.canCopy).toBe(false)
  })

  it('hides default mutation when the official Host does not expose the newer owner seam', async () => {
    const legacy = Object.fromEntries(Object.entries(service([
      preset({ id: 'standard', trust: 'system' }),
      preset({ id: 'minimal', trust: 'system' }),
    ])).filter(([name]) => name !== 'setDefault' && name !== 'defaultRevision')) as unknown as TuiAgentPresets
    const snapshot = await collectTuiPresetManager(legacy, 'standard', 'en')
    expect(snapshot.defaultRevision).toBeUndefined()
    expect(snapshot.rows.every(row => !row.canSetDefault)).toBe(true)
    await expect(setTuiDefaultPreset(legacy, 'minimal', 1)).rejects.toThrow(/read-only/u)
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
