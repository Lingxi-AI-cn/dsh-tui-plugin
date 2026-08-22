/**
 * `@lingxi-ai-cn/dsh-tui-runtime` — one full-screen terminal frontend over an owned,
 * in-process Agent and its durable Session log.
 */

import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import React from 'react'
import { render, type Instance } from 'ink'
import {
  AttachmentError,
  createUserMessage,
  errorChain,
  hostAuthentication,
  hostAgentPresets,
  hostCompletePaths,
  hostLogin,
  hostReadSessionPreview,
  assembleContextFor,
  installModelSelection,
  installSettingsSection,
  JobId,
  resolveSessionForkAnchor,
  resolveSessionPreset,
  SESSION_FORMAT_VERSION,
  SessionId,
  TuiHostCommandCatalog,
  UserQuestionError,
  z,
  type Agent,
  type AgentPreset,
  type AgentCreateSource,
  type AgentHandle,
  type AskUserQuestionItem,
  type EncodedImageAttachment,
  type ContextBreakdownProjection,
  type CommandInvocation,
  type CommandResult,
  type Context,
  type ContextPressureProjection,
  type FsPathCompletionResult,
  type JobSnapshot,
  type ImageAttachmentRef,
  type ImageMediaType,
  type LlmAuthenticationEvent,
  type LlmAuthenticationInteraction,
  type LlmAuthenticationPrompt,
  type ModelSelection,
  type ModelSelectionRef,
  type PermissionSelect,
  type SessionPreviewLine,
  type SessionEvent,
  type SessionProjectionCache,
  type SessionRecord,
  type SessionStatsProjection,
  type SubagentDescendantListEntry,
  type SubagentRunEndInfo,
  type SubagentRunInfo,
  type TokenUsageProjection,
} from './host.ts'
import { SessionLogExportError } from '@lingxi-ai-cn/dsh-session-export'
import { PluginHubError, type PluginCatalogSort, type PluginCategory, type PluginChangePlan, type PluginId } from '@lingxi-ai-cn/dsh-plugin-hub'
import type {} from '@lingxi-ai-cn/dsh-plugin-hub'
import { TuiApp } from './app.tsx'
import type { TuiSubmitMode } from './delivery.ts'
import type { TuiComposerImageAttachment } from './composer.ts'
import type { TuiAgentViewDescriptor } from './agent-view.ts'
import type { TuiFooterItemId } from './footer.ts'
import {
  resolveTuiInteractionRegistry, TUI_INTERACTION_REGISTRY, tuiInteractionDescription,
  type TuiInteractionDescriptor,
} from './keybindings.ts'
import { openExternalUrl } from './open-url.ts'
import {
  sortTuiResumeCandidates, summarizeTuiResumeCandidate,
  type TuiResumeCandidate, type TuiResumeDialogSnapshot, type TuiResumePresetSummary,
} from './resume.ts'
import {
  type TuiFreshSessionCommand, type TuiFreshSessionDialogSnapshot,
} from './session-lifecycle.ts'
import { tuiAgentModeName, tuiAgentModeOptions } from './mode.ts'
import {
  resolveTuiSessionExportDirectory, type TuiSessionExportDialogSnapshot,
  type TuiSessionExportFormat,
} from './session-export.ts'
import {
  tuiRewindCandidates, type TuiRewindCandidate, type TuiRewindDialogSnapshot,
} from './rewind.ts'
import {
  AgentStatusStore, InteractionStore, isTuiQuestionCancellation, SessionEventStore, ValueStore,
} from './store.ts'
import {
  TerminalSession, terminalInternals, type TuiTerminalCapabilities, type TuiTerminalColorDepth,
  type TuiTerminalHandoff,
} from './terminal-session.ts'
import {
  runTuiExternalEditor, type TuiExternalEditorResult,
} from './external-editor.ts'
import {
  detectImageMediaType, readTuiClipboard,
  type TuiClipboardInsert,
} from './clipboard.ts'
import {
  DEFAULT_TUI_SETTINGS, resolveTuiTheme, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA,
  TUI_MOUSE_PREFERENCES, TUI_THEME_PREFERENCES,
  TuiThemeProvider, type TuiSettings, type TuiTheme,
} from './theme.tsx'
import {
  TUI_LOCALES, TuiLocaleProvider, tuiCommandDescription, tuiCommandDescriptions, tuiLocaleLabel, tuiMessage,
  type TuiLocale, type TuiMessageKey,
} from './locale.ts'
import {
  EMPTY_TUI_WORK_SNAPSHOT, projectTuiWork,
  type TuiObservedSubagentRun, type TuiWorkAgentSnapshot, type TuiWorkItemView, type TuiWorkSnapshot,
} from './work.ts'
import { tuiPluginHubNextCategory, tuiPluginHubNextSort, type TuiPluginHubDialogSnapshot } from './plugin-hub.ts'
import {
  projectTuiDiagnostics,
  tuiHostDiagnosticsFromStartup,
  type TuiDiagnosticSnapshot,
  type TuiPluginHubDiagnostic,
  type TuiProviderDiagnostic,
} from './diagnostics.ts'
import {
  inspectTuiStartupProvider,
  type TuiStartupGuidanceSnapshot,
} from './startup-guidance.ts'
import { projectTuiLoadedContext, type TuiLoadedContextSnapshot } from './loaded-context.ts'
import { TuiExtensionRegistry } from './extensions.ts'

export const name = 'tui'

export const inject = [
  'agentDefaultModel', 'agents', 'sessions', 'sessionPersistence',
  'agentPresets',
  'sessionQuery', 'commands', 'userQuestions', 'approval', 'llm', 'tools',
  'fs', 'sessionLogExporter', 'jobs', 'subagents',
  'attachments', 'subprocess',
]

const PATH_COMPLETION_LIMITS = {
  maxDepth: 4,
  maxItems: 32,
  maxScannedEntries: 256,
} as const

const IMAGE_EXTENSIONS: Readonly<Record<string, ImageMediaType>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const DIAGNOSTIC_ERROR_NAMES = new Set([
  'AbortError', 'Error', 'RangeError', 'SyntaxError', 'TypeError', 'URIError',
])

function diagnosticFailureLabel(error: unknown, owner: 'provider' | 'Plugin Hub'): string {
  if (error instanceof PluginHubError) return `${owner} check failed (${error.code}).`
  if (error instanceof Error && DIAGNOSTIC_ERROR_NAMES.has(error.name)) {
    return `${owner} check failed (${error.name}).`
  }
  return `${owner} check failed.`
}

/** TUI application configuration resolved from its startup provider. */
export interface Config {
  /** Persisted TUI Session to resume; absent creates a new Session. */
  resume?: string
  /** Maximum Session rows mounted in the resume picker. */
  maxResumeOptions?: number
  /** Maximum concurrent metadata reads in one resume scan. */
  resumeScanConcurrency?: number
}

export const Config: z<Config> = z.object({
  resume: z.string(),
  maxResumeOptions: z.number().step(1).min(1).default(8),
  resumeScanConcurrency: z.number().step(1).min(1).default(4),
})

type ResumePreviewResolution =
  | { lines: readonly SessionPreviewLine[]; truncated: boolean; failure?: undefined }
  | { lines: readonly []; truncated: false; failure: unknown }

interface ResumePresetResolution {
  readonly summary?: TuiResumePresetSummary
  readonly disabledReason?: string
}

interface RuntimeDisposers {
  questionProvider?: () => void
  sessionEvents?: () => void
  agentStatus?: () => void
  approval?: () => void
  modelsCommand?: () => void
  modeCommand?: () => void
  configCommand?: () => void
  helpCommand?: () => void
  doctorCommand?: () => void
  langCommand?: () => void
  contextCommand?: () => void
  llmAdaptersUpdated?: () => void
  resumeCommand?: () => void
  clearCommand?: () => void
  newCommand?: () => void
  rewindCommand?: () => void
  exportCommand?: () => void
  renameCommand?: () => void
  quitCommand?: () => void
  exitCommand?: () => void
  pluginHubCommand?: () => void
  pluginHubProgress?: () => void
  projectionChanged?: () => void
  jobsController?: () => void
  jobsChanged?: () => void
  agentCreated?: () => void
  agentDisposed?: () => void
}

interface PreparedTuiAgent {
  handle: AgentHandle
  selection: ModelSelectionRef
  selectedModel: ModelSelection
  preset: AgentPreset
}

function withAgentCreateSource<Options extends object>(
  options: Options,
  source: AgentCreateSource,
): Options & { readonly source: AgentCreateSource } {
  return { ...options, source }
}

interface ActiveOperation {
  controller: AbortController
  completion: Promise<unknown>
}

interface ActiveAgentSwitch extends ActiveOperation {
  kind: 'resume' | 'fresh' | 'rewind'
}

interface ActiveTuiAgentView {
  readonly descriptor: TuiAgentViewDescriptor
  readonly agent: Agent
  readonly events: SessionEventStore
  readonly status: AgentStatusStore
}

interface LoadedContextPromptService {
  assemble(context: ReturnType<typeof assembleContextFor>): Promise<{
    readonly sections: readonly { readonly name: string }[]
    readonly contexts: readonly { readonly name: string }[]
    readonly tools: readonly { readonly name: string }[]
  }>
}

interface LoadedContextSkillService {
  list(options: {
    readonly scope?: object | undefined
    readonly cwd?: string | undefined
    readonly signal?: AbortSignal | undefined
  }): Promise<readonly { readonly name: string }[]>
}

type PrepareTuiAgentRequest =
  | { kind: 'startup'; preset?: string }
  | { kind: 'resume'; sessionId: SessionId }
  | {
    kind: 'fresh'
    source: AgentCreateSource
    cwd: string
    selection: ModelSelection
    preset: string
  }
  | {
    kind: 'rewind'
    parentSession: SessionId
    cwd: string
    selection: ModelSelection
    seed: readonly SessionEvent[]
    preset: string
  }

/** One activation's owned Agent, interactions, Ink root, signals, and terminal transaction. */
class TuiController {
  private readonly terminal = new TerminalSession(terminalInternals)
  private commandCatalog!: TuiHostCommandCatalog
  private readonly interactions = new InteractionStore()
  private readonly externalNotice = new ValueStore('')
  private readonly modelSelection = new ValueStore<ModelSelection | undefined>(undefined)
  private readonly agentMode = new ValueStore<AgentPreset | undefined>(undefined)
  private readonly helpOpen = new ValueStore(false)
  private readonly diagnostics = new ValueStore<TuiDiagnosticSnapshot | undefined>(undefined)
  private readonly loadedContext = new ValueStore<TuiLoadedContextSnapshot | undefined>(undefined)
  private readonly startupGuidance = new ValueStore<TuiStartupGuidanceSnapshot | undefined>(undefined)
  private readonly permissions = new ValueStore<PermissionSelect | undefined>(undefined)
  private readonly contextPressure = new ValueStore<ContextPressureProjection | undefined>(undefined)
  private readonly tokenUsage = new ValueStore<TokenUsageProjection | undefined>(undefined)
  private readonly contextBreakdown = new ValueStore<ContextBreakdownProjection | undefined>(undefined)
  private readonly sessionStats = new ValueStore<SessionStatsProjection | undefined>(undefined)
  private readonly resumeDialog = new ValueStore<TuiResumeDialogSnapshot | undefined>(undefined)
  private readonly freshSessionDialog = new ValueStore<TuiFreshSessionDialogSnapshot | undefined>(undefined)
  private readonly rewindDialog = new ValueStore<TuiRewindDialogSnapshot | undefined>(undefined)
  private readonly sessionExportDialog = new ValueStore<TuiSessionExportDialogSnapshot | undefined>(undefined)
  private readonly pluginHubDialog = new ValueStore<TuiPluginHubDialogSnapshot | undefined>(undefined)
  private readonly work = new ValueStore<TuiWorkSnapshot>(EMPTY_TUI_WORK_SNAPSHOT)
  private readonly disposers: RuntimeDisposers = {}
  private readonly workRootDisposers: (() => void)[] = []
  private readonly remoteSubagentRuns = new Map<string, TuiObservedSubagentRun>()
  private workCatalog: readonly SubagentDescendantListEntry[] = []
  private workCatalogError: string | undefined
  private workCatalogLoading = false
  private workRefreshGeneration = 0
  private workRefresh: ActiveOperation | undefined
  private externalEditor: ActiveOperation | undefined
  private externalEditorHandoff: TuiTerminalHandoff | undefined
  private handle: AgentHandle | undefined
  private events: SessionEventStore | undefined
  private status: AgentStatusStore | undefined
  private instance: Instance | undefined
  private requestedExit = 0
  private closing: Promise<void> | undefined
  private ownerDisposed = false
  private selection: ModelSelectionRef | undefined
  private activeCommand: ActiveOperation | undefined
  private startupGuidanceRefresh: ActiveOperation | undefined
  private exitAfterCommand: Agent | undefined
  private activeSessionExport: ActiveOperation | undefined
  private pluginHubOperation: ActiveOperation | undefined
  private inkMounted: (() => void) | undefined
  private resumeScan: ActiveOperation | undefined
  private activeAgentSwitch: ActiveAgentSwitch | undefined
  private activeView: ActiveTuiAgentView | undefined
  private resumeGeneration = 0
  private freshSessionGeneration = 0
  private rewindGeneration = 0
  private sessionExportGeneration = 0
  private pluginHubGeneration = 0
  private startupGuidanceGeneration = 0
  private settingsSource: () => TuiSettings = () => DEFAULT_TUI_SETTINGS
  private locale: TuiLocale = DEFAULT_TUI_SETTINGS.locale
  private mousePreference = DEFAULT_TUI_SETTINGS.mouse
  private terminalColorDepth: TuiTerminalColorDepth = 'ansi16'
  private terminalCapabilities: TuiTerminalCapabilities | undefined
  private theme: TuiTheme = resolveTuiTheme(DEFAULT_TUI_SETTINGS.theme, 'ansi16')
  private interactionRegistry: readonly TuiInteractionDescriptor[] = TUI_INTERACTION_REGISTRY

  constructor(private readonly ctx: Context, private readonly config: Config) {}

  /** Point live presentation reads at the current optional settings scope. */
  setSettingsSource(source: () => TuiSettings): void {
    this.settingsSource = source
  }

  /** Re-resolve presentation settings without replacing the active React tree. */
  refreshSettings(): void {
    const settings = this.settingsSource()
    this.locale = settings.locale
    this.mousePreference = settings.mouse
    this.terminal.setMouseMode(settings.mouse === 'auto')
    this.theme = resolveTuiTheme(
      settings.theme,
      this.terminalColorDepth,
      this.terminalCapabilities?.background ?? 'unknown',
    )
    this.interactionRegistry = resolveTuiInteractionRegistry(settings.keybindings)
    const root = this.handle?.agent
    if (root === undefined || this.events === undefined || this.status === undefined || this.instance === undefined) return
    this.instance.rerender(this.appElement(root, this.events, this.status))
  }

  async run(): Promise<void> {
    try {
      this.terminal.assertInteractive()
      this.commandCatalog = new TuiHostCommandCatalog(this.ctx.commands)
      await this.ctx.get('loader')?.await()
      if (this.ownerDisposed) return
      const prepared = await this.prepareAgent(this.config.resume === undefined
        ? { kind: 'startup' }
        : { kind: 'resume', sessionId: SessionId(this.config.resume) })
      const handle = prepared.handle
      if (this.isOwnerDisposed()) {
        await handle.dispose()
        return
      }
      this.handle = handle
      this.events = new SessionEventStore(handle.agent.session.events)
      this.status = new AgentStatusStore(handle.agent.status)
      this.selection = prepared.selection
      this.modelSelection.set(prepared.selectedModel)
      this.agentMode.set(prepared.preset)
      this.scheduleStartupGuidanceRefresh(prepared.selectedModel)
      this.refreshAgentDerivedState(handle.agent)
      this.installRuntimeBindings()
      this.bindWorkRoot(handle.agent)
      const terminalCapabilities = await this.terminal.negotiate()
      this.terminalCapabilities = terminalCapabilities
      this.terminalColorDepth = terminalCapabilities.colorDepth
      this.refreshSettings()
      this.terminal.enter(terminalCapabilities)
      if (this.mousePreference === 'off') this.terminal.setMouseMode(false)
      this.installSignals()
      const mounted = new Promise<void>((resolveMounted) => { this.inkMounted = resolveMounted })
      this.instance = render(this.appElement(handle.agent, this.events, this.status), {
        stdin: terminalInternals.stdin,
        stdout: this.terminal.rendererOutput,
        stderr: terminalInternals.stderr,
        exitOnCtrlC: false,
        patchConsole: false,
      })
      await mounted
      this.inkMounted = undefined
      const pluginHub = this.ctx.get('pluginHub')
      if (pluginHub !== undefined && pluginHub.hasProvider()) await pluginHub.markMaintenanceReady()
      await this.instance.waitUntilExit()
      await this.shutdown()
      if (!this.isOwnerDisposed()) this.ctx.get('appExit')?.(this.requestedExit)
    } catch (error: unknown) {
      await this.shutdown()
      if (!this.ownerDisposed) {
        terminalInternals.stderr.write(`dsh --profile tui: ${error instanceof Error ? error.message : String(error)}\n`)
        this.ctx.get('appExit')?.(1)
      }
    }
  }

  private appElement(
    root: Agent,
    rootEvents: SessionEventStore,
    rootStatus: AgentStatusStore,
  ): React.ReactElement {
    const activeView = this.activeView
    const agent = activeView?.agent ?? root
    const view: TuiAgentViewDescriptor = activeView?.descriptor ?? Object.freeze({
      kind: 'root',
      id: root.id,
      label: 'root',
      acceptsInput: true,
    })
    const app = React.createElement(TuiApp, {
      agent,
      view,
      events: activeView?.events ?? rootEvents,
      status: activeView?.status ?? rootStatus,
      interactions: this.interactions,
      externalNotice: this.externalNotice,
      modelSelection: this.modelSelection,
      agentMode: this.agentMode,
      helpOpen: this.helpOpen,
      diagnostics: this.diagnostics,
      loadedContext: this.loadedContext,
      startupGuidance: this.startupGuidance,
      permissions: this.permissions,
      contextPressure: this.contextPressure,
      tokenUsage: this.tokenUsage,
      contextBreakdown: this.contextBreakdown,
      sessionStats: this.sessionStats,
      resumeDialog: this.resumeDialog,
      freshSessionDialog: this.freshSessionDialog,
      rewindDialog: this.rewindDialog,
      sessionExportDialog: this.sessionExportDialog,
      pluginHubDialog: this.pluginHubDialog,
      work: this.work,
      extensions: this.ctx.tuiExtensions,
      maxResumeOptions: this.config.maxResumeOptions ?? 8,
      commands: activeView === undefined ? this.commandCatalog.list(root) : [],
      interactionRegistry: this.interactionRegistry,
      completePaths: (query, signal) => this.completePaths(root, agent, query, signal),
      onAttachPath: path => this.attachPath(root, agent, path),
      onInputCursor: (target) => { this.terminal.setInputCursor(target) },
      onSelectionMouseMode: enabled => this.terminal.setSelectionMouseMode(enabled),
      initialTerminalInput: this.terminal.takeBufferedInput(),
      onCopy: text => this.terminal.copyToClipboard(text),
      onOpenUrl: url => this.openTuiUrl(url),
      onSubmit: (text: string, mode?: TuiSubmitMode, attachments?: readonly TuiComposerImageAttachment[]) => activeView === undefined
        ? this.submit(root, text, mode, attachments)
        : this.submitChild(root, activeView, text, attachments),
      onExternalEditor: draft => this.editExternalDraft(root, agent, draft),
      onClipboardPaste: () => this.pasteClipboard(root, agent),
      onActivateFooter: itemId => this.activateFooter(root, itemId),
      onResume: candidate => this.activateResume(root, candidate),
      onCloseResume: () => { this.closeResume() },
      onConfirmFreshSession: () => this.activateFreshSession(root),
      onCloseFreshSession: () => { this.closeFreshSession() },
      onRewind: candidate => this.activateRewind(root, candidate),
      onCloseRewind: () => { this.closeRewind() },
      onExportSession: (directory, includeDescendants, format) => this.activateSessionExport(
        root, directory, includeDescendants, format,
      ),
      onCloseSessionExport: () => { this.closeSessionExport() },
      onClosePluginHub: () => { this.closePluginHub() },
      onPluginHubToggleView: () => this.togglePluginHubView(root),
      onPluginHubSearch: query => this.searchPluginHub(root, query),
      onPluginHubDetail: pluginId => this.openPluginHubDetail(root, pluginId),
      onPluginHubInstall: () => this.planPluginHubInstall(root),
      onPluginHubRemove: packageName => this.planPluginHubRemove(root, packageName),
      onPluginHubConfirm: () => this.confirmPluginHubPlan(root),
      onPluginHubRefresh: () => this.refreshPluginHub(root),
      onPluginHubLoadMore: () => this.loadMorePluginHub(root),
      onPluginHubSort: () => this.sortPluginHub(root),
      onPluginHubCategory: () => this.cyclePluginHubCategory(root),
      onMounted: () => { this.inkMounted?.() },
      onOpenHelp: () => { this.helpOpen.set(true) },
      onCloseHelp: () => { this.helpOpen.set(false) },
      onCloseDoctor: () => { this.diagnostics.set(undefined) },
      onCloseLoadedContext: () => { this.loadedContext.set(undefined) },
      onCancelWork: item => this.cancelWork(root, item),
      onOpenWork: item => this.openWorkView(root, item),
      onReturnRoot: () => { this.showRootView(root) },
      onCancel: () => { this.cancelView(root, activeView) },
      onExit: () => { this.requestExit(0) },
    })
    return React.createElement(TuiThemeProvider, { theme: this.theme },
      React.createElement(TuiLocaleProvider, { locale: this.locale }, app))
  }

