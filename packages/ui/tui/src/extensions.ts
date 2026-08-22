/** Versioned, process-local DTO contributions for the native TUI extension seam. */

import type { Context } from '@deepseek-ai/cordis'
import stringWidth from 'string-width'
import { dshHomePath } from './host.ts'
import { terminalSafe } from './sanitize.ts'
import { TuiExtensionGrantLedger, type TuiGrantRef } from './grant-ledger.ts'
import {
  createTuiPluginLocalStorage, MAX_TUI_STORAGE_QUOTA_BYTES, MIN_TUI_STORAGE_QUOTA_BYTES,
  TUI_STORAGE_ABI_VERSION, type TuiPluginLocalStorage,
} from './extension-storage.ts'

/** Current low-ABI contribution contract. */
export const TUI_EXTENSION_ABI_VERSION = 1 as const

/** Cordis activation identity attached to every live contribution. */
export interface TuiExtensionIdentity {
  readonly packageName: string
  readonly version: string
  /** Stable uid of the actual owning Cordis fiber. */
  readonly activationId: string
}

/** Common metadata retained in snapshots and diagnostics. */
export interface TuiExtensionMetadata {
  readonly abiVersion: number
  readonly owner: TuiExtensionIdentity
}

/** Read-only context passed to a status renderer. */
export interface TuiStatusContributionContext {
  readonly width: number
  readonly locale?: string
}

/** One keyed status value rendered into a bounded native-TUI status row. */
export interface TuiStatusContribution extends TuiExtensionMetadata {
  readonly kind: 'status'
  readonly key: string
  readonly priority: number
  readonly width: number
  readonly render: (context: TuiStatusContributionContext) => string
}

/** One owner-scoped settings section entry. */
export interface TuiSettingsContribution extends TuiExtensionMetadata {
  readonly kind: 'settings'
  readonly namespace: string
  readonly key: string
  readonly label: string
  readonly read: () => unknown
  readonly update: (value: unknown, signal: AbortSignal) => void | Promise<void>
  readonly timeoutMs: number
}

/** Managed dialog kinds intentionally narrower than approval/question surfaces. */
export type TuiManagedDialogKind = 'select' | 'confirm' | 'input'

/** One bounded, host-managed dialog contribution. */
export interface TuiDialogContribution extends TuiExtensionMetadata {
  readonly kind: 'dialog'
  readonly id: string
  readonly dialogKind: TuiManagedDialogKind
  readonly title: string
  readonly options?: readonly string[]
  readonly maxLength?: number
  readonly submit: (value: string | undefined, signal: AbortSignal) => void | Promise<void>
  readonly timeoutMs: number
}

/** One low-priority shortcut which cannot replace reserved native actions. */
export interface TuiShortcutContribution extends TuiExtensionMetadata {
  readonly kind: 'shortcut'
  readonly sequence: string
  readonly description: string
  readonly priority: number
  readonly handle: (input: string, signal: AbortSignal) => void | Promise<void>
  readonly timeoutMs: number
}

/** One workspace result returned by a provider. */
export interface TuiWorkspaceOption {
  readonly id: string
  readonly label: string
  readonly path: string
}

/** One provider for bounded workspace choices. */
export interface TuiWorkspaceContribution extends TuiExtensionMetadata {
  readonly kind: 'workspace'
  readonly id: string
  readonly priority: number
  readonly list: (signal: AbortSignal) => Promise<readonly TuiWorkspaceOption[]>
  readonly timeoutMs: number
}

/** Dimensions and locale supplied to a host-owned fullscreen scene renderer. */
export interface TuiFullscreenSceneContext {
  readonly width: number
  readonly height: number
  readonly locale?: string
}

/** Bounded text frame returned by a fullscreen scene renderer. */
export interface TuiFullscreenSceneFrame {
  readonly title: string
  readonly lines: readonly string[]
  readonly footer?: string
}

/** One structured fullscreen scene that temporarily owns native-TUI input. */
export interface TuiFullscreenSceneContribution extends TuiExtensionMetadata {
  readonly kind: 'fullscreen-scene'
  readonly id: string
  readonly priority: number
  readonly timeoutMs: number
  /** Pure bounded projection of the scene at the supplied terminal size. */
  readonly render: (context: TuiFullscreenSceneContext) => TuiFullscreenSceneFrame
  /** Optional input handler; Escape remains owned by the host scene controller. */
  readonly handleInput?: (input: string, signal: AbortSignal) => void | Promise<void>
}

/** Known committed surface event facts exposed to a host-owned renderer. */
export interface TuiKnownSessionEvent {
  readonly type: 'user/message' | 'assistant/message'
  readonly seq: number
  readonly text: string
  readonly interrupted?: boolean
}

/** Bounded replacement for one known Session event's default text projection. */
export interface TuiKnownSessionEventRenderResult {
  readonly label: string
  readonly text: string
  readonly tone: 'user' | 'assistant' | 'status'
}

/** Renderer for one known, host-owned Session event type. */
export interface TuiKnownSessionEventRendererContribution extends TuiExtensionMetadata {
  readonly kind: 'session-event-renderer'
  readonly id: string
  readonly eventType: TuiKnownSessionEvent['type']
  readonly priority: number
  readonly render: (event: TuiKnownSessionEvent) => TuiKnownSessionEventRenderResult | undefined
}

/** One owner-scoped durable namespace for a TUI extension. */
export interface TuiStorageContribution extends TuiExtensionMetadata {
  readonly kind: 'storage'
  readonly namespace: string
  readonly quotaBytes: number
}

/** Bounded, model-output text delivered after one known assistant message commits. */
export interface TuiCompletedMessageObservation {
  readonly sessionId: string
  readonly messageId: string
  readonly turn: number
  readonly step: number
  readonly text: string
  readonly interrupted: boolean
}

/** One observer for sanitized completed assistant messages. */
export interface TuiCompletedMessageObserverContribution extends TuiExtensionMetadata {
  readonly kind: 'completed-message-observer'
  readonly id: string
  readonly timeoutMs: number
  readonly observe: (observation: TuiCompletedMessageObservation, signal: AbortSignal) => void | Promise<void>
}

/** Operations for which an extension may allow or deny a TUI decision. */
export type TuiDecisionKind = 'input' | 'rewind' | 'session-switch'

/** Session replacement operation used by a session-switch decision. */
export type TuiSessionSwitchOperation = 'resume' | 'fresh' | 'rewind'

