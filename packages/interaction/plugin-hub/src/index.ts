/** Plugin Hub Service Definition for read-only catalog consumers. */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  InstalledPluginSnapshot, PluginChangePlan, PluginChangePlanId, PluginDetail,
  PluginDiscoveryRepositoryPage, PluginDiscoverySearchRequest, PluginHubProgress, PluginHubProvider, PluginHubStatus, PluginId,
  PluginMaintenanceHandoff, PluginSearchPage, PluginSearchRequest,
  PluginTransactionId, PluginVersionId, StagedPluginTransaction,
} from './types.ts'
import { PluginHubError } from './types.ts'

export * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { pluginHub: PluginHubRuntime }
  interface Events {
    /**
     * Provider progress is transient UI state and is never durable.
     * @param progress - bounded public progress.
     * @mode emit
     */
    'plugin-hub/progress'(progress: PluginHubProgress): void
  }
}

/** Read-only provider registry and facade consumed by native TUI. */
export class PluginHubRuntime extends Service {
  private readonly providers = new Map<string, PluginHubProvider>()

  constructor(ctx: Context) { super(ctx, 'pluginHub') }

  /**
   * Register one provider; the effect owns removal on unload.
   * @param provider - provider implementation for this fiber.
   * @returns disposer that removes the exact registration.
   */
  registerProvider(provider: PluginHubProvider): () => void {
    if (this.providers.size > 0) throw new Error('a plugin hub provider is already registered')
    const dispose = this.ctx.effect(function* (this: PluginHubRuntime) {
      this.providers.set(provider.id, provider)
      yield () => { this.providers.delete(provider.id) }
    }.bind(this), 'pluginHub.registerProvider()')
    return () => { void dispose() }
  }

  /**
   * Inspect provider availability without starting I/O.
   * @returns whether at least one provider is mounted for optional consumers.
   */
  hasProvider(): boolean { return this.providers.size > 0 }

  /**
   * Inspect whether the mounted provider may mutate the active profile.
   * Missing providers and catalog-only providers both return false.
   * @returns provider-declared profile mutation capability.
   */
  supportsProfileMutations(): boolean {
    const [provider] = this.providers.values()
    return provider?.profileMutations === true
  }

  /** Return the one configured provider or a stable unavailable error. */
  private provider(): PluginHubProvider {
    const [provider] = this.providers.values()
    if (provider === undefined) throw new PluginHubError('No Plugin Hub provider is configured.', 'REGISTRY_UNAVAILABLE')
    return provider
  }

  /**
   * Read provider health and catalog freshness.
   * @param signal - optional caller cancellation signal.
   * @returns provider status.
   */
  async status(signal?: AbortSignal): Promise<PluginHubStatus> { return this.provider().status(signal) }
  /**
   * Search the bounded catalog.
   * @param request - literal search and filter request.
   * @param signal - optional caller cancellation signal.
   * @returns one provider page.
   */
  async search(request: PluginSearchRequest, signal?: AbortSignal): Promise<PluginSearchPage> {
    return this.provider().search(request, signal)
  }
  /**
   * Search discovered GitHub repositories without granting install authority.
   * @param request - bounded discovery search request.
   * @param signal - optional caller cancellation signal.
   * @returns one discovery repository page.
   */
  async searchRepositories(request: PluginDiscoverySearchRequest, signal?: AbortSignal): Promise<PluginDiscoveryRepositoryPage> {
    return this.provider().searchRepositories(request, signal)
  }
  /**
   * Load one complete read-only plugin description.
   * @param pluginId - opaque catalog plugin id.
   * @param signal - optional caller cancellation signal.
   * @returns one provider detail record.
   */
  async plugin(pluginId: PluginId, signal?: AbortSignal): Promise<PluginDetail> {
    return this.provider().plugin(pluginId, signal)
  }

  /**
   * Inspect profile-local installed truth.
   * @param signal - optional caller cancellation signal.
   * @returns exact active-profile revision, bundle order, and third-party dependencies.
   */
  async installed(signal?: AbortSignal): Promise<InstalledPluginSnapshot> {
    return this.provider().installed(signal)
  }

  /**
   * Verify one selected Registry version and create a detached install or update plan.
   * @param pluginId - opaque selected plugin id.
   * @param versionId - opaque selected version id.
   * @param signal - optional caller cancellation signal.
   * @returns expiring plan containing only user-confirmation facts.
   */
  async planInstall(
    pluginId: PluginId,
    versionId: PluginVersionId,
    signal?: AbortSignal,
  ): Promise<PluginChangePlan> {
    return this.provider().planInstall(pluginId, versionId, signal)
  }

  /**
   * Create a detached removal plan from local installed truth.
   * @param packageName - exact installed dependency name.
   * @param signal - optional caller cancellation signal.
   * @returns expiring local removal plan.
   */
  async planRemove(packageName: string, signal?: AbortSignal): Promise<PluginChangePlan> {
    return this.provider().planRemove(packageName, signal)
  }

  /**
   * Prepare a still-current plan in an inactive staging generation.
   * @param planId - provider-issued detached plan id.
   * @param signal - optional caller cancellation signal.
   * @returns durable staged transaction; the active profile is unchanged.
   */
  async stage(planId: PluginChangePlanId, signal?: AbortSignal): Promise<StagedPluginTransaction> {
    return this.provider().stage(planId, signal)
  }

  /**
   * Discard one pre-activation transaction.
   * @param transactionId - provider-issued transaction id.
   * @param signal - optional caller cancellation signal.
   */
  async discard(transactionId: PluginTransactionId, signal?: AbortSignal): Promise<void> {
    await this.provider().discard(transactionId, signal)
  }

  /**
   * Transfer a staged transaction to the maintenance process.
   * @param transactionId - provider-issued staged transaction id.
   * @param signal - optional caller cancellation signal.
   * @returns handoff state after the maintenance process starts waiting.
   */
  async createMaintenanceHandoff(
    transactionId: PluginTransactionId,
    signal?: AbortSignal,
  ): Promise<PluginMaintenanceHandoff> {
    return this.provider().createMaintenanceHandoff(transactionId, signal)
  }

  /**
   * Publish the exact maintenance ready marker after the relaunched TUI mounts.
   * A normal boot without a handoff is a no-op.
   * @param signal - optional caller cancellation signal.
   */
  async markMaintenanceReady(signal?: AbortSignal): Promise<void> {
    await this.provider().markMaintenanceReady(signal)
  }

  /**
   * Publish transient provider progress to in-process UI listeners.
   * @param progress - bounded public progress update.
   */
  publishProgress(progress: PluginHubProgress): void { this.ctx.emit('plugin-hub/progress', progress) }
}

export default PluginHubRuntime