  private async completePaths(
    root: Agent,
    agent: Agent,
    query: string,
    signal: AbortSignal,
  ): Promise<FsPathCompletionResult> {
    if (!this.ownsView(root, agent)) throw new Error('TUI Agent view changed before path completion')
    const cwd = agent.session.header.cwd ?? process.cwd()
    const target = await this.ctx.fs.resolve(cwd, { signal })
    return hostCompletePaths(this.ctx.fs, target, query, { ...PATH_COMPLETION_LIMITS, signal })
  }

  private async attachPath(root: Agent, agent: Agent, path: string): Promise<ImageAttachmentRef> {
    if (!this.ownsView(root, agent)) throw new Error('TUI Agent view changed before image attachment')
    const mediaType = IMAGE_EXTENSIONS[extname(path).toLowerCase()]
    if (mediaType === undefined) throw new Error(`Cannot attach "${path}": only PNG, JPEG, WebP, and GIF files are supported.`)
    const cwd = agent.session.header.cwd ?? process.cwd()
    const target = await this.ctx.fs.resolve(path, { cwd })
    const info = await this.ctx.fs.stat(target)
    if (info === undefined) throw new Error(`Cannot attach "${path}": file not found.`)
    if (info.type !== 'file') throw new Error(`Cannot attach "${path}": the path is not a regular file.`)
    const byteCap = Math.min(
      this.ctx.attachments.imageLimits.maxImageBytes,
      this.ctx.attachments.imageLimits.maxMessageImageBytes,
    )
    const data = await this.ctx.fs.readBytes(target, undefined, byteCap)
    try {
      return await this.saveImageBytes(data, mediaType, basename(target.displayPath), `Cannot attach "${path}"`)
    } catch (error: unknown) {
      if (error instanceof AttachmentError) {
        throw new Error(`Cannot attach "${path}": ${error.message}`, { cause: error })
      }
      throw error
    }
  }

  private async saveImageBytes(
    data: Uint8Array,
    mediaType: ImageMediaType,
    name: string,
    context: string,
  ): Promise<ImageAttachmentRef> {
    const byteCap = Math.min(
      this.ctx.attachments.imageLimits.maxImageBytes,
      this.ctx.attachments.imageLimits.maxMessageImageBytes,
    )
    if (data.byteLength > byteCap) throw new Error(`${context}: image exceeds the ${byteCap}-byte limit.`)
    if (detectImageMediaType(data) !== mediaType) {
      throw new Error(`${context}: image bytes do not match ${mediaType}.`)
    }
    try {
      return await this.ctx.attachments.saveImage({
        data,
        mediaType,
        name,
      })
    } catch (error: unknown) {
      if (error instanceof AttachmentError) throw new Error(`${context}: ${error.message}`, { cause: error })
      throw error
    }
  }

  private async pasteClipboard(root: Agent, agent: Agent): Promise<TuiClipboardInsert> {
    if (!this.ownsView(root, agent)) throw new Error('TUI Agent view changed before clipboard read')
    const cwd = agent.session.header.cwd ?? process.cwd()
    const result = await readTuiClipboard(this.ctx.subprocess, {
      cwd,
      environment: {
        platform: process.platform === 'darwin' || process.platform === 'linux' || process.platform === 'win32'
          ? process.platform : 'other',
        values: { ...process.env },
      },
    })
    if (!result.ok) throw new Error(result.message)
    if (result.payload.kind === 'text') return { text: result.payload.text, attachments: [] }
    if (result.payload.kind === 'image') {
      const ref = await this.saveImageBytes(
        result.payload.data,
        result.payload.mediaType,
        result.payload.name,
        'Cannot paste clipboard image',
      )
      return { text: '', attachments: [ref] }
    }
    const attachments: ImageAttachmentRef[] = []
    const paths: string[] = []
    for (const path of result.payload.paths) {
      if (IMAGE_EXTENSIONS[extname(path).toLowerCase()] !== undefined) {
        attachments.push(await this.attachPath(root, agent, path))
      } else {
        paths.push(`@${path}`)
      }
    }
    return { text: paths.join(' '), attachments: Object.freeze(attachments) }
  }

  private async openTuiUrl(value: string): Promise<void> {
    const controller = new AbortController()
    try {
      await openExternalUrl(value, controller.signal)
      this.externalNotice.set(`Opening ${value}`)
    } catch {
      this.externalNotice.set(`Open this URL in a browser: ${value}`)
    }
  }

  private async assertImageCapableRoute(agent: Agent, signal: AbortSignal): Promise<void> {
    const routed = agent.session.requestHeader()?.config
    const provider = routed?.provider ?? agent.options.provider
    const model = routed?.model ?? agent.options.model
    if (provider === undefined || model === undefined) {
      throw new Error('Image attachments require an explicitly selected model.')
    }
    const info = await this.ctx.llm.resolveModelInfo(provider, model, signal)
    if (info.inputModalities === undefined || !info.inputModalities.includes('image')) {
      throw new Error(`Model "${model}" does not declare image input; switch to an image-capable model before attaching images.`)
    }
  }

  private assertImageAttachmentLimits(attachments: readonly TuiComposerImageAttachment[]): void {
    const limits = this.ctx.attachments.imageLimits
    if (attachments.length > limits.maxImagesPerMessage) {
      throw new Error(`Too many image attachments for one message (maximum ${limits.maxImagesPerMessage}).`)
    }
    const totalBytes = attachments.reduce((sum, item) => sum + item.ref.bytes, 0)
    if (totalBytes > limits.maxMessageImageBytes) {
      throw new Error(`Image attachments exceed the ${limits.maxMessageImageBytes}-byte message limit.`)
    }
  }

  private async encodeImageAttachments(
    attachments: readonly TuiComposerImageAttachment[],
    signal: AbortSignal,
  ): Promise<readonly EncodedImageAttachment[]> {
    const encoded: EncodedImageAttachment[] = []
    for (const item of attachments) {
      const stored = await this.ctx.attachments.readImage(item.ref, signal)
      encoded.push({
        mediaType: stored.ref.mediaType,
        data: Buffer.from(stored.data).toString('base64'),
        ...stored.ref.name === undefined ? {} : { name: stored.ref.name },
      })
    }
    return Object.freeze(encoded)
  }