/** Sanitized facts supplied to one input, rewind, or Session-switch hook. */
export interface TuiDecisionRequest {
  readonly kind: TuiDecisionKind
  readonly sessionId: string
  readonly targetSessionId?: string
  readonly targetEventSeq?: number
  readonly operation?: TuiSessionSwitchOperation
  readonly text?: string
  readonly mode?: 'followup' | 'steer' | 'interrupt'
  readonly attachmentCount?: number
}

/** Hook outcome; omitting a result means allow. */
export interface TuiDecisionResult {
  readonly outcome: 'allow' | 'deny'
  readonly reason?: string
}

/** One bounded decision hook for a TUI-owned interaction boundary. */
export interface TuiDecisionHookContribution extends TuiExtensionMetadata {
  readonly kind: 'decision-hook'
  readonly id: string
  readonly timeoutMs: number
  readonly decide: (request: TuiDecisionRequest, signal: AbortSignal) => TuiDecisionResult | void | Promise<TuiDecisionResult | void>
}

/** The ten contribution families available at ABI level 1. */
export type TuiExtensionContribution =
  | TuiStatusContribution
  | TuiSettingsContribution
  | TuiDialogContribution
  | TuiShortcutContribution
  | TuiWorkspaceContribution
  | TuiFullscreenSceneContribution
  | TuiKnownSessionEventRendererContribution
  | TuiStorageContribution
  | TuiCompletedMessageObserverContribution
  | TuiDecisionHookContribution

/** Registration input with owner and contribution kind supplied by the registry. */
export type TuiExtensionRegistration<T extends TuiExtensionContribution> = Omit<T, 'owner' | 'kind'> & {
  readonly abiVersion: number
  readonly packageName: string
  readonly version: string
  readonly grant?: TuiGrantRef
}

/** Immutable read view of all live contributions. */
export interface TuiExtensionSnapshot {
  readonly revision: number
  readonly status: readonly TuiStatusContribution[]
  readonly settings: readonly TuiSettingsContribution[]
  readonly dialogs: readonly TuiDialogContribution[]
  readonly shortcuts: readonly TuiShortcutContribution[]
  readonly workspaces: readonly TuiWorkspaceContribution[]
  readonly fullscreenScene: TuiFullscreenSceneContribution | undefined
  readonly sessionEventRenderers: readonly TuiKnownSessionEventRendererContribution[]
  readonly storage: readonly TuiStorageContribution[]
  readonly completedMessageObservers: readonly TuiCompletedMessageObserverContribution[]
  readonly decisionHooks: readonly TuiDecisionHookContribution[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tuiExtensions: TuiExtensionRegistry
  }
}

const PACKAGE_NAME = /^@[a-z0-9._-]+\/[a-z0-9._-]+$/u
const KEY = /^[a-z][a-z0-9._:-]{0,95}$/u
const NAMESPACE = /^[a-z][a-z0-9._-]{0,63}$/u
const SEQUENCE = /^(?:ctrl\+|meta\+|alt\+|shift\+)?[a-z0-9][a-z0-9+_-]{0,31}$/u
const RESERVED_SHORTCUTS = new Set([
  'ctrl+c', 'ctrl+g', 'ctrl+o', 'enter', 'escape', 'tab', 'up', 'down', 'left', 'right',
  'pageup', 'pagedown', 'home', 'end',
])
const MAX_PRIORITY = 10_000
const MAX_WIDTH = 120
const MAX_TIMEOUT_MS = 5_000
const MAX_OPTIONS = 32
const MAX_WORKSPACES = 32
const MAX_OBSERVER_TEXT = 4096
const MAX_SCENE_WIDTH = 240
const MAX_SCENE_HEIGHT = 512
const MAX_SCENE_LINES = 512
const MAX_SCENE_LINE_LENGTH = 4096
const MAX_SCENE_INPUT = 1024
const MAX_EVENT_RENDER_TEXT = 4096
const TUI_DECISION_TOTAL_TIMEOUT_MS = 500

/** Callback notified after a live contribution changes. */
export type TuiExtensionListener = () => void

/**
 * Process-local registry owned by the TUI plugin. Registrations are effect
 * scoped to the caller's real Cordis fiber and are removed on unload.
 */
export class TuiExtensionRegistry {
  private readonly statuses = new Map<string, TuiStatusContribution>()
  private readonly settings = new Map<string, TuiSettingsContribution>()
  private readonly settingsOwners = new Map<string, string>()
  private readonly dialogs = new Map<string, TuiDialogContribution>()
  private readonly shortcuts = new Map<string, TuiShortcutContribution>()
  private readonly workspaces = new Map<string, TuiWorkspaceContribution>()
  private readonly fullscreenScenes = new Map<string, TuiFullscreenSceneContribution>()
  private readonly sessionEventRenderers = new Map<string, TuiKnownSessionEventRendererContribution>()
  private readonly storages = new Map<string, TuiPluginLocalStorage>()
  private readonly completedMessageObservers = new Map<string, TuiCompletedMessageObserverContribution>()
  private readonly decisionHooks = new Map<string, TuiDecisionHookContribution>()
  private readonly storageRoot: string
  private readonly listeners = new Set<TuiExtensionListener>()
  private readonly grantLedger: TuiExtensionGrantLedger | undefined
  private readonly grantRefs = new Map<string, { readonly activationId: string; refs: number }>()
  private activeFullscreenSceneId: string | undefined
  private revision = 0
  private snapshot: TuiExtensionSnapshot | undefined
  private disposed = false

  /**
   * Create a registry whose plugin-local files live below the supplied root.
   * The default is the shared Harness home under `tui/extensions`.
   * @param options - optional host-owned storage root.
   */
  constructor(options: { readonly storageRoot?: string; readonly grantLedger?: TuiExtensionGrantLedger } = {}) {
    this.storageRoot = options.storageRoot ?? defaultTuiExtensionStorageRoot()
    this.grantLedger = options.grantLedger
  }

