/** Host Plugin Center inventory projection and filtering. */

import { describe, expect, it } from 'vitest'
import {
  collectTuiHostPluginCenter,
  filterTuiHostPlugins,
  planTuiHostSettingsMutation,
  tuiHostSettingsErrorMessage,
  type TuiHostPluginCenterCollectOptions,
} from '../src/host-plugin-center.ts'
import type { PluginEntryId, PluginInventoryEntry } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type { SettingsDescriptor, SettingsNamespace } from '@deepseek-ai/dsh-settings'

function entryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

function entry(overrides: Partial<PluginInventoryEntry> & { entryId: PluginEntryId; moduleName: string }): PluginInventoryEntry {
  return {
    enabled: true,
    fiberPhase: 'active',
    ...overrides,
  }
}

function descriptor(ns: string, overrides: Partial<SettingsDescriptor> = {}): SettingsDescriptor {
  return {
    ns: ns as SettingsNamespace,
    schema: {},
    value: {},
    revision: 1,
    applies: 'live',
    ...overrides,
  }
}

function options(overrides: Partial<TuiHostPluginCenterCollectOptions> = {}): TuiHostPluginCenterCollectOptions {
  return {
    inventory: {
      list: () => ({
        entries: [
          entry({ entryId: entryId('e1'), moduleName: '@deepseek-ai/dsh-llm-pi-ai' }),
          entry({ entryId: entryId('e2'), moduleName: '@deepseek-ai/dsh-shell', enabled: false, fiberPhase: null }),
          entry({ entryId: entryId('e3'), moduleName: '@deepseek-ai/dsh-settings-file', fiberPhase: 'failed' }),
          entry({ entryId: entryId('e4'), moduleName: '@lingxi-ai-cn/dsh-tui-runtime', fiberPhase: 'pending' }),
        ],
      }),
    },
    settings: {
      describe: () => [
        descriptor('llm-pi-ai', { revision: 3, applies: 'live', user: { providers: {} } }),
        descriptor('tui', { revision: 1, applies: 'live' }),
      ],
    },
    ...overrides,
  }
}