  private commandForLine(agent: Agent, line: string): { name: string; acceptsImages: boolean } | undefined {
    const match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line)
    const name = match?.[1]
    if (name === undefined) return undefined
    const descriptor = this.commandCatalog.list(agent).find(command => command.name === name
      || command.completion?.aliases?.includes(name))
    return descriptor === undefined ? undefined : {
      name: descriptor.name,
      acceptsImages: descriptor.input?.images === true,
    }
  }

  private async editExternalDraft(root: Agent, agent: Agent, draft: string): Promise<TuiExternalEditorResult> {
    if (!this.ownsView(root, agent)) return { ok: false, message: 'The Agent view changed; draft preserved.' }
    const handoff = this.terminal.handoff()
    this.externalEditorHandoff = handoff
    const controller = new AbortController()
    const cwd = agent.session.header.cwd ?? process.cwd()
    const completion = runTuiExternalEditor({ draft, cwd, signal: controller.signal }).finally(() => {
      if (this.externalEditorHandoff === handoff) this.externalEditorHandoff = undefined
      handoff.resume()
    })
    const operation: ActiveOperation = { controller, completion }
    this.externalEditor = operation
    try {
      const result = await completion
      const currentRoot = this.handle?.agent
      if (currentRoot !== undefined && this.events !== undefined && this.status !== undefined && this.instance !== undefined) {
        this.instance.rerender(this.appElement(currentRoot, this.events, this.status))
      }
      return result
    } finally {
      if (this.externalEditor === operation) this.externalEditor = undefined
    }
  }

  private ownsAgent(agent: Agent): boolean {
    return this.handle?.agent === agent
  }

  private ownsView(root: Agent, agent: Agent): boolean {
    if (this.handle?.agent !== root) return false
    return this.activeView === undefined ? agent === root : this.activeView.agent === agent
  }

  private agentStatus(agent: Agent): Agent['status'] {
    return agent.status
  }

  /** Idempotent teardown invoked by the app path and Cordis owner disposal. */
  async dispose(): Promise<void> {
    this.ownerDisposed = true
    this.requestExit(0)
    await this.shutdown()
  }

  private async prepareAgent(
    request: PrepareTuiAgentRequest,
    signal?: AbortSignal,
  ): Promise<PreparedTuiAgent> {
    const agents = this.ctx.get('agents')
    const defaultModel = this.ctx.get('agentDefaultModel')
    if (agents === undefined || defaultModel === undefined) throw new Error('TUI core Agent services were disposed during startup')
    const presets = hostAgentPresets(this.ctx)
    const requestedPreset = request.kind === 'resume' ? undefined : request.preset
    const resolvedPreset = request.kind === 'resume' ? undefined : await presets.resolve(requestedPreset)
    const configuredSelection = request.kind === 'fresh' || request.kind === 'rewind'
      ? request.selection
      : defaultModel.currentSelection()
    const resolvedDefault = await this.ctx.llm.resolveCallConfig(configuredSelection, signal)
    const defaultSelection: ModelSelection = {
      provider: resolvedDefault.provider,
      model: resolvedDefault.model,
      ...resolvedDefault.reasoningEffort === undefined ? {} : { reasoningEffort: resolvedDefault.reasoningEffort },
    }
    const selected: ModelSelectionRef = { current: defaultSelection, assembled: undefined }
    let mountedPreset: AgentPreset | undefined
    const setup = async (agentCtx: Context): Promise<void> => {
      const session = agentCtx.agent?.session
      if (session === undefined) throw new Error('TUI Agent setup cannot resolve its unpublished Session')
      const presetId = request.kind === 'resume'
        ? this.assertResumeCompatible(session.header, session.events)
        : resolvedPreset?.id
      if (presetId === undefined) throw new Error('TUI Agent setup has no resolved Agent preset')
      const logged = session.requestHeader()?.config
      if (logged !== undefined) {
        selected.current = {
          provider: logged.provider,
          model: logged.model,
          ...logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort },
        }
      } else if (request.kind === 'resume') {
        const route = resumeRoute(session.events)
        if (route !== undefined) selected.current = route
      }
      installModelSelection(agentCtx, selected)
      mountedPreset = await presets.mount(agentCtx, presetId)
    }
    let handle: AgentHandle
    if (request.kind === 'resume') {
      handle = await agents.resume({
        resumeSessionId: request.sessionId,
        agentOptions: { provider: defaultSelection.provider, model: defaultSelection.model },
        setup,
        ...signal === undefined ? {} : { signal },
      })
    } else {
      if (resolvedPreset === undefined) throw new Error('TUI Agent creation has no resolved Agent preset')
      handle = await agents.create(withAgentCreateSource({
        sessionId: SessionId(`session-${randomUUID()}`),
        meta: request.kind === 'startup'
          ? { cwd: process.cwd(), agentPreset: resolvedPreset.id }
          : request.kind === 'fresh'
            ? { cwd: request.cwd, agentPreset: resolvedPreset.id }
            : {
              cwd: request.cwd,
              agentPreset: resolvedPreset.id,
              parentSession: request.parentSession,
              seedLength: request.seed.length,
            },
        ...request.kind === 'rewind' ? { seed: request.seed } : {},
        agentOptions: { provider: defaultSelection.provider, model: defaultSelection.model },
        setup,
        ...signal === undefined ? {} : { signal },
      }, request.kind === 'fresh' ? request.source : request.kind === 'rewind' ? 'rewind' : 'startup'))
    }
    if (mountedPreset === undefined) {
      await handle.dispose().catch(() => undefined)
      throw new Error('TUI Agent was created without a mounted Agent preset')
    }
    return { handle, selection: selected, selectedModel: selected.current ?? defaultSelection, preset: mountedPreset }
  }

  private assertResumeCompatible(
    header: Agent['session']['header'],
    events: readonly SessionEvent[],
  ): string {
    if (header.version !== SESSION_FORMAT_VERSION) {
      throw new Error(`cannot resume Session ${JSON.stringify(header.id)}: incompatible format ${header.version}`)
    }
    if (header.origin === 'subagent') {
      throw new Error(`cannot resume subagent-owned Session ${JSON.stringify(header.id)} in the TUI`)
    }
    if (header.cwd === undefined) {
      throw new Error(`cannot resume Session ${JSON.stringify(header.id)} without a recorded workspace`)
    }
    const preset = resolveSessionPreset({ header, events })
    if (preset === undefined) {
      throw new Error(
        `cannot resume legacy rosterless Session ${JSON.stringify(header.id)} in the preset-aware TUI; `
        + 'use the previous compatible TUI to export it',
      )
    }
    const route = resumeRoute(events)
    if (route !== undefined && !this.ctx.llm.listProviders().some(provider => provider.id === route.provider)) {
      throw new Error(`session route is unavailable (${route.provider}/${route.model})`)
    }
    return preset
  }

  private refreshAgentDerivedState(agent: Agent): void {
    this.refreshPermission(agent)
    const projections = this.ctx.get('sessionProjections')
    const values = projections?.snapshot(agent.session).values
    this.contextPressure.set(values?.contextPressure)
    this.tokenUsage.set(values?.tokenUsage)
    this.contextBreakdown.set(values?.contextBreakdown)
    this.sessionStats.set(values?.sessionStats)
  }

  private scheduleStartupGuidanceRefresh(selection = this.modelSelection.getSnapshot()): void {
    this.startupGuidanceRefresh?.controller.abort(new Error('TUI startup guidance refresh superseded'))
    this.startupGuidanceRefresh = undefined
    const generation = ++this.startupGuidanceGeneration
    if (selection === undefined || this.isClosing()) {
      this.startupGuidance.set(undefined)
      return
    }

    const startup: unknown = this.ctx.get('tuiStartup')
    const host = tuiHostDiagnosticsFromStartup(startup) === undefined ? 'unavailable' : 'compatible'
    const pluginHub = this.ctx.get('pluginHub')
    const registered = this.ctx.llm.listProviders().find(provider => provider.id === selection.provider)
    if (registered === undefined) {
      this.startupGuidance.set(Object.freeze({
        host,
        provider: Object.freeze({ state: 'missing', id: selection.provider }),
        pluginHub: pluginHub !== undefined && pluginHub.hasProvider(),
      }))
      return
    }

    const base = {
      host,
      pluginHub: pluginHub !== undefined && pluginHub.hasProvider(),
    } as const
    this.startupGuidance.set(Object.freeze({
      ...base,
      provider: Object.freeze({ state: 'checking', id: registered.id, name: registered.name }),
    }))
    const controller = new AbortController()
    const completion = (async (): Promise<void> => {
      const provider = await inspectTuiStartupProvider(registered, {
        authentication: id => hostAuthentication(this.ctx.llm, id),
        listModels: id => this.ctx.llm.listModels(id),
      }, controller.signal).catch((error: unknown) => {
        if (controller.signal.aborted) return undefined
        throw error
      })
      if (provider === undefined) return
      if (controller.signal.aborted || generation !== this.startupGuidanceGeneration || this.isClosing()) return
      if (this.modelSelection.getSnapshot()?.provider !== selection.provider) return
      this.startupGuidance.set(Object.freeze({ ...base, provider }))
    })().finally(() => {
      if (this.startupGuidanceRefresh?.controller === controller) this.startupGuidanceRefresh = undefined
    })
    this.startupGuidanceRefresh = { controller, completion }
  }

  private installRuntimeBindings(): void {
    this.disposers.llmAdaptersUpdated = this.ctx.on('llm/adapters-updated', () => {
      this.scheduleStartupGuidanceRefresh()
    })
    const projections = this.ctx.get('sessionProjections')
    if (projections !== undefined) {
      this.disposers.projectionChanged = projections.onChanged((session, key, value) => {
        if (session === this.handle?.agent.session) {
          if (key === 'contextPressure') this.contextPressure.set(value as ContextPressureProjection)
          if (key === 'tokenUsage') this.tokenUsage.set(value as TokenUsageProjection)
          if (key === 'contextBreakdown') this.contextBreakdown.set(value as ContextBreakdownProjection)
          if (key === 'sessionStats') this.sessionStats.set(value as SessionStatsProjection)
        }
        if (key === 'subagentTiming' && this.workCatalog.some(entry => entry.id === session.id)) {
          this.rebuildWorkSnapshot()
        }
      })
    }
    this.disposers.sessionEvents = this.ctx.on('session/event', (session, event) => {
      if (event.type === 'assistant/message') {
        const text = event.data.message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('')
        void this.ctx.tuiExtensions.notifyCompletedMessage({
          sessionId: session.id,
          messageId: event.data.message.id,
          turn: event.data.turn,
          step: event.data.step,
          text,
          interrupted: event.data.interrupted === true,
        })
      }
      const agent = this.handle?.agent
      if (agent !== undefined && session === agent.session) {
        this.events?.append(event)
        this.refreshPermission(agent)
      }
      if (session === this.activeView?.agent.session) this.activeView.events.append(event)
      if (this.workCatalog.some(entry => entry.id === session.id)) this.rebuildWorkSnapshot()
    })
    this.disposers.agentStatus = this.ctx.on('agent/status', (payload) => {
      if (payload.agent === this.handle?.agent) this.status?.set(payload.status)
      if (payload.agent === this.activeView?.agent) this.activeView.status.set(payload.status)
      if (payload.agent === this.handle?.agent
        || this.workCatalog.some(entry => entry.id === payload.agent.id)) this.rebuildWorkSnapshot()
    })
    this.disposers.jobsController = this.ctx.jobs.attachController('native-tui')
    this.disposers.jobsChanged = this.ctx.jobs.onJobsChanged((owner) => {
      const root = this.handle?.agent
      if (root === undefined || (owner !== undefined && owner !== root
        && !this.workCatalog.some(entry => entry.id === owner.id))) return
      this.rebuildWorkSnapshot()
    })
    this.disposers.agentCreated = this.ctx.on('agent/created', ({ agent }) => {
      const root = this.handle?.agent
      if (root === undefined || agent === root || !isSessionDescendantOf(agent, root.id, this.ctx.agents)) return
      this.scheduleWorkCatalogRefresh(root)
    })
    this.disposers.agentDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      const root = this.handle?.agent
      if (root === undefined || agent === root) return
      if (agent === this.activeView?.agent) {
        this.showRootView(root, `Agent ${agent.id} settled; returned to the root transcript.`)
      }
      if (this.workCatalog.some(entry => entry.id === agent.id)) this.scheduleWorkCatalogRefresh(root)
    })
    this.disposers.questionProvider = this.ctx.userQuestions.registerProvider({
      ask: (request) => {
        const root = this.handle?.agent
        if (root === undefined || request.agent !== root) {
          return Promise.reject(new UserQuestionError(
            'TUI user interaction answers only its exact owned root Agent', 'CALLER_NOT_LIVE'))
        }
        this.showRootView(root)
        return this.interactions.askQuestion(request)
      },
    })
    this.disposers.approval = this.ctx.on('approval/request', (request, next) => {
      if (request.agent !== this.handle?.agent) return next()
      this.showRootView(request.agent)
      return this.interactions.askApproval(request)
    })
    const pluginHub = this.ctx.get('pluginHub')
    if (pluginHub !== undefined && pluginHub.hasProvider()) {
      this.disposers.pluginHubProgress = this.ctx.on('plugin-hub/progress', (progress) => {
        const snapshot = this.pluginHubDialog.getSnapshot()
        if (snapshot !== undefined) this.pluginHubDialog.set({ ...snapshot, progress })
      })
      this.disposers.pluginHubCommand = this.commandCatalog.register({
        name: 'plugins',
        description: 'Browse the Plugin Hub catalog',
        input: { hint: '[search]' },
        completion: { descriptions: tuiCommandDescriptions('command.plugins') },
        handler: invocation => this.executePlugins(invocation),
      })
    }
    if (this.ctx.get('sessionTitle') !== undefined) {
      this.disposers.renameCommand = this.commandCatalog.register({
        name: 'rename',
        description: 'Rename the current Session',
        input: { hint: '<title>' },
        completion: { descriptions: tuiCommandDescriptions('command.rename') },
        handler: invocation => this.executeRename(invocation),
      })
    }
    this.disposers.modelsCommand = this.commandCatalog.register({
      name: 'models',
      description: 'Select and configure a model',
      completion: { descriptions: tuiCommandDescriptions('command.models') },
      handler: invocation => this.executeQuestionCommand(
        'models.cancelled', () => this.executeModels(invocation),
      ),
    })
    this.disposers.modeCommand = this.commandCatalog.register({
      name: 'mode',
      description: 'Select the Agent execution mode',
      completion: { descriptions: tuiCommandDescriptions('command.mode') },
      handler: invocation => this.executeQuestionCommand(
        'mode.cancelled', () => this.executeMode(invocation),
      ),
    })
    this.disposers.configCommand = this.commandCatalog.register({
      name: 'config',
      description: 'Configure TUI theme, language, and keybindings',
      completion: { descriptions: tuiCommandDescriptions('command.config') },
      handler: invocation => this.executeQuestionCommand(
        'config.cancelled', () => this.executeConfig(invocation),
      ),
    })
    this.disposers.helpCommand = this.commandCatalog.register({
      name: 'help',
      description: 'List available commands',
      completion: { descriptions: tuiCommandDescriptions('command.help') },
      handler: invocation => this.executeHelp(invocation),
    })
    this.disposers.doctorCommand = this.commandCatalog.register({
      name: 'doctor',
      description: 'Inspect Host and TUI runtime health',
      completion: { descriptions: tuiCommandDescriptions('command.doctor') },
      handler: invocation => this.executeDoctor(invocation),
    })
    this.disposers.contextCommand = this.commandCatalog.register({
      name: 'context',
      description: 'Inspect loaded context facts',
      completion: { descriptions: tuiCommandDescriptions('command.context') },
      handler: invocation => this.executeLoadedContext(invocation),
    })
    this.disposers.langCommand = this.commandCatalog.register({
      name: 'lang',
      description: 'Change the TUI language',
      input: { hint: '[en|zh]' },
      completion: { descriptions: tuiCommandDescriptions('command.lang') },
      handler: invocation => this.executeQuestionCommand(
        'language.cancelled', () => this.executeLanguage(invocation),
      ),
    })
    this.disposers.resumeCommand = this.commandCatalog.register({
      name: 'resume',
      description: 'Select and resume a Session',
      completion: { descriptions: tuiCommandDescriptions('command.resume') },
      handler: invocation => this.executeResume(invocation),
    })
    this.disposers.clearCommand = this.commandCatalog.register({
      name: 'clear',
      description: 'Start a fresh Session',
      completion: { descriptions: tuiCommandDescriptions('command.clear') },
      handler: invocation => this.executeFreshSession(invocation, 'clear'),
    })
    this.disposers.newCommand = this.commandCatalog.register({
      name: 'new',
      description: 'Start a fresh Session',
      completion: { descriptions: tuiCommandDescriptions('command.new') },
      handler: invocation => this.executeFreshSession(invocation, 'new'),
    })
    this.disposers.rewindCommand = this.commandCatalog.register({
      name: 'rewind',
      description: 'Branch from an earlier human turn',
      completion: { descriptions: tuiCommandDescriptions('command.rewind') },
      handler: invocation => this.executeRewind(invocation),
    })
    this.disposers.exportCommand = this.commandCatalog.register({
      name: 'export',
      description: 'Export the durable Session archive',
      completion: { descriptions: tuiCommandDescriptions('command.export') },
      handler: invocation => this.executeSessionExport(invocation),
    })
    this.disposers.quitCommand = this.commandCatalog.register({
      name: 'quit',
      description: 'Exit the TUI',
      completion: { descriptions: tuiCommandDescriptions('command.quit') },
      handler: invocation => this.executeExit(invocation, 'quit'),
    })
    this.disposers.exitCommand = this.commandCatalog.register({
      name: 'exit',
      description: 'Exit the TUI',
      completion: { descriptions: tuiCommandDescriptions('command.exit') },
      handler: invocation => this.executeExit(invocation, 'exit'),
    })
  }

  private bindWorkRoot(root: Agent): void {
    this.disposeWorkRootBindings()
    this.workRefresh?.controller.abort(new Error('TUI work root changed'))
    this.workRefresh = undefined
    this.workRefreshGeneration += 1
    this.workCatalog = []
    this.workCatalogError = undefined
    this.remoteSubagentRuns.clear()
    this.workRootDisposers.push(
      root.ctx.on('subagent/start', (info: SubagentRunInfo) => {
        if (!info.local) {
          this.remoteSubagentRuns.set(info.runId, Object.freeze({ info, observedAt: Date.now() }))
        }
        this.scheduleWorkCatalogRefresh(root)
      }),
      root.ctx.on('subagent/end', (info: SubagentRunEndInfo) => {
        const observed = this.remoteSubagentRuns.get(info.runId)
        if (observed !== undefined) {
          this.remoteSubagentRuns.set(info.runId, Object.freeze({
            ...observed,
            outcome: info,
            finishedAt: Date.now(),
          }))
        }
        this.scheduleWorkCatalogRefresh(root)
      }),
    )
    this.scheduleWorkCatalogRefresh(root)
  }

  private disposeWorkRootBindings(): void {
    for (const dispose of this.workRootDisposers.splice(0)) dispose()
  }

  private scheduleWorkCatalogRefresh(root: Agent): void {
    if (this.handle?.agent !== root || this.isClosing()) return
    this.workRefresh?.controller.abort(new Error('TUI work catalog refresh superseded'))
    const generation = ++this.workRefreshGeneration
    const controller = new AbortController()
    this.workCatalogLoading = true
    this.rebuildWorkSnapshot()
    const completion = this.ctx.subagents.listDescendants(root.id, controller.signal).then((catalog) => {
      if (controller.signal.aborted || generation !== this.workRefreshGeneration
        || this.handle?.agent !== root || this.isClosing()) return
      this.workCatalog = Object.freeze([...catalog])
      this.workCatalogError = undefined
    }).catch((error: unknown) => {
      if (controller.signal.aborted || generation !== this.workRefreshGeneration || this.isClosing()) return
      this.workCatalogError = `Background work catalog unavailable: ${errorChain(error)}`
    }).finally(() => {
      if (generation !== this.workRefreshGeneration) return
      this.workCatalogLoading = false
      this.rebuildWorkSnapshot()
      if (this.workRefresh?.controller === controller) this.workRefresh = undefined
    })
    this.workRefresh = { controller, completion }
  }

  private rebuildWorkSnapshot(): void {
    const root = this.handle?.agent
    if (root === undefined || this.isClosing()) return
    const jobs = new Map<string, JobSnapshot>()
    const liveAgents = new Map<SessionId, TuiWorkAgentSnapshot>()
    const owners: Agent[] = [root]
    const projections = this.ctx.get('sessionProjections')
    for (const entry of this.workCatalog) {
      if (entry.kind !== 'child') continue
      const child = this.ctx.agents.get(entry.id)
      if (child === undefined) continue
      owners.push(child)
      let timing: TuiWorkAgentSnapshot['timing']
      if (projections !== undefined) {
        try { timing = projections.snapshot(child.session).values.subagentTiming }
        catch {
          // A damaged projection degrades only elapsed time; catalog identity and Agent status remain authoritative.
        }
      }
      liveAgents.set(entry.id, {
        status: child.status,
        ...timing === undefined ? {} : { timing },
      })
    }
    for (const owner of owners) {
      for (const job of this.ctx.jobs.list(owner)) jobs.set(job.id, job)
    }
    this.work.set(projectTuiWork({
      jobs: [...jobs.values()],
      subagents: this.workCatalog,
      liveAgents,
      remoteRuns: [...this.remoteSubagentRuns.values()],
      loading: this.workCatalogLoading,
      ...this.workCatalogError === undefined ? {} : { error: this.workCatalogError },
    }))
  }

  private cancelWork(root: Agent, item: TuiWorkItemView): Promise<void> {
    try {
      if (this.handle?.agent !== root) throw new Error('TUI Session changed before work cancellation')
      if (item.action === 'cancel-job') {
        const owner = item.ownerSession === undefined ? root : this.ctx.agents.get(item.ownerSession)
        if (owner === undefined) throw new Error('The job owner is no longer live.')
        const result = this.ctx.jobs.kill(JobId(item.id), owner, 'cancelled by the TUI user')
        this.externalNotice.set(result === 'requested'
          ? `Stopping background job ${item.id}.`
          : `Background job ${item.id} already finished.`)
        this.rebuildWorkSnapshot()
        return Promise.resolve()
      }
      if (item.action === 'interrupt-subagent') {
        this.ctx.subagents.interrupt(SessionId(item.id), { kind: 'ancestor', agent: root })
        this.externalNotice.set(`Interrupt requested for subagent ${item.id}.`)
        this.rebuildWorkSnapshot()
        return Promise.resolve()
      }
      throw new Error('The selected work item has no available stop action.')
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error
        ? error
        : new Error('Background work cancellation failed', { cause: error }))
    }
  }

  private openWorkView(root: Agent, item: TuiWorkItemView): Promise<void> {
    try {
      if (this.handle?.agent !== root) throw new Error('TUI Session changed before opening the Agent view')
      if (!item.inspectable || item.source !== 'subagent') {
        throw new Error(item.readOnlyReason ?? 'The selected work item has no inspectable local Agent transcript.')
      }
      const entry = this.workCatalog.find(candidate => candidate.kind === 'child' && candidate.id === item.id)
      if (entry?.kind !== 'child' || entry.mode !== 'continuable') {
        throw new Error('Only a continuable local child can be opened as an Agent view.')
      }
      const child = this.ctx.agents.get(entry.id)
      const parent = this.ctx.agents.get(entry.parentId)
      if (child === undefined) throw new Error('The selected child Agent is no longer live.')
      if (parent === undefined) throw new Error('The child Agent direct parent is no longer live.')
      if (child.session.header.parentSession !== entry.parentId) {
        throw new Error('The child Agent no longer has the catalogued direct parent authority.')
      }
      const previous = this.activeView
      this.activeView = {
        descriptor: Object.freeze({
          kind: 'child',
          id: child.id,
          label: entry.label,
          parentSession: entry.parentId,
          acceptsInput: true,
        }),
        agent: child,
        events: new SessionEventStore(child.session.events),
        status: new AgentStatusStore(child.status),
      }
      try {
        const events = this.events
        const status = this.status
        if (events === undefined || status === undefined || this.instance === undefined) {
          throw new Error('The root TUI view is unavailable.')
        }
        this.helpOpen.set(false)
        this.externalNotice.set('')
        this.instance.rerender(this.appElement(root, events, status))
      } catch (error: unknown) {
        this.activeView = previous
        throw error
      }
      return Promise.resolve()
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error
        ? error
        : new Error('Opening the Agent view failed', { cause: error }))
    }
  }

  private showRootView(root: Agent, notice?: string): void {
    if (this.handle?.agent !== root || this.activeView === undefined) return
    const events = this.events
    const status = this.status
    if (events === undefined || status === undefined || this.instance === undefined) return
    const previous = this.activeView
    this.activeView = undefined
    try {
      this.instance.rerender(this.appElement(root, events, status))
    } catch (error: unknown) {
      this.activeView = previous
      throw error
    }
    if (notice !== undefined) this.externalNotice.set(notice)
  }

  private cancelView(root: Agent, view: ActiveTuiAgentView | undefined): void {
    if (this.handle?.agent !== root) return
    if (view === undefined) {
      root.cancel({ kind: 'user' })
      return
    }
    if (view !== this.activeView) return
    this.ctx.subagents.interrupt(view.agent.id, { kind: 'ancestor', agent: root })
    this.externalNotice.set(`Interrupt requested for subagent ${view.agent.id}.`)
  }

  private executePlugins(invocation: CommandInvocation): CommandResult {
    const query = invocation.rawInput.trim()
    if (query.length > 160) return { kind: 'error', text: tuiMessage(this.locale, 'plugin.search.limit') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'plugin.command.rootOnly') }
    }
    const pluginHub = this.ctx.get('pluginHub')
    if (pluginHub === undefined || !pluginHub.hasProvider()) {
      return { kind: 'error', text: tuiMessage(this.locale, 'plugin.command.providerUnavailable') }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'plugin.command.interaction') }
    }
    if (this.resumeDialog.getSnapshot() !== undefined || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined || this.sessionExportDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'plugin.command.dialog') }
    }
    if (this.pluginHubDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'plugin.command.open') }
    }
    const generation = ++this.pluginHubGeneration
    this.helpOpen.set(false)
    this.pluginHubDialog.set({ generation, phase: 'loading', view: 'discover', initialQuery: query, sort: 'stars',
      profileMutations: pluginHub.supportsProfileMutations() })
    void this.searchPluginHub(invocation.agent, query, 'stars', null)
    return { kind: 'success', text: tuiMessage(this.locale, 'plugin.command.opened') }
  }

  private async searchPluginHub(
    root: Agent,
    query: string,
    requestedSort?: PluginCatalogSort,
    requestedCategory?: PluginCategory | null,
  ): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (pluginHub === undefined || snapshot === undefined || this.handle?.agent !== root || this.activeView !== undefined) return
    this.pluginHubOperation?.controller.abort(new Error('Plugin Hub catalog request superseded'))
    const controller = new AbortController()
    const generation = snapshot.generation
    const normalizedQuery = query.trim().slice(0, 160)
    const sort = requestedSort ?? snapshot.sort
    const category = requestedCategory === null ? undefined : requestedCategory ?? snapshot.category
    this.pluginHubDialog.set({ ...snapshot, phase: 'loading', initialQuery: normalizedQuery, sort, page: undefined,
      ...(category === undefined ? { category: undefined } : { category }), loadingMore: false,
      detail: undefined, progress: undefined, error: undefined })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = Promise.all([
      pluginHub.status(controller.signal).catch(() => undefined),
      pluginHub.search({ query: normalizedQuery, ...(category === undefined ? {} : { category }), sort, limit: 20 }, controller.signal),
    ]).then(([status, page]) => {
      if (controller.signal.aborted || this.pluginHubOperation !== operation
        || this.handle?.agent !== root || this.pluginHubDialog.getSnapshot()?.generation !== generation) return
      this.pluginHubDialog.set({ generation, phase: 'browse', view: 'discover', initialQuery: normalizedQuery, sort,
        profileMutations: snapshot.profileMutations,
        ...(category === undefined ? { category: undefined } : { category }), page,
        loadingMore: false,
        ...(status === undefined ? {} : { status }) })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || this.pluginHubOperation !== operation
        || this.pluginHubDialog.getSnapshot()?.generation !== generation) return
      if (error instanceof PluginHubError && error.code === 'INVALID_CURSOR') {
        const current = this.pluginHubDialog.getSnapshot()
        if (current !== undefined) this.pluginHubDialog.set({ ...current, page: undefined, loadingMore: false, phase: 'loading', error: undefined })
        void this.searchPluginHub(root, normalizedQuery, sort, category ?? null)
        return
      }
      this.pluginHubDialog.set({ generation, phase: 'error', view: 'discover', initialQuery: normalizedQuery,
        profileMutations: snapshot.profileMutations,
        sort, ...(category === undefined ? { category: undefined } : { category }), loadingMore: false,
        error: tuiMessage(this.locale, 'plugin.error.catalog', { error: errorChain(error) }) })
    }).finally(() => {
      if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
    })
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private async sortPluginHub(root: Agent): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined || snapshot.view !== 'discover' || snapshot.phase === 'handoff'
      || this.handle?.agent !== root) return
    await this.searchPluginHub(root, snapshot.initialQuery, tuiPluginHubNextSort(snapshot.sort))
  }

  private async cyclePluginHubCategory(root: Agent): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined || snapshot.view !== 'discover' || snapshot.phase === 'handoff'
      || this.handle?.agent !== root) return
    await this.searchPluginHub(root, snapshot.initialQuery, snapshot.sort, tuiPluginHubNextCategory(snapshot.category))
  }

  private async loadMorePluginHub(root: Agent): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    const snapshot = this.pluginHubDialog.getSnapshot()
    const page = snapshot?.page
    if (pluginHub === undefined || snapshot === undefined || page === undefined || snapshot.view !== 'discover'
      || snapshot.phase !== 'browse' || snapshot.loadingMore === true || page.nextCursor === undefined
      || this.handle?.agent !== root) return
    const cursor = page.nextCursor
    const controller = new AbortController()
    const generation = snapshot.generation
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    this.pluginHubDialog.set({ ...snapshot, loadingMore: true, progress: undefined, error: undefined })
    const completion = pluginHub.search({ query: snapshot.initialQuery,
      ...(snapshot.category === undefined ? {} : { category: snapshot.category }),
      sort: snapshot.sort, cursor, limit: 20 }, controller.signal).then((nextPage) => {
      if (!this.ownsPluginHubOperation(root, generation, operation)) return
      const current = this.pluginHubDialog.getSnapshot()
      const currentPage = current?.page
      if (current === undefined || currentPage === undefined) return
      const known = new Set(currentPage.items.map(item => String(item.id)))
      const appended = nextPage.items.filter(item => !known.has(String(item.id)))
      const items = Object.freeze([...currentPage.items, ...appended])
      this.pluginHubDialog.set({ ...current, page: {
        ...nextPage, items,
        ...(nextPage.nextCursor === undefined ? {} : { nextCursor: nextPage.nextCursor }),
      }, loadingMore: false })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || !this.ownsPluginHubGeneration(root, generation)) return
      const current = this.pluginHubDialog.getSnapshot()
      if (current === undefined) return
      if (error instanceof PluginHubError && error.code === 'INVALID_CURSOR') {
        this.pluginHubDialog.set({ ...current, page: undefined, loadingMore: false, phase: 'loading', error: undefined })
        void this.searchPluginHub(root, current.initialQuery, current.sort, current.category ?? null)
        return
      }
      this.pluginHubDialog.set({
        ...current, loadingMore: false, phase: 'error',
        error: tuiMessage(this.locale, 'plugin.error.catalog', { error: errorChain(error) }),
      })
    }).finally(() => {
      if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
    })
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private async togglePluginHubView(root: Agent): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined || snapshot.phase === 'handoff' || this.handle?.agent !== root) return
    if (snapshot.view === 'installed') {
      this.pluginHubDialog.set({
        generation: snapshot.generation,
        phase: 'loading',
        view: 'discover',
        profileMutations: snapshot.profileMutations,
        initialQuery: snapshot.initialQuery, sort: snapshot.sort, category: snapshot.category,
      })
      await this.searchPluginHub(root, snapshot.initialQuery)
      return
    }
    await this.loadPluginHubInstalled(root)
  }

  private async loadPluginHubInstalled(root: Agent): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (pluginHub === undefined || snapshot === undefined || this.handle?.agent !== root) return
    this.pluginHubOperation?.controller.abort(new Error('Plugin Hub view changed'))
    const controller = new AbortController()
    const generation = snapshot.generation
    this.pluginHubDialog.set({ generation, phase: 'loading', view: 'installed', initialQuery: snapshot.initialQuery, sort: snapshot.sort,
      profileMutations: snapshot.profileMutations,
      category: snapshot.category,
      loadingMore: false })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = pluginHub.installed(controller.signal).then((installed) => {
      if (!this.ownsPluginHubOperation(root, generation, operation)) return
      this.pluginHubDialog.set({ generation, phase: 'browse', view: 'installed',
        profileMutations: snapshot.profileMutations,
        initialQuery: snapshot.initialQuery, sort: snapshot.sort, category: snapshot.category, loadingMore: false, installed })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || !this.ownsPluginHubGeneration(root, generation)) return
      this.pluginHubDialog.set({ generation, phase: 'error', view: 'installed',
        profileMutations: snapshot.profileMutations,
        initialQuery: snapshot.initialQuery, sort: snapshot.sort, category: snapshot.category, loadingMore: false,
        error: tuiMessage(this.locale, 'plugin.error.installed', { error: errorChain(error) }) })
    }).finally(() => {
      if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
    })
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private async openPluginHubDetail(root: Agent, pluginId: PluginId): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (pluginHub === undefined || snapshot === undefined || snapshot.page === undefined
      || this.handle?.agent !== root || this.activeView !== undefined) return
    this.pluginHubOperation?.controller.abort(new Error('Plugin Hub detail request superseded'))
    const controller = new AbortController()
    const generation = snapshot.generation
    this.pluginHubDialog.set({ ...snapshot, phase: 'detail-loading', detail: undefined, progress: undefined, error: undefined })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = pluginHub.plugin(pluginId, controller.signal).then((detail) => {
      const current = this.pluginHubDialog.getSnapshot()
      if (controller.signal.aborted || this.pluginHubOperation !== operation
        || this.handle?.agent !== root || current?.generation !== generation) return
      this.pluginHubDialog.set({ ...current, phase: 'detail', detail, error: undefined })
    }).catch((error: unknown) => {
      const current = this.pluginHubDialog.getSnapshot()
      if (controller.signal.aborted || this.pluginHubOperation !== operation || current?.generation !== generation) return
      this.pluginHubDialog.set({
        ...current, phase: 'error',
        error: tuiMessage(this.locale, 'plugin.error.detail', { error: errorChain(error) }),
      })
    }).finally(() => {
      if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
    })
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private async planPluginHubInstall(root: Agent): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    const detail = snapshot?.detail
    const version = detail?.latestVersion
    const pluginHub = this.ctx.get('pluginHub')
    if (pluginHub === undefined || snapshot === undefined || detail === undefined
      || version === undefined || !version.installable) return
    if (snapshot.profileMutations === false || !pluginHub.supportsProfileMutations()) {
      this.externalNotice.set(`Use dsh plugin --profile tui add --save-exact ${detail.packageName}@${version.version}`)
      return
    }
    await this.planPluginHubChange(root, signal => pluginHub.planInstall(detail.id, version.id, signal), snapshot)
  }

  private async planPluginHubRemove(root: Agent, packageName: string): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    const pluginHub = this.ctx.get('pluginHub')
    if (pluginHub === undefined || snapshot === undefined || snapshot.view !== 'installed'
      || !snapshot.installed?.plugins.some(plugin => plugin.packageName === packageName)) return
    if (snapshot.profileMutations === false || !pluginHub.supportsProfileMutations()) {
      this.externalNotice.set(`Use dsh plugin --profile tui remove ${packageName}`)
      return
    }
    await this.planPluginHubChange(root, signal => pluginHub.planRemove(packageName, signal), snapshot)
  }

  private async planPluginHubChange(
    root: Agent,
    createPlan: (signal: AbortSignal) => Promise<PluginChangePlan>,
    snapshot: TuiPluginHubDialogSnapshot,
  ): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    if (pluginHub === undefined || !pluginHub.hasProvider() || this.handle?.agent !== root) return
    this.pluginHubOperation?.controller.abort(new Error('Plugin Hub plan superseded'))
    const controller = new AbortController()
    const generation = snapshot.generation
    this.pluginHubDialog.set({ ...snapshot, phase: 'planning', plan: undefined, progress: undefined, error: undefined })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = createPlan(controller.signal).then((plan) => {
      if (!this.ownsPluginHubOperation(root, generation, operation)) return
      const current = this.pluginHubDialog.getSnapshot()
      if (current === undefined) return
      this.pluginHubDialog.set({ ...current, phase: 'confirm', plan, error: undefined })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || !this.ownsPluginHubGeneration(root, generation)) return
      const current = this.pluginHubDialog.getSnapshot()
      if (current === undefined) return
      this.pluginHubDialog.set({
        ...current, phase: 'error',
        error: tuiMessage(this.locale, 'plugin.error.plan', { error: errorChain(error) }),
      })
    }).finally(() => {
      if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
    })
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private async confirmPluginHubPlan(root: Agent): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    const snapshot = this.pluginHubDialog.getSnapshot()
    const plan = snapshot?.plan
    if (pluginHub === undefined || snapshot === undefined || plan === undefined
      || snapshot.phase !== 'confirm' || this.handle?.agent !== root) return
    const controller = new AbortController()
    const generation = snapshot.generation
    this.pluginHubDialog.set({ ...snapshot, phase: 'staging', progress: undefined, error: undefined })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = (async () => {
      try {
        const staged = await pluginHub.stage(plan.id, controller.signal)
        if (!this.ownsPluginHubOperation(root, generation, operation)) {
          await pluginHub.discard(staged.id).catch(() => undefined)
          return
        }
        const current = this.pluginHubDialog.getSnapshot()
        if (current === undefined) return
        this.pluginHubDialog.set({ ...current, phase: 'handoff' })
        await pluginHub.createMaintenanceHandoff(staged.id)
        if (!this.ownsPluginHubOperation(root, generation, operation)) return
        this.requestExit(0)
      } catch (error: unknown) {
        if (controller.signal.aborted || !this.ownsPluginHubGeneration(root, generation)) return
        const current = this.pluginHubDialog.getSnapshot()
        if (current === undefined) return
        this.pluginHubDialog.set({
          ...current, phase: 'error',
          error: tuiMessage(this.locale, 'plugin.error.activation', { error: errorChain(error) }),
        })
      } finally {
        if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
      }
    })()
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private ownsPluginHubGeneration(root: Agent, generation: number): boolean {
    return this.handle?.agent === root && this.pluginHubDialog.getSnapshot()?.generation === generation
  }

  private ownsPluginHubOperation(root: Agent, generation: number, operation: ActiveOperation): boolean {
    return !operation.controller.signal.aborted && this.pluginHubOperation === operation
      && this.ownsPluginHubGeneration(root, generation)
  }

  private async refreshPluginHub(root: Agent): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot?.view === 'installed') await this.loadPluginHubInstalled(root)
    else await this.searchPluginHub(root, snapshot?.initialQuery ?? '')
  }

  private closePluginHub(): void {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined) return
    if (snapshot.phase === 'handoff') return
    this.pluginHubOperation?.controller.abort(new Error('Plugin Hub panel closed'))
    this.pluginHubOperation = undefined
    if (snapshot.phase === 'confirm' || snapshot.phase === 'planning' || snapshot.phase === 'staging') {
      if (snapshot.view === 'installed') {
        this.pluginHubDialog.set({ ...snapshot, phase: 'browse', plan: undefined, error: undefined })
      } else {
        this.pluginHubDialog.set({ ...snapshot, phase: 'detail', plan: undefined, error: undefined })
      }
      return
    }
    if ((snapshot.phase === 'detail' || snapshot.phase === 'detail-loading' || snapshot.phase === 'error')
      && snapshot.page !== undefined) {
      this.pluginHubDialog.set({ ...snapshot, phase: 'browse', detail: undefined, plan: undefined, error: undefined })
      return
    }
    if (snapshot.phase === 'error' && snapshot.view === 'installed' && snapshot.installed !== undefined) {
      this.pluginHubDialog.set({ ...snapshot, phase: 'browse', plan: undefined, error: undefined })
      return
    }
    this.pluginHubDialog.set(undefined)
  }

  private executeHelp(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'help.usage') }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    this.helpOpen.set(true)
    const lines = this.commandCatalog.list(invocation.agent).map(command =>
      `/${command.name}${command.input === undefined ? '' : ` ${command.input.hint}`} — ${tuiCommandDescription(command, this.locale)}`)
    return { kind: 'success', text: lines.join('\n') }
  }

  private async executeLanguage(invocation: CommandInvocation): Promise<CommandResult> {
    const settings = this.ctx.get('settings')
    if (settings === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'system.settings.unavailable') }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    const input = invocation.rawInput.trim().toLocaleLowerCase()
    let selected: TuiLocale | undefined
    if (input === '') {
      const answer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-language',
        header: tuiMessage(this.locale, 'command.lang'),
        question: tuiMessage(this.locale, 'language.current', {
          language: tuiLocaleLabel(this.locale, this.locale),
        }),
        options: TUI_LOCALES.map(locale => ({
          label: tuiLocaleLabel(locale, this.locale),
          description: locale,
        })),
      })
      selected = TUI_LOCALES.find(locale => tuiLocaleLabel(locale, this.locale) === answer.selected[0])
    } else if (TUI_LOCALES.includes(input as TuiLocale)) {
      selected = input as TuiLocale
    } else {
      return { kind: 'error', text: tuiMessage(this.locale, 'language.invalid', { locale: input }) }
    }
    if (selected === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'language.cancelled') }
    try {
      await settings.update(TUI_SETTINGS_NAMESPACE, { locale: selected })
    } catch (error: unknown) {
      return { kind: 'error', text: tuiMessage(this.locale, 'language.failed', { error: errorChain(error) }) }
    }
    return {
      kind: 'success',
      text: tuiMessage(selected, 'language.updated', { language: tuiLocaleLabel(selected, selected) }),
    }
  }

  private async executeDoctor(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'doctor.usage') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'doctor.rootOnly') }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'doctor.interaction') }
    }
    if (this.resumeDialog.getSnapshot() !== undefined || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined || this.sessionExportDialog.getSnapshot() !== undefined
      || this.pluginHubDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'doctor.dialog') }
    }

    this.helpOpen.set(false)
    const notice = tuiMessage(this.locale, 'doctor.checking')
    this.externalNotice.set(notice)
    try {
      return await this.collectDoctorDiagnostics(invocation)
    } finally {
      if (this.externalNotice.getSnapshot() === notice) this.externalNotice.set('')
    }
  }

  private async collectDoctorDiagnostics(invocation: CommandInvocation): Promise<CommandResult> {
    const providers = this.ctx.llm.listProviders()
    const inspectedProviders = providers.slice(0, 8)
    const providerDiagnostics = await Promise.all(inspectedProviders.map(async (
      provider,
    ): Promise<TuiProviderDiagnostic> => {
      invocation.signal.throwIfAborted()
      try {
        const authentication = await hostAuthentication(this.ctx.llm, provider.id)
        invocation.signal.throwIfAborted()
        const models = authentication.configured
          ? await this.ctx.llm.listModels(provider.id)
          : undefined
        invocation.signal.throwIfAborted()
        return Object.freeze({
          id: provider.id,
          name: provider.name,
          configured: authentication.configured,
          ...(authentication.source === undefined ? {} : { authenticationSource: authentication.source }),
          ...(models === undefined ? {} : { modelCount: models.length }),
        })
      } catch (error: unknown) {
        invocation.signal.throwIfAborted()
        return Object.freeze({
          id: provider.id,
          name: provider.name,
          configured: false,
          error: diagnosticFailureLabel(error, 'provider'),
        })
      }
    }))

    const pluginHub = this.ctx.get('pluginHub')
    let pluginHubDiagnostic: TuiPluginHubDiagnostic = { state: 'unavailable' }
    if (pluginHub !== undefined && pluginHub.hasProvider()) {
      const profileMutations = pluginHub.supportsProfileMutations()
      try {
        const [status, installed] = await Promise.all([
          pluginHub.status(invocation.signal),
          pluginHub.installed(invocation.signal),
        ])
        invocation.signal.throwIfAborted()
        pluginHubDiagnostic = Object.freeze({
          state: 'available',
          source: status.source,
          stale: status.stale,
          installedCount: installed.plugins.length,
          profileMutations,
        })
      } catch (error: unknown) {
        invocation.signal.throwIfAborted()
        pluginHubDiagnostic = Object.freeze({
          state: 'failed',
          error: diagnosticFailureLabel(error, 'Plugin Hub'),
          profileMutations,
        })
      }
    }

    invocation.signal.throwIfAborted()
    const startup: unknown = this.ctx.get('tuiStartup')
    const host = tuiHostDiagnosticsFromStartup(startup)
    this.diagnostics.set(projectTuiDiagnostics({
      ...(host === undefined ? {} : { host }),
      ...(this.terminalCapabilities === undefined ? {} : { terminal: this.terminalCapabilities }),
      providers: providerDiagnostics,
      omittedProviders: Math.max(0, providers.length - inspectedProviders.length),
      pluginHub: pluginHubDiagnostic,
      capabilities: {
        settings: this.ctx.get('settings') !== undefined,
        sessionProjection: this.ctx.get('sessionProjections') !== undefined,
        pluginHub: pluginHub !== undefined && pluginHub.hasProvider(),
        jobs: this.ctx.get('jobs') !== undefined,
        subagents: this.ctx.get('subagents') !== undefined,
      },
    }, this.locale))
    return { kind: 'success', text: tuiMessage(this.locale, 'doctor.opened') }
  }

  private async executeLoadedContext(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'context.usage') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'context.rootOnly') }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'context.interaction') }
    }
    if (this.resumeDialog.getSnapshot() !== undefined || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined || this.sessionExportDialog.getSnapshot() !== undefined
      || this.pluginHubDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'context.dialog') }
    }
    const agent = invocation.agent
    const prompt = this.ctx.get('systemPrompt') as unknown as LoadedContextPromptService | undefined
    if (prompt === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'context.unavailable') }

    this.helpOpen.set(false)
    this.diagnostics.set(undefined)
    const notice = tuiMessage(this.locale, 'context.checking')
    this.externalNotice.set(notice)
    try {
      const assembly = await prompt.assemble(assembleContextFor(agent, invocation.signal))
      invocation.signal.throwIfAborted()
      const skillService = this.ctx.get('skills') as unknown as LoadedContextSkillService | undefined
      const skills = skillService === undefined
        ? []
        : await skillService.list({
          scope: agent,
          cwd: agent.session.header.cwd,
          signal: invocation.signal,
        })
      invocation.signal.throwIfAborted()
      const selection = this.selection?.current ?? this.modelSelection.getSnapshot()
      const permission = this.permissions.getSnapshot()?.currentValue
      this.loadedContext.set(projectTuiLoadedContext({
        sections: assembly.sections.map(section => section.name),
        contexts: assembly.contexts.map(context => context.name),
        tools: assembly.tools.map(tool => tool.name),
        skills: skills.map(skill => skill.name),
        ...(selection === undefined ? {} : {
          model: `${selection.provider}/${selection.model}${selection.reasoningEffort === undefined ? '' : ` · ${selection.reasoningEffort}`}`,
        }),
        ...(permission === undefined ? {} : { permission }),
      }, this.locale))
      return { kind: 'success', text: tuiMessage(this.locale, 'context.opened') }
    } finally {
      if (this.externalNotice.getSnapshot() === notice) this.externalNotice.set('')
    }
  }

  private async executeQuestionCommand(
    cancelledMessage: TuiMessageKey,
    execute: () => Promise<CommandResult>,
  ): Promise<CommandResult> {
    try {
      return await execute()
    } catch (error: unknown) {
      if (isTuiQuestionCancellation(error)) {
        return { kind: 'success', text: tuiMessage(this.locale, cancelledMessage) }
      }
      throw error
    }
  }

  private async executeMode(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'mode.usage') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    }
    if (invocation.agent.status !== 'idle') {
      return { kind: 'error', text: tuiMessage(this.locale, 'fresh.error.agentBusy', { status: invocation.agent.status }) }
    }
    if (this.resumeDialog.getSnapshot() !== undefined || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined || this.sessionExportDialog.getSnapshot() !== undefined
      || this.pluginHubDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'plugin.command.dialog') }
    }
    const presets = hostAgentPresets(this.ctx)
    const currentId = resolveSessionPreset(invocation.agent.session)
      ?? presets.composedPreset(invocation.agent.ctx)
    if (currentId === undefined) throw new Error('The active TUI Agent has no composed preset')
    const roster = tuiAgentModeOptions(await presets.list(), currentId, this.locale)
    const options = Object.freeze([
      ...roster.filter(option => option.preset.id === currentId),
      ...roster.filter(option => option.preset.id !== currentId),
    ])
    if (options.length === 0) return { kind: 'error', text: tuiMessage(this.locale, 'mode.none') }
    this.helpOpen.set(false)
    this.externalNotice.set('')
    const answer = await this.askOne(invocation.agent, invocation.signal, {
      id: 'agent-mode-selection',
      header: tuiMessage(this.locale, 'mode.header'),
      question: tuiMessage(this.locale, 'mode.question'),
      options: options.map(option => ({ label: option.label, description: option.description })),
    })
    const selected = options.find(option => option.label === answer.selected[0])
    if (selected === undefined) throw new Error(tuiMessage(this.locale, 'mode.cancelled'))
    if (selected.preset.broken !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'mode.unavailable', {
        mode: selected.name, reason: selected.preset.broken,
      }) }
    }
    if (selected.preset.id === currentId) {
      return { kind: 'success', text: tuiMessage(this.locale, 'mode.same', { mode: selected.name }) }
    }
    if (invocation.agent.session.events.some(event => event.type === 'turn/start')) {
      const cwd = invocation.agent.session.header.cwd
      if (cwd === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'session.error.workspace') }
      this.freshSessionDialog.set({
        generation: ++this.freshSessionGeneration,
        command: 'mode',
        phase: 'confirming',
        currentSessionId: invocation.agent.session.id,
        workspaceLabel: cwd,
        targetPreset: { id: selected.preset.id, name: selected.name },
      })
      return { kind: 'success', text: tuiMessage(this.locale, 'mode.started.opened', { mode: selected.name }) }
    }
    try {
      const mounted = await presets.recompose(invocation.agent.ctx, selected.preset.id)
      // Commit the durable identity only after the new standing composition is live.
      invocation.agent.session.append('agent-preset/selected', { agentPreset: mounted.id })
      this.agentMode.set(mounted)
      return { kind: 'success', text: tuiMessage(this.locale, 'mode.switched', { mode: selected.name }) }
    } catch (error: unknown) {
      return { kind: 'error', text: tuiMessage(this.locale, 'mode.switch.failed', { error: errorChain(error) }) }
    }
  }

  private async executeConfig(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'config.usage') }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    const settings = this.ctx.get('settings')
    if (settings === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'system.settings.unavailable') }
    this.helpOpen.set(false)
    this.externalNotice.set('')
    const current = this.settingsSource()
    const themeValue = tuiMessage(this.locale, current.theme === 'auto'
      ? 'config.theme.auto' : current.theme === 'dark'
        ? 'config.theme.dark' : current.theme === 'light' ? 'config.theme.light' : 'config.theme.no-color')
    const mouseValue = tuiMessage(this.locale, current.mouse === 'auto' ? 'config.mouse.auto' : 'config.mouse.off')
    const themeLabel = tuiMessage(this.locale, 'config.theme.option', { value: themeValue })
    const mouseLabel = tuiMessage(this.locale, 'config.mouse.option', { value: mouseValue })
    const actionLabel = tuiMessage(this.locale, 'config.keybindings.option')
    const resetLabel = tuiMessage(this.locale, 'config.reset.option')
    const choice = await this.askOne(invocation.agent, invocation.signal, {
      id: 'tui-config',
      header: tuiMessage(this.locale, 'config.header'),
      question: tuiMessage(this.locale, 'config.question'),
      options: [
        { label: themeLabel, description: tuiMessage(this.locale, 'config.theme.description') },
        { label: mouseLabel, description: tuiMessage(this.locale, 'config.mouse.description') },
        { label: actionLabel, description: tuiMessage(this.locale, 'config.keybindings.description') },
        { label: resetLabel, description: tuiMessage(this.locale, 'config.reset.description') },
      ],
    })
    const selected = choice.selected[0]
    if (selected === themeLabel) {
      const themeChoices = TUI_THEME_PREFERENCES.map(theme => ({
        value: theme,
        label: tuiMessage(this.locale, theme === current.theme ? 'config.current' : theme === 'auto'
          ? 'config.theme.auto' : theme === 'dark' ? 'config.theme.dark'
            : theme === 'light' ? 'config.theme.light' : 'config.theme.no-color', {
          value: tuiMessage(this.locale, theme === 'auto'
            ? 'config.theme.auto' : theme === 'dark' ? 'config.theme.dark'
              : theme === 'light' ? 'config.theme.light' : 'config.theme.no-color'),
        }),
      }))
      const themeAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-theme',
        header: tuiMessage(this.locale, 'config.theme.header'),
        question: tuiMessage(this.locale, 'config.theme.question'),
        options: themeChoices.map(theme => ({ label: theme.label })),
      })
      const selectedTheme = themeChoices.find(theme => theme.label === themeAnswer.selected[0])?.value
      if (selectedTheme === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'config.theme.cancelled') }
      try {
        await settings.update(TUI_SETTINGS_NAMESPACE, { theme: selectedTheme })
      } catch (error: unknown) {
        return { kind: 'error', text: tuiMessage(this.locale, 'config.theme.failed', { error: errorChain(error) }) }
      }
      return { kind: 'success', text: tuiMessage(this.locale, 'config.theme.updated', {
        value: tuiMessage(this.locale, selectedTheme === 'auto'
          ? 'config.theme.auto' : selectedTheme === 'dark' ? 'config.theme.dark'
            : selectedTheme === 'light' ? 'config.theme.light' : 'config.theme.no-color'),
      }) }
    }
    if (selected === mouseLabel) {
      const mouseChoices = TUI_MOUSE_PREFERENCES.map(mouse => ({
        value: mouse,
        label: tuiMessage(this.locale, mouse === current.mouse ? 'config.current'
          : mouse === 'auto' ? 'config.mouse.auto' : 'config.mouse.off', {
          value: tuiMessage(this.locale, mouse === 'auto' ? 'config.mouse.auto' : 'config.mouse.off'),
        }),
      }))
      const mouseAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-mouse',
        header: tuiMessage(this.locale, 'config.mouse.header'),
        question: tuiMessage(this.locale, 'config.mouse.question'),
        options: mouseChoices.map(mouse => ({
          label: mouse.label,
          description: tuiMessage(this.locale, mouse.value === 'auto'
            ? 'config.mouse.auto.description'
            : 'config.mouse.off.description'),
        })),
      })
      const selectedMouse = mouseChoices.find(mouse => mouse.label === mouseAnswer.selected[0])?.value
      if (selectedMouse === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'config.mouse.cancelled') }
      try {
        await settings.update(TUI_SETTINGS_NAMESPACE, { mouse: selectedMouse })
      } catch (error: unknown) {
        return { kind: 'error', text: tuiMessage(this.locale, 'config.mouse.failed', { error: errorChain(error) }) }
      }
      return { kind: 'success', text: tuiMessage(this.locale, 'config.mouse.updated', {
        value: tuiMessage(this.locale, selectedMouse === 'auto' ? 'config.mouse.auto' : 'config.mouse.off'),
      }) }
    }
    if (selected === actionLabel) {
      const configurableActionIds = new Set(TUI_INTERACTION_REGISTRY
        .filter(candidate => candidate.bindings.some(binding => binding.kind === 'key'))
        .map(candidate => candidate.id))
      const actions = this.interactionRegistry.filter(candidate => configurableActionIds.has(candidate.id))
      const actionLabels = new Map(actions.map(candidate => [
        `${candidate.id} · ${tuiInteractionDescription(candidate, this.locale)}`,
        candidate,
      ]))
      const actionAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-keybinding-action',
        header: tuiMessage(this.locale, 'config.keybindings.header'),
        question: tuiMessage(this.locale, 'config.keybindings.question'),
        options: actions.map(candidate => ({
          label: `${candidate.id} · ${tuiInteractionDescription(candidate, this.locale)}`,
          description: candidate.bindings.filter(binding => binding.kind === 'key').map(binding => binding.label).join(', '),
        })),
      })
      const action = actionLabels.get(actionAnswer.selected[0] ?? '')
      if (action === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'config.keybindings.cancelled') }
      const currentBindings = action.bindings.filter(binding => binding.kind === 'key').map(binding => binding.label).join(', ')
      const bindingAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-keybinding-value',
        header: action.id,
        question: tuiMessage(this.locale, 'config.keybindings.value.question'),
        detail: tuiMessage(this.locale, 'config.keybindings.value.detail', {
          bindings: currentBindings || tuiMessage(this.locale, 'common.none'),
        }),
      })
      const input = bindingAnswer.custom?.trim()
      if (input === undefined || input === '') {
        return { kind: 'success', text: tuiMessage(this.locale, 'config.keybindings.value.cancelled') }
      }
      try {
        if (input.toLocaleLowerCase() === 'default') {
          await settings.mutate(TUI_SETTINGS_NAMESPACE, [{ op: 'unset', path: ['keybindings', action.id] }])
        } else {
          const sequences = input.split(',').map(sequence => sequence.trim()).filter(Boolean)
          await settings.update(TUI_SETTINGS_NAMESPACE, { keybindings: { [action.id]: sequences } })
        }
      } catch (error: unknown) {
        return { kind: 'error', text: tuiMessage(this.locale, 'config.keybindings.value.failed', { error: errorChain(error) }) }
      }
      return { kind: 'success', text: input.toLocaleLowerCase() === 'default'
        ? tuiMessage(this.locale, 'config.keybindings.value.reset', { action: action.id })
        : tuiMessage(this.locale, 'config.keybindings.value.updated', { action: action.id }) }
    }
    if (selected === resetLabel) {
      const confirmation = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-reset',
        header: tuiMessage(this.locale, 'config.reset.header'),
        question: tuiMessage(this.locale, 'config.reset.question'),
        options: [{ label: resetLabel }, { label: tuiMessage(this.locale, 'common.cancel') }],
      })
      if (confirmation.selected[0] !== resetLabel) {
        return { kind: 'success', text: tuiMessage(this.locale, 'config.reset.unchanged') }
      }
      try {
        await settings.replace(TUI_SETTINGS_NAMESPACE, {})
      } catch (error: unknown) {
        return { kind: 'error', text: tuiMessage(this.locale, 'config.reset.failed', { error: errorChain(error) }) }
      }
      return { kind: 'success', text: tuiMessage(this.locale, 'config.reset.updated') }
    }
    return { kind: 'success', text: tuiMessage(this.locale, 'config.cancelled') }
  }

  private executeExit(invocation: CommandInvocation, name: 'quit' | 'exit'): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: `Usage: /${name}` }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    this.exitAfterCommand = invocation.agent
    return { kind: 'success', text: 'Exiting the TUI.' }
  }

  private executeRename(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() === '') return { kind: 'error', text: 'Usage: /rename <title>' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    if (invocation.agent.status !== 'idle') {
      return { kind: 'error', text: 'Session rename requires the current turn to finish or be cancelled first.' }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Session rename is unavailable while an interaction is waiting.' }
    }
    if (this.activeAgentSwitch !== undefined) {
      return { kind: 'error', text: 'Session rename is unavailable while another Session switch is settling.' }
    }
    if (this.resumeDialog.getSnapshot() !== undefined
      || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined
      || this.sessionExportDialog.getSnapshot() !== undefined
      || this.pluginHubDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Close the current Session dialog before renaming.' }
    }
    const sessionTitle = this.ctx.get('sessionTitle')
    if (sessionTitle === undefined) return { kind: 'error', text: 'Session rename is unavailable in this TUI composition.' }
    try {
      const snapshot = sessionTitle.rename(invocation.agent.session, invocation.rawInput)
      return {
        kind: 'success',
        text: `Session renamed to ${snapshot.title}.`,
        sourceEventSeq: snapshot.eventSeq,
      }
    } catch (error: unknown) {
      return { kind: 'error', text: `Could not rename Session: ${errorChain(error)}` }
    }
  }

  private executeResume(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: 'Usage: /resume' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    if (this.activeAgentSwitch !== undefined) {
      return { kind: 'error', text: 'The previous Session switch is still settling.' }
    }
    if (invocation.agent.status !== 'idle') {
      return { kind: 'error', text: 'Resume requires the current turn to finish or be cancelled first.' }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Resume is unavailable while an interaction is waiting.' }
    }
    if (this.sessionExportDialog.getSnapshot() !== undefined || this.activeSessionExport !== undefined) {
      return { kind: 'error', text: 'Close or cancel Session export before resuming another Session.' }
    }
    if (this.rewindDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Close Session rewind before resuming another Session.' }
    }
    this.openResume(invocation.agent)
    return { kind: 'success', text: 'Opened Session picker.' }
  }

  private executeFreshSession(
    invocation: CommandInvocation,
    command: TuiFreshSessionCommand,
  ): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: `Usage: /${command}` }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    if (this.activeAgentSwitch !== undefined) {
      return { kind: 'error', text: 'The previous Session switch is still settling.' }
    }
    if (invocation.agent.status !== 'idle') {
      return { kind: 'error', text: 'Starting a fresh Session requires the current turn to finish or be cancelled first.' }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Starting a fresh Session is unavailable while an interaction is waiting.' }
    }
    if (this.resumeDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Close the Session picker before starting a fresh Session.' }
    }
    if (this.rewindDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Close Session rewind before starting a fresh Session.' }
    }
    if (this.sessionExportDialog.getSnapshot() !== undefined || this.activeSessionExport !== undefined) {
      return { kind: 'error', text: 'Close or cancel Session export before starting a fresh Session.' }
    }
    const cwd = invocation.agent.session.header.cwd
    if (cwd === undefined) return { kind: 'error', text: 'The current Session has no workspace to retain.' }
    const generation = ++this.freshSessionGeneration
    this.helpOpen.set(false)
    this.externalNotice.set('')
    this.freshSessionDialog.set({
      generation,
      command,
      phase: 'confirming',
      currentSessionId: invocation.agent.session.id,
      workspaceLabel: cwd,
    })
    return { kind: 'success', text: `Opened /${command} confirmation.` }
  }

  private executeRewind(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: 'Usage: /rewind' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    if (this.activeAgentSwitch !== undefined) {
      return { kind: 'error', text: 'The previous Session switch is still settling.' }
    }
    if (invocation.agent.status !== 'idle') {
      return { kind: 'error', text: 'Rewind requires the current turn to finish or be cancelled first.' }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Rewind is unavailable while an interaction is waiting.' }
    }
    if (this.resumeDialog.getSnapshot() !== undefined
      || this.freshSessionDialog.getSnapshot() !== undefined
      || this.sessionExportDialog.getSnapshot() !== undefined
      || this.activeSessionExport !== undefined) {
      return { kind: 'error', text: 'Close the current Session dialog before rewinding.' }
    }
    if (invocation.agent.session.header.cwd === undefined) {
      return { kind: 'error', text: 'The current Session has no workspace to retain.' }
    }
    this.helpOpen.set(false)
    this.externalNotice.set('')
    this.rewindDialog.set({
      generation: ++this.rewindGeneration,
      phase: 'opening',
      currentSessionId: invocation.agent.session.id,
    })
    return { kind: 'success', text: 'Opened Session rewind.' }
  }

  private settleRewindCommand(agent: Agent): void {
    const dialog = this.rewindDialog.getSnapshot()
    if (dialog?.phase !== 'opening' || !this.ownsAgent(agent) || this.isClosing()) return
    this.rewindDialog.set({
      ...dialog,
      phase: 'browsing',
      candidates: tuiRewindCandidates(agent.session.events),
    })
  }

  private closeRewind(): void {
    if (this.activeAgentSwitch?.kind === 'rewind') {
      this.activeAgentSwitch.controller.abort(new Error('TUI Session rewind cancelled'))
    }
    this.rewindGeneration += 1
    this.rewindDialog.set(undefined)
  }

  private async activateRewind(agent: Agent, candidate: TuiRewindCandidate): Promise<void> {
    const dialog = this.rewindDialog.getSnapshot()
    if (dialog?.phase !== 'browsing' || !this.ownsAgent(agent) || this.activeAgentSwitch !== undefined) return
    const current = dialog.candidates?.find(item => item.eventSeq === candidate.eventSeq)
    if (current === undefined) return
    if (agent.status !== 'idle') {
      this.rewindDialog.set({ ...dialog, error: tuiMessage(this.locale, 'rewind.error.agentBusy', { status: agent.status }) })
      return
    }
    if (this.interactions.getSnapshot() !== undefined) {
      this.rewindDialog.set({ ...dialog, error: tuiMessage(this.locale, 'session.error.interaction') })
      return
    }
    const cwd = agent.session.header.cwd
    const selectedModel = this.selection?.current ?? this.modelSelection.getSnapshot()
    if (cwd === undefined || selectedModel === undefined) {
      this.rewindDialog.set({ ...dialog, error: cwd === undefined
        ? tuiMessage(this.locale, 'session.error.workspace')
        : tuiMessage(this.locale, 'session.error.model') })
      return
    }
    const rewindDecision = await this.ctx.tuiExtensions.decide({
      kind: 'rewind', sessionId: agent.session.id, targetEventSeq: current.eventSeq, operation: 'rewind',
    })
    if (rewindDecision.outcome === 'deny') {
      this.rewindDialog.set({
        ...dialog, error: rewindDecision.reason ?? tuiMessage(this.locale, 'rewind.error.denied'),
      })
      return
    }
    const anchor = resolveSessionForkAnchor(agent.session.events, current.eventSeq)
    if (anchor.kind === 'unavailable') {
      this.rewindDialog.set({ ...dialog, error: tuiMessage(this.locale, 'rewind.error.boundary') })
      return
    }
    const controller = new AbortController()
    this.rewindDialog.set({
      generation: dialog.generation,
      phase: 'rewinding',
      currentSessionId: dialog.currentSessionId,
      ...dialog.candidates === undefined ? {} : { candidates: dialog.candidates },
      rewindingSeq: current.eventSeq,
    })
    const completion = this.rewindAgent(
      agent, cwd, selectedModel, anchor.seedLength, controller.signal,
    ).catch((error: unknown) => {
      if (controller.signal.aborted || this.isClosing()) return
      const latest = this.rewindDialog.getSnapshot()
      if (latest?.generation !== dialog.generation) return
      this.rewindDialog.set({
        generation: latest.generation,
        phase: 'browsing',
        currentSessionId: latest.currentSessionId,
        ...latest.candidates === undefined ? {} : { candidates: latest.candidates },
        error: tuiMessage(this.locale, 'rewind.error.failed', { error: errorChain(error) }),
      })
    })
    const operation: ActiveAgentSwitch = { kind: 'rewind', controller, completion }
    this.activeAgentSwitch = operation
    await completion.finally(() => {
      if (this.activeAgentSwitch === operation) this.activeAgentSwitch = undefined
    })
  }

  private async rewindAgent(
    oldAgent: Agent,
    cwd: string,
    selectedModel: ModelSelection,
    seedLength: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
    const initialStatus = this.agentStatus(oldAgent)
    if (initialStatus !== 'idle') throw new Error(`current Agent is ${initialStatus}`)
    const seed = oldAgent.session.events.slice(0, seedLength)
    const preset = resolveSessionPreset(oldAgent.session)
    if (preset === undefined) throw new Error('the source Session has no Agent preset to inherit')
    const prepared = await this.prepareAgent({
      kind: 'rewind',
      parentSession: oldAgent.session.id,
      cwd,
      selection: selectedModel,
      seed,
      preset,
    }, signal)
    let retiredHandle: AgentHandle
    try {
      signal.throwIfAborted()
      if (this.isClosing()) throw new Error('TUI is shutting down')
      if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
      const currentStatus = this.agentStatus(oldAgent)
      if (currentStatus !== 'idle') throw new Error(`current Agent became ${currentStatus}`)
      retiredHandle = this.commitAgentSwitch(oldAgent, prepared)
    } catch (error: unknown) {
      await prepared.handle.dispose().catch(() => undefined)
      throw error
    }

    let retirementError: unknown
    try {
      await this.ctx.sessions.flush(oldAgent.session)
    } catch (error: unknown) {
      retirementError = error
    }
    try {
      await retiredHandle.dispose()
    } catch (error: unknown) {
      retirementError ??= error
    }
    this.externalNotice.set(retirementError === undefined
      ? tuiMessage(this.locale, 'rewind.complete')
      : tuiMessage(this.locale, 'rewind.complete.retirementFailed', { error: errorChain(retirementError) }))
  }

  private executeSessionExport(invocation: CommandInvocation): CommandResult {
    const formatInput = invocation.rawInput.trim().toLocaleLowerCase()
    let format: TuiSessionExportFormat
    if (formatInput === '' || formatInput === 'zip') format = 'zip'
    else if (formatInput === 'md' || formatInput === 'markdown') format = 'markdown'
    else return { kind: 'error', text: 'Usage: /export [zip|markdown]' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    if (this.activeSessionExport !== undefined) {
      return { kind: 'error', text: 'The previous Session export is still settling.' }
    }
    if (invocation.agent.status !== 'idle') {
      return { kind: 'error', text: 'Session export requires the current turn to finish or be cancelled first.' }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Session export is unavailable while an interaction is waiting.' }
    }
    if (this.resumeDialog.getSnapshot() !== undefined
      || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Close the current Session dialog before exporting.' }
    }
    if (this.sessionExportDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'The Session export dialog is already open.' }
    }
    const cwd = invocation.agent.session.header.cwd
    if (cwd === undefined) return { kind: 'error', text: 'The current Session has no workspace for relative export paths.' }
    this.helpOpen.set(false)
    this.externalNotice.set('')
    this.sessionExportDialog.set({
      generation: ++this.sessionExportGeneration,
      phase: 'opening',
      sessionId: invocation.agent.session.id,
      workspaceLabel: cwd,
      format,
    })
    return { kind: 'success', text: 'Opened Session export.' }
  }

  private settleSessionExportCommand(agent: Agent): void {
    const dialog = this.sessionExportDialog.getSnapshot()
    if (dialog?.phase !== 'opening' || !this.ownsAgent(agent) || this.isClosing()) return
    this.sessionExportDialog.set({ ...dialog, phase: 'selecting' })
  }

  private closeSessionExport(): void {
    const exporting = this.activeSessionExport !== undefined
    this.sessionExportGeneration += 1
    this.activeSessionExport?.controller.abort(new Error('TUI Session export cancelled'))
    this.sessionExportDialog.set(undefined)
    if (exporting) this.externalNotice.set(tuiMessage(this.locale, 'export.cancelled'))
  }

  private async activateSessionExport(
    agent: Agent,
    directoryInput: string,
    includeDescendants: boolean,
    format: TuiSessionExportFormat,
  ): Promise<void> {
    const dialog = this.sessionExportDialog.getSnapshot()
    if (dialog?.phase !== 'selecting' || !this.ownsAgent(agent) || this.activeSessionExport !== undefined) return
    if (agent.status !== 'idle') {
      this.sessionExportDialog.set({
        ...dialog,
        error: tuiMessage(this.locale, 'export.error.agentBusy', { status: agent.status }),
      })
      return
    }
    const destination = resolveTuiSessionExportDirectory(dialog.workspaceLabel, directoryInput)
    const controller = new AbortController()
    this.sessionExportDialog.set({
      generation: dialog.generation,
      phase: 'exporting',
      sessionId: dialog.sessionId,
      workspaceLabel: dialog.workspaceLabel,
      format,
      destination,
      includeDescendants,
    })
    const completion = this.writeSessionExport(
      agent, dialog.generation, destination, includeDescendants, format, controller.signal,
    )
    const operation = { controller, completion }
    this.activeSessionExport = operation
    await completion.finally(() => {
      if (this.activeSessionExport === operation) this.activeSessionExport = undefined
    })
  }

  private async writeSessionExport(
    agent: Agent,
    generation: number,
    destination: string,
    includeDescendants: boolean,
    format: TuiSessionExportFormat,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const result = format === 'markdown'
        ? await this.ctx.sessionLogExporter.writeMarkdownToDirectory({
          sessionId: agent.session.id,
          includeDescendants,
          attachmentPolicy: 'reference',
        }, destination, signal)
        : await this.ctx.sessionLogExporter.writeToDirectory({
          sessionId: agent.session.id,
          includeDescendants,
        }, destination, signal)
      signal.throwIfAborted()
      if (!this.ownsAgent(agent) || this.sessionExportGeneration !== generation || this.isClosing()) return
      this.sessionExportDialog.set(undefined)
      this.externalNotice.set(format === 'markdown'
        ? tuiMessage(this.locale, 'export.complete.markdown', { path: result.path })
        : tuiMessage(this.locale, 'export.complete.archive', { path: result.path }))
    } catch (error: unknown) {
      if (signal.aborted || this.sessionExportGeneration !== generation || this.isClosing()) return
      const dialog = this.sessionExportDialog.getSnapshot()
      if (dialog?.generation !== generation) return
      this.sessionExportDialog.set({
        generation,
        phase: 'selecting',
        sessionId: dialog.sessionId,
        workspaceLabel: dialog.workspaceLabel,
        format: dialog.format,
        error: error instanceof SessionLogExportError
          ? error.message
          : tuiMessage(this.locale, 'export.error.failed'),
      })
    }
  }

  private openResume(agent: Agent): void {
    this.closeResume(true)
    const generation = ++this.resumeGeneration
    const controller = new AbortController()
    this.resumeDialog.set({
      generation,
      phase: 'loading',
      currentWorkspaceLabel: agent.session.header.cwd ?? '(no workspace)',
    })
    this.externalNotice.set('')
    const completion = this.scanResume(agent, generation, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted || this.resumeGeneration !== generation || this.isClosing()) return
      this.resumeDialog.set(undefined)
      this.externalNotice.set(`Resume session scan failed: ${errorChain(error)}`)
    })
    const operation = { controller, completion }
    this.resumeScan = operation
    void completion.finally(() => {
      if (this.resumeScan === operation) this.resumeScan = undefined
    })
  }

  private closeResume(superseded = false): void {
    if (this.activeAgentSwitch?.kind === 'resume') {
      if (superseded) return
      this.activeAgentSwitch.controller.abort(new Error('TUI Session resume cancelled'))
    }
    this.resumeScan?.controller.abort(new Error('TUI Session picker closed'))
    this.resumeScan = undefined
    if (!superseded) this.resumeGeneration += 1
    this.resumeDialog.set(undefined)
  }

  private async scanResume(
    agent: Agent,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    const records = await this.ctx.sessionQuery.listSessions(signal)
    signal.throwIfAborted()
    if (!this.ownsAgent(agent) || this.resumeGeneration !== generation) return
    const [titles, activity, previews, presetResolutions] = await Promise.all([
      this.resolveResumeTitles(records, signal),
      this.resolveResumeActivity(records, signal),
      this.resolveResumePreviews(records, signal),
      this.resolveResumePresets(records, signal),
    ])
    signal.throwIfAborted()
    if (!this.ownsAgent(agent) || this.resumeGeneration !== generation) return
    const candidates = records.map((record, index): TuiResumeCandidate => {
      const resolution = titles[index] as { title?: string; failure?: unknown }
      const previewResolution = previews[index]
      const presetResolution = presetResolutions[index]
      const candidate = summarizeTuiResumeCandidate(
        record,
        resolution.title,
        activity[index],
        agent.session.id,
        agent.session.header.cwd,
        previewResolution?.lines,
        previewResolution?.truncated,
        previewResolution?.failure === undefined ? undefined : errorChain(previewResolution.failure),
        presetResolution?.summary,
        presetResolution?.disabledReason,
      )
      if (resolution.failure === undefined) return candidate
      return {
        ...candidate,
        title: tuiMessage(this.locale, 'resume.preview.unreadable'),
        disabledReason: tuiMessage(this.locale, 'resume.preview.readFailed', {
          error: errorChain(resolution.failure),
        }),
      }
    })
    this.resumeDialog.set({
      generation,
      phase: 'ready',
      currentWorkspaceLabel: agent.session.header.cwd ?? tuiMessage(this.locale, 'resume.workspace.none'),
      candidates: sortTuiResumeCandidates(candidates),
    })
  }

  private async resolveResumePresets(
    records: readonly SessionRecord[],
    signal: AbortSignal,
  ): Promise<ResumePresetResolution[]> {
    const presets = hostAgentPresets(this.ctx)
    let roster: readonly AgentPreset[]
    try {
      roster = await presets.list()
    } catch (error: unknown) {
      const disabledReason = tuiMessage(this.locale, 'resume.preset.unreadable', { error: errorChain(error) })
      return records.map(() => ({ disabledReason }))
    }
    const byId = new Map(roster.map(preset => [preset.id, preset]))
    const resolutions = new Array<ResumePresetResolution>(records.length)
    let cursor = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        signal.throwIfAborted()
        const index = cursor
        if (index >= records.length) return
        cursor += 1
        const record = records[index] as SessionRecord
        try {
          const live = this.ctx.sessions.get(record.header.id)
          const session = live === undefined
            ? await this.ctx.sessionQuery.readSession(record.header.id)
            : { session: live.header, events: live.events }
          signal.throwIfAborted()
          const id = resolveSessionPreset({ header: session.session, events: session.events })
          if (id === undefined) {
            resolutions[index] = { disabledReason: tuiMessage(this.locale, 'resume.preset.legacy') }
            continue
          }
          const preset = byId.get(id)
          if (preset === undefined) {
            resolutions[index] = {
              summary: { id, label: id },
              disabledReason: tuiMessage(this.locale, 'resume.preset.missing', { id }),
            }
            continue
          }
          const summary: TuiResumePresetSummary = {
            id,
            label: tuiAgentModeName(preset, this.locale),
            trust: preset.trust,
            ...preset.broken === undefined ? {} : {
              disabledReason: tuiMessage(this.locale, 'resume.preset.broken', {
                id, reason: preset.broken,
              }),
            },
          }
          resolutions[index] = {
            summary,
            ...summary.disabledReason === undefined ? {} : { disabledReason: summary.disabledReason },
          }
        } catch (error: unknown) {
          if (signal.aborted) signal.throwIfAborted()
          resolutions[index] = {
            disabledReason: tuiMessage(this.locale, 'resume.preset.unreadable', { error: errorChain(error) }),
          }
        }
      }
    }
    const concurrency = Math.min(this.config.resumeScanConcurrency ?? 4, records.length)
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    signal.throwIfAborted()
    return resolutions
  }

  private async resolveResumePreviews(
    records: readonly SessionRecord[],
    signal: AbortSignal,
  ): Promise<Array<ResumePreviewResolution | undefined>> {
    const previews: Array<ResumePreviewResolution | undefined> = new Array<ResumePreviewResolution | undefined>(records.length)
    let cursor = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        signal.throwIfAborted()
        const index = cursor
        if (index >= records.length) return
        cursor += 1
        const record = records[index] as SessionRecord
        try {
          const preview = await hostReadSessionPreview(this.ctx.sessionQuery, record.header.id, signal)
          previews[index] = preview === undefined
            ? { lines: [], truncated: false }
            : { lines: preview.lines, truncated: preview.truncated }
        } catch (failure: unknown) {
          if (signal.aborted) signal.throwIfAborted()
          previews[index] = { lines: [], truncated: false, failure }
        }
      }
    }
    const concurrency = Math.min(this.config.resumeScanConcurrency ?? 4, records.length)
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    signal.throwIfAborted()
    return previews
  }

  private async resolveResumeActivity(
    records: readonly SessionRecord[],
    signal: AbortSignal,
  ): Promise<Array<number | undefined>> {
    const activity = new Array<number | undefined>(records.length)
    let cursor = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        signal.throwIfAborted()
        const index = cursor
        if (index >= records.length) return
        cursor += 1
        activity[index] = await this.resumeActivityTime(records[index] as SessionRecord, signal)
      }
    }
    const concurrency = Math.min(this.config.resumeScanConcurrency ?? 4, records.length)
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    signal.throwIfAborted()
    return activity
  }

  private async resumeActivityTime(record: SessionRecord, signal: AbortSignal): Promise<number | undefined> {
    signal.throwIfAborted()
    const live = this.ctx.sessions.get(record.header.id)
    if (live !== undefined) return live.events.at(-1)?.time
    const location = this.ctx.get('sessionPersistence')?.locate(record.header)
    if (location === undefined) return undefined
    try {
      const updatedAt = (await stat(location.path)).mtimeMs
      signal.throwIfAborted()
      return updatedAt
    } catch {
      if (signal.aborted) signal.throwIfAborted()
      // A removed or not-yet-materialized artifact falls back to header creation time.
      return undefined
    }
  }

  private async resolveResumeTitles(
    records: readonly SessionRecord[],
    signal: AbortSignal,
  ): Promise<Array<{ title?: string; failure?: unknown }>> {
    const cache = this.ctx.get('sessionProjectionCache')
    if (cache === undefined) {
      const results = await this.ctx.sessionQuery.readTitleSnapshots(
        records.map(record => record.header.id),
        signal,
      )
      const byId = new Map(results.map(result => [result.sessionId, result]))
      return records.map((record) => {
        const result = byId.get(record.header.id)
        if (result === undefined) return { failure: new Error(`missing title result for ${record.header.id}`) }
        if (result.status === 'rejected') return { failure: result.reason }
        const title = result.value.title?.title
        return title === undefined ? {} : { title }
      })
    }
    return this.resolveProjectedTitles(cache, records, signal)
  }

  private async resolveProjectedTitles(
    cache: SessionProjectionCache,
    records: readonly SessionRecord[],
    signal: AbortSignal,
  ): Promise<Array<{ title?: string; failure?: unknown }>> {
    const resolutions = new Array<{ title?: string; failure?: unknown }>(records.length)
    let cursor = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        signal.throwIfAborted()
        const index = cursor
        if (index >= records.length) return
        cursor += 1
        const record = records[index] as SessionRecord
        try {
          const title = await this.projectedResumeTitle(cache, record, signal)
          resolutions[index] = typeof title === 'string' ? { title } : {}
        } catch (failure: unknown) {
          if (signal.aborted) signal.throwIfAborted()
          resolutions[index] = { failure }
        }
      }
    }
    const concurrency = Math.min(this.config.resumeScanConcurrency ?? 4, records.length)
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    signal.throwIfAborted()
    return resolutions
  }

  private async projectedResumeTitle(
    cache: SessionProjectionCache,
    record: SessionRecord,
    signal: AbortSignal,
  ): Promise<string | null | undefined> {
    const live = this.ctx.sessions.get(record.header.id)
    if (live !== undefined) return this.ctx.get('sessionProjections')?.snapshot(live).values.title
    const cached = cache.cachedSnapshot(record.header)
    if (cached !== undefined && 'title' in cached.values) return cached.values.title
    return (await cache.coldSnapshot(record.header.id, signal)).values.title
  }

  private async activateResume(agent: Agent, candidate: TuiResumeCandidate): Promise<void> {
    const dialog = this.resumeDialog.getSnapshot()
    if (dialog?.phase !== 'ready' || this.handle?.agent !== agent || this.activeAgentSwitch !== undefined) return
    const current = dialog.candidates?.find(item => item.record.header.id === candidate.record.header.id)
    if (current === undefined) return
    if (current.disabledReason !== undefined) {
      this.resumeDialog.set({ ...dialog, error: current.disabledReason })
      return
    }
    const switchDecision = await this.ctx.tuiExtensions.decide({
      kind: 'session-switch',
      sessionId: agent.session.id,
      targetSessionId: current.record.header.id,
      operation: 'resume',
    })
    if (switchDecision.outcome === 'deny') {
      this.resumeDialog.set({
        ...dialog, error: switchDecision.reason ?? tuiMessage(this.locale, 'resume.error.denied'),
      })
      return
    }
    if (agent.status !== 'idle') {
      this.resumeDialog.set({ ...dialog, error: tuiMessage(this.locale, 'resume.error.agentBusy', { status: agent.status }) })
      return
    }
    this.resumeScan?.controller.abort(new Error('TUI Session selected'))
    this.resumeScan = undefined
    const controller = new AbortController()
    this.resumeDialog.set({
      generation: dialog.generation,
      phase: 'resuming',
      currentWorkspaceLabel: dialog.currentWorkspaceLabel,
      ...dialog.candidates === undefined ? {} : { candidates: dialog.candidates },
      resumingId: current.record.header.id,
    })
    const completion = this.resumeCandidate(agent, current, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted || this.isClosing()) return
      const latest = this.resumeDialog.getSnapshot()
      if (latest?.generation !== dialog.generation) return
      this.resumeDialog.set({
        generation: latest.generation,
        phase: 'ready',
        currentWorkspaceLabel: latest.currentWorkspaceLabel,
        ...latest.candidates === undefined ? {} : { candidates: latest.candidates },
        error: tuiMessage(this.locale, 'resume.error.failed', { error: errorChain(error) }),
      })
    })
    const operation: ActiveAgentSwitch = { kind: 'resume', controller, completion }
    this.activeAgentSwitch = operation
    await completion.finally(() => {
      if (this.activeAgentSwitch === operation) this.activeAgentSwitch = undefined
    })
  }

  private async resumeCandidate(
    oldAgent: Agent,
    candidate: TuiResumeCandidate,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
    const initialStatus = this.agentStatus(oldAgent)
    if (initialStatus !== 'idle') throw new Error(`current Agent is ${initialStatus}`)
    const prepared = await this.prepareAgent({ kind: 'resume', sessionId: candidate.record.header.id }, signal)
    let retiredHandle: AgentHandle
    try {
      signal.throwIfAborted()
      if (this.isClosing()) throw new Error('TUI is shutting down')
      if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
      const currentStatus = this.agentStatus(oldAgent)
      if (currentStatus !== 'idle') throw new Error(`current Agent became ${currentStatus}`)
      retiredHandle = this.commitAgentSwitch(oldAgent, prepared)
    } catch (error: unknown) {
      await prepared.handle.dispose().catch(() => undefined)
      throw error
    }

    let retirementError: unknown
    try {
      await this.ctx.sessions.flush(oldAgent.session)
    } catch (error: unknown) {
      retirementError = error
    }
    try {
      await retiredHandle.dispose()
    } catch (error: unknown) {
      retirementError ??= error
    }
    this.externalNotice.set(retirementError === undefined
      ? `Resumed ${candidate.title}.`
      : `Resumed ${candidate.title}; previous Session cleanup failed: ${errorChain(retirementError)}`)
  }

  private closeFreshSession(): void {
    if (this.activeAgentSwitch?.kind === 'fresh') {
      this.activeAgentSwitch.controller.abort(new Error('TUI fresh Session creation cancelled'))
    }
    this.freshSessionGeneration += 1
    this.freshSessionDialog.set(undefined)
  }

  private async activateFreshSession(agent: Agent): Promise<void> {
    const dialog = this.freshSessionDialog.getSnapshot()
    if (dialog?.phase !== 'confirming' || !this.ownsAgent(agent) || this.activeAgentSwitch !== undefined) return
    if (agent.status !== 'idle') {
      this.freshSessionDialog.set({
        ...dialog, error: tuiMessage(this.locale, 'fresh.error.agentBusy', { status: agent.status }),
      })
      return
    }
    if (this.interactions.getSnapshot() !== undefined) {
      this.freshSessionDialog.set({ ...dialog, error: tuiMessage(this.locale, 'session.error.interaction') })
      return
    }
    const cwd = agent.session.header.cwd
    const selectedModel = this.selection?.current ?? this.modelSelection.getSnapshot()
    if (cwd === undefined || selectedModel === undefined) {
      this.freshSessionDialog.set({ ...dialog, error: cwd === undefined
        ? tuiMessage(this.locale, 'session.error.workspace')
        : tuiMessage(this.locale, 'session.error.model') })
      return
    }
    const switchDecision = await this.ctx.tuiExtensions.decide({
      kind: 'session-switch', sessionId: agent.session.id, operation: 'fresh',
    })
    if (switchDecision.outcome === 'deny') {
      this.freshSessionDialog.set({
        ...dialog, error: switchDecision.reason ?? tuiMessage(this.locale, 'fresh.error.denied'),
      })
      return
    }
    const controller = new AbortController()
    this.freshSessionDialog.set({
      generation: dialog.generation,
      command: dialog.command,
      phase: 'creating',
      currentSessionId: dialog.currentSessionId,
      workspaceLabel: dialog.workspaceLabel,
      ...dialog.targetPreset === undefined ? {} : { targetPreset: dialog.targetPreset },
    })
    const completion = this.startFreshSession(
      agent, cwd, selectedModel, controller.signal, dialog.targetPreset,
    ).catch((error: unknown) => {
      if (controller.signal.aborted || this.isClosing()) return
      const latest = this.freshSessionDialog.getSnapshot()
      if (latest?.generation !== dialog.generation) return
      this.freshSessionDialog.set({
        ...latest, phase: 'confirming',
        error: tuiMessage(this.locale, 'fresh.error.failed', { error: errorChain(error) }),
      })
    })
    const operation: ActiveAgentSwitch = { kind: 'fresh', controller, completion }
    this.activeAgentSwitch = operation
    await completion.finally(() => {
      if (this.activeAgentSwitch === operation) this.activeAgentSwitch = undefined
    })
  }

  private async startFreshSession(
    oldAgent: Agent,
    cwd: string,
    selectedModel: ModelSelection,
    signal: AbortSignal,
    targetPreset?: { readonly id: string; readonly name: string },
  ): Promise<void> {
    if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
    const initialStatus = this.agentStatus(oldAgent)
    if (initialStatus !== 'idle') throw new Error(`current Agent is ${initialStatus}`)
    const preset = targetPreset?.id ?? resolveSessionPreset(oldAgent.session)
    if (preset === undefined) throw new Error('the current Session has no Agent preset to inherit')
    const prepared = await this.prepareAgent({
      kind: 'fresh', source: 'clear', cwd, selection: selectedModel, preset,
    }, signal)
    let retiredHandle: AgentHandle
    try {
      signal.throwIfAborted()
      if (this.isClosing()) throw new Error('TUI is shutting down')
      if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
      const currentStatus = this.agentStatus(oldAgent)
      if (currentStatus !== 'idle') throw new Error(`current Agent became ${currentStatus}`)
      retiredHandle = this.commitAgentSwitch(oldAgent, prepared)
    } catch (error: unknown) {
      await prepared.handle.dispose().catch(() => undefined)
      throw error
    }

    let retirementError: unknown
    try {
      await this.ctx.sessions.flush(oldAgent.session)
    } catch (error: unknown) {
      retirementError = error
    }
    try {
      await retiredHandle.dispose()
    } catch (error: unknown) {
      retirementError ??= error
    }
    this.externalNotice.set(targetPreset === undefined
      ? retirementError === undefined
        ? tuiMessage(this.locale, 'fresh.complete')
        : tuiMessage(this.locale, 'fresh.complete.retirementFailed', { error: errorChain(retirementError) })
      : retirementError === undefined
        ? tuiMessage(this.locale, 'fresh.mode.complete', { mode: targetPreset.name })
        : tuiMessage(this.locale, 'fresh.mode.complete.retirementFailed', {
          mode: targetPreset.name, error: errorChain(retirementError),
        }))
  }

  private commitAgentSwitch(oldAgent: Agent, prepared: PreparedTuiAgent): AgentHandle {
    const oldHandle = this.handle
    const oldEvents = this.events
    const oldStatus = this.status
    const oldSelection = this.selection
    const oldModel = this.modelSelection.getSnapshot()
    const oldMode = this.agentMode.getSnapshot()
    const oldLoadedContext = this.loadedContext.getSnapshot()
    const oldPermissions = this.permissions.getSnapshot()
    const oldContext = this.contextPressure.getSnapshot()
    const oldTokenUsage = this.tokenUsage.getSnapshot()
    const oldContextBreakdown = this.contextBreakdown.getSnapshot()
    const oldSessionStats = this.sessionStats.getSnapshot()
    const oldDialog = this.resumeDialog.getSnapshot()
    const oldFreshDialog = this.freshSessionDialog.getSnapshot()
    const oldRewindDialog = this.rewindDialog.getSnapshot()
    const oldExportDialog = this.sessionExportDialog.getSnapshot()
    const oldActiveView = this.activeView
    if (oldHandle?.agent !== oldAgent || oldEvents === undefined || oldStatus === undefined || this.instance === undefined) {
      throw new Error('TUI Agent switch lost its current owner')
    }
    const nextEvents = new SessionEventStore(prepared.handle.agent.session.events)
    const nextStatus = new AgentStatusStore(prepared.handle.agent.status)
    this.handle = prepared.handle
    this.events = nextEvents
    this.status = nextStatus
    this.selection = prepared.selection
    this.activeView = undefined
    this.modelSelection.set(prepared.selectedModel)
    this.agentMode.set(prepared.preset)
    this.helpOpen.set(false)
    this.loadedContext.set(undefined)
    this.refreshAgentDerivedState(prepared.handle.agent)
    try {
      this.instance.rerender(this.appElement(prepared.handle.agent, nextEvents, nextStatus))
      this.resumeDialog.set(undefined)
      this.freshSessionDialog.set(undefined)
      this.rewindDialog.set(undefined)
      this.sessionExportDialog.set(undefined)
    } catch (error: unknown) {
      this.handle = oldHandle
      this.events = oldEvents
      this.status = oldStatus
      this.selection = oldSelection
      this.activeView = oldActiveView
      this.modelSelection.set(oldModel)
      this.agentMode.set(oldMode)
      this.loadedContext.set(oldLoadedContext)
      this.permissions.set(oldPermissions)
      this.contextPressure.set(oldContext)
      this.tokenUsage.set(oldTokenUsage)
      this.contextBreakdown.set(oldContextBreakdown)
      this.sessionStats.set(oldSessionStats)
      this.resumeDialog.set(oldDialog)
      this.freshSessionDialog.set(oldFreshDialog)
      this.rewindDialog.set(oldRewindDialog)
      this.sessionExportDialog.set(oldExportDialog)
      this.instance.rerender(this.appElement(oldAgent, oldEvents, oldStatus))
      throw error
    }
    this.bindWorkRoot(prepared.handle.agent)
    this.scheduleStartupGuidanceRefresh(prepared.selectedModel)
    return oldHandle
  }

  private refreshPermission(agent: Agent): void {
    const service = this.ctx.get('permissionPresets')
    if (service === undefined) {
      this.permissions.set(undefined)
      return
    }
    const currentValue = service.current(agent.session.events)
    if (this.permissions.getSnapshot()?.currentValue === currentValue) return
    this.permissions.set({
      options: [
        ...service.names.map(name => service.optionOf(name)),
        ...currentValue === 'custom' ? [service.optionOf('custom')] : [],
      ],
      currentValue,
    })
  }

  private async activateFooter(agent: Agent, itemId: TuiFooterItemId): Promise<void> {
    if (this.handle?.agent !== agent) throw new Error('TUI Session changed before footer activation')
    if (itemId === 'model') {
      await this.submit(agent, '/models')
      return
    }
    if (itemId === 'mode') {
      await this.submit(agent, '/mode')
      return
    }
    if (itemId !== 'permission') return
    if (this.activeCommand !== undefined) throw new Error('Another TUI command is already running')
    const controller = new AbortController()
    const completion = this.selectPermission(agent, controller.signal)
    const operation = { controller, completion }
    this.activeCommand = operation
    try {
      await completion
    } catch (error: unknown) {
      if (!isTuiQuestionCancellation(error)) throw error
    } finally {
      if (this.activeCommand === operation) this.activeCommand = undefined
    }
  }

  private async selectPermission(agent: Agent, signal: AbortSignal): Promise<void> {
    if (this.handle?.agent !== agent) throw new Error('TUI Session changed before permission selection')
    const service = this.ctx.get('permissionPresets')
    if (service === undefined) throw new Error(tuiMessage(this.locale, 'permissions.unavailable'))
    const choices = service.names.map((value) => {
      const option = service.optionOf(value)
      return {
        value,
        label: option.name === value ? value : `${option.name} (${value})`,
        description: option.description,
      }
    })
    if (choices.length === 0) throw new Error(tuiMessage(this.locale, 'permissions.none'))
    const answer = await this.askOne(agent, signal, {
      id: 'permission-selection',
      header: tuiMessage(this.locale, 'permissions.header'),
      question: tuiMessage(this.locale, 'permissions.question', { current: service.current(agent.session.events) }),
      options: choices.map(choice => ({
        label: choice.label,
        ...choice.description === undefined ? {} : { description: choice.description },
      })),
    })
    const selected = choices.find(choice => choice.label === answer.selected[0])
    if (selected === undefined) throw new Error(tuiMessage(this.locale, 'permissions.cancelled'))
    await this.ctx.commands.execute(agent, `/permission ${selected.value}`, [], signal)
  }

  private interactionSignal(operation: AbortSignal, prompt?: AbortSignal): AbortSignal {
    return prompt === undefined ? operation : AbortSignal.any([operation, prompt])
  }

  private async askOne(
    agent: Agent,
    signal: AbortSignal,
    question: AskUserQuestionItem,
  ): Promise<{ selected: string[]; custom?: string }> {
    const answer = await this.interactions.askQuestion({ questions: [question], agent, signal })
    const item = answer.answers.find(candidate => candidate.id === question.id)
    if (item === undefined) throw new Error(`TUI interaction returned no answer for ${JSON.stringify(question.id)}`)
    return item
  }

  private async authPrompt(
    agent: Agent,
    operationSignal: AbortSignal,
    prompt: LlmAuthenticationPrompt,
  ): Promise<string> {
    if (prompt.type === 'secret') {
      throw new Error(tuiMessage(this.locale, 'auth.secret.unsupported'))
    }
    const signal = this.interactionSignal(operationSignal, prompt.signal)
    if (prompt.type === 'select') {
      const labels = new Map(prompt.options.map(option => [option.label, option.id]))
      const answer = await this.askOne(agent, signal, {
        id: 'oauth-select', header: tuiMessage(this.locale, 'auth.header'), question: prompt.message,
        options: prompt.options.map(option => ({
          label: option.label,
          ...option.description === undefined ? {} : { description: option.description },
        })),
      })
      const label = answer.selected[0]
      const id = label === undefined ? undefined : labels.get(label)
      if (id === undefined) throw new Error(tuiMessage(this.locale, 'auth.select.cancelled'))
      return id
    }
    const answer = await this.askOne(agent, signal, {
      id: 'oauth-text', header: tuiMessage(this.locale, 'auth.header'), question: prompt.message,
      ...prompt.placeholder === undefined ? {} : {
        detail: tuiMessage(this.locale, 'auth.expected', { value: prompt.placeholder }),
      },
    })
    const value = answer.custom?.trim()
    if (value === undefined || value.length === 0) throw new Error(tuiMessage(this.locale, 'auth.input.empty'))
    return value
  }

  private authNotify(event: LlmAuthenticationEvent, signal: AbortSignal): void {
    if (signal.aborted) return
    if (event.type === 'auth-url') {
      this.externalNotice.set(tuiMessage(this.locale, 'auth.browser.complete', { url: event.url }))
      void openExternalUrl(event.url, signal).catch(() => {
        if (!signal.aborted) this.externalNotice.set(tuiMessage(this.locale, 'auth.browser.open', { url: event.url }))
      })
      return
    }
    if (event.type === 'device-code') {
      this.externalNotice.set(tuiMessage(this.locale, 'auth.device', {
        url: event.verificationUri, code: event.userCode,
      }))
      return
    }
    this.externalNotice.set(event.message)
  }

  private async login(
    agent: Agent,
    provider: string,
    method: string,
    signal: AbortSignal,
  ): Promise<void> {
    const interaction: LlmAuthenticationInteraction = {
      signal,
      prompt: prompt => this.authPrompt(agent, signal, prompt),
      notify: (event) => { this.authNotify(event, signal) },
    }
    await hostLogin(this.ctx.llm, provider, method, interaction)
    signal.throwIfAborted()
    this.externalNotice.set(tuiMessage(this.locale, 'models.signin.complete'))
  }

  private async executeModels(invocation: CommandInvocation): Promise<CommandResult> {
    const input = invocation.rawInput.trim().toLocaleLowerCase()
    if (input !== '') return { kind: 'error', text: tuiMessage(this.locale, 'models.usage') }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    const providers = this.ctx.llm.listProviders()

    this.externalNotice.set(tuiMessage(this.locale, 'models.loading'))
    try {
      for (;;) {
        invocation.signal.throwIfAborted()
        const choices: Array<{
          label: string
          description?: string
          selection?: ModelSelection
          login?: { provider: string; method: string }
        }> = []
        for (const provider of providers) {
          const auth = await hostAuthentication(this.ctx.llm, provider.id)
          invocation.signal.throwIfAborted()
          if (!auth.configured) {
            for (const method of auth.methods) {
              choices.push({
                label: `${provider.name} (${provider.id}) · ${method.name}`,
                description: tuiMessage(this.locale, 'models.auth.description'),
                login: { provider: provider.id, method: method.id },
              })
            }
            continue
          }
          const models = await this.ctx.llm.listModels(provider.id)
          invocation.signal.throwIfAborted()
          for (const model of models) {
            choices.push({
              label: `${provider.name} · ${model.name} (${model.id})`,
              description: model.description ?? model.id,
              selection: { provider: provider.id, model: model.id },
            })
          }
        }
        if (choices.length === 0) return { kind: 'error', text: tuiMessage(this.locale, 'models.none') }
        invocation.signal.throwIfAborted()
        this.externalNotice.set('')
        const answer = await this.askOne(invocation.agent, invocation.signal, {
          id: 'model-selection',
          header: tuiMessage(this.locale, 'models.header'),
          question: tuiMessage(this.locale, 'models.question'),
          options: choices.map(choice => ({
            label: choice.label,
            ...choice.description === undefined ? {} : { description: choice.description },
          })),
        })
        const chosen = choices.find(choice => choice.label === answer.selected[0])
        if (chosen === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'models.cancelled') }
        if (chosen.login !== undefined) {
          await this.login(invocation.agent, chosen.login.provider, chosen.login.method, invocation.signal)
          continue
        }
        if (chosen.selection === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'models.row.invalid') }
        const modelInfo = await this.ctx.llm.resolveModelInfo(
          chosen.selection.provider, chosen.selection.model, invocation.signal,
        )
        let requested: ModelSelection = chosen.selection
        if (modelInfo.reasoning !== undefined) {
          const efforts = modelInfo.reasoning.efforts
          const effortLabels = new Map(efforts.map(effort => [`${effort.name} (${effort.id})`, effort]))
          const effortAnswer = await this.askOne(invocation.agent, invocation.signal, {
            id: 'reasoning-effort',
            header: tuiMessage(this.locale, 'models.thinking.header'),
            question: tuiMessage(this.locale, 'models.thinking.question'),
            options: efforts.map(effort => ({
              label: `${effort.name} (${effort.id})`,
              description: effort.description ?? String(effort.id),
            })),
          })
          const effort = effortLabels.get(effortAnswer.selected[0] ?? '')
          if (effort === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'models.thinking.cancelled') }
          requested = { ...requested, reasoningEffort: effort.id }
        }
        const resolved = await this.ctx.llm.resolveCallConfig(requested, invocation.signal)
        invocation.signal.throwIfAborted()
        const selected: ModelSelection = {
          provider: resolved.provider,
          model: resolved.model,
          ...resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort },
        }
        if (this.selection === undefined) throw new Error('TUI model selection is unavailable before Agent setup')
        await this.ctx.agentDefaultModel.saveSelection(selected)
        invocation.signal.throwIfAborted()
        this.selection.current = selected
        this.modelSelection.set(selected)
        this.scheduleStartupGuidanceRefresh(selected)
        return { kind: 'success', text: tuiMessage(this.locale, 'models.selected', { model: chosen.label }) }
      }
    } finally {
      if (!invocation.signal.aborted) this.externalNotice.set('')
    }
  }

  private async submit(
    agent: Agent,
    text: string,
    mode: TuiSubmitMode = 'followup',
    composerAttachments: readonly TuiComposerImageAttachment[] = [],
  ): Promise<string | undefined> {
    if (this.handle?.agent !== agent) throw new Error('TUI Session changed before input submission')
    if (text.startsWith('/')) {
      const controller = new AbortController()
      const command = this.commandForLine(agent, text)
      if (composerAttachments.length > 0 && command !== undefined && !command.acceptsImages) {
        throw new Error(`/${command.name} does not accept image attachments`)
      }
      const completion = (async () => {
        if (composerAttachments.length > 0) {
          this.assertImageAttachmentLimits(composerAttachments)
          await this.assertImageCapableRoute(agent, controller.signal)
        }
        const images = composerAttachments.length === 0
          ? []
          : await this.encodeImageAttachments(composerAttachments, controller.signal)
        return this.ctx.commands.execute(agent, text, images, controller.signal)
      })()
      const operation = { controller, completion }
      this.activeCommand = operation
      let admittedSuccess = false
      try {
        const execution = await completion
        if (execution !== undefined) {
          admittedSuccess = execution.result.kind === 'success'
          if (!admittedSuccess) throw new Error(execution.result.text ?? 'Command failed.')
          return
        }
      } finally {
        if (this.activeCommand === operation) {
          this.activeCommand = undefined
          const exitRequested = admittedSuccess && this.exitAfterCommand === agent
          if (this.exitAfterCommand === agent) this.exitAfterCommand = undefined
          if (admittedSuccess) {
            this.settleSessionExportCommand(agent)
            this.settleRewindCommand(agent)
          }
          if (exitRequested) this.requestExit(0)
        }
      }
    }
    const inputDecision = await this.ctx.tuiExtensions.decide({
      kind: 'input', sessionId: agent.session.id, text, mode, attachmentCount: composerAttachments.length,
    })
    if (inputDecision.outcome === 'deny') throw new Error(inputDecision.reason ?? 'A TUI extension denied this input.')
    let imageBlocks: readonly { type: 'image'; attachment: ImageAttachmentRef }[] = []
    if (composerAttachments.length > 0) {
      const controller = new AbortController()
      const completion = (async () => {
        this.assertImageAttachmentLimits(composerAttachments)
        await this.assertImageCapableRoute(agent, controller.signal)
        return composerAttachments.map(item => ({ type: 'image' as const, attachment: item.ref }))
      })()
      const operation = { controller, completion }
      this.activeCommand = operation
      try {
        imageBlocks = await completion
      } finally {
        if (this.activeCommand === operation) this.activeCommand = undefined
      }
    }
    const message = createUserMessage({
      content: [{ type: 'text', text }, ...imageBlocks],
      source: { kind: 'user' },
    })
    if (agent.status !== 'running') {
      agent.followup(message)
    } else if (mode === 'interrupt') {
      agent.cancel({ kind: 'user' }, { keepInbox: true })
      agent.followup(message)
    } else if (mode === 'followup') {
      agent.followup(message)
    } else {
      agent.steer(message)
    }
    return message.id
  }

  private async submitChild(
    root: Agent,
    view: ActiveTuiAgentView,
    text: string,
    composerAttachments: readonly TuiComposerImageAttachment[] = [],
  ): Promise<string | undefined> {
    if (this.handle?.agent !== root || this.activeView !== view) {
      throw new Error('TUI Agent view changed before input submission')
    }
    const parentId = view.descriptor.parentSession
    if (parentId === undefined) throw new Error('The child Agent view has no direct parent authority')
    const parent = this.ctx.agents.get(parentId)
    if (parent === undefined || view.agent.session.header.parentSession !== parentId) {
      throw new Error('The child Agent direct parent is no longer live')
    }
    if (this.activeCommand !== undefined) throw new Error('Another TUI command or Agent input is already running')
    const inputDecision = await this.ctx.tuiExtensions.decide({
      kind: 'input', sessionId: view.agent.session.id, text, mode: 'followup', attachmentCount: composerAttachments.length,
    })
    if (inputDecision.outcome === 'deny') throw new Error(inputDecision.reason ?? 'A TUI extension denied this input.')
    let imageBlocks: readonly { type: 'image'; attachment: ImageAttachmentRef }[] = []
    if (composerAttachments.length > 0) {
      const preflight = new AbortController()
      const completion = (async () => {
        this.assertImageAttachmentLimits(composerAttachments)
        await this.assertImageCapableRoute(view.agent, preflight.signal)
        return composerAttachments.map(item => ({ type: 'image' as const, attachment: item.ref }))
      })()
      const operation = { controller: preflight, completion }
      this.activeCommand = operation
      try {
        imageBlocks = await completion
      } finally {
        if (this.activeCommand === operation) this.activeCommand = undefined
      }
    }
    const controller = new AbortController()
    const completion = this.ctx.subagents.followup(
      parent,
      view.agent.id,
      [{ type: 'text', text }, ...imageBlocks],
      { source: { kind: 'user' }, signal: controller.signal },
    )
    const operation = { controller, completion }
    this.activeCommand = operation
    try {
      await completion
    } finally {
      if (this.activeCommand === operation) this.activeCommand = undefined
    }
    return undefined
  }

  private requestExit(code: number): void {
    this.requestedExit = Math.max(this.requestedExit, code)
    this.terminal.setInputCursor(undefined)
    this.instance?.unmount()
  }

  private isOwnerDisposed(): boolean {
    return this.ownerDisposed
  }

  private isClosing(): boolean {
    return this.ownerDisposed || this.closing !== undefined
  }

  private readonly onSigint = (): void => { this.requestedExit = 130; this.requestExit(1) }
  private readonly onSigterm = (): void => { this.requestedExit = 143; this.requestExit(1) }

  private installSignals(): void {
    process.once('SIGINT', this.onSigint)
    process.once('SIGTERM', this.onSigterm)
  }

  private shutdown(): Promise<void> {
    this.closing ??= this.doShutdown()
    return this.closing
  }

  private async doShutdown(): Promise<void> {
    process.off('SIGINT', this.onSigint)
    process.off('SIGTERM', this.onSigterm)
    this.terminal.setInputCursor(undefined)
    this.instance?.unmount()
    this.instance = undefined
    this.interactions.dispose()
    this.helpOpen.set(false)
    this.diagnostics.set(undefined)
    this.loadedContext.set(undefined)
    this.startupGuidance.set(undefined)
    const activeCommand = this.activeCommand
    const startupGuidanceRefresh = this.startupGuidanceRefresh
    const activeSessionExport = this.activeSessionExport
    const pluginHubOperation = this.pluginHubOperation
    const resumeScan = this.resumeScan
    const activeAgentSwitch = this.activeAgentSwitch
    const workRefresh = this.workRefresh
    const externalEditor = this.externalEditor
    this.externalEditorHandoff?.cancel()
    this.activeCommand = undefined
    this.startupGuidanceRefresh = undefined
    this.exitAfterCommand = undefined
    this.activeSessionExport = undefined
    this.pluginHubOperation = undefined
    this.resumeScan = undefined
    this.activeAgentSwitch = undefined
    this.workRefresh = undefined
    this.externalEditor = undefined
    activeCommand?.controller.abort(new Error('TUI command cancelled during shutdown'))
    startupGuidanceRefresh?.controller.abort(new Error('TUI startup guidance refresh cancelled during shutdown'))
    activeSessionExport?.controller.abort(new Error('TUI Session export cancelled during shutdown'))
    pluginHubOperation?.controller.abort(new Error('TUI Plugin Hub request cancelled during shutdown'))
    resumeScan?.controller.abort(new Error('TUI Session scan cancelled during shutdown'))
    activeAgentSwitch?.controller.abort(new Error('TUI Agent switch cancelled during shutdown'))
    workRefresh?.controller.abort(new Error('TUI work catalog refresh cancelled during shutdown'))
    externalEditor?.controller.abort(new Error('TUI external editor cancelled during shutdown'))
    this.resumeDialog.set(undefined)
    this.freshSessionDialog.set(undefined)
    this.rewindDialog.set(undefined)
    this.sessionExportDialog.set(undefined)
    this.pluginHubDialog.set(undefined)
    this.activeView = undefined
    this.disposers.approval?.()
    this.disposers.helpCommand?.()
    this.disposers.doctorCommand?.()
    this.disposers.contextCommand?.()
    this.disposers.langCommand?.()
    this.disposers.resumeCommand?.()
    this.disposers.clearCommand?.()
    this.disposers.newCommand?.()
    this.disposers.rewindCommand?.()
    this.disposers.exportCommand?.()
    this.disposers.renameCommand?.()
    this.disposers.quitCommand?.()
    this.disposers.exitCommand?.()
    this.disposers.pluginHubCommand?.()
    this.disposers.pluginHubProgress?.()
    this.disposers.projectionChanged?.()
    this.disposers.modelsCommand?.()
    this.disposers.modeCommand?.()
    this.disposers.llmAdaptersUpdated?.()
    this.disposeWorkRootBindings()
    this.disposers.agentDisposed?.()
    this.disposers.agentCreated?.()
    this.disposers.jobsChanged?.()
    this.disposers.jobsController?.()
    this.disposers.agentStatus?.()
    this.disposers.sessionEvents?.()
    this.disposers.questionProvider?.()
    this.terminal.restore()
    await Promise.all([
      activeCommand?.completion.catch(() => undefined),
      startupGuidanceRefresh?.completion.catch(() => undefined),
      activeSessionExport?.completion.catch(() => undefined),
      pluginHubOperation?.completion.catch(() => undefined),
      resumeScan?.completion.catch(() => undefined),
      activeAgentSwitch?.completion.catch(() => undefined),
      workRefresh?.completion.catch(() => undefined),
      externalEditor?.completion.catch(() => undefined),
    ])
    const handle = this.handle
    this.handle = undefined
    this.events = undefined
    this.status = undefined
    if (handle !== undefined) {
      if (handle.agent.status === 'running') handle.agent.cancel({ kind: 'disposed' })
      await handle.agent.whenIdle().catch(() => undefined)
      await this.ctx.get('sessions')?.flush(handle.agent.session).catch(() => undefined)
      await handle.dispose().catch(() => undefined)
    }
  }
}