  /**
   * Read the current immutable contribution snapshot.
   * @returns the live contribution lists and revision.
   */
  getSnapshot(): TuiExtensionSnapshot {
    if (this.snapshot?.revision === this.revision) return this.snapshot
    this.snapshot = Object.freeze({
      revision: this.revision,
      status: Object.freeze([...this.statuses.values()].sort(sortPriority)),
      settings: Object.freeze([...this.settings.values()].sort(sortKey)),
      dialogs: Object.freeze([...this.dialogs.values()].sort(sortKey)),
      shortcuts: Object.freeze([...this.shortcuts.values()].sort(sortPriority)),
      workspaces: Object.freeze([...this.workspaces.values()].sort(sortPriority)),
      fullscreenScene: this.activeFullscreenSceneId === undefined
        ? undefined : this.fullscreenScenes.get(this.activeFullscreenSceneId),
      sessionEventRenderers: Object.freeze([...this.sessionEventRenderers.values()].sort(sortPriority)),
      storage: Object.freeze([...this.storages.values()].map(item => item.info).sort(sortNamespace)),
      completedMessageObservers: Object.freeze([...this.completedMessageObservers.values()].sort(sortKey)),
      decisionHooks: Object.freeze([...this.decisionHooks.values()].sort(sortKey)),
    })
    return this.snapshot
  }

