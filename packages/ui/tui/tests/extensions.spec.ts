import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { PluginId, PluginVersionId } from '@lingxi-ai-cn/dsh-plugin-hub'
import { TuiExtensionRegistry } from '../src/extensions.ts'
import { TuiExtensionGrantLedger } from '../src/grant-ledger.ts'

function pluginWith(install: (ctx: Context) => void) {
  return Object.assign((ctx: Context) => { install(ctx) }, { inject: [] as const })
}

const temporaryRoots: string[] = []

async function storageRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tui-extension-storage-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('TuiExtensionRegistry', () => {
  it('returns a stable external-store snapshot until a contribution changes', () => {
    const registry = new TuiExtensionRegistry()
    expect(registry.getSnapshot()).toBe(registry.getSnapshot())
  })

  it('binds status and settings entries to the real Cordis activation and unloads them', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry()
    const fiber = await ctx.plugin(pluginWith((child) => {
      registry.registerStatus(child, {
        abiVersion: 1, packageName: '@example/status', version: '1.0.0', key: 'status.ready', priority: 10, width: 20,
        render: () => 'ready\u001b[31m',
      })
      registry.registerSettings(child, {
        abiVersion: 1, packageName: '@example/status', version: '1.0.0', namespace: 'example', key: 'enabled', label: 'Enabled',
        timeoutMs: 100, read: () => true, update: vi.fn(),
      })
    }))
    const snapshot = registry.getSnapshot()
    expect(snapshot.status[0]?.owner).toMatchObject({
      packageName: '@example/status', version: '1.0.0', activationId: `cordis:${fiber.uid}`,
    })
    expect(registry.renderStatus(20)).toEqual(['ready�[31m'])
    expect(snapshot.settings[0]?.namespace).toBe('example')
    await fiber.dispose()
    expect(registry.getSnapshot().status).toEqual([])
    expect(registry.getSnapshot().settings).toEqual([])
  })

  it('reads and updates only the owning settings namespace', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry()
    const update = vi.fn(async (_value: unknown, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
    })
    const owner = await ctx.plugin(pluginWith((child) => {
      registry.registerSettings(child, {
        abiVersion: 1, packageName: '@example/settings', version: '1.0.0', namespace: 'example', key: 'enabled', label: 'Enabled',
        timeoutMs: 100, read: () => true, update,
      })
    }))
    expect(registry.readSetting('example', 'enabled')).toBe(true)
    await expect(registry.updateSetting('example', 'enabled', false)).resolves.toBeUndefined()
    expect(update).toHaveBeenCalledWith(false, expect.any(AbortSignal))
    expect(() => registry.readSetting('other', 'enabled')).toThrow(/unavailable/u)

    const otherFiber = await ctx.plugin(pluginWith((child) => {
      expect(() => registry.registerSettings(child, {
        abiVersion: 1, packageName: '@example/other', version: '1.0.0', namespace: 'example', key: 'other', label: 'Other',
        timeoutMs: 100, read: () => false, update: () => {},
      })).toThrow(/belongs to another activation/u)
    }))
    await otherFiber.dispose()
    await owner.dispose()
  })

  it('rejects namespace, key, priority, width, timeout, and reserved shortcut conflicts', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry()
    const fiber = await ctx.plugin(pluginWith((child) => {
      expect(() => registry.registerSettings(child, {
        abiVersion: 1, packageName: '@example/invalid', version: '1.0.0', namespace: 'bad space', key: 'value', label: 'Value',
        timeoutMs: 100, read: () => undefined, update: () => {},
      })).toThrow(/namespace/u)
      expect(() => registry.registerStatus(child, {
        abiVersion: 1, packageName: '@example/invalid', version: '1.0.0', key: 'bad key', priority: 0, width: 10, render: () => 'x',
      })).toThrow(/key/u)
      expect(() => registry.registerStatus(child, {
        abiVersion: 1, packageName: '@example/invalid', version: '1.0.0', key: 'status.width', priority: 0, width: 121, render: () => 'x',
      })).toThrow(/width/u)
      expect(() => registry.registerShortcut(child, {
        abiVersion: 1, packageName: '@example/invalid', version: '1.0.0', sequence: 'enter', description: 'replace', priority: 0,
        timeoutMs: 100, handle: () => {},
      })).toThrow(/reserved/u)
    }))
    await fiber.dispose()
  })

  it('keeps managed dialogs separate from approval/question and enforces call deadlines', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry()
    const submit = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const fiber = await ctx.plugin(pluginWith((child) => {
      registry.registerDialog(child, {
        abiVersion: 1, packageName: '@example/dialog', version: '1.0.0', id: 'settings.confirm', dialogKind: 'confirm',
        title: 'Confirm', timeoutMs: 5, submit,
      })
    }))
    await expect(registry.submitDialog('settings.confirm', 'yes')).rejects.toThrow(/exceeded 5ms/u)
    expect(submit).toHaveBeenCalledWith('yes', expect.any(AbortSignal))
    await fiber.dispose()
    await expect(registry.submitDialog('settings.confirm', 'yes')).rejects.toThrow(/unavailable/u)
  })

  it('sorts and bounds workspace providers while preserving low-priority shortcut dispatch', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry()
    const handled = vi.fn()
    const fiber = await ctx.plugin(pluginWith((child) => {
      registry.registerShortcut(child, {
        abiVersion: 1, packageName: '@example/workspace', version: '1.0.0', sequence: 'ctrl+alt+w', description: 'workspace', priority: 1,
        timeoutMs: 100, handle: handled,
      })
      registry.registerWorkspace(child, {
        abiVersion: 1, packageName: '@example/workspace', version: '1.0.0', id: 'slow', priority: 1, timeoutMs: 100,
        list: async () => Array.from({ length: 40 }, (_, index) => ({ id: `workspace-${index}`, label: `Workspace ${index}`, path: `/tmp/${index}` })),
      })
    }))
    await expect(registry.invokeShortcut('ctrl+alt+w', 'open')).resolves.toBe(true)
    expect(handled).toHaveBeenCalledWith('open', expect.any(AbortSignal))
    await expect(registry.listWorkspaces()).resolves.toHaveLength(32)
    await expect(registry.invokeShortcut('ctrl+alt+x')).resolves.toBe(false)
    await fiber.dispose()
  })

  it('sanitizes completed-message observations, bounds text, and contains observer deadlines', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry({ storageRoot: await storageRoot() })
    const observe = vi.fn(async (observation: unknown, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
      expect(Object.keys(observation as object).sort()).toEqual(['interrupted', 'messageId', 'sessionId', 'step', 'text', 'turn'])
    })
    const slow = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const fiber = await ctx.plugin(pluginWith((child) => {
      registry.registerCompletedMessageObserver(child, {
        abiVersion: 1, packageName: '@example/observer', version: '1.0.0', id: 'visible', timeoutMs: 100,
        observe,
      })
      registry.registerCompletedMessageObserver(child, {
        abiVersion: 1, packageName: '@example/observer', version: '1.0.0', id: 'slow', timeoutMs: 5,
        observe: slow,
      })
    }))
    await registry.notifyCompletedMessage({
      sessionId: 'session-1', messageId: 'message-1', turn: 2, step: 3,
      text: `hello\u001b[31m${'x'.repeat(5000)}`, interrupted: true,
    })
    expect(observe).toHaveBeenCalledTimes(1)
    const observation = observe.mock.calls[0]?.[0] as { readonly text: string; readonly interrupted: boolean }
    expect(observation.text).toMatch(/^hello�\[31mx/u)
    expect(observation.text).toHaveLength(4096)
    expect(observation.text.endsWith('…')).toBe(true)
    expect(observation.interrupted).toBe(true)
    expect(slow).toHaveBeenCalledTimes(1)
    await fiber.dispose()
    await registry.notifyCompletedMessage({
      sessionId: 'session-1', messageId: 'message-2', turn: 2, step: 4, text: 'ignored', interrupted: false,
    })
    expect(observe).toHaveBeenCalledTimes(1)
  })

  it('evaluates bounded input and Session decision hooks without making them load-bearing', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry({ storageRoot: await storageRoot() })
    const deny = vi.fn(async (request: { readonly kind: string; readonly text?: string }) => {
      expect(request.kind).toBe('input')
      expect(request.text).toMatch(/^draft�/u)
      return { outcome: 'deny' as const, reason: 'blocked\u001b[31m' }
    })
    const slow = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 25)); return { outcome: 'deny' as const } })
    const fiber = await ctx.plugin(pluginWith((child) => {
      registry.registerDecisionHook(child, {
        abiVersion: 1, packageName: '@example/decision', version: '1.0.0', id: 'deny-input', timeoutMs: 100,
        decide: deny,
      })
      registry.registerDecisionHook(child, {
        abiVersion: 1, packageName: '@example/decision', version: '1.0.0', id: 'slow', timeoutMs: 5,
        decide: slow,
      })
    }))
    await expect(registry.decide({
      kind: 'input', sessionId: 'session-1', text: 'draft\u001b[31m', mode: 'followup', attachmentCount: 0,
    })).resolves.toEqual({ outcome: 'deny', reason: 'blocked�[31m' })
    expect(deny).toHaveBeenCalledTimes(1)
    expect(slow).toHaveBeenCalledTimes(1)
    await fiber.dispose()
    await expect(registry.decide({ kind: 'rewind', sessionId: 'session-1', targetEventSeq: 4, operation: 'rewind' }))
      .resolves.toEqual({ outcome: 'allow' })
  })

  it('rechecks Plugin Hub grants for sensitive storage calls and records lifecycle-only effects', async () => {
    const ctx = new Context()
    const ledger = new TuiExtensionGrantLedger()
    const registry = new TuiExtensionRegistry({ storageRoot: await storageRoot(), grantLedger: ledger })
    const pluginId = PluginId('plugin.example')
    const versionId = PluginVersionId('version.example')
    let storage!: ReturnType<TuiExtensionRegistry['registerStorage']>
    const fiber = await ctx.plugin(pluginWith((child) => {
      ledger.create({
        pluginId, versionId, packageName: '@example/granted', version: '1.0.0', activationId: `cordis:${child.fiber.uid}`,
      }, ['tui.storage.read', 'tui.storage.write'])
      storage = registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/granted', version: '1.0.0', namespace: 'state', quotaBytes: 4096,
        grant: { pluginId, versionId },
      })
    }))
    await storage.set('value', 'allowed')
    await expect(storage.get('value')).resolves.toBe('allowed')
    ledger.replace(`cordis:${fiber.uid}`, ['tui.storage.read'])
    await expect(storage.get('value')).resolves.toBe('allowed')
    await expect(storage.set('value', 'blocked')).rejects.toThrow(/lacks capability "tui.storage.write"/u)
    await fiber.dispose()
    expect(ledger.getRecords().map(record => record.operation)).toEqual(['create', 'bind', 'replace', 'release'])
  })

  it('rechecks observer and decision grants after callback waits', async () => {
    const ctx = new Context()
    const ledger = new TuiExtensionGrantLedger()
    const registry = new TuiExtensionRegistry({ grantLedger: ledger })
    const pluginId = PluginId('plugin.recheck')
    const versionId = PluginVersionId('version.recheck')
    let releaseObserver!: () => void
    let releaseDecision!: () => void
    const observerReady = new Promise<void>((resolve) => { releaseObserver = resolve })
    const decisionReady = new Promise<void>((resolve) => { releaseDecision = resolve })
    const fiber = await ctx.plugin(pluginWith((child) => {
      const activationId = `cordis:${child.fiber.uid}`
      ledger.create({ pluginId, versionId, packageName: '@example/recheck', version: '1.0.0', activationId }, [
        'tui.message.observe', 'tui.decision.evaluate',
      ])
      registry.registerCompletedMessageObserver(child, {
        abiVersion: 1, packageName: '@example/recheck', version: '1.0.0', id: 'observer', timeoutMs: 100,
        grant: { pluginId, versionId },
        observe: async () => { await observerReady },
      })
      registry.registerDecisionHook(child, {
        abiVersion: 1, packageName: '@example/recheck', version: '1.0.0', id: 'decision', timeoutMs: 100,
        grant: { pluginId, versionId },
        decide: async () => { await decisionReady; return { outcome: 'deny' } },
      })
    }))
    const observed = registry.notifyCompletedMessage({
      sessionId: 'session-1', messageId: 'message-1', turn: 1, step: 1, text: 'done', interrupted: false,
    })
    const decision = registry.decide({ kind: 'input', sessionId: 'session-1', text: 'draft' })
    await Promise.resolve()
    ledger.replace(`cordis:${fiber.uid}`, [])
    releaseObserver()
    releaseDecision()
    await expect(observed).resolves.toBeUndefined()
    await expect(decision).resolves.toEqual({ outcome: 'allow' })
    await fiber.dispose()
  })

  it('requires exact Plugin Hub descriptor identity when binding a grant', () => {
    const ledger = new TuiExtensionGrantLedger()
    const pluginId = PluginId('plugin.identity')
    const versionId = PluginVersionId('version.identity')
    ledger.create({
      pluginId, versionId, packageName: '@example/identity', version: '1.0.0', activationId: 'cordis:identity',
    }, ['tui.storage.read'])
    expect(() => {
      ledger.bind({
        pluginId, versionId, packageName: '@example/identity', version: '2.0.0', activationId: 'cordis:identity',
      })
    }).toThrow(/does not match/u)
    expect(ledger.getRecords().map(record => record.operation)).toEqual(['create'])
  })

  it('owns fullscreen scene input and bounds rendered frames', async () => {
    const ctx = new Context()
    const ledger = new TuiExtensionGrantLedger()
    const registry = new TuiExtensionRegistry({ grantLedger: ledger })
    const pluginId = PluginId('plugin.scene')
    const versionId = PluginVersionId('version.scene')
    const render = vi.fn(() => ({ title: 'Scene\u001b[31m', lines: ['012345678901234567890', 'second', 'third'], footer: 'Esc close' }))
    const handleInput = vi.fn()
    let activationId = ''
    const fiber = await ctx.plugin(pluginWith((child) => {
      activationId = `cordis:${child.fiber.uid}`
      ledger.create({ pluginId, versionId, packageName: '@example/scene', version: '1.0.0', activationId }, [
        'tui.scene.render', 'tui.scene.interact',
      ])
      registry.registerFullscreenScene(child, {
        abiVersion: 1, packageName: '@example/scene', version: '1.0.0', id: 'inspect', priority: 1, timeoutMs: 100,
        grant: { pluginId, versionId }, render, handleInput,
      })
    }))
    registry.openFullscreenScene('inspect')
    expect(registry.getSnapshot().fullscreenScene?.id).toBe('inspect')
    expect(registry.renderFullscreenScene(20, 5)).toEqual({
      title: 'Scene�[31m', lines: ['0123456789012345678…', 'second'], footer: 'Esc close',
    })
    await expect(registry.handleFullscreenSceneInput('next')).resolves.toBe(true)
    expect(handleInput).toHaveBeenCalledWith('next', expect.any(AbortSignal))
    ledger.replace(activationId, [])
    expect(registry.renderFullscreenScene(20, 5)).toEqual({
      title: 'inspect', lines: ['inspect: unavailable'], footer: 'Esc close',
    })
    await expect(registry.handleFullscreenSceneInput('blocked')).resolves.toBe(false)
    registry.closeFullscreenScene()
    expect(registry.getSnapshot().fullscreenScene).toBeUndefined()
    await fiber.dispose()
  })

  it('binds known Session event renderers to grants and falls back after revocation', async () => {
    const ctx = new Context()
    const ledger = new TuiExtensionGrantLedger()
    const registry = new TuiExtensionRegistry({ grantLedger: ledger })
    const pluginId = PluginId('plugin.renderer')
    const versionId = PluginVersionId('version.renderer')
    let activationId = ''
    const render = vi.fn((event: { readonly type: string; readonly seq: number; readonly text: string }) => {
      expect(Object.keys(event).sort()).toEqual(['seq', 'text', 'type'])
      return { label: 'Rendered', text: `${event.text}\u001b[31m`, tone: 'status' as const }
    })
    const fiber = await ctx.plugin(pluginWith((child) => {
      activationId = `cordis:${child.fiber.uid}`
      ledger.create({ pluginId, versionId, packageName: '@example/renderer', version: '1.0.0', activationId }, ['tui.message.render'])
      registry.registerSessionEventRenderer(child, {
        abiVersion: 1, packageName: '@example/renderer', version: '1.0.0', id: 'assistant', eventType: 'assistant/message', priority: 1,
        grant: { pluginId, versionId }, render,
      })
    }))
    expect(registry.renderKnownSessionEvent({ type: 'assistant/message', seq: 2, text: 'answer' })).toEqual({
      label: 'Rendered', text: 'answer�[31m', tone: 'status',
    })
    ledger.replace(activationId, [])
    expect(registry.renderKnownSessionEvent({ type: 'assistant/message', seq: 2, text: 'answer' })).toBeUndefined()
    await fiber.dispose()
  })

  it('persists owner-scoped JSON storage across unload and serializes concurrent updates', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry({ storageRoot: await storageRoot() })
    let storage!: ReturnType<TuiExtensionRegistry['registerStorage']>
    const first = await ctx.plugin(pluginWith((child) => {
      storage = registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/storage', version: '1.0.0', namespace: 'prefs', quotaBytes: 4096,
      })
    }))
    expect(registry.getSnapshot().storage[0]?.owner).toMatchObject({
      packageName: '@example/storage', version: '1.0.0', activationId: `cordis:${first.uid}`,
    })
    await Promise.all(Array.from({ length: 8 }, (_, index) => storage.set(`value${index}`, { index, enabled: true })))
    expect(await storage.keys()).toEqual(['value0', 'value1', 'value2', 'value3', 'value4', 'value5', 'value6', 'value7'])
    expect(await storage.get<{ readonly index: number }>('value3')).toEqual({ index: 3, enabled: true })
    await first.dispose()
    await expect(storage.get('value0')).rejects.toThrow(/disposed/u)

    let restored!: ReturnType<TuiExtensionRegistry['registerStorage']>
    const second = await ctx.plugin(pluginWith((child) => {
      restored = registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/storage', version: '1.1.0', namespace: 'prefs', quotaBytes: 4096,
      })
    }))
    await expect(restored.get('value3')).resolves.toEqual({ index: 3, enabled: true })
    await expect(restored.delete('value3')).resolves.toBe(true)
    await expect(restored.delete('value3')).resolves.toBe(false)
    await restored.clear()
    await expect(restored.keys()).resolves.toEqual([])
    await second.dispose()
  })

  it('rejects values over quota without replacing the previous atomic document', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry({ storageRoot: await storageRoot() })
    let storage!: ReturnType<TuiExtensionRegistry['registerStorage']>
    const fiber = await ctx.plugin(pluginWith((child) => {
      storage = registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/quota', version: '1.0.0', namespace: 'state', quotaBytes: 128,
      })
    }))
    await storage.set('small', 'ok')
    await expect(storage.set('large', 'x'.repeat(512))).rejects.toThrow(/quota/u)
    await expect(storage.get('small')).resolves.toBe('ok')
    await expect(storage.get('large')).resolves.toBeUndefined()
    await fiber.dispose()
  })

  it('retains corrupt files and recovers the namespace as empty', async () => {
    const root = await storageRoot()
    const ctx = new Context()
    const registry = new TuiExtensionRegistry({ storageRoot: root })
    const packageDirectory = `package-${Buffer.from('@example/corrupt', 'utf8').toString('hex')}`
    const directory = join(root, packageDirectory)
    await (async () => {
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'cache.json'), '{not-json\n', 'utf8')
    })()
    let storage!: ReturnType<TuiExtensionRegistry['registerStorage']>
    const fiber = await ctx.plugin(pluginWith((child) => {
      storage = registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/corrupt', version: '1.0.0', namespace: 'cache', quotaBytes: 4096,
      })
    }))
    await expect(storage.keys()).resolves.toEqual([])
    await expect(storage.get('missing')).resolves.toBeUndefined()
    const retained = (await readdir(directory)).filter(name => name.startsWith('cache.json.corrupt-'))
    expect(retained).toHaveLength(1)
    await storage.set('recovered', { ok: true })
    expect(JSON.parse(await readFile(join(directory, 'cache.json'), 'utf8'))).toEqual({
      version: 1, values: { recovered: { ok: true } },
    })
    await fiber.dispose()
  })

  it('rejects namespace takeover and non-JSON values', async () => {
    const ctx = new Context()
    const registry = new TuiExtensionRegistry({ storageRoot: await storageRoot() })
    let storage!: ReturnType<TuiExtensionRegistry['registerStorage']>
    const first = await ctx.plugin(pluginWith((child) => {
      storage = registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/owner', version: '1.0.0', namespace: 'cache', quotaBytes: 4096,
      })
      expect(() => registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/owner', version: '1.0.0', namespace: 'cache', quotaBytes: 4096,
      })).toThrow(/already registered/u)
      expect(() => registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/owner', version: '1.0.0', namespace: 'small', quotaBytes: 64,
      })).toThrow(/quota/u)
    }))
    await expect(storage.set('value', undefined as never)).rejects.toThrow(/JSON/u)
    const other = await ctx.plugin(pluginWith((child) => {
      expect(() => registry.registerStorage(child, {
        abiVersion: 1, packageName: '@example/owner', version: '2.0.0', namespace: 'cache', quotaBytes: 4096,
      })).toThrow(/another activation/u)
    }))
    await other.dispose()
    await first.dispose()
  })
})