function resumeRoute(events: readonly SessionEvent[]): { provider: string; model: string } | undefined {
  const header = events.findLast(event => event.type === 'request/header')
  if (header?.type === 'request/header') {
    return { provider: header.data.header.config.provider, model: header.data.header.config.model }
  }
  const assistant = events.findLast(event => event.type === 'assistant/message')
  return assistant?.type === 'assistant/message'
    ? { provider: assistant.data.message.source.provider, model: assistant.data.message.source.model }
    : undefined
}

function isSessionDescendantOf(
  candidate: Agent,
  rootId: SessionId,
  agents: { get(id: SessionId): Agent | undefined },
): boolean {
  let parentId = candidate.session.header.parentSession
  const visited = new Set<SessionId>([candidate.id])
  while (parentId !== undefined && !visited.has(parentId)) {
    if (parentId === rootId) return true
    visited.add(parentId)
    parentId = agents.get(parentId)?.session.header.parentSession
  }
  return false
}

/** Mount one TUI application lifecycle. */
export function apply(ctx: Context, config: Config): void {
  if (ctx.get('appExit') === undefined) {
    throw new Error('tui: the launcher must provide ctx.appExit before the tree mounts')
  }
  const controller = new TuiController(ctx, config)
  const extensions = new TuiExtensionRegistry()
  ctx.provide('tuiExtensions', extensions)
  ctx.effect(() => () => { extensions.dispose() }, 'tui: extension registry lifecycle')
  installSettingsSection(ctx, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA, DEFAULT_TUI_SETTINGS, {
    setSource: (source) => { controller.setSettingsSource(source) },
    onChange: () => { controller.refreshSettings() },
  })
  ctx.effect(() => async () => { await controller.dispose() }, 'tui: application lifecycle')
  void controller.run()
}