  /**
   * Subscribe to registry changes; listeners are contained and never awaited.
   * @param listener - callback invoked after a contribution changes.
   * @returns a disposer for the listener.
   */
  subscribe(listener: TuiExtensionListener): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Register a keyed status contribution under the caller's Cordis fiber.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and status renderer.
   * @returns a Cordis effect disposer.
   */
  registerStatus(ctx: Context, input: TuiExtensionRegistration<TuiStatusContribution>): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeStatus({ ...input, kind: 'status', owner })
    if (this.statuses.has(contribution.key)) throw new Error(`tui extension status "${contribution.key}" is already registered`)
    this.assertActive()
    this.statuses.set(contribution.key, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.statuses.get(contribution.key) !== contribution) return
      this.statuses.delete(contribution.key)
      this.changed()
    }, `tui.extensions.status(${contribution.key})`)
  }

  /**
   * Register an owner-scoped settings entry; another activation cannot claim the namespace.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and settings callbacks.
   * @returns a Cordis effect disposer.
   */
  registerSettings(ctx: Context, input: TuiExtensionRegistration<TuiSettingsContribution>): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeSettings({ ...input, kind: 'settings', owner })
    const namespaceOwner = this.settingsOwners.get(contribution.namespace)
    if (namespaceOwner !== undefined && namespaceOwner !== owner.activationId) {
      throw new Error(`tui extension settings namespace "${contribution.namespace}" belongs to another activation`)
    }
    const key = `${contribution.namespace}:${contribution.key}`
    if (this.settings.has(key)) throw new Error(`tui extension setting "${key}" is already registered`)
    this.assertActive()
    this.settingsOwners.set(contribution.namespace, owner.activationId)
    this.settings.set(key, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.settings.get(key) !== contribution) return
      this.settings.delete(key)
      if (![...this.settings.values()].some(item => item.namespace === contribution.namespace)) {
        this.settingsOwners.delete(contribution.namespace)
      }
      this.changed()
    }, `tui.extensions.settings(${key})`)
  }

  /**
   * Register a managed select, confirm, or input dialog.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and dialog callback.
   * @returns a Cordis effect disposer.
   */
  registerDialog(ctx: Context, input: TuiExtensionRegistration<TuiDialogContribution>): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeDialog({ ...input, kind: 'dialog', owner })
    if (this.dialogs.has(contribution.id)) throw new Error(`tui extension dialog "${contribution.id}" is already registered`)
    this.assertActive()
    this.dialogs.set(contribution.id, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.dialogs.get(contribution.id) !== contribution) return
      this.dialogs.delete(contribution.id)
      this.changed()
    }, `tui.extensions.dialog(${contribution.id})`)
  }

  /**
   * Register a bounded shortcut that cannot claim a built-in sequence.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and shortcut callback.
   * @returns a Cordis effect disposer.
   */
  registerShortcut(ctx: Context, input: TuiExtensionRegistration<TuiShortcutContribution>): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeShortcut({ ...input, kind: 'shortcut', owner })
    if (RESERVED_SHORTCUTS.has(contribution.sequence)) throw new Error(`tui extension shortcut "${contribution.sequence}" is reserved`)
    if (this.shortcuts.has(contribution.sequence)) throw new Error(`tui extension shortcut "${contribution.sequence}" is already registered`)
    this.assertActive()
    this.shortcuts.set(contribution.sequence, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.shortcuts.get(contribution.sequence) !== contribution) return
      this.shortcuts.delete(contribution.sequence)
      this.changed()
    }, `tui.extensions.shortcut(${contribution.sequence})`)
  }

  /**
   * Register a bounded workspace provider.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and workspace provider callback.
   * @returns a Cordis effect disposer.
   */
  registerWorkspace(ctx: Context, input: TuiExtensionRegistration<TuiWorkspaceContribution>): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeWorkspace({ ...input, kind: 'workspace', owner })
    if (this.workspaces.has(contribution.id)) throw new Error(`tui extension workspace "${contribution.id}" is already registered`)
    this.assertActive()
    this.workspaces.set(contribution.id, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.workspaces.get(contribution.id) !== contribution) return
      this.workspaces.delete(contribution.id)
      this.changed()
    }, `tui.extensions.workspace(${contribution.id})`)
  }

  /**
   * Register one structured fullscreen scene.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata, frame renderer, and optional input handler.
   * @returns a Cordis effect disposer.
   */
  registerFullscreenScene(ctx: Context, input: TuiExtensionRegistration<TuiFullscreenSceneContribution>): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeFullscreenScene({ ...input, kind: 'fullscreen-scene', owner })
    if (this.fullscreenScenes.has(contribution.id)) throw new Error(`tui extension fullscreen scene "${contribution.id}" is already registered`)
    this.assertActive()
    const releaseGrant = this.bindGrant(input, owner)
    this.fullscreenScenes.set(contribution.id, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.fullscreenScenes.get(contribution.id) !== contribution) return
      releaseGrant()
      if (this.activeFullscreenSceneId === contribution.id) this.activeFullscreenSceneId = undefined
      this.fullscreenScenes.delete(contribution.id)
      this.changed()
    }, `tui.extensions.fullscreenScene(${contribution.id})`)
  }

  /**
   * Register a renderer for a known committed user or assistant Session event.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and bounded replacement renderer.
   * @returns a Cordis effect disposer.
   */
  registerSessionEventRenderer(
    ctx: Context,
    input: TuiExtensionRegistration<TuiKnownSessionEventRendererContribution>,
  ): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeSessionEventRenderer({ ...input, kind: 'session-event-renderer', owner })
    if (this.sessionEventRenderers.has(contribution.id)) throw new Error(`tui extension Session event renderer "${contribution.id}" is already registered`)
    this.assertActive()
    const releaseGrant = this.bindGrant(input, owner)
    this.sessionEventRenderers.set(contribution.id, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.sessionEventRenderers.get(contribution.id) !== contribution) return
      releaseGrant()
      this.sessionEventRenderers.delete(contribution.id)
      this.changed()
    }, `tui.extensions.sessionEventRenderer(${contribution.id})`)
  }

  /**
   * Resolve the first successful replacement for one known Session event.
   * @param event - sanitized committed user or assistant event facts.
   * @returns a bounded replacement, or `undefined` to use the built-in projection.
   */
  renderKnownSessionEvent(event: TuiKnownSessionEvent): TuiKnownSessionEventRenderResult | undefined {
    const normalized = normalizeKnownSessionEvent(event)
    for (const renderer of this.getSnapshot().sessionEventRenderers) {
      if (renderer.eventType !== normalized.type) continue
      try {
        this.assertCapability(renderer.owner.activationId, 'tui.message.render')
        const result = normalizeKnownSessionEventRenderResult(renderer.render(normalized))
        this.assertCapability(renderer.owner.activationId, 'tui.message.render')
        if (result !== undefined) return result
      } catch {
        // A stale or revoked renderer cannot break Session replay or rendering.
      }
    }
    return undefined
  }

  /**
   * Open one registered fullscreen scene; host input and rendering remain in control.
   * @param id - registered scene identifier.
   */
  openFullscreenScene(id: string): void {
    const scene = this.fullscreenScenes.get(id)
    if (scene === undefined) throw new Error(`tui extension fullscreen scene "${id}" is unavailable`)
    this.assertActive()
    this.assertCapability(scene.owner.activationId, 'tui.scene.render')
    this.activeFullscreenSceneId = id
    this.changed()
  }

  /** Close the active fullscreen scene and return control to the normal TUI. */
  closeFullscreenScene(): void {
    if (this.activeFullscreenSceneId === undefined) return
    this.activeFullscreenSceneId = undefined
    this.changed()
  }

  /**
   * Render the active scene into a bounded terminal-safe frame.
   * @param width - available terminal cell width.
   * @param height - available terminal row count.
   * @param locale - optional locale passed to the renderer.
   * @returns a bounded frame, or `undefined` when no scene is active.
   */
  renderFullscreenScene(width: number, height: number, locale?: string): TuiFullscreenSceneFrame | undefined {
    const scene = this.getSnapshot().fullscreenScene
    if (scene === undefined) return undefined
    try {
      this.assertCapability(scene.owner.activationId, 'tui.scene.render')
      const context: TuiFullscreenSceneContext = {
        width: Math.max(1, Math.min(MAX_SCENE_WIDTH, Math.trunc(width))),
        height: Math.max(1, Math.min(MAX_SCENE_HEIGHT, Math.trunc(height))),
        ...locale === undefined ? {} : { locale },
      }
      return normalizeFullscreenSceneFrame(scene.render(context), context.width, context.height, scene.id)
    } catch {
      return unavailableFullscreenSceneFrame(scene.id)
    }
  }

  /**
   * Deliver one committed input to the active scene handler.
   * @param input - terminal-safe committed input.
   * @param signal - optional caller cancellation signal.
   * @returns whether an active handler received the input.
   */
  async handleFullscreenSceneInput(input: string, signal?: AbortSignal): Promise<boolean> {
    const scene = this.getSnapshot().fullscreenScene
    if (scene?.handleInput === undefined) return false
    try {
      this.assertCapability(scene.owner.activationId, 'tui.scene.interact')
      await bounded(callSignal => scene.handleInput?.(singleLine(input, 'fullscreen scene input', MAX_SCENE_INPUT), callSignal), scene.timeoutMs, signal)
      this.assertCapability(scene.owner.activationId, 'tui.scene.interact')
      return true
    } catch {
      return false
    }
  }

  /**
   * Register one owner-scoped durable JSON namespace. The returned handle is
   * also an idempotent disposer; Cordis unload closes it automatically while
   * leaving its persisted data in place for the next activation.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata, namespace, and byte quota.
   * @returns the durable storage handle and disposer.
   */
  registerStorage(ctx: Context, input: TuiExtensionRegistration<TuiStorageContribution>): TuiPluginLocalStorage {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeStorage({ ...input, kind: 'storage', owner })
    const key = `${owner.packageName}:${contribution.namespace}`
    const existing = this.storages.get(key)
    if (existing !== undefined) {
      if (existing.info.owner.activationId !== owner.activationId) {
        throw new Error(`tui extension storage namespace "${contribution.namespace}" belongs to another activation`)
      }
      throw new Error(`tui extension storage namespace "${contribution.namespace}" is already registered`)
    }
    this.assertActive()
    const releaseGrant = this.bindGrant(input, owner)
    const holder: { value?: TuiPluginLocalStorage } = {}
    const storage = createTuiPluginLocalStorage(this.storageRoot, contribution, {
      assertRead: () => { this.assertCapability(owner.activationId, 'tui.storage.read') },
      assertWrite: () => { this.assertCapability(owner.activationId, 'tui.storage.write') },
      onDispose: () => {
        releaseGrant()
        if (this.storages.get(key) !== holder.value) return
        this.storages.delete(key)
        this.changed()
      },
    })
    holder.value = storage
    this.storages.set(key, storage)
    this.changed()
    ctx.effect(() => () => { storage.dispose() }, `tui.extensions.storage(${key})`)
    return storage
  }

  /**
   * Register an observer for sanitized, committed assistant-message text.
   * The callback cannot see reasoning, tool calls, images, provider metadata,
   * or the complete Session event.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and bounded observer callback.
   * @returns a Cordis effect disposer.
   */
  registerCompletedMessageObserver(
    ctx: Context,
    input: TuiExtensionRegistration<TuiCompletedMessageObserverContribution>,
  ): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeCompletedMessageObserver({ ...input, kind: 'completed-message-observer', owner })
    if (this.completedMessageObservers.has(contribution.id)) {
      throw new Error(`tui extension completed-message observer "${contribution.id}" is already registered`)
    }
    this.assertActive()
    const releaseGrant = this.bindGrant(input, owner)
    this.completedMessageObservers.set(contribution.id, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.completedMessageObservers.get(contribution.id) !== contribution) return
      releaseGrant()
      this.completedMessageObservers.delete(contribution.id)
      this.changed()
    }, `tui.extensions.completedMessageObserver(${contribution.id})`)
  }

  /**
   * Dispatch one host-extracted assistant message to live observers.
   * Observer failures and deadlines are contained so they cannot affect the
   * Session append or the TUI render loop.
   * @param input - known assistant-message facts before sanitization.
   * @returns completion after every observer has settled or been contained.
   */
  async notifyCompletedMessage(input: TuiCompletedMessageObservation): Promise<void> {
    const observation = normalizeCompletedMessageObservation(input)
    await Promise.all(this.getSnapshot().completedMessageObservers.map(async (observer) => {
      try {
        this.assertCapability(observer.owner.activationId, 'tui.message.observe')
        await bounded(signal => observer.observe(observation, signal), observer.timeoutMs)
        this.assertCapability(observer.owner.activationId, 'tui.message.observe')
      } catch {
        // Observer failure cannot veto a committed Session event.
      }
    }))
  }

  /**
   * Register one bounded allow/deny hook for an input, rewind, or Session switch.
   * Hook timeout and failure are contained as allow so optional extensions cannot
   * stall or veto a built-in TUI operation.
   * @param ctx - live Cordis context that owns the registration.
   * @param input - ABI metadata and decision callback.
   * @returns a Cordis effect disposer.
   */
  registerDecisionHook(ctx: Context, input: TuiExtensionRegistration<TuiDecisionHookContribution>): () => Promise<void> {
    const owner = identity(ctx, input.packageName, input.version)
    const contribution = normalizeDecisionHook({ ...input, kind: 'decision-hook', owner })
    if (this.decisionHooks.has(contribution.id)) throw new Error(`tui extension decision hook "${contribution.id}" is already registered`)
    this.assertActive()
    const releaseGrant = this.bindGrant(input, owner)
    this.decisionHooks.set(contribution.id, contribution)
    this.changed()
    return this.effectDisposer(ctx, () => {
      if (this.decisionHooks.get(contribution.id) !== contribution) return
      releaseGrant()
      this.decisionHooks.delete(contribution.id)
      this.changed()
    }, `tui.extensions.decisionHook(${contribution.id})`)
  }

  /**
   * Evaluate all live decision hooks within the fixed total deadline.
   * @param input - host-owned boundary facts before sanitization.
   * @returns the first contained denial, or allow when no hook denies.
   */
  async decide(input: TuiDecisionRequest): Promise<TuiDecisionResult> {
    const request = normalizeDecisionRequest(input)
    const hooks = this.getSnapshot().decisionHooks
    try {
      const decisions = await bounded(async signal => Promise.all(hooks.map(async (hook) => {
        try {
          this.assertCapability(hook.owner.activationId, 'tui.decision.evaluate')
          const result = await bounded(callSignal => hook.decide(request, callSignal), hook.timeoutMs, signal)
          this.assertCapability(hook.owner.activationId, 'tui.decision.evaluate')
          return normalizeDecisionResult(result)
        } catch {
          return { outcome: 'allow' as const }
        }
      })), TUI_DECISION_TOTAL_TIMEOUT_MS)
      return decisions.find(decision => decision.outcome === 'deny') ?? { outcome: 'allow' }
    } catch {
      return { outcome: 'allow' }
    }
  }

  /**
   * Render status values with terminal sanitization and per-contribution width budgets.
   * @param width - available terminal cell width.
   * @param locale - optional locale passed to renderers.
   * @returns bounded status lines.
   */
  renderStatus(width: number, locale?: string): readonly string[] {
    const budget = Math.max(1, Math.min(MAX_WIDTH, Math.trunc(width)))
    return Object.freeze(this.getSnapshot().status.flatMap((item) => {
      try {
        const rendered = item.render({ width: Math.min(budget, item.width), ...(locale === undefined ? {} : { locale }) })
        return [truncateCells(singleLine(rendered, `${item.key} status`, item.width), item.width)]
      } catch {
        return [`${item.key}: unavailable`]
      }
    }))
  }

  /**
   * Read one registered setting value through its owner namespace.
   * @param namespace - registered owner namespace.
   * @param key - registered setting key.
   * @returns the owner-provided setting value.
   */
  readSetting(namespace: string, key: string): unknown {
    const contribution = this.settings.get(`${namespace}:${key}`)
    if (contribution === undefined) throw new Error(`tui extension setting "${namespace}:${key}" is unavailable`)
    return contribution.read()
  }

  /**
   * Invoke a registered setting update through its owner-scoped timeout.
   * @param namespace - registered owner namespace.
   * @param key - registered setting key.
   * @param value - value passed to the owner callback.
   * @param signal - optional caller cancellation signal.
   * @returns completion after the owner callback settles.
   */
  async updateSetting(namespace: string, key: string, value: unknown, signal?: AbortSignal): Promise<void> {
    const contribution = this.settings.get(`${namespace}:${key}`)
    if (contribution === undefined) throw new Error(`tui extension setting "${namespace}:${key}" is unavailable`)
    await bounded(callSignal => contribution.update(value, callSignal), contribution.timeoutMs, signal)
  }

  /**
   * Invoke a managed dialog callback; approval and question owners remain separate.
   * @param id - registered dialog id.
   * @param value - optional submitted value.
   * @param signal - optional caller cancellation signal.
   * @returns completion after the dialog callback settles.
   */
  async submitDialog(id: string, value: string | undefined, signal?: AbortSignal): Promise<void> {
    const contribution = this.dialogs.get(id)
    if (contribution === undefined) throw new Error(`tui extension dialog "${id}" is unavailable`)
    const normalized = value === undefined ? undefined : singleLine(value, `${id} dialog value`, contribution.maxLength ?? 1024)
    await bounded(callSignal => contribution.submit(normalized, callSignal), contribution.timeoutMs, signal)
  }

  /**
   * Invoke the matching low-priority shortcut.
   * @param sequence - canonical registered key sequence.
   * @param input - optional input delivered to the callback.
   * @param signal - optional caller cancellation signal.
   * @returns whether a registered shortcut handled the sequence.
   */
  async invokeShortcut(sequence: string, input: string = '', signal?: AbortSignal): Promise<boolean> {
    const contribution = this.shortcuts.get(sequence)
    if (contribution === undefined) return false
    await bounded(callSignal => contribution.handle(singleLine(input, 'shortcut input', 1024), callSignal), contribution.timeoutMs, signal)
    return true
  }

  /**
   * Collect bounded workspace options from all live providers.
   * @param signal - optional caller cancellation signal.
   * @returns deduplicated workspace options within the registry bound.
   */
  async listWorkspaces(signal?: AbortSignal): Promise<readonly TuiWorkspaceOption[]> {
    const entries: TuiWorkspaceOption[] = []
    const seen = new Set<string>()
    for (const provider of this.getSnapshot().workspaces) {
      const values = await bounded(callSignal => provider.list(callSignal), provider.timeoutMs, signal)
      for (const value of values) {
        if (entries.length >= MAX_WORKSPACES || seen.has(value.id)) continue
        const option = normalizeWorkspaceOption(value)
        seen.add(option.id)
        entries.push(option)
      }
      if (entries.length >= MAX_WORKSPACES) break
    }
    return Object.freeze(entries)
  }

  /** Dispose all live entries; subsequent registration fails loudly. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.statuses.clear()
    this.settings.clear()
    this.settingsOwners.clear()
    this.dialogs.clear()
    this.shortcuts.clear()
    this.workspaces.clear()
    this.fullscreenScenes.clear()
    this.activeFullscreenSceneId = undefined
    this.sessionEventRenderers.clear()
    this.completedMessageObservers.clear()
    this.decisionHooks.clear()
    for (const storage of this.storages.values()) storage.dispose()
    this.storages.clear()
    for (const grant of this.grantRefs.values()) this.grantLedger?.release(grant.activationId)
    this.grantRefs.clear()
    this.changed()
    this.listeners.clear()
  }

  private effectDisposer(ctx: Context, remove: () => void, label: string): () => Promise<void> {
    return ctx.effect(() => remove, label)
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('tui extension registry is disposed')
  }

  private bindGrant(
    input: { readonly packageName: string; readonly version: string; readonly grant?: TuiGrantRef },
    owner: TuiExtensionIdentity,
  ): () => void {
    const ledger = this.grantLedger
    if (ledger === undefined) return () => {}
    if (input.grant === undefined) throw new Error(`TUI extension "${input.packageName}" requires a Plugin Hub grant`)
    ledger.bind({
      ...input.grant,
      packageName: input.packageName,
      version: input.version,
      activationId: owner.activationId,
    })
    const current = this.grantRefs.get(owner.activationId)
    if (current === undefined) this.grantRefs.set(owner.activationId, { activationId: owner.activationId, refs: 1 })
    else current.refs += 1
    let released = false
    return () => {
      if (released) return
      released = true
      const entry = this.grantRefs.get(owner.activationId)
      if (entry === undefined) return
      entry.refs -= 1
      if (entry.refs > 0) return
      this.grantRefs.delete(owner.activationId)
      ledger.release(owner.activationId)
    }
  }

  private assertCapability(
    activationId: string,
    capability: Parameters<TuiExtensionGrantLedger['assertGranted']>[1],
  ): void {
    this.grantLedger?.assertGranted(activationId, capability)
  }

  private changed(): void {
    this.revision += 1
    this.snapshot = undefined
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* observer failure cannot veto the registry */ }
    }
  }
}

