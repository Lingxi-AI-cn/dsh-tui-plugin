import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import PluginHubRuntime, {
  PluginChangePlanId, PluginHubError, PluginId, PluginTransactionId, PluginVersionId,
  type PluginHubProvider,
} from '@lingxi-ai-cn/dsh-plugin-hub'

const installed = { profileRevision: 'revision-1', bundles: [], plugins: [] } as const

function lifecycle(): Pick<PluginHubProvider,
  'installed' | 'planInstall' | 'planRemove' | 'stage' | 'discard'
  | 'createMaintenanceHandoff' | 'markMaintenanceReady'> {
  return {
    installed: async () => installed,
    planInstall: async (pluginId, versionId) => ({
      id: PluginChangePlanId('plan-1'), operation: 'install', profileRevision: 'revision-1',
      createdAt: '2026-08-18T00:00:00.000Z', expiresAt: '2026-08-18T00:05:00.000Z',
      packageName: 'fixture-plugin', target: { pluginId, versionId, packageName: 'fixture-plugin', version: '1.0.0',
        sourceCommit: 'abc123', artifactSizeBytes: 42, artifactDigest: 'sha512:fixture', dshRange: '^0.1.0',
        validationLevel: 'manifest-valid', lifecycleScripts: [] },
      before: installed, afterBundles: ['fixture-plugin'], restartRequired: true, risks: [],
    }),
    planRemove: async packageName => ({ id: PluginChangePlanId('plan-remove'), operation: 'remove',
      profileRevision: 'revision-1', createdAt: '2026-08-18T00:00:00.000Z',
      expiresAt: '2026-08-18T00:05:00.000Z', packageName, before: installed,
      afterBundles: [], restartRequired: true, risks: [] }),
    stage: async planId => ({ id: PluginTransactionId('transaction-1'), planId, operation: 'install',
      packageName: 'fixture-plugin', beforeRevision: 'revision-1', afterRevision: 'revision-2',
      createdAt: '2026-08-18T00:01:00.000Z', restartRequired: true }),
    discard: async () => {},
    createMaintenanceHandoff: async transactionId => ({ transactionId,
      state: 'waiting-for-old-process', createdAt: '2026-08-18T00:02:00.000Z' }),
    markMaintenanceReady: async () => {},
  }
}

describe('PluginHubRuntime', () => {
  it('registers one provider and disposes it with the registration', async () => {
    const ctx = new Context()
    await ctx.plugin(PluginHubRuntime)
    const provider = {
      id: 'fixture',
      profileMutations: true,
      status: async () => ({ apiVersion: 'dsh.plugin-hub/v1' as const, stale: false, source: 'fixture' as const }),
      search: async () => ({ apiVersion: 'dsh.plugin-hub/v1' as const, catalogRevision: 1, items: [] }),
      plugin: async () => { throw new PluginHubError('missing', 'PLUGIN_NOT_FOUND') },
      ...lifecycle(),
    }
    const dispose = ctx.pluginHub.registerProvider(provider)
    expect(ctx.pluginHub.hasProvider()).toBe(true)
    expect(ctx.pluginHub.supportsProfileMutations()).toBe(true)
    await expect(ctx.pluginHub.search({ query: 'x' })).resolves.toMatchObject({ catalogRevision: 1 })
    await expect(ctx.pluginHub.installed()).resolves.toEqual(installed)
    const plan = await ctx.pluginHub.planInstall(PluginId('plugin-1'), PluginVersionId('version-1'))
    await expect(ctx.pluginHub.stage(plan.id)).resolves.toMatchObject({ afterRevision: 'revision-2' })
    await expect(ctx.pluginHub.createMaintenanceHandoff(PluginTransactionId('transaction-1')))
      .resolves.toMatchObject({ state: 'waiting-for-old-process' })
    await expect(ctx.pluginHub.markMaintenanceReady()).resolves.toBeUndefined()
    dispose()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ctx.pluginHub.hasProvider()).toBe(false)
    expect(ctx.pluginHub.supportsProfileMutations()).toBe(false)
    await expect(ctx.pluginHub.status()).rejects.toMatchObject({ code: 'REGISTRY_UNAVAILABLE' })
  })

  it('rejects a second provider and keeps ids opaque', async () => {
    const ctx = new Context()
    await ctx.plugin(PluginHubRuntime)
    const provider = {
      id: 'fixture',
      profileMutations: false,
      status: async () => ({ apiVersion: 'dsh.plugin-hub/v1' as const, stale: false, source: 'fixture' as const }),
      search: async () => ({ apiVersion: 'dsh.plugin-hub/v1' as const, catalogRevision: 1, items: [] }),
      plugin: async (id: PluginId) => { throw new PluginHubError(String(id), 'PLUGIN_NOT_FOUND') },
      ...lifecycle(),
    }
    ctx.pluginHub.registerProvider(provider)
    expect(() => ctx.pluginHub.registerProvider(provider)).toThrow(/already registered/u)
    expect(() => ctx.pluginHub.registerProvider({ ...provider, id: 'other' })).toThrow(/already registered/u)
  })
})
