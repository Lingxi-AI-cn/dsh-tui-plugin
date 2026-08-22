/** Process-local managed-API grants and lifecycle-only effect ledger. */

import type { PluginId, PluginVersionId } from '@lingxi-ai-cn/dsh-plugin-hub'

/** Managed API capabilities recognized by the TUI extension runtime. */
export type TuiManagedCapability =
  | 'tui.storage.read'
  | 'tui.storage.write'
  | 'tui.message.observe'
  | 'tui.message.render'
  | 'tui.decision.evaluate'
  | 'tui.scene.render'
  | 'tui.scene.interact'

/** Plugin Hub descriptor identity bound to one live Cordis activation. */
export interface TuiGrantIdentity {
  readonly pluginId: PluginId
  readonly versionId: PluginVersionId
  readonly packageName: string
  readonly version: string
  readonly activationId: string
}

/** Reference supplied by a registration to bind a host-created grant. */
export type TuiGrantRef = Pick<TuiGrantIdentity, 'pluginId' | 'versionId'>

/** One lifecycle-only ledger record. */
export interface TuiGrantLedgerRecord {
  readonly operation: 'create' | 'bind' | 'replace' | 'release' | 'cleanup-failed'
  readonly pluginId: PluginId
  readonly versionId: PluginVersionId
  readonly packageName: string
  readonly version: string
  readonly activationId: string
  readonly capabilities: readonly TuiManagedCapability[]
}

interface GrantState extends TuiGrantIdentity {
  capabilities: Set<TuiManagedCapability>
}

/**
 * Host-created, process-local grant authority. It authorizes managed APIs only
 * and records lifecycle transitions without claiming profile installation truth.
 */
export class TuiExtensionGrantLedger {
  private readonly grants = new Map<string, GrantState>()
  private readonly records: TuiGrantLedgerRecord[] = []

  /**
   * Create one grant before an extension activation binds it.
   * @param identity - Plugin Hub descriptor and live activation identity.
   * @param capabilities - managed capabilities available to the activation.
   */
  create(identity: TuiGrantIdentity, capabilities: readonly TuiManagedCapability[]): void {
    if (this.grants.has(identity.activationId)) throw new Error(`TUI grant "${identity.activationId}" already exists`)
    const state = createState(identity, capabilities)
    this.grants.set(identity.activationId, state)
    this.record('create', state)
  }

  /**
   * Bind an existing grant to a registration using exact descriptor identity.
   * @param identity - Plugin Hub descriptor and live activation identity.
   */
  bind(identity: TuiGrantIdentity): void {
    const state = this.grants.get(identity.activationId)
    if (state === undefined || !sameIdentity(state, identity)) {
      throw new Error(`TUI grant "${identity.activationId}" does not match its Plugin Hub identity`)
    }
    this.record('bind', state)
  }

  /**
   * Replace capabilities after a host revalidation of the same grant.
   * @param activationId - live Cordis activation identifier.
   * @param capabilities - managed capabilities available after revalidation.
   */
  replace(activationId: string, capabilities: readonly TuiManagedCapability[]): void {
    const state = this.require(activationId)
    state.capabilities = new Set(validateCapabilities(capabilities))
    this.record('replace', state)
  }

  /**
   * Release one activation grant. Releasing an unknown grant is idempotent.
   * @param activationId - live Cordis activation identifier.
   */
  release(activationId: string): void {
    const state = this.grants.get(activationId)
    if (state === undefined) return
    this.grants.delete(activationId)
    this.record('release', state)
  }

  /**
   * Record a cleanup failure without retaining the failure message or stderr.
   * @param identity - Plugin Hub descriptor and live activation identity.
   */
  cleanupFailed(identity: TuiGrantIdentity): void {
    this.record('cleanup-failed', {
      ...identity,
      capabilities: new Set<TuiManagedCapability>(),
    })
  }

  /**
   * Recheck one sensitive managed API call against the current grant.
   * @param activationId - live Cordis activation identifier.
   * @param capability - managed capability required by the call.
   */
  assertGranted(activationId: string, capability: TuiManagedCapability): void {
    const state = this.require(activationId)
    if (!state.capabilities.has(capability)) throw new Error(`TUI grant "${activationId}" lacks capability "${capability}"`)
  }

  /**
   * Read a detached lifecycle snapshot for diagnostics and tests.
   * @returns immutable lifecycle records without mutable capability sets.
   */
  getRecords(): readonly TuiGrantLedgerRecord[] {
    return Object.freeze(this.records.map(record => Object.freeze({ ...record, capabilities: Object.freeze([...record.capabilities]) })))
  }

  private require(activationId: string): GrantState {
    const state = this.grants.get(activationId)
    if (state === undefined) throw new Error(`TUI grant "${activationId}" is unavailable`)
    return state
  }

  private record(operation: TuiGrantLedgerRecord['operation'], state: GrantState): void {
    this.records.push(Object.freeze({
      operation,
      pluginId: state.pluginId,
      versionId: state.versionId,
      packageName: state.packageName,
      version: state.version,
      activationId: state.activationId,
      capabilities: Object.freeze([...state.capabilities].sort()),
    }))
  }
}

function createState(identity: TuiGrantIdentity, capabilities: readonly TuiManagedCapability[]): GrantState {
  return { ...identity, capabilities: new Set(validateCapabilities(capabilities)) }
}

function validateCapabilities(capabilities: readonly TuiManagedCapability[]): readonly TuiManagedCapability[] {
  const allowed: readonly TuiManagedCapability[] = [
    'tui.storage.read', 'tui.storage.write', 'tui.message.observe', 'tui.message.render', 'tui.decision.evaluate',
    'tui.scene.render', 'tui.scene.interact',
  ]
  const result = [...new Set(capabilities)]
  if (result.some(capability => !allowed.includes(capability))) throw new TypeError('unknown TUI managed capability')
  return result
}

function sameIdentity(left: TuiGrantIdentity, right: TuiGrantIdentity): boolean {
  return left.pluginId === right.pluginId
    && left.versionId === right.versionId
    && left.packageName === right.packageName
    && left.version === right.version
    && left.activationId === right.activationId
}