function identity(ctx: Context, packageName: string, version: string): TuiExtensionIdentity {
  if (ctx.fiber.uid === null) throw new Error('tui extension registration requires a live Cordis activation')
  if (!PACKAGE_NAME.test(packageName)) throw new TypeError(`invalid TUI extension package name "${packageName}"`)
  if (!singleLine(version, 'extension version', 128)) throw new TypeError('TUI extension version must be non-blank')
  return Object.freeze({ packageName, version, activationId: `cordis:${ctx.fiber.uid}` })
}

function normalizeMetadata(input: TuiExtensionMetadata, kind: TuiExtensionContribution['kind']): TuiExtensionMetadata {
  if (input.abiVersion !== TUI_EXTENSION_ABI_VERSION) throw new TypeError(`unsupported TUI extension ABI version ${String(input.abiVersion)}`)
  return Object.freeze({ abiVersion: input.abiVersion, owner: input.owner, kind } as TuiExtensionMetadata)
}

function normalizeStatus(input: TuiStatusContribution): TuiStatusContribution {
  normalizeMetadata(input, 'status')
  validateKey(input.key)
  validatePriority(input.priority)
  validateWidth(input.width)
  if (typeof input.render !== 'function') throw new TypeError(`TUI status "${input.key}" render must be a function`)
  return Object.freeze({ ...input })
}

