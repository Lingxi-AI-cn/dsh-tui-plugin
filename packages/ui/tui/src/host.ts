/** Supported DeepSeek Harness imports and optional-host compatibility adapters. */

import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { ApprovalRequest as HostApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { SessionEvent, SessionId as HostSessionId } from '@deepseek-ai/dsh-session'
import type {
  CommandDefinition as HostCommandDefinition,
  CommandDescriptor as HostCommandDescriptor,
  CommandRuntime,
} from '@deepseek-ai/dsh-commands'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { settingsNamespace as hostSettingsNamespace } from '@deepseek-ai/dsh-settings'

import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-compaction'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'

export type { Context } from '@deepseek-ai/cordis'
export { AttachmentError } from '@deepseek-ai/dsh-attachment'
export type { EncodedImageAttachment, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
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
export { resolveSessionPreset } from '@deepseek-ai/dsh-agent-presets'
export type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
export { JobId } from '@deepseek-ai/dsh-jobs'
export type { JobSnapshot, JobStatus } from '@deepseek-ai/dsh-jobs'
export { createUserMessage, errorChain } from '@deepseek-ai/dsh-llm'
export type { ContentBlock, StreamChunk, UserMessage } from '@deepseek-ai/dsh-llm'
export { runNativeCommand } from '@deepseek-ai/dsh-native-command'
export type { PermissionSelect } from '@deepseek-ai/dsh-permission-presets'
export {
  isAppendSurfaceEvent,
} from '@deepseek-ai/dsh-session/surface'
export {
  SESSION_FORMAT_VERSION,
  SessionId,
} from '@deepseek-ai/dsh-session'
export type { SessionEvent, SessionId as SessionIdType, TodoItem } from '@deepseek-ai/dsh-session'
export type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache'
export type { SessionRecord } from '@deepseek-ai/dsh-session-query'
export { installSettingsSection } from '@deepseek-ai/dsh-settings'
/** Validate one TUI-owned settings namespace through the supported Host API. */
export const settingsNamespace = hostSettingsNamespace
export type {
  SubagentDescendantListEntry,
  SubagentRunEndInfo,
  SubagentRunInfo,
  SubagentTimingProjection,
} from '@deepseek-ai/dsh-subagent'
export type {
  ContextBreakdownProjection,
  ContextPressureProjection,
  TokenUsageProjection,
} from '@deepseek-ai/dsh-token-meter'
export type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats'
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

/** Register additive TUI metadata while retaining the legacy Host registration contract. */
export function hostRegisterCommand(
  commands: CommandRuntime,
  definition: TuiCommandDefinition,
): ReturnType<CommandRuntime['register']> {
  return commands.register(definition)
}

/** Read command descriptors while treating completion metadata as optional Host capability. */
export function hostCommandDescriptors(
  commands: CommandRuntime,
  agent: Parameters<CommandRuntime['list']>[0],
): readonly CommandDescriptor[] {
  return commands.list(agent)
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
}

interface AuthenticationCapableLlm {
  authentication(provider: string): Promise<LlmAuthenticationInfo>
  login(provider: string, method: string, interaction: LlmAuthenticationInteraction): Promise<void>
}

/**
 * Read provider authentication when the Host exposes that optional seam.
 * Older Hosts treat registered routes as already configured and offer no login action.
 * @param llm - active Host LLM runtime.
 * @param provider - registered provider route.
 * @returns provider authentication projection or the legacy configured fallback.
 */
export function hostAuthentication(llm: LlmRuntime, provider: string): Promise<LlmAuthenticationInfo> {
  const candidate = llm as LlmRuntime & Partial<AuthenticationCapableLlm>
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
  llm: LlmRuntime,
  provider: string,
  method: string,
  interaction: LlmAuthenticationInteraction,
): Promise<void> {
  const candidate = llm as LlmRuntime & Partial<AuthenticationCapableLlm>
  if (typeof candidate.login !== 'function') {
    return Promise.reject(new Error('This DeepSeek Harness version does not expose interactive provider authentication.'))
  }
  return candidate.login(provider, method, interaction)
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

/**
 * Complete workspace paths when the Host exposes bounded completion.
 * Older Hosts return no suggestions while ordinary path submission remains available.
 * @param fs - active Host filesystem service.
 * @param root - resolved workspace root.
 * @param query - workspace-relative query.
 * @param options - complete traversal and result bounds.
 * @returns bounded matches, or an empty legacy result.
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
    : Promise.resolve({ entries: [], truncated: false })
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