describe('native TUI Host Plugin Center', () => {
  it('projects Loader entries with phase labels and settings namespaces', () => {
    const snapshot = collectTuiHostPluginCenter(options(), 'en')

    expect(snapshot.plugins).toHaveLength(4)
    expect(snapshot.omittedPlugins).toBe(0)
    expect(snapshot.settingsNamespaces).toHaveLength(2)
    expect(snapshot.omittedNamespaces).toBe(0)

    const active = snapshot.plugins[0]!
    expect(active).toMatchObject({
      moduleName: '@deepseek-ai/dsh-llm-pi-ai',
      enabled: true,
      phase: 'active',
      phaseLabel: 'active',
    })

    const disabled = snapshot.plugins[1]!
    expect(disabled).toMatchObject({
      moduleName: '@deepseek-ai/dsh-shell',
      enabled: false,
      phase: null,
      phaseLabel: 'unloaded',
    })

    const failed = snapshot.plugins[2]!
    expect(failed).toMatchObject({
      phase: 'failed',
      phaseLabel: 'failed',
    })

    const pending = snapshot.plugins[3]!
    expect(pending).toMatchObject({
      phase: 'pending',
      phaseLabel: 'pending',
    })
  })

  it('provides Chinese phase labels', () => {
    const snapshot = collectTuiHostPluginCenter(options(), 'zh')
    expect(snapshot.plugins[0]!.phaseLabel).toBe('活跃')
    expect(snapshot.plugins[1]!.phaseLabel).toBe('未加载')
    expect(snapshot.plugins[2]!.phaseLabel).toBe('失败')
    expect(snapshot.plugins[3]!.phaseLabel).toBe('等待中')
  })

  it('projects settings namespaces with user override detection', () => {
    const snapshot = collectTuiHostPluginCenter(options(), 'en')
    const llm = snapshot.settingsNamespaces[0]!
    expect(llm).toMatchObject({
      ns: 'llm-pi-ai',
      revision: 3,
      applies: 'live',
      hasUserOverride: true,
    })
    const tui = snapshot.settingsNamespaces[1]!
    expect(tui).toMatchObject({
      ns: 'tui',
      revision: 1,
      hasUserOverride: false,
    })
  })

  it('bounds large inventories', () => {
    const largeEntries = Array.from({ length: 300 }, (_, i) =>
      entry({ entryId: entryId(`e-${i}`), moduleName: `plugin-${i}` }),
    )
    const snapshot = collectTuiHostPluginCenter({
      inventory: { list: () => ({ entries: largeEntries }) },
    }, 'en')
    expect(snapshot.plugins).toHaveLength(256)
    expect(snapshot.omittedPlugins).toBe(44)
  })

  it('handles missing inventory and settings gracefully', () => {
    const snapshot = collectTuiHostPluginCenter({}, 'en')
    expect(snapshot.plugins).toHaveLength(0)
    expect(snapshot.settingsNamespaces).toHaveLength(0)
    expect(snapshot.inventoryState).toBe('unavailable')
    expect(snapshot.settingsState).toBe('unavailable')
    expect(snapshot.settingsWritable).toBe(false)
  })

  it('keeps source read failures distinct from a successful empty snapshot', () => {
    const snapshot = collectTuiHostPluginCenter({
      inventory: { list: () => { throw new Error('inventory failed') } },
      settings: { describe: () => { throw new Error('settings failed') } },
    }, 'en')
    expect(snapshot.inventoryState).toBe('error')
    expect(snapshot.settingsState).toBe('error')
    expect(snapshot.plugins).toEqual([])
    expect(snapshot.settingsNamespaces).toEqual([])
  })

  it('re-reads late inventory state instead of caching a stale snapshot', () => {
    let phase: PluginInventoryEntry['fiberPhase'] = 'pending'
    const inventory = {
      list: () => ({ entries: [entry({ entryId: entryId('late'), moduleName: 'late-owner', fiberPhase: phase })] }),
    }
    expect(collectTuiHostPluginCenter({ inventory }, 'en').plugins[0]?.phase).toBe('pending')
    phase = 'active'
    expect(collectTuiHostPluginCenter({ inventory }, 'en').plugins[0]?.phase).toBe('active')
  })

  it('projects only the reviewed non-secret editor intersection', () => {
    const snapshot = collectTuiHostPluginCenter({
      settings: {
        writable: true,
        describe: () => [
          descriptor('tui', {
            revision: 4,
            value: { theme: 'dark', locale: 'zh', mouse: 'auto', activity: 'pulse', keybindings: {} },
            user: { theme: 'dark' },
          }),
          descriptor('shell', {
            value: { timeoutMs: 120_000, maxOutputBytes: 64_000, cwd: '/secret/path' },
          }),
          descriptor('agent-loop', { value: { maxParallelToolCalls: 4 } }),
          descriptor('third-party', { value: { token: 'must-not-be-editable' } }),
        ],
      },
    }, 'en')
    expect(snapshot.settingsWritable).toBe(true)
    expect(snapshot.settingsNamespaces.map(row => row.fields.map(field => field.id))).toEqual([
      ['theme', 'locale', 'mouse', 'activity'],
      ['timeoutMs', 'maxOutputBytes'],
      ['maxParallelToolCalls'],
      [],
    ])
    expect(snapshot.settingsNamespaces[0]?.fields[0]).toMatchObject({ value: 'dark', overridden: true })
  })

  it('plans one atomic revision-fenced mutation and validates drafts', () => {
    const [row] = collectTuiHostPluginCenter({
      settings: {
        writable: true,
        describe: () => [descriptor('agent-loop', {
          revision: 9,
          value: { maxParallelToolCalls: 4 },
          user: { maxParallelToolCalls: 4 },
        })],
      },
    }, 'en').settingsNamespaces
    expect(row).toBeDefined()
    expect(planTuiHostSettingsMutation(row!, {
      maxParallelToolCalls: { text: '8' },
    })).toEqual({
      ns: 'agent-loop',
      expectedRevision: 9,
      ops: [{ op: 'set', path: ['maxParallelToolCalls'], value: 8 }],
    })
    expect(planTuiHostSettingsMutation(row!, {
      maxParallelToolCalls: { text: '4', reset: true },
    }).ops).toEqual([{ op: 'unset', path: ['maxParallelToolCalls'] }])
    expect(() => planTuiHostSettingsMutation(row!, {
      maxParallelToolCalls: { text: '1.5' },
    })).toThrow(/invalid value/u)
    expect(() => planTuiHostSettingsMutation(row!, {
      secret: { text: 'nope' },
    })).toThrow(/unsupported Host setting/u)
  })

  it('maps validation, revision, and owner failures to stable bilingual guidance', () => {
    expect(tuiHostSettingsErrorMessage(new Error('invalid value for timeoutMs'), 'en'))
      .toContain('timeoutMs')
    expect(tuiHostSettingsErrorMessage({ code: 'SETTINGS_CONFLICT' }, 'zh'))
      .toContain('其他界面')
    expect(tuiHostSettingsErrorMessage(new Error('settings provider is read-only'), 'zh'))
      .toContain('只读')
    expect(tuiHostSettingsErrorMessage(new Error('secret implementation detail'), 'en'))
      .toBe('The Host settings update failed. The staged values are retained.')
  })

  it('filters plugins by enabled state, failure, and search query', () => {
    const snapshot = collectTuiHostPluginCenter(options(), 'en')
    const { plugins } = snapshot

    expect(filterTuiHostPlugins(plugins, 'all', '')).toHaveLength(4)
    expect(filterTuiHostPlugins(plugins, 'enabled', '')).toHaveLength(3)
    expect(filterTuiHostPlugins(plugins, 'disabled', '')).toHaveLength(1)
    expect(filterTuiHostPlugins(plugins, 'failed', '')).toHaveLength(1)

    expect(filterTuiHostPlugins(plugins, 'all', 'tui')).toHaveLength(1)
    expect(filterTuiHostPlugins(plugins, 'all', 'dsh')).toHaveLength(4)
    expect(filterTuiHostPlugins(plugins, 'enabled', 'shell')).toHaveLength(0)
    expect(filterTuiHostPlugins(plugins, 'all', 'nonexistent')).toHaveLength(0)
  })
})