function normalizeSettings(input: TuiSettingsContribution): TuiSettingsContribution {
  normalizeMetadata(input, 'settings')
  validateNamespace(input.namespace)
  validateKey(input.key)
  singleLine(input.label, `${input.namespace}:${input.key} label`, 128)
  validateTimeout(input.timeoutMs)
  if (typeof input.read !== 'function' || typeof input.update !== 'function') throw new TypeError(`TUI setting "${input.namespace}:${input.key}" requires read and update functions`)
  return Object.freeze({ ...input })
}

function normalizeDialog(input: TuiDialogContribution): TuiDialogContribution {
  normalizeMetadata(input, 'dialog')
  validateKey(input.id)
  if (input.id.startsWith('approval:') || input.id.startsWith('question:') || input.id.startsWith('security:')) throw new TypeError('TUI extension dialogs cannot claim approval, question, or security ids')
  singleLine(input.title, `${input.id} title`, 128)
  validateTimeout(input.timeoutMs)
  if (typeof input.submit !== 'function') throw new TypeError(`TUI dialog "${input.id}" submit must be a function`)
  const dialogKind: string = input.dialogKind
  if (dialogKind === 'select') {
    if (input.options === undefined || input.options.length === 0 || input.options.length > MAX_OPTIONS) throw new TypeError(`TUI select dialog "${input.id}" requires 1-${MAX_OPTIONS} options`)
  } else if (dialogKind === 'confirm') {
    if (input.options !== undefined) throw new TypeError(`TUI confirm dialog "${input.id}" cannot define options`)
  } else if (dialogKind === 'input') {
    if (input.maxLength === undefined || !Number.isInteger(input.maxLength) || input.maxLength < 1 || input.maxLength > 4096) throw new TypeError(`TUI input dialog "${input.id}" maxLength must be 1-4096`)
  } else {
    throw new TypeError(`TUI dialog "${input.id}" has an unknown kind`)
  }
  const options = input.options?.map((value, index) => singleLine(value, `${input.id} option ${index + 1}`, 256))
  return Object.freeze({ ...input, ...(options === undefined ? {} : { options: Object.freeze(options) }) })
}