export type {
  TranscriptCompactionNode, TranscriptNode, TranscriptTextNode,
  TranscriptTodoNode, TranscriptToolGroupNode, TranscriptToolNode,
} from './transcript.ts'
export { foldTranscript, TuiTranscriptProjectionCache } from './transcript.ts'
export type { TuiKnownSessionEventRenderer } from './transcript.ts'
export { TuiTranscriptDetailCache, tuiTranscriptDetailText } from './detail.ts'
export {
  addComposerImageAttachment, removeComposerImageAttachment, removeLastComposerImageAttachment,
  createComposerState, deleteComposerText, insertComposerClipboard, insertComposerPasteReference, insertComposerText,
  isLargeComposerPaste, layoutComposer, materializeComposerText, moveComposerCursor,
  redoComposerEdit, replaceComposerText, restoreTuiComposerDraft, toggleTuiComposerStash,
  traverseComposerHistory, tuiComposerDraft, undoComposerEdit,
} from './composer.ts'
export {
  TUI_EXTENSION_ABI_VERSION, TuiExtensionRegistry,
} from './extensions.ts'
export type {
  TuiDialogContribution, TuiExtensionContribution, TuiExtensionIdentity, TuiExtensionListener, TuiExtensionMetadata,
  TuiExtensionRegistration, TuiExtensionSnapshot, TuiManagedDialogKind, TuiSettingsContribution, TuiShortcutContribution,
  TuiCompletedMessageObserverContribution, TuiCompletedMessageObservation,
  TuiDecisionHookContribution, TuiDecisionKind, TuiDecisionRequest, TuiDecisionResult, TuiSessionSwitchOperation,
  TuiStatusContribution, TuiStatusContributionContext, TuiStorageContribution, TuiWorkspaceContribution, TuiWorkspaceOption,
  TuiFullscreenSceneContext, TuiFullscreenSceneFrame, TuiFullscreenSceneContribution,
  TuiKnownSessionEvent, TuiKnownSessionEventRenderResult, TuiKnownSessionEventRendererContribution,
} from './extensions.ts'
export {
  MAX_TUI_STORAGE_QUOTA_BYTES, MIN_TUI_STORAGE_QUOTA_BYTES, TUI_STORAGE_ABI_VERSION,
} from './extension-storage.ts'
export type { TuiPluginLocalStorage, TuiPluginLocalStorageInfo, TuiStorageJson } from './extension-storage.ts'
export { TuiExtensionGrantLedger } from './grant-ledger.ts'
export type { TuiGrantIdentity, TuiGrantLedgerRecord, TuiGrantRef, TuiManagedCapability } from './grant-ledger.ts'
export {
  DEFAULT_TUI_SETTINGS, resolveTuiTheme, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA,
  TUI_MOUSE_PREFERENCES, TUI_THEME_PREFERENCES, TuiThemeProvider, useTuiTheme,
} from './theme.tsx'
export type {
  TuiMousePreference, TuiResolvedThemePreference, TuiSemanticThemeTokens, TuiSettings, TuiTheme, TuiThemePreference,
} from './theme.tsx'
export {
  TUI_LOCALE_CATALOG, TUI_LOCALE_CATALOG_VERSION, TUI_LOCALES, TuiLocaleProvider,
  tuiCommandDescription, tuiCommandDescriptions, tuiLocaleLabel, tuiMessage, useTuiLocale,
} from './locale.ts'
export type { TuiLocale, TuiMessageKey } from './locale.ts'
export { projectTuiLoadedContext, tuiLoadedContextPanelLines } from './loaded-context.ts'
export type {
  TuiLoadedContextInput, TuiLoadedContextPanelLine, TuiLoadedContextRow, TuiLoadedContextSnapshot,
} from './loaded-context.ts'
export type {
  TuiComposerDraft, TuiComposerEditHistory, TuiComposerEditKind,
  TuiComposerImageAttachment, TuiComposerPasteReference, TuiComposerSnapshot, TuiComposerStashTransition,
} from './composer.ts'
export {
  cancelTuiHistorySearch, nextTuiHistorySearchMatch, startTuiHistorySearch,
  tuiHistorySearchResult, updateTuiHistorySearchQuery,
} from './history-search.ts'
export type { TuiHistorySearchResult, TuiHistorySearchState } from './history-search.ts'
export {
  normalizeTuiTranscriptSearchText, resolveTuiTranscriptSearchHit,
  TuiTranscriptSearchIndex, tuiTranscriptSearchSegments,
} from './transcript-search.ts'
export type {
  TuiTranscriptSearchDocument, TuiTranscriptSearchHit, TuiTranscriptSearchSegment,
} from './transcript-search.ts'
export {
  moveTuiFooterSelection, tuiFooterItems, tuiFooterPointerTargets, tuiFooterStatusLine, tuiSelectedFooterLine,
  visibleTuiFooterItems,
} from './footer.ts'
export type {
  TuiFooterItemDescriptor, TuiFooterItemId, TuiFooterPointerTarget, TuiFooterSources, TuiFooterTranscriptPosition,
} from './footer.ts'
export { tuiAgentModeName, tuiAgentModeOptions } from './mode.ts'
export type { TuiAgentModeOption } from './mode.ts'
export { terminalMarkdownText } from './markdown.ts'
export { terminalSafe } from './sanitize.ts'
export {
  filterTuiResumeCandidates, formatTuiRelativeTime,
  sortTuiResumeCandidates, summarizeTuiResumeCandidate,
} from './resume.ts'
export type {
  TuiResumeCandidate, TuiResumeDialogSnapshot, TuiResumePresetSummary, TuiResumeScope,
} from './resume.ts'
export { resolveTuiSessionExportDirectory } from './session-export.ts'
export type { TuiSessionExportDialogSnapshot, TuiSessionExportFormat, TuiSessionExportPhase } from './session-export.ts'
export { tuiRewindCandidates } from './rewind.ts'
export type { TuiRewindCandidate, TuiRewindDialogSnapshot } from './rewind.ts'
export { consumeTuiDoubleEscape, TUI_DOUBLE_ESCAPE_WINDOW_MS } from './double-escape.ts'
export type { TuiDoubleEscapeTransition } from './double-escape.ts'
export {
  acceptTuiSuggestion, commandSuggestionState, moveTuiSuggestion, pathSuggestionQuery, pathSuggestionState,
  visibleTuiSuggestions,
} from './suggestion.ts'
export type {
  TuiPathSuggestionQuery, TuiSuggestionAcceptance, TuiSuggestionItem, TuiSuggestionKind, TuiSuggestionState,
  TuiSuggestionStatus,
} from './suggestion.ts'
export {
  effectiveTuiInteractionDescriptors, matchTuiInteractionAction, resolveTuiInteractionContext,
  resolveTuiInteractionRegistry, TUI_INTERACTION_ACTION_IDS, TUI_INTERACTION_CONTEXT_PRIORITY,
  TUI_INTERACTION_REGISTRY, TUI_KEYBINDING_OVERRIDES_SCHEMA, tuiInteractionHelpLines,
  validateTuiKeybindingOverrides,
} from './keybindings.ts'
export type {
  TuiInteractionActionId, TuiInteractionBinding, TuiInteractionCapabilities, TuiInteractionContext,
  TuiInteractionDescriptor, TuiInteractionHelpLine, TuiInteractionModeState, TuiKeybindingOverrides,
  TuiKeypress,
} from './keybindings.ts'
export {
  formatTuiPluginHubRelativeTime, formatTuiPluginHubStars, tuiPluginHubCardHeight,
  tuiPluginHubCardLayout, tuiPluginHubDetailLines, tuiPluginHubInstalledRows, tuiPluginHubNextSort,
  tuiPluginHubCategoryLabel, tuiPluginHubNextCategory, tuiPluginHubPlanLines, tuiPluginHubRows, tuiPluginHubSortLabel,
} from './plugin-hub.ts'
export type {
  TuiPluginHubCard, TuiPluginHubCardLayout, TuiPluginHubDetailLine, TuiPluginHubDialogSnapshot,
  TuiPluginHubLineTone, TuiPluginHubRow,
} from './plugin-hub.ts'
export { InteractionStore, SessionEventStore } from './store.ts'
export { TerminalSession } from './terminal-session.ts'
export {
  applyTuiTerminalReply, DEFAULT_TUI_TERMINAL_CAPABILITIES,
} from './terminal-session.ts'
export type {
  TuiClipboardResult, TuiTerminalBackground, TuiTerminalCapabilities, TuiTerminalColorDepth, TuiTerminalHandoff,
  TuiTerminalKeyboardProtocol,
  TuiTerminalNegotiationOptions,
} from './terminal-session.ts'
export {
  detectImageMediaType, readTuiClipboard,
} from './clipboard.ts'
export type {
  TuiClipboardEnvironment, TuiClipboardFailureReason, TuiClipboardFiles, TuiClipboardImage,
  TuiClipboardInsert, TuiClipboardPayload, TuiClipboardPlatform, TuiClipboardReadOptions,
  TuiClipboardReadResult,
} from './clipboard.ts'
export {
  externalEditorInternals, parseTuiEditorCommand, resolveTuiEditorArgv, runTuiExternalEditor,
} from './external-editor.ts'
export type { TuiExternalEditorChild, TuiExternalEditorResult } from './external-editor.ts'
export { TuiAgentViewStateCache } from './agent-view.ts'
export type { TuiAgentViewDescriptor } from './agent-view.ts'
export { EMPTY_TUI_WORK_SNAPSHOT, projectTuiWork } from './work.ts'
export type {
  TuiObservedSubagentRun, TuiWorkAgentSnapshot, TuiWorkItemState,
  TuiWorkItemView, TuiWorkProjectionInput, TuiWorkSnapshot, TuiWorkSummary,
} from './work.ts'
export { formatTuiWorkElapsed, formatTuiWorkOwner } from './work-panel.tsx'
export {
  previousTranscriptPageAnchor, selectTranscriptPage, selectTranscriptWindow,
  terminalWrappedLines, tuiTranscriptWindowEntryRows, TuiTranscriptScrollController, TuiTranscriptViewportIndex,
} from './viewport.ts'
export type {
  TuiTranscriptViewportAnchor, TuiTranscriptViewportStats, TuiTranscriptVirtualWindow,
} from './viewport.ts'
export { projectTuiScreenMap } from './screen-map.ts'
export type {
  TuiScreenCell, TuiScreenMap, TuiScreenMapLine, TuiScreenMapOptions, TuiScreenMapRow,
} from './screen-map.ts'
export { tuiBidiGraphemes, tuiBidiVisualText } from './bidi.ts'
export type { TuiBidiGrapheme } from './bidi.ts'
export { tuiFindHyperlinks, tuiHyperlinkAt, tuiOsc8Text, tuiSafeHyperlinkUrl } from './hyperlink.ts'
export type { TuiHyperlinkRange } from './hyperlink.ts'
export {
  advanceTuiScreenClick, resolveTuiScreenSelection, tuiScreenSelectionText, tuiScreenTextSegments,
} from './selection.ts'
export type {
  TuiScreenClick, TuiScreenPosition, TuiScreenSelection, TuiScreenSelectionGesture, TuiScreenTextSegment,
} from './selection.ts'
export {
  TuiPointerRegionRegistry, tuiApprovalPointerRegions, tuiFooterPointerRegions, tuiModalClosePointerRegions,
  tuiPluginHubPointerRegions, tuiQuestionPointerRegions, tuiResumePointerRegions, tuiSuggestionPointerRegions,
  tuiWorkPointerRegions,
} from './pointer.ts'
export type {
  TuiApprovalPointerOptions, TuiPluginHubPointerOptions, TuiPointerAction, TuiPointerHit, TuiPointerPoint,
  TuiPointerRect, TuiPointerRegion, TuiQuestionPointerOptions, TuiResumePointerOptions,
  TuiSuggestionPointerOptions, TuiModalClosePointerOptions,
} from './pointer.ts'
export { TuiTerminalInputDecoder, tuiTerminalMouseReportKind } from './terminal-input.ts'
export type {
  TuiTerminalInputEvent, TuiTerminalInputWait, TuiTerminalMouseReportKind,
} from './terminal-input.ts'
export {
  projectTuiDiagnostics, tuiDiagnosticPanelLines, tuiHostDiagnosticsFromStartup,
} from './diagnostics.ts'
export type {
  TuiDiagnosticInput, TuiDiagnosticPanelLine, TuiDiagnosticRow, TuiDiagnosticSeverity,
  TuiDiagnosticSnapshot, TuiHostDiagnosticSnapshot, TuiHostPackageDiagnostic,
  TuiPluginHubDiagnostic, TuiProviderDiagnostic, TuiRuntimeCapabilityDiagnostics,
} from './diagnostics.ts'
export { inspectTuiStartupProvider, projectTuiStartupGuidance } from './startup-guidance.ts'
export type {
  TuiStartupGuidanceLine, TuiStartupGuidanceSnapshot, TuiStartupProviderInspector, TuiStartupProviderState,
} from './startup-guidance.ts'
