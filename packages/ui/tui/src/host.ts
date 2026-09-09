/** Supported DeepSeek Harness imports and optional-host compatibility adapters. */

import { FsError, type FileSystem, type FsDirEntry, type FsTarget } from '@deepseek-ai/dsh-fs'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { ApprovalRequest as HostApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { SessionEvent, SessionHeader, SessionId as HostSessionId } from '@deepseek-ai/dsh-session'
import type {
  CommandDefinition as HostCommandDefinition,
  CommandDescriptor as HostCommandDescriptor,
  CommandRuntime,
} from '@deepseek-ai/dsh-commands'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { FileReferenceService, FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference'
import type {
  SessionReferenceCandidate,
  SessionReferenceInput,
} from '@deepseek-ai/dsh-session-reference'
import type { Agent as HostAgent } from '@deepseek-ai/dsh-agent'
import type { GoalProjection, GoalRef, GoalService } from '@deepseek-ai/dsh-goal'
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode'
import { brandString } from '@deepseek-ai/dsh-brand'
import type z from '@deepseek-ai/schemastery'
import {
  credentialKeyId, credentialKeyScope, credentialRef as hostCredentialRef,
} from '@deepseek-ai/dsh-credentials'
import type { Context as HostContext } from '@deepseek-ai/cordis'
import type { AgentPreset, AgentPresets as HostAgentPresets } from '@deepseek-ai/dsh-agent-presets'
import type {
  Workspace, WorkspaceId, WorkspaceRegistry as HostWorkspaceRegistry,
} from '@deepseek-ai/dsh-workspace'
import type {
  DirectoryPickerCapability, DirectoryListing,
} from '@deepseek-ai/dsh-host-directory-picker'

import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-compaction'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-schedule'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-tool-todo'
import type {} from '@deepseek-ai/dsh-authorization'

export type { Context } from '@deepseek-ai/cordis'
export { FsError } from '@deepseek-ai/dsh-fs'
export type { FileSystem } from '@deepseek-ai/dsh-fs'
export { AttachmentError } from '@deepseek-ai/dsh-attachment'
export type {
  EncodedImageAttachment, ImageAttachmentLimits, ImageAttachmentRef, ImageMediaType,
} from '@deepseek-ai/dsh-attachment'
export { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
export { dshHomePath } from '@deepseek-ai/dsh-home-paths'
export type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export { default as z } from '@deepseek-ai/schemastery'
export {
  assembleContextFor, installModelSelection,
} from '@deepseek-ai/dsh-agent'
export type {
  Agent,
  AgentHandle,
  AgentStatus,
  ModelSelection,
  ModelSelectionRef,
} from '@deepseek-ai/dsh-agent'
export type {
  AgentPreset, AgentPresetComposition, AgentPresetCompositionRow,
} from '@deepseek-ai/dsh-agent-presets'
export type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
export { JobId } from '@deepseek-ai/dsh-jobs'
export type { JobSnapshot, JobStatus } from '@deepseek-ai/dsh-jobs'
export { createUserMessage, errorChain, freezeMessage, normalizeApiKey, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
export type {
  ContentBlock, LlmConfigurableProvider, LlmDiscoveredModel, LlmModelDiscoveryRequest,
  StreamChunk, TokenUsage, UserMessage,
} from '@deepseek-ai/dsh-llm'
export { MessageId } from '@deepseek-ai/dsh-llm/brand'
export { runNativeCommand } from '@deepseek-ai/dsh-native-command'
export type { PermissionSelect } from '@deepseek-ai/dsh-permission-presets'
export {
  isAppendSurfaceEvent,
} from '@deepseek-ai/dsh-session/surface'
export {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionLogOffset,
} from '@deepseek-ai/dsh-session'
export type { SessionEvent, SessionHeader, SessionId as SessionIdType, TurnEndReason } from '@deepseek-ai/dsh-session'
export type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
export type { TodoItem } from '@deepseek-ai/dsh-tool-todo'
export type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache'
export type { SessionRecord } from '@deepseek-ai/dsh-session-query'
export { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'
export type {
  SettingsDescriptor, SettingsNamespace, SettingsPathOp, SettingsProvider,
} from '@deepseek-ai/dsh-settings'
export { activeAtToken, formatFileMention } from '@deepseek-ai/dsh-file-reference'
export type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference'
export { formatSessionReferenceMention } from '@deepseek-ai/dsh-session-reference'
export type {
  AgentPresetPluginGroup, AgentPresetPluginRow, PluginEntryId, PluginFiberPhase,
  PluginInventoryEntry, PluginInventorySnapshot,
} from '@deepseek-ai/dsh-host-plugin-inventory/types'
export type {
  MessageFeedbackDeleteResult, MessageFeedbackListResult, MessageFeedbackPutResult,
  MessageFeedbackRating, MessageFeedbackVersion,
} from '@deepseek-ai/dsh-message-feedback'
const SETTINGS_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/

/** Validate and brand one dynamic settings namespace before calling the Host owner. */
export function settingsNamespace(value: string): import('@deepseek-ai/dsh-settings').SettingsNamespace {
  if (!SETTINGS_NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(SETTINGS_NAMESPACE_PATTERN)}`)
  }
  return brandString<import('@deepseek-ai/dsh-settings').SettingsNamespace>(value)
}

/** Hooks used while the TUI follows the optional settings owner. */
export interface TuiSettingsSectionHooks<T> {
  /** Replace the currently authoritative configuration source. */
  setSource(current: () => T): void
  /** Recompute TUI state derived from the active source. */
  onChange(): void
  /** Refuse a resolved settings section the TUI cannot apply. */
  validate?: (value: T) => void
}

/** Install one TUI settings section through the rc.1 owner method. */
export function installSettingsSection<T>(
  ctx: HostContext,
  namespace: string,
  schema: z<T>,
  entry: T,
  hooks: TuiSettingsSectionHooks<T>,
): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, namespace, schema, entry, hooks)
  })
}

/** Resolve the shared Host settings owner through the reviewed adapter boundary. */
export function hostSettings(ctx: HostContext): import('@deepseek-ai/dsh-settings').SettingsProvider {
  const settings = ctx.get('settings')
  if (settings === undefined) throw new Error('TUI settings service is unavailable')
  return settings
}
/** Validate one provider credential reference through the supported Host API. */
export const credentialRef = hostCredentialRef

function recordedSessionPreset(session: {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
}): string | undefined {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index]
    if (event?.type === 'agent-preset/selected') return event.data.agentPreset
  }
  return session.header.agentPreset
}

/** Whether a detached or live Session still records the retired downstream PTC id. */
export function sessionUsesLegacyCodePreset(session: {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
}): boolean {
  return recordedSessionPreset(session) === 'code'
}

/** Resolve the durable preset from a detached or live Session, newest selection winning. */
export function resolveSessionPreset(session: {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
}): string | undefined {
  const recorded = recordedSessionPreset(session)
  return recorded === 'code' ? 'ptc' : recorded
}
export type { CredentialInfo, CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'
export type {
  SubagentDescendantListEntry,
  SubagentResult,
  SubagentRunEndInfo,
  SubagentRunInfo,
  SubagentTimingProjection,
} from '@deepseek-ai/dsh-subagent'
export type {
  ContextBreakdownProjection,
  ContextPressureProjection,
  TokenUsageProjection,
} from '@deepseek-ai/dsh-token-meter'
export { deriveTurnTokenUsage } from '@deepseek-ai/dsh-token-meter/client'
export type { TurnTokenUsage, TurnTokenUsageRoute } from '@deepseek-ai/dsh-token-meter/client'
export type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats'
export type { ScheduleRecord } from '@deepseek-ai/dsh-schedule/client'
export { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
export type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
export type { ToolCallView, ToolDefinition, ToolResultView } from '@deepseek-ai/dsh-tools'
export { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
export type {
  AskUserQuestionAnswer,
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
export type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'

/** Preset operations the native TUI is allowed to use from the official Host. */
export type TuiAgentPresets = Pick<HostAgentPresets,
  'list' | 'resolve' | 'mount' | 'recompose' | 'composedPreset'
  | 'read' | 'copy' | 'remove' | 'defaultId' | 'authorable' | 'roots'> & {
    /** Structured owner projection; absent only on an older compatible Host. */
    compositionInventory?: HostAgentPresets['compositionInventory']
    /** Newer owner mutation; absent on legacy Hosts. */
    setDefault?(id: string, expectedRevision: number): Promise<void>
    /** Settings revision paired with {@link setDefault}. */
    readonly defaultRevision?: number
  }

/** Resolve the required preset roster through the reviewed Host adapter. */
export function hostAgentPresets(ctx: HostContext): TuiAgentPresets {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) throw new Error('TUI Agent preset service is unavailable')
  return presets as unknown as TuiAgentPresets
}

/** Keep the imported preset row type on the public Host boundary. */
export type TuiAgentPreset = AgentPreset

/** Workspace operations the native TUI consumes from the durable Host owner. */
export type TuiWorkspaceRegistry = Pick<HostWorkspaceRegistry,
  'archivedSessionIds' | 'archiveSession' | 'create' | 'delete' | 'get' | 'insertBefore' | 'list' | 'resolveByPath'> & {
    /** Remove one id from the durable archive set. */
    unarchiveSession?(sessionId: HostSessionId): Promise<void>
  }

/** Resolve the required durable Workspace owner through the reviewed Host adapter. */
export function hostWorkspaceRegistry(ctx: HostContext): TuiWorkspaceRegistry {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) throw new Error('TUI Workspace registry is unavailable')
  return registry
}

/** Keep Workspace entity and identity types on the public TUI Host boundary. */
export type { Workspace as TuiWorkspace, WorkspaceId as TuiWorkspaceId }

/** Optional Host-owned directory interaction used when creating a Workspace. */
export function hostDirectoryPickerCapability(ctx: HostContext): DirectoryPickerCapability | undefined {
  return ctx.get('directoryPicker')?.capability()
}

/** Keep directory browsing facts on the official Host owner boundary. */
export type {
  DirectoryPickerCapability as TuiDirectoryPickerCapability,
  DirectoryListing as TuiDirectoryListing,
}

/** Bounded Host file-reference discovery consumed by the unified composer panel. */
export type TuiFileReferences = Pick<FileReferenceService, 'list'>

/** Resolve the mounted file-reference owner. */
export function hostFileReferences(ctx: HostContext): TuiFileReferences {
  const references = ctx.get('fileReferences')
  if (references === undefined) throw new Error('TUI file-reference discovery is unavailable')
  return references
}

/** Session-reference discovery and pre-submit validation consumed by the TUI. */
export interface TuiSessionReferences {
  listCandidates(
    agent: HostAgent,
    query?: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<(SessionReferenceCandidate & { readonly updatedAt: number })[]>
  validateText(
    agent: HostAgent,
    text: string,
    signal?: AbortSignal,
  ): Promise<readonly Required<SessionReferenceInput>[]>
}

/** Resolve the mounted canonical Session-reference owner. */
export function hostSessionReferences(ctx: HostContext): TuiSessionReferences {
  const references = ctx.get('sessionReferenceResolver')
  if (references === undefined) throw new Error('TUI Session-reference service is unavailable')
  const candidate = references as unknown as {
    listCandidates: TuiSessionReferences['listCandidates']
    validateText?: TuiSessionReferences['validateText']
  }
  return {
    async listCandidates(agent, query, limit, signal) {
      const rows = await candidate.listCandidates(agent, query, limit, signal)
      return rows.map(row => Object.freeze({
        ...row,
        updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : row.createdAt,
      }))
    },
    validateText: typeof candidate.validateText === 'function'
      ? (agent, text, signal) => candidate.validateText?.(agent, text, signal) ?? Promise.resolve([])
      : () => Promise.resolve([]),
  }
}

export type { FileReferenceCandidate as TuiFileReferenceCandidate }
export type TuiSessionReferenceCandidate = SessionReferenceCandidate & { readonly updatedAt: number }

/** Goal mutations exposed by the active Agent-scoped preset. */
export type TuiGoals = Pick<GoalService, 'edit' | 'pause' | 'resume' | 'clear'>

/** Resolve the exact active Agent's Goal owner instead of the root Host tree. */
export function hostGoals(agent: HostAgent): TuiGoals {
  const goals = agent.ctx.get('goals')
  if (goals === undefined) throw new Error('TUI Goal service is unavailable for this Agent mode')
  return goals
}

export type { GoalProjection as TuiGoalProjection, GoalRef as TuiGoalRef }
export type { PlanProjection as TuiPlanProjection }

/** Localized descriptions accepted by newer command registries and ignored by older ones. */
export type CommandLocalizedDescriptions = Readonly<Record<string, string>>

/** One optional nested command path projected by the TUI completion surface. */
export interface CommandCompletionNode {
  readonly name: string
  readonly canonicalPath?: readonly string[]
  readonly aliases?: readonly string[]
  readonly description: string
  readonly descriptions?: CommandLocalizedDescriptions
  readonly input?: { readonly hint: string }
  readonly disabledReason?: string
  readonly children?: readonly CommandCompletionNode[]
}

/** Additive command metadata available only when the Host preserves it. */
export interface CommandCompletionDescriptor {
  readonly aliases?: readonly string[]
  readonly descriptions?: CommandLocalizedDescriptions
  readonly children?: readonly CommandCompletionNode[]
}

/** Command discovery view shared by legacy and completion-capable Hosts. */
export type CommandDescriptor = HostCommandDescriptor & {
  readonly completion?: CommandCompletionDescriptor
}

/** Command registration accepted by both legacy and completion-capable Hosts. */
export type TuiCommandDefinition = HostCommandDefinition & {
  readonly completion?: CommandCompletionDescriptor
}

/** Legacy-host command discovery retaining TUI metadata against one captured service proxy. */
export class TuiHostCommandCatalog {
  private readonly completions = new Map<string, CommandCompletionDescriptor>()

  /** @param commands - command service proxy captured from the TUI owner context. */
  constructor(private readonly commands: CommandRuntime) {}

  /**
   * Register one TUI command and retain its additive discovery metadata.
   * @param definition - TUI-owned command registration.
   * @returns disposer for both the Host registration and retained metadata.
   */
  register(definition: TuiCommandDefinition): ReturnType<CommandRuntime['register']> {
    const dispose = this.commands.register(definition)
    const completion = definition.completion
    if (completion === undefined) return dispose
    this.completions.set(definition.name, completion)
    return () => {
      try {
        dispose()
      } finally {
        if (this.completions.get(definition.name) === completion) this.completions.delete(definition.name)
      }
    }
  }

  /**
   * Read descriptors and restore TUI-owned metadata omitted by a legacy Host.
   * @param agent - exact Agent whose effective commands are requested.
   * @returns immutable effective descriptors with retained TUI metadata.
   */
  list(agent: Parameters<CommandRuntime['list']>[0]): readonly CommandDescriptor[] {
    const descriptors = this.commands.list(agent)
    if (this.completions.size === 0) return descriptors
    return Object.freeze(descriptors.map((descriptor): CommandDescriptor => {
      const descriptorWithCompletion = descriptor as HostCommandDescriptor & {
        readonly completion?: CommandCompletionDescriptor
      }
      if (descriptorWithCompletion.completion !== undefined) return descriptorWithCompletion
      const completion = this.completions.get(descriptor.name)
      return completion === undefined ? descriptor : Object.freeze({ ...descriptor, completion })
    }))
  }
}

/** Terminal-safe semantic category for one bounded Session preview line. */
export type SessionPreviewLineKind = 'human' | 'assistant' | 'tool'

/** One optional newer-Host Session preview row. */
export interface SessionPreviewLine {
  readonly seq: number
  readonly kind: SessionPreviewLineKind
  readonly text: string
}

/** Bounded preview projection returned only by preview-capable Hosts. */
export interface SessionPreviewSnapshot {
  readonly lines: readonly SessionPreviewLine[]
  readonly truncated: boolean
}

interface PreviewCapableSessionQuery {
  readPreview(sessionId: HostSessionId, signal?: AbortSignal): Promise<SessionPreviewSnapshot>
}

/** Read a bounded Session preview when supported; legacy Hosts return no preview rows. */
export function hostReadSessionPreview(
  sessionQuery: SessionQueryEngine,
  sessionId: HostSessionId,
  signal?: AbortSignal,
): Promise<SessionPreviewSnapshot | undefined> {
  const candidate = sessionQuery as SessionQueryEngine & Partial<PreviewCapableSessionQuery>
  return typeof candidate.readPreview === 'function'
    ? candidate.readPreview(sessionId, signal)
    : Promise.resolve(undefined)
}

/** Why a fresh TUI Agent exists; older supported Hosts ignore this additive field. */
export type AgentCreateSource = 'startup' | 'clear' | 'compact' | 'rewind'

/** Bounded path-completion result available on newer Hosts. */
export interface FsPathCompletionResult {
  /** Stable workspace-relative matches. */
  readonly entries: readonly { readonly path: string; readonly type: 'file' | 'directory' }[]
  /** Whether a provider bound truncated the result. */
  readonly truncated: boolean
}

/** One optional provider-owned authentication prompt. */
export type LlmAuthenticationPrompt = {
  readonly signal?: AbortSignal
} & ({
  readonly type: 'text' | 'secret' | 'manual-code'
  readonly message: string
  readonly placeholder?: string
} | {
  readonly type: 'select'
  readonly message: string
  readonly options: readonly { readonly id: string; readonly label: string; readonly description?: string }[]
})

/** One optional provider-owned authentication progress event. */
export type LlmAuthenticationEvent =
  | { readonly type: 'info' | 'progress'; readonly message: string }
  | { readonly type: 'auth-url'; readonly url: string; readonly instructions?: string }
  | {
    readonly type: 'device-code'
    readonly userCode: string
    readonly verificationUri: string
    readonly intervalSeconds?: number
    readonly expiresInSeconds?: number
  }

/** Callbacks borrowed by an optional provider-owned authentication flow. */
export interface LlmAuthenticationInteraction {
  readonly signal?: AbortSignal
  prompt(prompt: LlmAuthenticationPrompt): Promise<string>
  notify(event: LlmAuthenticationEvent): void
}

/** Non-secret authentication state projected by a newer Host. */
export interface LlmAuthenticationInfo {
  readonly configured: boolean
  readonly source?: string
  readonly methods: readonly { readonly id: string; readonly name: string }[]
  readonly canLogout?: boolean
}

interface AuthenticationCapableLlm {
  authentication(provider: string): Promise<LlmAuthenticationInfo>
  login(provider: string, method: string, interaction: LlmAuthenticationInteraction): Promise<void>
  logout(provider: string): Promise<void>
}

type TuiAuthenticationHost = HostContext | LlmRuntime

function authenticationContext(host: TuiAuthenticationHost): HostContext | undefined {
  return typeof (host as HostContext).get === 'function'
    ? host as HostContext
    : undefined
}

function authenticationLlm(host: TuiAuthenticationHost): LlmRuntime {
  return authenticationContext(host)?.llm ?? host as LlmRuntime
}

function authorizationEntry(host: HostContext, provider: string) {
  const authorization = host.get('authorization')
  if (authorization === undefined) return undefined
  // The enhanced route retains its legacy scoped credential address.
  return authorization.list().find(entry => provider === 'lingxi-openai-codex'
    ? credentialKeyScope(entry.key) === 'llm-openai-codex' && credentialKeyId(entry.key) === 'openai-codex'
    : credentialKeyScope(entry.key) !== 'llm-openai-codex' && credentialKeyId(entry.key) === provider)
}

/**
 * Read provider authentication when the Host exposes that optional seam.
 * Older Hosts treat registered routes as already configured and offer no login action.
 * @param llm - active Host LLM runtime.
 * @param provider - registered provider route.
 * @returns provider authentication projection or the legacy configured fallback.
 */
export async function hostAuthentication(host: TuiAuthenticationHost, provider: string): Promise<LlmAuthenticationInfo> {
  const ctx = authenticationContext(host)
  const entry = ctx === undefined ? undefined : authorizationEntry(ctx, provider)
  const credentials = ctx?.get('credentials')
  if (entry !== undefined && credentials !== undefined) {
    const record = await credentials.describeRecord(entry.key)
    return {
      configured: record.configured,
      ...record.kind === undefined ? {} : { source: record.kind },
      methods: entry.methods.map(method => ({ id: method.id, name: method.label })),
      canLogout: record.configured && record.writable,
    }
  }
  const candidate = authenticationLlm(host) as LlmRuntime & Partial<AuthenticationCapableLlm>
  return typeof candidate.authentication === 'function'
    ? candidate.authentication(provider)
    : Promise.resolve({ configured: true, methods: [] })
}

/**
 * Run an authentication method previously returned by {@link hostAuthentication}.
 * @param llm - active Host LLM runtime.
 * @param provider - registered provider route.
 * @param method - provider-owned method id.
 * @param interaction - borrowed TUI callbacks.
 */
export function hostLogin(
  host: TuiAuthenticationHost,
  provider: string,
  method: string,
  interaction: LlmAuthenticationInteraction,
): Promise<void | 'authorized' | 'cancelled'> {
  const ctx = authenticationContext(host)
  const entry = ctx === undefined ? undefined : authorizationEntry(ctx, provider)
  const authorization = ctx?.get('authorization')
  if (entry !== undefined && authorization !== undefined) {
    return authorization.begin({
      key: entry.key,
      method,
      ...interaction.signal === undefined ? {} : { signal: interaction.signal },
      interaction: {
        notify(notice) {
          if (notice.url !== undefined && notice.code !== undefined) {
            interaction.notify({ type: 'device-code', verificationUri: notice.url, userCode: notice.code })
          } else if (notice.url !== undefined) {
            interaction.notify({ type: 'auth-url', url: notice.url, instructions: notice.message })
          } else {
            interaction.notify({ type: 'info', message: notice.message })
          }
        },
        prompt(prompt) {
          return interaction.prompt(prompt.kind === 'select'
            ? { type: 'select', message: prompt.message, options: prompt.options, ...prompt.signal === undefined ? {} : { signal: prompt.signal } }
            : {
              type: prompt.kind,
              message: prompt.message,
              ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
              ...prompt.signal === undefined ? {} : { signal: prompt.signal },
            })
        },
      },
    }).then(outcome => outcome.status)
  }
  const candidate = authenticationLlm(host) as LlmRuntime & Partial<AuthenticationCapableLlm>
  if (typeof candidate.login !== 'function') {
    return Promise.reject(new Error('This DeepSeek Harness version does not expose interactive provider authentication.'))
  }
  return candidate.login(provider, method, interaction)
}

/**
 * Run provider-owned logout when the Host or bundled compatibility bridge exposes it.
 * @param llm - active Host LLM runtime.
 * @param provider - registered provider route.
 * @returns promise settled after the provider-owned credential removal finishes.
 */
export function hostLogout(host: TuiAuthenticationHost, provider: string): Promise<void> {
  const ctx = authenticationContext(host)
  const entry = ctx === undefined ? undefined : authorizationEntry(ctx, provider)
  const credentials = ctx?.get('credentials')
  if (entry !== undefined && credentials !== undefined) return credentials.deleteRecord(entry.key)
  const candidate = authenticationLlm(host) as LlmRuntime & Partial<AuthenticationCapableLlm>
  if (typeof candidate.logout !== 'function') {
    return Promise.reject(new Error('This DeepSeek Harness version does not expose provider logout.'))
  }
  return candidate.logout(provider)
}

interface PathCompletionCapableFileSystem {
  completePaths(
    root: FsTarget,
    query: string,
    options: {
      readonly maxDepth: number
      readonly maxItems: number
      readonly maxScannedEntries: number
      readonly signal?: AbortSignal
    },
  ): Promise<FsPathCompletionResult>
}

interface LegacyPathCompletionCandidate {
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly rank: number
}

function pathCompletionRank(path: string, query: string): number | undefined {
  if (query === '') return 0
  const normalizedPath = path.normalize('NFC').toLocaleLowerCase()
  const basename = normalizedPath.replace(/\/$/u, '').split('/').at(-1) ?? ''
  if (basename.startsWith(query)) return 0
  if (normalizedPath.startsWith(query)) return 1
  if (basename.includes(query)) return 2
  if (normalizedPath.includes(query)) return 3
  return undefined
}

function comparePathCompletionCandidates(
  left: LegacyPathCompletionCandidate,
  right: LegacyPathCompletionCandidate,
): number {
  return left.rank - right.rank
    || Number(left.type === 'file') - Number(right.type === 'file')
    || left.path.localeCompare(right.path)
}

function requirePathCompletionLimit(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`)
}

async function legacyHostCompletePaths(
  fs: FileSystem,
  root: FsTarget,
  query: string,
  options: {
    readonly maxDepth: number
    readonly maxItems: number
    readonly maxScannedEntries: number
    readonly signal?: AbortSignal
  },
): Promise<FsPathCompletionResult> {
  requirePathCompletionLimit('maxDepth', options.maxDepth)
  requirePathCompletionLimit('maxItems', options.maxItems)
  requirePathCompletionLimit('maxScannedEntries', options.maxScannedEntries)
  if (options.signal?.aborted) throw new FsError('path completion aborted', 'FS_ABORTED')

  const normalizedQuery = query.replaceAll('\\', '/').replace(/^\.\/+/, '').normalize('NFC').toLocaleLowerCase()
  const maxDepth = normalizedQuery === '' ? 1 : options.maxDepth
  const queue: Array<{ target: FsTarget; path: string; depth: number }> = [
    { target: root, path: '', depth: 0 },
  ]
  const visitedDirectories = new Set<string>([String(root.targetKey)])
  const matches: LegacyPathCompletionCandidate[] = []
  let scannedEntries = 0
  let truncated = false

  while (queue.length > 0) {
    if (options.signal?.aborted) throw new FsError('path completion aborted', 'FS_ABORTED')
    const directory = queue.shift()
    if (directory === undefined) break
    const remaining = options.maxScannedEntries - scannedEntries
    if (remaining <= 0) {
      truncated = true
      break
    }

    let entries: FsDirEntry[]
    try {
      entries = await fs.listDir(directory.target, options.signal)
    } catch (error: unknown) {
      if (directory.depth === 0) throw error
      if (error instanceof FsError
        && (error.code === 'FS_PERMISSION_DENIED'
          || error.code === 'FS_NOT_FOUND'
          || error.code === 'FS_NOT_DIRECTORY')) continue
      throw error
    }
    if (entries.length > remaining) truncated = true

    for (const entry of entries.slice(0, remaining)) {
      if (options.signal?.aborted) throw new FsError('path completion aborted', 'FS_ABORTED')
      scannedEntries += 1
      if (!fs.contains(root, entry.target)) continue
      if (entry.type !== 'file' && entry.type !== 'directory') continue

      const path = `${directory.path}${entry.name}${entry.type === 'directory' ? '/' : ''}`
      const rank = pathCompletionRank(path, normalizedQuery)
      if (rank !== undefined) {
        matches.push({ path, type: entry.type, rank })
        matches.sort(comparePathCompletionCandidates)
        if (matches.length > options.maxItems) {
          matches.pop()
          truncated = true
        }
      }

      if (entry.type === 'directory' && directory.depth + 1 < maxDepth) {
        const key = String(entry.target.targetKey)
        if (!visitedDirectories.has(key)) {
          visitedDirectories.add(key)
          queue.push({ target: entry.target, path, depth: directory.depth + 1 })
        }
      }
    }
  }

  return {
    entries: matches.map(({ path, type }) => ({ path, type })),
    truncated,
  }
}

/**
 * Complete workspace paths through the current Host helper or bounded legacy primitives.
 * @param fs - active Host filesystem service.
 * @param root - resolved workspace root.
 * @param query - workspace-relative query.
 * @param options - complete traversal and result bounds.
 * @returns bounded workspace-relative matches.
 */
export function hostCompletePaths(
  fs: FileSystem,
  root: FsTarget,
  query: string,
  options: {
    readonly maxDepth: number
    readonly maxItems: number
    readonly maxScannedEntries: number
    readonly signal?: AbortSignal
  },
): Promise<FsPathCompletionResult> {
  const candidate = fs as FileSystem & Partial<PathCompletionCapableFileSystem>
  return typeof candidate.completePaths === 'function'
    ? candidate.completePaths(root, query, options)
    : legacyHostCompletePaths(fs, root, query, options)
}

/** One provider-neutral approval presentation projected by newer Hosts. */
export type ApprovalPresentation =
  | { readonly kind: 'terminal'; readonly command: string; readonly cwd?: string; readonly policy?: string }
  | {
    readonly kind: 'diff'
    readonly files: readonly {
      readonly path: string
      readonly additions: number
      readonly deletions: number
      readonly preview?: readonly string[]
    }[]
  }
  | {
    readonly kind: 'filesystem'
    readonly path: string
    readonly operation: 'read' | 'write' | 'edit' | 'delete' | 'move' | 'other'
    readonly workspaceRoot?: string
  }
  | {
    readonly kind: 'web'
    readonly url: string
    readonly host: string
    readonly method?: string
    readonly purpose?: string
  }
  | { readonly kind: 'generic'; readonly toolName: string; readonly args?: unknown }

/** Approval request accepted from either the legacy Host or its presentation-aware successor. */
export type ApprovalRequest = HostApprovalRequest & { readonly presentation?: ApprovalPresentation }

/** Why a Session event anchor cannot select a complete turn. */
type SessionForkAnchorUnavailableReason = 'no-completed-turn' | 'anchored-turn-open'

/** Result of selecting a complete, between-turn Session seed prefix. */
export type SessionForkAnchorResolution =
  | { readonly kind: 'selected'; readonly boundarySeq: number; readonly seedLength: number }
  | { readonly kind: 'unavailable'; readonly reason: SessionForkAnchorUnavailableReason }

/**
 * Map a human event anchor to the complete turn prefix retained by a rewind.
 * @param events - contiguous durable Session log.
 * @param atSeq - optional event sequence inside the turn to retain.
 * @returns safe seed boundary or why no completed turn is available.
 */
export function resolveSessionForkAnchor(
  events: readonly SessionEvent[],
  atSeq?: number,
): SessionForkAnchorResolution {
  const lastSeq = events.at(-1)?.seq ?? -1
  const anchoredBoundary = atSeq === undefined
    ? undefined
    : events.find(event => event.type === 'turn/end' && event.seq >= atSeq)
  const boundary = anchoredBoundary
    ?? (atSeq === undefined || atSeq > lastSeq
      ? events.findLast(event => event.type === 'turn/end')
      : undefined)
  if (boundary === undefined) {
    return {
      kind: 'unavailable',
      reason: atSeq !== undefined && atSeq <= lastSeq ? 'anchored-turn-open' : 'no-completed-turn',
    }
  }
  let seedLength = boundary.seq + 1
  while (seedLength < events.length && events[seedLength]?.type !== 'turn/start') seedLength += 1
  return { kind: 'selected', boundarySeq: boundary.seq, seedLength }
}