function normalizeShortcut(input: TuiShortcutContribution): TuiShortcutContribution {
  normalizeMetadata(input, 'shortcut')
  if (!SEQUENCE.test(input.sequence)) throw new TypeError(`invalid TUI shortcut sequence "${input.sequence}"`)
  singleLine(input.description, `${input.sequence} description`, 128)
  validatePriority(input.priority)
  validateTimeout(input.timeoutMs)
  if (typeof input.handle !== 'function') throw new TypeError(`TUI shortcut "${input.sequence}" handle must be a function`)
  return Object.freeze({ ...input })
}

function normalizeWorkspace(input: TuiWorkspaceContribution): TuiWorkspaceContribution {
  normalizeMetadata(input, 'workspace')
  validateKey(input.id)
  validatePriority(input.priority)
  validateTimeout(input.timeoutMs)
  if (typeof input.list !== 'function') throw new TypeError(`TUI workspace "${input.id}" list must be a function`)
  return Object.freeze({ ...input })
}

function normalizeFullscreenScene(input: TuiFullscreenSceneContribution): TuiFullscreenSceneContribution {
  normalizeMetadata(input, 'fullscreen-scene')
  validateKey(input.id)
  validatePriority(input.priority)
  validateTimeout(input.timeoutMs)
  if (typeof input.render !== 'function') throw new TypeError(`TUI fullscreen scene "${input.id}" render must be a function`)
  if (input.handleInput !== undefined && typeof input.handleInput !== 'function') {
    throw new TypeError(`TUI fullscreen scene "${input.id}" handleInput must be a function`)
  }
  return Object.freeze({ ...input })
}

function normalizeSessionEventRenderer(input: TuiKnownSessionEventRendererContribution): TuiKnownSessionEventRendererContribution {
  normalizeMetadata(input, 'session-event-renderer')
  validateKey(input.id)
  validatePriority(input.priority)
  if (typeof input.render !== 'function') throw new TypeError(`TUI Session event renderer "${input.id}" render must be a function`)
  return Object.freeze({ ...input })
}

function normalizeStorage(input: TuiStorageContribution): TuiStorageContribution {
  normalizeMetadata(input, 'storage')
  validateNamespace(input.namespace)
  if (input.abiVersion !== TUI_STORAGE_ABI_VERSION) throw new TypeError(`unsupported TUI storage ABI version ${String(input.abiVersion)}`)
  if (!Number.isInteger(input.quotaBytes)
    || input.quotaBytes < MIN_TUI_STORAGE_QUOTA_BYTES
    || input.quotaBytes > MAX_TUI_STORAGE_QUOTA_BYTES) {
    throw new TypeError(`TUI extension storage quota must be an integer between ${MIN_TUI_STORAGE_QUOTA_BYTES} and ${MAX_TUI_STORAGE_QUOTA_BYTES} bytes`)
  }
  return Object.freeze({ ...input })
}

function normalizeCompletedMessageObserver(input: TuiCompletedMessageObserverContribution): TuiCompletedMessageObserverContribution {
  normalizeMetadata(input, 'completed-message-observer')
  validateKey(input.id)
  validateTimeout(input.timeoutMs)
  if (typeof input.observe !== 'function') throw new TypeError(`TUI completed-message observer "${input.id}" observe must be a function`)
  return Object.freeze({ ...input })
}

function normalizeDecisionHook(input: TuiDecisionHookContribution): TuiDecisionHookContribution {
  normalizeMetadata(input, 'decision-hook')
  validateKey(input.id)
  validateTimeout(input.timeoutMs)
  if (typeof input.decide !== 'function') throw new TypeError(`TUI decision hook "${input.id}" decide must be a function`)
  return Object.freeze({ ...input })
}

function normalizeCompletedMessageObservation(input: TuiCompletedMessageObservation): TuiCompletedMessageObservation {
  if (typeof input.text !== 'string') throw new TypeError('completed message text must be a string')
  if (typeof input.interrupted !== 'boolean') throw new TypeError('completed message interrupted must be a boolean')
  return Object.freeze({
    sessionId: singleLine(input.sessionId, 'completed message session id', 256),
    messageId: singleLine(input.messageId, 'completed message id', 256),
    turn: nonNegativeInteger(input.turn, 'completed message turn'),
    step: nonNegativeInteger(input.step, 'completed message step'),
    text: truncateText(terminalSafe(input.text), MAX_OBSERVER_TEXT),
    interrupted: input.interrupted,
  })
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`)
  return value
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

function normalizeDecisionRequest(input: TuiDecisionRequest): TuiDecisionRequest {
  if (input.attachmentCount !== undefined
    && (!Number.isSafeInteger(input.attachmentCount) || input.attachmentCount < 0 || input.attachmentCount > 32)) {
    throw new TypeError('TUI decision attachmentCount must be an integer between 0 and 32')
  }
  return Object.freeze({
    kind: input.kind,
    sessionId: singleLine(input.sessionId, 'TUI decision session id', 256),
    ...input.targetSessionId === undefined ? {} : { targetSessionId: singleLine(input.targetSessionId, 'TUI decision target session id', 256) },
    ...input.targetEventSeq === undefined ? {} : { targetEventSeq: nonNegativeInteger(input.targetEventSeq, 'TUI decision target event sequence') },
    ...input.operation === undefined ? {} : { operation: input.operation },
    ...input.text === undefined ? {} : { text: truncateText(terminalSafe(input.text), MAX_OBSERVER_TEXT) },
    ...input.mode === undefined ? {} : { mode: input.mode },
    ...input.attachmentCount === undefined ? {} : { attachmentCount: input.attachmentCount },
  })
}

function normalizeDecisionResult(value: unknown): TuiDecisionResult {
  if (value === undefined) return { outcome: 'allow' }
  if (value === null || typeof value !== 'object') throw new TypeError('TUI decision result must be an object')
  const record = value as Record<string, unknown>
  if (record.outcome !== 'allow' && record.outcome !== 'deny') throw new TypeError('TUI decision result outcome must be allow or deny')
  if (record.reason !== undefined && typeof record.reason !== 'string') throw new TypeError('TUI decision result reason must be a string')
  return Object.freeze({
    outcome: record.outcome,
    ...record.reason === undefined ? {} : { reason: truncateText(terminalSafe(record.reason), 256) },
  })
}

function normalizeWorkspaceOption(input: TuiWorkspaceOption): TuiWorkspaceOption {
  validateKey(input.id)
  return Object.freeze({
    id: input.id,
    label: singleLine(input.label, `${input.id} workspace label`, 256),
    path: singleLine(input.path, `${input.id} workspace path`, 4096),
  })
}

function normalizeFullscreenSceneFrame(
  input: unknown,
  width: number,
  height: number,
  id: string,
): TuiFullscreenSceneFrame {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`TUI fullscreen scene "${id}" frame must be an object`)
  }
  const record = input as Record<string, unknown>
  if (typeof record.title !== 'string') throw new TypeError(`TUI fullscreen scene "${id}" title must be a string`)
  const title = singleLine(record.title, `${id} scene title`, 128)
  if (!isStringArray(record.lines)) {
    throw new TypeError(`TUI fullscreen scene "${id}" lines must be an array of strings`)
  }
  const maxLines = Math.min(MAX_SCENE_LINES, Math.max(1, height - 3))
  const lines = record.lines.slice(0, maxLines).map((line, index) => truncateCells(
    singleLine(line, `${id} scene line ${index + 1}`, MAX_SCENE_LINE_LENGTH), width,
  ))
  if (record.footer !== undefined && typeof record.footer !== 'string') {
    throw new TypeError(`TUI fullscreen scene "${id}" footer must be a string`)
  }
  const footer = record.footer === undefined ? undefined : singleLine(record.footer, `${id} scene footer`, 512)
  return Object.freeze({
    title,
    lines: Object.freeze(lines),
    ...footer === undefined ? {} : { footer: truncateCells(footer, width) },
  })
}

function unavailableFullscreenSceneFrame(id: string): TuiFullscreenSceneFrame {
  return Object.freeze({ title: id, lines: Object.freeze([`${id}: unavailable`]), footer: 'Esc close' })
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function normalizeKnownSessionEvent(input: TuiKnownSessionEvent): TuiKnownSessionEvent {
  if (!Number.isInteger(input.seq) || input.seq < 0) throw new TypeError('known TUI Session event seq must be non-negative')
  return Object.freeze({
    type: input.type,
    seq: input.seq,
    text: truncateText(terminalSafe(input.text), MAX_EVENT_RENDER_TEXT),
    ...input.interrupted === undefined ? {} : { interrupted: input.interrupted },
  })
}

function normalizeKnownSessionEventRenderResult(value: unknown): TuiKnownSessionEventRenderResult | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('known TUI Session event renderer result must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.label !== 'string' || typeof record.text !== 'string') {
    throw new TypeError('known TUI Session event renderer result requires label and text')
  }
  if (record.tone !== 'user' && record.tone !== 'assistant' && record.tone !== 'status') {
    throw new TypeError('known TUI Session event renderer result has an unknown tone')
  }
  return Object.freeze({
    label: singleLine(record.label, 'known Session event renderer label', 128),
    text: truncateText(terminalSafe(record.text), MAX_EVENT_RENDER_TEXT),
    tone: record.tone,
  })
}

function validateKey(value: string): void {
  if (!KEY.test(value)) throw new TypeError(`invalid TUI extension key "${value}"`)
}

function validateNamespace(value: string): void {
  if (!NAMESPACE.test(value)) throw new TypeError(`invalid TUI settings namespace "${value}"`)
}

function validatePriority(value: number): void {
  if (!Number.isInteger(value) || value < -MAX_PRIORITY || value > MAX_PRIORITY) throw new TypeError('TUI extension priority must be an integer between -10000 and 10000')
}

function validateWidth(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_WIDTH) throw new TypeError(`TUI status width must be an integer between 1 and ${MAX_WIDTH}`)
}

function validateTimeout(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) throw new TypeError(`TUI extension timeout must be an integer between 1 and ${MAX_TIMEOUT_MS}ms`)
}

function singleLine(value: string, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`)
  const safe = terminalSafe(value).replace(/[\r\n\t]+/gu, ' ').trim()
  if (safe.length === 0 || safe.length > maxLength) throw new TypeError(`${label} must be non-blank and at most ${maxLength} characters`)
  return safe
}

function sortKey(
  left: { readonly kind: string; readonly key?: string; readonly id?: string },
  right: { readonly kind: string; readonly key?: string; readonly id?: string },
): number {
  return (left.key ?? left.id ?? '').localeCompare(right.key ?? right.id ?? '')
}

function sortPriority(
  left: { readonly priority: number; readonly key?: string; readonly id?: string },
  right: { readonly priority: number; readonly key?: string; readonly id?: string },
): number {
  return right.priority - left.priority || (left.key ?? left.id ?? '').localeCompare(right.key ?? right.id ?? '')
}

function sortNamespace(left: { readonly namespace: string }, right: { readonly namespace: string }): number {
  return left.namespace.localeCompare(right.namespace)
}

function defaultTuiExtensionStorageRoot(): string {
  return dshHomePath('tui', 'extensions')
}

function truncateCells(value: string, width: number): string {
  if (stringWidth(value) <= width) return value
  if (width === 1) return '…'
  let output = ''
  for (const segment of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) {
    if (stringWidth(output + segment.segment) > width - 1) break
    output += segment.segment
  }
  return `${output}…`
}

async function bounded<T>(
  run: (signal: AbortSignal) => T | Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const onAbort = (): void => { controller.abort(signal?.reason ?? new Error('TUI extension call aborted')) }
  if (signal?.aborted === true) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const timeoutError = new Error(`TUI extension call exceeded ${timeoutMs}ms`)
          controller.abort(timeoutError)
          reject(timeoutError)
        }, timeoutMs)
      }),
      new Promise<never>((_, reject) => {
        if (controller.signal.aborted) reject(asError(controller.signal.reason))
        else controller.signal.addEventListener('abort', () => {
          reject(asError(controller.signal.reason))
        }, { once: true })
      }),
    ])
    return result
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'TUI extension call aborted')
}
