/**
 * `@lingxi-ai-cn/dsh-tui-runtime` — one full-screen terminal frontend over an owned,
 * in-process Agent and its durable Session log.
 */

import { requestTuiExit } from './exit.ts'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import React from 'react'
import { render, type Instance } from 'ink'
import {
  createUserMessage,
  credentialRef,
  errorChain,
  hostAuthentication,
  hostAgentPresets,
  hostDirectoryPickerCapability,
  hostGoals,
  hostFileReferences,
  hostSessionReferences,
  hostSettings,
  hostLogin,
  hostLogout,
  hostReadSessionPreview,
  hostWorkspaceRegistry,
  formatFileMention,
  assembleContextFor,
  installModelSelection,
  installSettingsSection,
  JobId,
  MessageId,
  resolveSessionForkAnchor,
  resolveSessionPreset,
  queueHostSubagentPrompt,
  sessionUsesLegacyCodePreset,
  SESSION_FORMAT_VERSION,
  Session,
  SessionId,
  SessionLogOffset,
  TuiHostCommandCatalog,
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
  type ScheduleRecord,
  type SessionStatsProjection,
  type SubagentDescendantListEntry,
  type SubagentResult,
  type SubagentRunEndInfo,
  type SubagentRunInfo,
  type TokenUsageProjection,
  type TuiAgentPresets,
  type TuiGoalProjection,
  type TuiPlanProjection,
} from './host.ts'
import { SessionLogExportError } from '@lingxi-ai-cn/dsh-session-export'
import { PluginHubError, type PluginCatalogSort, type PluginCategory, type PluginChangePlan, type PluginId } from '@lingxi-ai-cn/dsh-plugin-hub'
import type {} from '@lingxi-ai-cn/dsh-plugin-hub'
import { updateTuiAssistantStream, type TuiAssistantStream } from './assistant-stream.ts'
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
import { canOpenExternalPath, openExternalPath } from './open-path.ts'
import {
  sortTuiResumeCandidates, summarizeTuiResumeCandidate,
  type TuiResumeCandidate, type TuiResumeDialogSnapshot, type TuiResumePresetSummary,
} from './resume.ts'
import {
  collectTuiWorkspaceRows,
  type TuiSessionManagerDialogSnapshot,
  type TuiWorkspaceManagerRow,
} from './session-manager.ts'
import {
  type TuiFreshSessionCommand, type TuiFreshSessionDialogSnapshot,
} from './session-lifecycle.ts'
import { tuiAgentModeName, tuiAgentModeOptions } from './mode.ts'
import {
  collectTuiPresetManager, readTuiPresetComposition, setTuiDefaultPreset, type TuiPresetManagerSnapshot,
} from './preset-manager.ts'
import {
  collectTuiHostPluginCenter,
  type TuiHostPluginCenterSnapshot,
  type TuiHostSettingsMutation,
} from './host-plugin-center.ts'
import { TuiTrajectoryProjectionCache, type TuiTrajectorySnapshot } from './trajectory.ts'
import {
  processDeleteResult, processPutResult, projectMessageFeedback,
  type TuiMessageFeedbackSnapshot,
  type TuiMessageFeedbackMutationState,
} from './message-feedback.ts'
import {
  resolveTuiSessionExportDirectory, type TuiSessionExportDialogSnapshot,
  type TuiSessionExportFormat,
} from './session-export.ts'
import {
  writeTuiOutputMarkdown, type TuiOutputExportKind, type TuiOutputExportResult,
} from './output-export.ts'
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
  DEFAULT_TUI_SETTINGS, resolveTuiTheme, TUI_ACTIVITY_PREFERENCES, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA,
  TUI_MOUSE_PREFERENCES, TUI_PROVIDER_ONBOARDING_VERSION, TUI_THEME_PREFERENCES,
  TuiThemeProvider, type TuiActivityPreference, type TuiCustomThemeDefinition, type TuiSettings, type TuiTheme,
} from './theme.tsx'
import { listTuiCustomThemes, loadTuiCustomTheme } from './custom-theme.ts'
import {
  TUI_LOCALES, TuiLocaleProvider, tuiCommandDescription, tuiCommandDescriptions, tuiLocaleLabel, tuiMessage,
  type TuiLocale, type TuiMessageKey,
} from './locale.ts'
import {
  EMPTY_TUI_WORK_SNAPSHOT, projectTuiWork,
  type TuiObservedSubagentRun, type TuiWorkAgentSnapshot, type TuiWorkItemView, type TuiWorkSnapshot,
} from './work.ts'
import {
  tuiPluginHubAvailableCategories, tuiPluginHubLoadMoreFailure, tuiPluginHubNextCategory, tuiPluginHubNextSort,
  type TuiPluginHubDialogSnapshot,
} from './plugin-hub.ts'
import {
  projectTuiDiagnostics,
  tuiHostDiagnosticsFromStartup,
  type TuiDiagnosticSnapshot,
  type TuiPluginHubDiagnostic,
  type TuiProviderDiagnostic,
  type TuiSessionStorageDiagnostic,
} from './diagnostics.ts'
import {
  inspectTuiStartupProvider,
  type TuiStartupGuidanceSnapshot,
} from './startup-guidance.ts'
import { projectTuiLoadedContext, type TuiLoadedContextSnapshot } from './loaded-context.ts'
import { TuiExtensionRegistry } from './extensions.ts'
import { tuiGroupedCommandHelpLines, tuiMcpStatusLines, tuiUsageTipLines } from './command-help.ts'
import { checkTuiUpdate, tuiUpdateStatus, type TuiUpdateStatus } from './update.ts'
import {
  collectTuiProviderCenter, createTuiCustomProvider, discoverTuiCustomProviderModels,
  removeTuiProviderProfile, saveTuiProviderApiKey, saveTuiProviderEndpoint, saveTuiProviderProfile,
  TuiCustomProviderError, TuiProviderApiKeyError, TuiProviderEndpointError,
  TuiProviderProfileError, TuiProviderRemoveError,
  tuiProviderOnboardingReadiness,
  type TuiCustomProviderDraft, type TuiCustomProviderModelDraft,
  type TuiProviderCenterDialogSnapshot, type TuiProviderCreationTarget, type TuiProviderProfileDraft,
} from './provider-center.ts'
import {
  collectTuiReferenceResolution, preflightTuiReferenceText, type TuiReferenceResolution,
} from './references.ts'
import {
  createTuiGoalPlanProjectionFrame, updateTuiGoalPlanProjectionFrame,
  type TuiGoalPlanProjectionFrame,
} from './goal-plan.ts'
import { preflightAttachments, projectAttachmentRail, tuiAttachmentStoreErrorMessage } from './attachment-intake.ts'
import { preflightTuiSessionStorage } from './storage-preflight.ts'
import {
  collectTuiSchedules, TUI_SCHEDULES_UNAVAILABLE, type TuiScheduleSnapshot,
} from './schedules.ts'

export const name = 'tui'

export const inject = [
  'agentDefaultModel', 'agents', 'sessions', 'sessionPersistence',
  'agentPresets',
  'sessionQuery', 'workspaceRegistry', 'commands', 'userQuestions', 'approval', 'llm', 'tools',
  'fs', 'fileReferences', 'sessionReferenceResolver', 'sessionLogExporter', 'jobs', 'subagents',
  'attachments', 'subprocess',
]

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

function diagnosticFailureLabel(error: unknown, owner: 'provider' | 'Plugin Hub' | 'Session persistence'): string {
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
  assistantStream?: () => void
  agentStatus?: () => void
  approval?: () => void
  modelsCommand?: () => void
  modeCommand?: () => void
  configCommand?: () => void
  helpCommand?: () => void
  doctorCommand?: () => void
  langCommand?: () => void
  contextCommand?: () => void
  providerCommand?: () => void
  updateCommand?: () => void
  skillsCommand?: () => void
  mcpCommand?: () => void
  tipsCommand?: () => void
  btwCommand?: () => void
  workspaceCommand?: () => void
  sessionsCommand?: () => void
  presetsCommand?: () => void
  schedulesCommand?: () => void
  hostPluginsCommand?: () => void
  trajectoryCommand?: () => void
  feedbackCommand?: () => void
  llmAdaptersUpdated?: () => void
  settingsDocumentUpdated?: () => void
  hostPluginStatus?: () => void
  credentialsUpdated?: () => void
  workspaceChanged?: () => void
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
  legacyPresetMigrated: boolean
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

interface DetachedRewindSource {
  readonly id: SessionId
  readonly cwd: string
  readonly events: readonly SessionEvent[]
  readonly selection: ModelSelection
  readonly preset: string
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
  }): Promise<readonly {
    readonly name: string
    readonly description: string
    readonly source: string
    readonly provider: string
    readonly invocation: { readonly userInvocable: boolean }
  }[]>
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
  private readonly assistantStreams = new Map<Agent, TuiAssistantStream>()
  private readonly terminal = new TerminalSession(terminalInternals)
  private commandCatalog!: TuiHostCommandCatalog
  private readonly interactions = new InteractionStore()
  private readonly externalNotice = new ValueStore('')
  private readonly composerPrefill = new ValueStore<{ readonly revision: number; readonly text: string } | undefined>(undefined)
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
  private readonly goalProjection = new ValueStore<TuiGoalProjection | null | undefined>(undefined)
  private readonly planProjection = new ValueStore<TuiPlanProjection | undefined>(undefined)
  private goalPlanProjectionFrame: TuiGoalPlanProjectionFrame<Agent['session']> | undefined
  private readonly resumeDialog = new ValueStore<TuiResumeDialogSnapshot | undefined>(undefined)
  private readonly sessionManager = new ValueStore<TuiSessionManagerDialogSnapshot | undefined>(undefined)
  private readonly presetManagerStore = new ValueStore<TuiPresetManagerSnapshot | undefined>(undefined)
  private readonly schedulesStore = new ValueStore<TuiScheduleSnapshot>(TUI_SCHEDULES_UNAVAILABLE)
  private readonly scheduleDialogStore = new ValueStore<TuiScheduleSnapshot | undefined>(undefined)
  private readonly hostPluginCenterStore = new ValueStore<TuiHostPluginCenterSnapshot | undefined>(undefined)
  private hostPluginCenterGeneration = 0
  private readonly trajectoryStore = new ValueStore<TuiTrajectorySnapshot | undefined>(undefined)
  private readonly trajectoryProjection = new TuiTrajectoryProjectionCache()
  private readonly messageFeedbackStore = new ValueStore<TuiMessageFeedbackSnapshot | undefined>(undefined)
  private readonly feedbackMutationStore = new ValueStore<TuiMessageFeedbackMutationState>({ status: 'idle' })
  private feedbackMutationGeneration = 0
  private readonly freshSessionDialog = new ValueStore<TuiFreshSessionDialogSnapshot | undefined>(undefined)
  private readonly rewindDialog = new ValueStore<TuiRewindDialogSnapshot | undefined>(undefined)
  private readonly sessionExportDialog = new ValueStore<TuiSessionExportDialogSnapshot | undefined>(undefined)
  private readonly pluginHubDialog = new ValueStore<TuiPluginHubDialogSnapshot | undefined>(undefined)
  private readonly providerCenter = new ValueStore<TuiProviderCenterDialogSnapshot | undefined>(undefined)
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
  private providerCenterRefresh: ActiveOperation | undefined
  private providerCenterOperation: ActiveOperation | undefined
  private inkMounted: (() => void) | undefined
  private resumeScan: ActiveOperation | undefined
  private sessionManagerScan: ActiveOperation | undefined
  private sessionManagerGeneration = 0
  private sessionManagerRefreshTimer: ReturnType<typeof setTimeout> | undefined
  private trajectoryLimit = 256
  private detachedRewindSource: DetachedRewindSource | undefined
  private activeAgentSwitch: ActiveAgentSwitch | undefined
  private activeView: ActiveTuiAgentView | undefined
  private resumeGeneration = 0
  private freshSessionGeneration = 0
  private rewindGeneration = 0
  private sessionExportGeneration = 0
  private pluginHubGeneration = 0
  private providerCenterGeneration = 0
  private startupGuidanceGeneration = 0
  private providerOnboardingAcknowledged = false
  private composerPrefillRevision = 0
  private updateCheck: ActiveOperation | undefined
  private themeLoad: ActiveOperation | undefined
  private settingsSource: () => TuiSettings = () => DEFAULT_TUI_SETTINGS
  private locale: TuiLocale = DEFAULT_TUI_SETTINGS.locale
  private mousePreference = DEFAULT_TUI_SETTINGS.mouse
  private activityPreference: TuiActivityPreference = DEFAULT_TUI_SETTINGS.activity
  private customThemeFile: string | undefined
  private customTheme: TuiCustomThemeDefinition | undefined
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
    this.activityPreference = settings.activity
    this.terminal.setMouseMode(settings.mouse === 'auto')
    if (settings.themeFile !== this.customThemeFile) this.scheduleCustomTheme(settings.themeFile)
    this.theme = resolveTuiTheme(
      settings.theme,
      this.terminalColorDepth,
      this.terminalCapabilities?.background ?? 'unknown',
      settings.themeFile === this.customThemeFile ? this.customTheme : undefined,
    )
    this.interactionRegistry = resolveTuiInteractionRegistry(settings.keybindings)
    const root = this.handle?.agent
    if (root === undefined || this.events === undefined || this.status === undefined || this.instance === undefined) return
    this.instance.rerender(this.appElement(root, this.events, this.status))
  }

  private scheduleCustomTheme(fileName: string | undefined): void {
    this.themeLoad?.controller.abort(new Error('TUI custom theme selection changed'))
    this.themeLoad = undefined
    this.customThemeFile = fileName
    this.customTheme = undefined
    if (fileName === undefined) return
    const controller = new AbortController()
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    operation.completion = loadTuiCustomTheme(fileName, controller.signal).then((loaded) => {
      if (controller.signal.aborted || this.themeLoad !== operation || this.customThemeFile !== fileName) return
      this.customTheme = loaded.theme
      const settings = this.settingsSource()
      this.theme = resolveTuiTheme(
        settings.theme,
        this.terminalColorDepth,
        this.terminalCapabilities?.background ?? 'unknown',
        loaded.theme,
      )
      const root = this.handle?.agent
      if (root !== undefined && this.events !== undefined && this.status !== undefined && this.instance !== undefined) {
        this.instance.rerender(this.appElement(root, this.events, this.status))
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted || this.themeLoad !== operation) return
      this.externalNotice.set(tuiMessage(this.locale, 'config.theme.loadFailed', {
        file: fileName, error: errorChain(error),
      }))
    }).finally(() => {
      if (this.themeLoad === operation) this.themeLoad = undefined
    })
    this.themeLoad = operation
  }

  async run(): Promise<void> {
    try {
      this.terminal.assertInteractive()
      this.commandCatalog = new TuiHostCommandCatalog(this.ctx.commands)
      await this.ctx.get('loader')?.await()
      if (this.isOwnerDisposed()) return
      const persistence = this.ctx.get('sessionPersistence')
      if (persistence === undefined) throw new Error('TUI Session persistence service is unavailable')
      await preflightTuiSessionStorage(persistence)
      if (this.isOwnerDisposed()) return
      const prepared = await this.prepareAgent(this.config.resume === undefined
        ? { kind: 'startup' }
        : { kind: 'resume', sessionId: SessionId(this.config.resume) })
      const handle = prepared.handle
      if (this.isOwnerDisposed()) {
        await handle.dispose()
        return
      }
      this.handle = handle
      this.events = new SessionEventStore(handle.agent.session.snapshotEvents())
      this.status = new AgentStatusStore(handle.agent.status)
      this.selection = prepared.selection
      this.modelSelection.set(prepared.selectedModel)
      this.agentMode.set(prepared.preset)
      if (prepared.legacyPresetMigrated) {
        this.externalNotice.set(tuiMessage(this.locale, 'mode.legacy.migrated'))
      }
      void this.refreshFeedback()
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
      this.scheduleUpdateCheck()
      void this.maybeOpenProviderOnboarding(handle.agent)
      const pluginHub = this.ctx.get('pluginHub')
      if (pluginHub !== undefined && pluginHub.hasProvider()) await pluginHub.markMaintenanceReady()
      await this.instance.waitUntilExit()
      this.requestExit(this.requestedExit)
      await this.shutdown()
      if (!this.isOwnerDisposed()) this.ctx.get('appExit')?.(this.requestedExit)
    } catch (error: unknown) {
      if (!this.ownerDisposed) {
        this.terminal.restore()
        terminalInternals.stderr.write(`dsh --profile tui: ${error instanceof Error ? error.message : String(error)}\n`)
      }
      this.requestExit(1)
      await this.shutdown()
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
    const directoryPicker = hostDirectoryPickerCapability(this.ctx)
    const workspaceRegistry = this.ctx.get('workspaceRegistry') as unknown as { unarchiveSession?: unknown } | undefined
    const app = React.createElement(TuiApp, {
      agent,
      view,
      events: activeView?.events ?? rootEvents,
      status: activeView?.status ?? rootStatus,
      interactions: this.interactions,
      externalNotice: this.externalNotice,
      composerPrefill: this.composerPrefill,
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
      goalProjection: this.goalProjection,
      planProjection: this.planProjection,
      resumeDialog: this.resumeDialog,
      sessionManager: this.sessionManager,
      ...(directoryPicker === undefined ? {} : { directoryPicker }),
      freshSessionDialog: this.freshSessionDialog,
      rewindDialog: this.rewindDialog,
      sessionExportDialog: this.sessionExportDialog,
      pluginHubDialog: this.pluginHubDialog,
      providerCenter: this.providerCenter,
      work: this.work,
      extensions: this.ctx.tuiExtensions,
      maxResumeOptions: this.config.maxResumeOptions ?? 8,
      commands: activeView === undefined ? this.commandCatalog.list(root) : [],
      interactionRegistry: this.interactionRegistry,
      activityPreference: this.activityPreference,
      completeReferences: (query, signal) => this.completeReferences(root, agent, query, signal),
      onAttachPath: path => this.attachPath(root, agent, path),
      onTerminalPathPaste: paths => this.pasteTerminalPaths(root, agent, paths),
      onInputCursor: (target) => { this.terminal.setInputCursor(target) },
      onSelectionMouseMode: enabled => this.terminal.setSelectionMouseMode(enabled),
      initialTerminalInput: this.terminal.takeBufferedInput(),
      onCopy: text => this.terminal.copyToClipboard(text),
      onOpenUrl: url => this.openTuiUrl(url),
      onOpenPath: path => this.openTuiPath(root, path),
      pathOpenerAvailable: canOpenExternalPath(),
      onSubmit: (text: string, mode?: TuiSubmitMode, attachments?: readonly TuiComposerImageAttachment[]) => activeView === undefined
        ? this.submit(root, text, mode, attachments)
        : this.submitChild(root, activeView, text, attachments),
      onExternalEditor: draft => this.editExternalDraft(root, agent, draft),
      onClipboardPaste: () => this.pasteClipboard(root, agent),
      onActivateFooter: itemId => this.activateFooter(root, itemId),
      onResume: candidate => this.activateResume(root, candidate),
      onResumeForRename: candidate => this.activateResume(root, candidate, 'rename'),
      onCloseResume: () => { this.closeResume() },
      onCloseSessionManager: () => { this.closeSessionManager() },
      onRefreshSessionManager: () => this.refreshSessionManager(root),
      sessionManagerPreferences: this.settingsSource().sessionManager,
      onUpdateSessionManagerPreferences: patch => this.updateSessionManagerPreferences(patch),
      presetManager: this.presetManagerStore,
      onClosePresetManager: () => { this.closePresetManager() },
      onRefreshPresetManager: () => this.refreshPresetManager(root),
      schedules: this.schedulesStore,
      scheduleDialog: this.scheduleDialogStore,
      onCloseScheduleDialog: () => { this.closeScheduleDialog() },
      onCopyPreset: (sourceId, newId, displayName) => this.copyPreset(root, sourceId, newId, displayName),
      onDeletePreset: id => this.deletePreset(root, id),
      onSetDefaultPreset: (id, expectedRevision) => this.setDefaultPreset(root, id, expectedRevision),
      onReadPresetComposition: id => readTuiPresetComposition(hostAgentPresets(root.ctx), id),
      onOpenPresetFile: id => this.openPresetFile(root, id),
      onOpenPresetLocation: id => this.openPresetLocation(root, id),
      hostPluginCenter: this.hostPluginCenterStore,
      onCloseHostPluginCenter: () => { this.closeHostPluginCenter() },
      onRefreshHostPluginCenter: () => this.refreshHostPluginCenter(),
      onMutateHostSettings: mutation => this.mutateHostSettings(mutation),
      trajectory: this.trajectoryStore,
      onCloseTrajectory: () => { this.closeTrajectory() },
      onRefreshTrajectory: () => { this.openTrajectory() },
      onLoadOlderTrajectory: () => { this.loadOlderTrajectory() },
      messageFeedback: this.messageFeedbackStore,
      feedbackMutation: this.feedbackMutationStore,
      onSubmitFeedback: async (messageId: string, rating: 'positive' | 'negative', note?: string) => {
        await this.submitFeedback(messageId, rating, note)
      },
      onClearFeedback: async (messageId: string) => {
        await this.clearFeedback(messageId)
      },
      onRefreshFeedback: async () => {
        await this.refreshFeedback()
      },
      onResumeManagedSession: candidate => this.activateManagedResume(root, candidate),
      onForkManagedSession: candidate => this.openManagedFork(root, candidate),
      onRenameManagedSession: (candidate, title) => this.renameManagedSession(root, candidate, title),
      onArchiveManagedSession: (candidate, archived) => this.setManagedSessionArchived(root, candidate, archived),
      canUnarchiveManagedSessions: typeof workspaceRegistry?.unarchiveSession === 'function',
      onCreateManagedWorkspace: path => this.createManagedWorkspace(root, path),
      onRenameManagedWorkspace: (workspace, title) => this.renameManagedWorkspace(root, workspace, title),
      onMoveManagedWorkspace: (workspace, direction) => this.moveManagedWorkspace(root, workspace, direction),
      onDeleteManagedWorkspace: workspace => this.deleteManagedWorkspace(root, workspace),
      onEditGoal: objective => this.editGoal(root, objective),
      onPauseGoal: () => this.pauseGoal(root),
      onResumeGoal: () => this.resumeGoal(root),
      onClearGoal: () => this.clearGoal(root),
      onExitPlan: () => this.submit(root, '/plan off').then(() => undefined),
      onConfirmFreshSession: () => this.activateFreshSession(root),
      onCloseFreshSession: () => { this.closeFreshSession() },
      onRewind: candidate => this.activateRewind(root, candidate),
      onCloseRewind: () => { this.closeRewind() },
      onExportSession: (directory, includeDescendants, format) => this.activateSessionExport(
        root, directory, includeDescendants, format,
      ),
      onCloseSessionExport: () => { this.closeSessionExport() },
      onExportOutput: (markdown, kind) => this.exportTuiOutput(agent, markdown, kind),
      onClosePluginHub: () => { this.closePluginHub() },
      onPluginHubToggleView: targetView => this.togglePluginHubView(root, targetView),
      onPluginHubSearch: query => this.searchPluginHubInput(root, query),
      onPluginHubDetail: pluginId => this.openPluginHubDetail(root, pluginId),
      onPluginHubDiscoveryDetail: (repositoryId) => { this.openPluginHubDiscoveryDetail(root, repositoryId) },
      onPluginHubInstall: () => this.planPluginHubInstall(root),
      onPluginHubRemove: packageName => this.planPluginHubRemove(root, packageName),
      onPluginHubConfirm: () => this.confirmPluginHubPlan(root),
      onPluginHubRefresh: () => this.refreshPluginHub(root),
      onPluginHubLoadMore: () => this.loadMorePluginHub(root),
      onPluginHubSort: () => this.sortPluginHub(root),
      onPluginHubCategory: () => this.cyclePluginHubCategory(root),
      onPluginHubInstallable: () => this.togglePluginHubInstallable(root),
      onCloseProviderCenter: () => { this.closeProviderCenter() },
      onRefreshProviderCenter: () => this.refreshProviderCenter(root),
      onAuthenticateProvider: provider => this.authenticateProvider(root, provider),
      onLogoutProvider: provider => this.logoutProvider(root, provider),
      onSaveProviderApiKey: (provider, key) => this.saveProviderApiKey(root, provider, key),
      onSaveProviderEndpoint: (provider, endpoint) => this.saveProviderEndpoint(root, provider, endpoint),
      onSaveProviderProfile: (provider, draft) => this.saveProviderProfile(root, provider, draft),
      onRemoveProvider: provider => this.removeProvider(root, provider),
      onDiscoverCustomProviderModels: (target, draft) => this.discoverCustomProviderModels(root, target, draft),
      onCreateCustomProvider: (target, draft) => this.createCustomProvider(root, target, draft),
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

  private async completeReferences(
    root: Agent,
    agent: Agent,
    query: string,
    signal: AbortSignal,
  ): Promise<TuiReferenceResolution> {
    if (!this.ownsView(root, agent)) throw new Error('TUI Agent view changed before reference completion')
    return collectTuiReferenceResolution(query, {
      files: (value, activeSignal) => hostFileReferences(this.ctx).list(agent, value, activeSignal),
      sessions: (value, activeSignal) => hostSessionReferences(this.ctx)
        .listCandidates(agent, value, 24, activeSignal),
    }, signal)
  }

  private async attachPath(root: Agent, agent: Agent, path: string): Promise<ImageAttachmentRef> {
    if (!this.ownsView(root, agent)) throw new Error('TUI Agent view changed before image attachment')
    const mediaType = IMAGE_EXTENSIONS[extname(path).toLowerCase()]
    if (mediaType === undefined) {
      throw new Error(tuiMessage(this.locale, 'attachment.path.unsupported', { path }))
    }
    const cwd = agent.session.header.cwd ?? process.cwd()
    const target = await this.ctx.fs.resolve(path, { cwd })
    const info = await this.ctx.fs.stat(target)
    if (info === undefined) throw new Error(tuiMessage(this.locale, 'attachment.path.notFound', { path }))
    if (info.type !== 'file') throw new Error(tuiMessage(this.locale, 'attachment.path.notRegular', { path }))
    const byteCap = Math.min(
      this.ctx.attachments.imageLimits.maxImageBytes,
      this.ctx.attachments.imageLimits.maxMessageImageBytes,
    )
    let data: Uint8Array
    try {
      data = await this.ctx.fs.readBytes(target, undefined, byteCap)
    } catch (error: unknown) {
      throw new Error(tuiMessage(this.locale, 'attachment.path.readFailed', { path }), { cause: error })
    }
    return await this.saveImageBytes(data, mediaType, basename(target.displayPath), path)
  }

  private async saveImageBytes(
    data: Uint8Array,
    mediaType: ImageMediaType,
    name: string,
    displayPath: string,
  ): Promise<ImageAttachmentRef> {
    const byteCap = Math.min(
      this.ctx.attachments.imageLimits.maxImageBytes,
      this.ctx.attachments.imageLimits.maxMessageImageBytes,
    )
    if (data.byteLength > byteCap) {
      throw new Error(tuiMessage(this.locale, 'attachment.path.tooLarge', { path: displayPath, max: byteCap }))
    }
    if (detectImageMediaType(data) !== mediaType) {
      throw new Error(tuiMessage(this.locale, 'attachment.path.bytesMismatch', { path: displayPath }))
    }
    try {
      return await this.ctx.attachments.saveImage({
        data,
        mediaType,
        name,
      })
    } catch (error: unknown) {
      throw new Error(tuiAttachmentStoreErrorMessage(error, 'save', this.locale), { cause: error })
    }
  }

  private async intakePathList(
    root: Agent,
    agent: Agent,
    paths: readonly string[],
    fallbackToText: boolean,
  ): Promise<TuiClipboardInsert | undefined> {
    if (!this.ownsView(root, agent)) throw new Error('TUI Agent view changed before path intake')
    const cwd = agent.session.header.cwd ?? process.cwd()
    const analyzed: Array<{
      readonly path: string
      readonly mediaType?: ImageMediaType
      readonly mention?: string
    }> = []
    for (const path of paths) {
      let info: Awaited<ReturnType<Context['fs']['stat']>>
      try {
        const target = await this.ctx.fs.resolve(path, { cwd })
        info = await this.ctx.fs.stat(target)
      } catch {
        if (fallbackToText) return undefined
        throw new Error(tuiMessage(this.locale, 'attachment.path.inspectFailed', { path }))
      }
      if (info === undefined) {
        if (fallbackToText) return undefined
        throw new Error(tuiMessage(this.locale, 'attachment.path.notFound', { path }))
      }
      if (info.type !== 'file' && info.type !== 'directory') {
        if (fallbackToText) return undefined
        throw new Error(tuiMessage(this.locale, 'attachment.path.notRegular', { path }))
      }
      const mediaType = info.type === 'file' ? IMAGE_EXTENSIONS[extname(path).toLowerCase()] : undefined
      if (mediaType !== undefined) {
        analyzed.push({ path, mediaType })
        continue
      }
      const mention = formatFileMention({ path, kind: 'file' }, false)
      if (mention === undefined) {
        if (fallbackToText) return undefined
        throw new Error(tuiMessage(this.locale, 'attachment.path.unsafeReference', { path }))
      }
      analyzed.push({ path, mention })
    }
    if (!this.ownsView(root, agent)) throw new Error('TUI Agent view changed before path intake')
    const attachments: ImageAttachmentRef[] = []
    for (const item of analyzed) {
      if (item.mediaType !== undefined) attachments.push(await this.attachPath(root, agent, item.path))
    }
    const mentions = analyzed.flatMap(item => item.mention === undefined ? [] : [item.mention])
    return {
      text: mentions.length === 0 ? '' : `${mentions.join(' ')} `,
      attachments: Object.freeze(attachments),
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
        result.payload.name,
      )
      return { text: '', attachments: [ref] }
    }
    const insert = await this.intakePathList(root, agent, result.payload.paths, false)
    if (insert === undefined) throw new Error('Typed clipboard file intake unexpectedly returned no result')
    return insert
  }

  private pasteTerminalPaths(
    root: Agent,
    agent: Agent,
    paths: readonly string[],
  ): Promise<TuiClipboardInsert | undefined> {
    return this.intakePathList(root, agent, paths, true)
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

  private async openTuiPath(agent: Agent, value: string): Promise<void> {
    const path = resolve(agent.session.header.cwd ?? process.cwd(), value)
    if (!canOpenExternalPath()) {
      this.externalNotice.set(tuiMessage(this.locale, 'path.open.unavailable', { path }))
      return
    }
    const controller = new AbortController()
    try {
      await openExternalPath(path, controller.signal)
      this.externalNotice.set(tuiMessage(this.locale, 'path.opening', { path }))
    } catch {
      this.externalNotice.set(tuiMessage(this.locale, 'path.open.failed', { path }))
    }
  }

  private async assertImageCapableRoute(agent: Agent, signal: AbortSignal): Promise<void> {
    const routed = agent.session.requestHeader()?.config
    const provider = routed?.provider ?? agent.options.provider
    const model = routed?.model ?? agent.options.model
    if (provider === undefined || model === undefined) {
      throw new Error(tuiMessage(this.locale, 'attachment.preflight.selectModel'))
    }
    const info = await this.ctx.llm.resolveModelInfo(provider, model, signal)
    if (info.inputModalities === undefined || !info.inputModalities.includes('image')) {
      throw new Error(tuiMessage(this.locale, 'attachment.preflight.noVisionModel', { model }))
    }
  }

  private assertImageAttachmentLimits(attachments: readonly TuiComposerImageAttachment[]): void {
    const result = preflightAttachments(
      projectAttachmentRail(attachments), this.ctx.attachments.imageLimits, true, this.locale,
    )
    if (!result.ok) throw new Error(result.message)
  }

  private async encodeImageAttachments(
    attachments: readonly TuiComposerImageAttachment[],
    signal: AbortSignal,
  ): Promise<readonly EncodedImageAttachment[]> {
    const encoded: EncodedImageAttachment[] = []
    for (const item of attachments) {
      let stored: Awaited<ReturnType<Context['attachments']['readImage']>>
      try {
        stored = await this.ctx.attachments.readImage(item.ref, signal)
      } catch (error: unknown) {
        throw new Error(tuiAttachmentStoreErrorMessage(error, 'read', this.locale), { cause: error })
      }
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
      acceptsImages: descriptor.input?.attachments === true,
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
      : this.settingsSource().defaultModel ?? defaultModel.currentSelection()
    const resolvedDefault = await this.ctx.llm.resolveCallConfig(configuredSelection, signal)
    const defaultSelection: ModelSelection = {
      provider: resolvedDefault.provider,
      model: resolvedDefault.model,
      ...resolvedDefault.reasoningEffort === undefined ? {} : { reasoningEffort: resolvedDefault.reasoningEffort },
    }
    const selected: ModelSelectionRef = { current: defaultSelection, assembled: undefined }
    let mountedPreset: AgentPreset | undefined
    const migration = { legacyPreset: false }
    const setup = async (agentCtx: Context, unpublishedAgent: Agent): Promise<void> => {
      const session = unpublishedAgent.session
      const presetId = request.kind === 'resume'
        ? this.assertResumeCompatible(session.header, session.snapshotEvents())
        : resolvedPreset?.id
      migration.legacyPreset = request.kind === 'resume' && sessionUsesLegacyCodePreset({
        header: session.header,
        events: session.snapshotEvents(),
      })
      if (presetId === undefined) throw new Error('TUI Agent setup has no resolved Agent preset')
      const logged = session.requestHeader()?.config
      if (logged !== undefined) {
        selected.current = {
          provider: logged.provider,
          model: logged.model,
          ...logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort },
        }
      } else if (request.kind === 'resume') {
        const route = resumeRoute(session.snapshotEvents())
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
              isSeeded: true,
            },
        ...request.kind === 'rewind'
          ? { seed: request.seed, inheritedEventCount: SessionLogOffset(request.seed.length) }
          : {},
        agentOptions: { provider: defaultSelection.provider, model: defaultSelection.model },
        setup,
        ...signal === undefined ? {} : { signal },
      }, request.kind === 'fresh' ? request.source : request.kind === 'rewind' ? 'rewind' : 'startup'))
    }
    if (mountedPreset === undefined) {
      await handle.dispose().catch(() => undefined)
      throw new Error('TUI Agent was created without a mounted Agent preset')
    }
    if (migration.legacyPreset) {
      handle.agent.session.append('agent-preset/selected', { agentPreset: 'ptc' })
    }
    return {
      handle,
      selection: selected,
      selectedModel: selected.current ?? defaultSelection,
      preset: mountedPreset,
      legacyPresetMigrated: migration.legacyPreset,
    }
  }

  private assertResumeCompatible(
    header: Agent['session']['header'],
    events: readonly SessionEvent[],
  ): string {
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
    const snapshot = projections?.snapshot(agent.session)
    const values = snapshot?.values
    this.contextPressure.set(values?.contextPressure)
    this.tokenUsage.set(values?.tokenUsage)
    this.contextBreakdown.set(values?.contextBreakdown)
    this.sessionStats.set(values?.sessionStats)
    const schedules = collectTuiSchedules(values?.schedule)
    this.schedulesStore.set(schedules)
    if (this.scheduleDialogStore.getSnapshot() !== undefined) this.scheduleDialogStore.set(schedules)
    const frame = createTuiGoalPlanProjectionFrame(
      agent.session,
      snapshot?.asOfSeq ?? agent.session.seq,
      values?.goal,
      values?.plan,
    )
    this.goalPlanProjectionFrame = frame
    this.goalProjection.set(frame.goal)
    this.planProjection.set(frame.plan)
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
        authentication: id => hostAuthentication(this.ctx, id),
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
      const root = this.handle?.agent
      if (root !== undefined && this.providerCenter.getSnapshot() !== undefined) void this.refreshProviderCenter(root)
    })
    this.disposers.settingsDocumentUpdated = this.ctx.on('settings/document-updated', () => {
      const root = this.handle?.agent
      if (root !== undefined && this.providerCenter.getSnapshot() !== undefined) void this.refreshProviderCenter(root)
      if (this.hostPluginCenterStore.getSnapshot() !== undefined) void this.refreshHostPluginCenter()
    })
    this.disposers.hostPluginStatus = this.ctx.on('internal/status', () => {
      if (this.hostPluginCenterStore.getSnapshot() !== undefined) void this.refreshHostPluginCenter()
    })
    const refreshProviderCredentials = (): void => {
      const root = this.handle?.agent
      if (root !== undefined && this.providerCenter.getSnapshot() !== undefined) void this.refreshProviderCenter(root)
    }
    const disposeCredentialRecord = this.ctx.on('credentials/record-updated', refreshProviderCredentials)
    const disposeCredentialReference = this.ctx.on('credentials/reference-updated', refreshProviderCredentials)
    this.disposers.credentialsUpdated = () => {
      disposeCredentialRecord()
      disposeCredentialReference()
    }
    this.disposers.workspaceChanged = this.ctx.on('domain/changed', (change) => {
      if (change.domain !== 'workspace' || this.sessionManager.getSnapshot() === undefined) return
      if (this.sessionManagerRefreshTimer !== undefined) clearTimeout(this.sessionManagerRefreshTimer)
      this.sessionManagerRefreshTimer = setTimeout(() => {
        this.sessionManagerRefreshTimer = undefined
        const root = this.handle?.agent
        const dialog = this.sessionManager.getSnapshot()
        if (root !== undefined && dialog?.phase === 'ready' && this.activeAgentSwitch === undefined) {
          void this.refreshSessionManager(root)
        }
      }, 25)
    })
    const projections = this.ctx.get('sessionProjections')
    if (projections !== undefined) {
      this.disposers.projectionChanged = projections.onChanged((session, key, value, seq) => {
        if (session === this.handle?.agent.session) {
          if (key === 'contextPressure') this.contextPressure.set(value as ContextPressureProjection)
          if (key === 'tokenUsage') this.tokenUsage.set(value as TokenUsageProjection)
          if (key === 'contextBreakdown') this.contextBreakdown.set(value as ContextBreakdownProjection)
          if (key === 'sessionStats') this.sessionStats.set(value as SessionStatsProjection)
          if (key === 'schedule') {
            const schedules = collectTuiSchedules(value as readonly ScheduleRecord[])
            this.schedulesStore.set(schedules)
            if (this.scheduleDialogStore.getSnapshot() !== undefined) this.scheduleDialogStore.set(schedules)
          }
          if (key === 'goal' || key === 'plan') {
            const frame = this.goalPlanProjectionFrame
            if (frame !== undefined) {
              const next = updateTuiGoalPlanProjectionFrame(
                frame, session, key, value as TuiGoalProjection | TuiPlanProjection | null, seq,
              )
              if (next !== frame) {
                this.goalPlanProjectionFrame = next
                if (key === 'goal') this.goalProjection.set(next.goal)
                else this.planProjection.set(next.plan)
              }
            }
          }
        }
        if (key === 'subagentTiming' && this.workCatalog.some(entry => entry.id === session.id)) {
          this.rebuildWorkSnapshot()
        }
      })
    }
    this.disposers.assistantStream = this.ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      const root = this.handle?.agent
      if (root === undefined || (agent !== root && !isSessionDescendantOf(agent, root.id, this.ctx.agents))) return
      const next = updateTuiAssistantStream(this.assistantStreams.get(agent), frame)
      if (next === undefined) this.assistantStreams.delete(agent)
      else this.assistantStreams.set(agent, next)
      if (agent === root) this.events?.stream.set(next)
      if (agent === this.activeView?.agent) this.activeView.events.stream.set(next)
    })
    this.disposers.sessionEvents = this.ctx.on('session/event', (session, event) => {
      if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
        for (const [owner, stream] of this.assistantStreams) {
          if (owner.session === session && stream.turn === event.data.turn && stream.step === event.data.step) {
            this.assistantStreams.delete(owner)
          }
        }
      }
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
        if (this.trajectoryStore.getSnapshot() !== undefined) {
          this.openTrajectory()
        }
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
      this.assistantStreams.delete(agent)
      const root = this.handle?.agent
      if (root === undefined || agent === root) return
      if (agent === this.activeView?.agent) {
        this.showRootView(root, `Agent ${agent.id} settled; returned to the root transcript.`)
      }
      if (this.workCatalog.some(entry => entry.id === agent.id)) this.scheduleWorkCatalogRefresh(root)
    })
    this.disposers.questionProvider = this.ctx.on('user-questions/request', (request, next) => {
      const root = this.handle?.agent
      if (root === undefined || request.agent !== root) return next()
      this.showRootView(root)
      return this.interactions.askQuestion(request)
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
      description: 'Configure TUI theme, activity, language, and keybindings',
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
    this.disposers.providerCommand = this.commandCatalog.register({
      name: 'provider',
      description: 'Inspect provider setup and authentication',
      completion: { descriptions: tuiCommandDescriptions('command.provider') },
      handler: invocation => this.executeProvider(invocation),
    })
    this.disposers.updateCommand = this.commandCatalog.register({
      name: 'update',
      description: 'Check for a compatible TUI update',
      completion: { descriptions: tuiCommandDescriptions('command.update') },
      handler: invocation => this.executeUpdate(invocation),
    })
    this.disposers.skillsCommand = this.commandCatalog.register({
      name: 'skills',
      description: 'Browse user-invocable skills',
      completion: { descriptions: tuiCommandDescriptions('command.skills') },
      handler: invocation => this.executeQuestionCommand(
        'skills.cancelled', () => this.executeSkills(invocation),
      ),
    })
    this.disposers.mcpCommand = this.commandCatalog.register({
      name: 'mcp',
      description: 'Inspect MCP tools visible to this Agent',
      completion: { descriptions: tuiCommandDescriptions('command.mcp') },
      handler: invocation => this.executeMcp(invocation),
    })
    this.disposers.tipsCommand = this.commandCatalog.register({
      name: 'tips',
      description: 'Show practical TUI usage tips',
      completion: { descriptions: tuiCommandDescriptions('command.tips') },
      handler: invocation => this.executeTips(invocation),
    })
    this.disposers.btwCommand = this.commandCatalog.register({
      name: 'btw',
      description: 'Ask a durable side question without interrupting the root Agent',
      input: { hint: '<question>' },
      completion: { descriptions: tuiCommandDescriptions('command.btw') },
      handler: invocation => this.executeBtw(invocation),
    })
    this.disposers.workspaceCommand = this.commandCatalog.register({
      name: 'workspace',
      description: 'Manage Workspaces or start a fresh Session at a path',
      input: { hint: '[path]' },
      completion: { descriptions: tuiCommandDescriptions('command.workspace') },
      handler: invocation => this.executeQuestionCommand(
        'workspace.cancelled', () => this.executeWorkspace(invocation),
      ),
    })
    this.disposers.sessionsCommand = this.commandCatalog.register({
      name: 'sessions',
      description: 'Manage Sessions and Workspaces',
      completion: { descriptions: tuiCommandDescriptions('command.sessions') },
      handler: invocation => this.executeSessions(invocation),
    })
    this.disposers.presetsCommand = this.commandCatalog.register({
      name: 'presets',
      description: tuiMessage(this.locale, 'presets.command'),
      handler: (invocation) => {
        void this.openPresetManager(invocation.agent)
        return { kind: 'success' }
      },
    })
    this.disposers.schedulesCommand = this.commandCatalog.register({
      name: 'schedules',
      description: tuiMessage(this.locale, 'schedules.command'),
      handler: (invocation) => {
        this.openScheduleDialog(invocation.agent)
        return { kind: 'success' }
      },
    })
    this.disposers.feedbackCommand = this.commandCatalog.register({
      name: 'message-feedback',
      description: tuiMessage(this.locale, 'feedback.command'),
      handler: (_invocation) => {
        void this.refreshFeedback().then(() => {
          this.externalNotice.set(tuiMessage(this.locale, 'feedback.command.hint'))
        })
        return { kind: 'success' }
      },
    })
    this.disposers.trajectoryCommand = this.commandCatalog.register({
      name: 'trajectory',
      description: tuiMessage(this.locale, 'trajectory.command'),
      handler: (_invocation) => {
        this.openTrajectory()
        return { kind: 'success' }
      },
    })
    this.disposers.hostPluginsCommand = this.commandCatalog.register({
      name: 'host-plugins',
      description: tuiMessage(this.locale, 'hostPlugins.command'),
      handler: (_invocation) => {
        void this.openHostPluginCenter()
        return { kind: 'success' }
      },
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
        route: {
          ...child.options.provider === undefined ? {} : { provider: child.options.provider },
          ...child.options.model === undefined ? {} : { model: child.options.model },
          ...child.options.reasoningEffort === undefined ? {} : { reasoningEffort: child.options.reasoningEffort },
          ...child.options.maxTokens === undefined ? {} : { maxTokens: child.options.maxTokens },
          source: 'live-agent',
        },
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
        events: new SessionEventStore(child.session.snapshotEvents()),
        status: new AgentStatusStore(child.status),
      }
      this.activeView.events.stream.set(this.assistantStreams.get(child))
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
    this.pluginHubDialog.set({ generation, phase: 'loading', view: 'discover', initialQuery: query, sort: 'stars', installableOnly: false,
      profileMutations: pluginHub.supportsProfileMutations() })
    void this.searchPluginHub(invocation.agent, query, 'stars', null)
    return { kind: 'success', text: tuiMessage(this.locale, 'plugin.command.opened') }
  }

  private async searchPluginHub(
    root: Agent,
    query: string,
    requestedSort?: PluginCatalogSort,
    requestedCategory?: PluginCategory | null,
    requestedInstallableOnly?: boolean,
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
    const installableOnly = requestedInstallableOnly ?? snapshot.installableOnly === true
    this.pluginHubDialog.set({ ...snapshot, phase: 'loading', initialQuery: normalizedQuery, sort, page: undefined,
      ...(category === undefined ? { category: undefined } : { category }), installableOnly, loadingMore: false,
      detail: undefined, discoveryDetail: undefined, progress: undefined, error: undefined })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = Promise.all([
      pluginHub.status(controller.signal).catch(() => undefined),
      pluginHub.search({ query: normalizedQuery, ...(category === undefined ? {} : { category }),
        ...(installableOnly ? { installable: true } : {}), sort, limit: 20 }, controller.signal),
    ]).then(([status, page]) => {
      if (controller.signal.aborted || this.pluginHubOperation !== operation
        || this.handle?.agent !== root || this.pluginHubDialog.getSnapshot()?.generation !== generation) return
      this.pluginHubDialog.set({ generation, phase: 'browse', view: 'discover', initialQuery: normalizedQuery, sort,
        profileMutations: snapshot.profileMutations,
        ...(category === undefined ? { category: undefined } : { category }), installableOnly, page,
        availableCategories: category === undefined && !installableOnly
          ? tuiPluginHubAvailableCategories(page)
          : snapshot.availableCategories,
        loadingMore: false,
        ...(status === undefined ? {} : { status }) })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || this.pluginHubOperation !== operation
        || this.pluginHubDialog.getSnapshot()?.generation !== generation) return
      if (error instanceof PluginHubError && error.code === 'INVALID_CURSOR') {
        const current = this.pluginHubDialog.getSnapshot()
        if (current !== undefined) this.pluginHubDialog.set({ ...current, page: undefined, loadingMore: false, phase: 'loading', error: undefined })
        void this.searchPluginHub(root, normalizedQuery, sort, category ?? null, installableOnly)
        return
      }
      this.pluginHubDialog.set({ generation, phase: 'error', view: 'discover', initialQuery: normalizedQuery,
        profileMutations: snapshot.profileMutations,
        sort, ...(category === undefined ? { category: undefined } : { category }), installableOnly, loadingMore: false,
        error: tuiMessage(this.locale, 'plugin.error.catalog', { error: errorChain(error) }) })
    }).finally(() => {
      if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
    })
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private async searchPluginHubInput(root: Agent, query: string): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot?.view === 'discovery') {
      await this.searchPluginHubDiscovery(root, query, snapshot.sort === 'relevance' ? 'stars' : snapshot.sort)
      return
    }
    await this.searchPluginHub(root, query)
  }

  private async searchPluginHubDiscovery(
    root: Agent, query: string, sort: 'stars' | 'updated' | 'newest' = 'stars',
  ): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (pluginHub === undefined || snapshot === undefined || this.handle?.agent !== root) return
    this.pluginHubOperation?.controller.abort(new Error('Plugin Hub discovery request replaced'))
    const controller = new AbortController()
    const generation = snapshot.generation
    const normalizedQuery = query.slice(0, 160)
    this.pluginHubDialog.set({ generation, phase: 'loading', view: 'discovery', profileMutations: snapshot.profileMutations,
      initialQuery: normalizedQuery, sort, category: snapshot.category, installableOnly: snapshot.installableOnly,
      availableCategories: snapshot.availableCategories,
      discoveryPage: undefined, loadingMore: false })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = pluginHub.searchRepositories({ query: normalizedQuery, sort, limit: 20 }, controller.signal).then((page) => {
      if (!this.ownsPluginHubOperation(root, generation, operation)) return
      this.pluginHubDialog.set({ generation, phase: 'browse', view: 'discovery', profileMutations: snapshot.profileMutations,
        initialQuery: normalizedQuery, sort, category: snapshot.category, installableOnly: snapshot.installableOnly,
        availableCategories: snapshot.availableCategories, discoveryPage: page, loadingMore: false })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || !this.ownsPluginHubGeneration(root, generation)) return
      this.pluginHubDialog.set({ generation, phase: 'error', view: 'discovery', profileMutations: snapshot.profileMutations,
        initialQuery: normalizedQuery, sort, category: snapshot.category, installableOnly: snapshot.installableOnly,
        availableCategories: snapshot.availableCategories, discoveryPage: undefined, loadingMore: false,
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
    if (snapshot === undefined || snapshot.phase === 'handoff'
      || this.handle?.agent !== root) return
    if (snapshot.view === 'discovery') {
      const next = tuiPluginHubNextSort(snapshot.sort)
      await this.searchPluginHubDiscovery(root, snapshot.initialQuery, next === 'relevance' ? 'stars' : next)
      return
    }
    if (snapshot.view !== 'discover') return
    await this.searchPluginHub(root, snapshot.initialQuery, tuiPluginHubNextSort(snapshot.sort))
  }

  private async cyclePluginHubCategory(root: Agent): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined || snapshot.view !== 'discover' || snapshot.phase === 'handoff'
      || this.handle?.agent !== root) return
    const availableCategories = snapshot.availableCategories ?? tuiPluginHubAvailableCategories(snapshot.page)
    const nextCategory = tuiPluginHubNextCategory(snapshot.category, availableCategories)
    if (snapshot.category === undefined && nextCategory === null) return
    await this.searchPluginHub(root, snapshot.initialQuery, snapshot.sort, nextCategory)
  }

  private async togglePluginHubInstallable(root: Agent): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined || snapshot.view !== 'discover' || snapshot.phase === 'handoff'
      || this.handle?.agent !== root) return
    await this.searchPluginHub(root, snapshot.initialQuery, snapshot.sort, snapshot.category ?? null,
      snapshot.installableOnly !== true)
  }

  private async loadMorePluginHub(root: Agent): Promise<void> {
    const pluginHub = this.ctx.get('pluginHub')
    const snapshot = this.pluginHubDialog.getSnapshot()
    const page = snapshot?.view === 'discovery' ? snapshot.discoveryPage : snapshot?.page
    if (pluginHub === undefined || snapshot === undefined || page === undefined || (snapshot.view !== 'discover' && snapshot.view !== 'discovery')
      || snapshot.phase !== 'browse' || snapshot.loadingMore === true || page.nextCursor === undefined
      || this.handle?.agent !== root) return
    const cursor = page.nextCursor
    const controller = new AbortController()
    const generation = snapshot.generation
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    this.pluginHubDialog.set({ ...snapshot, loadingMore: true, progress: undefined, error: undefined })
    const completion = (snapshot.view === 'discovery'
      ? pluginHub.searchRepositories({ query: snapshot.initialQuery, sort: snapshot.sort === 'relevance' ? 'stars' : snapshot.sort, cursor, limit: 20 }, controller.signal).then((nextPage) => {
        if (!this.ownsPluginHubOperation(root, generation, operation)) return
        const current = this.pluginHubDialog.getSnapshot()
        const currentPage = current?.discoveryPage
        if (current === undefined || currentPage === undefined) return
        const known = new Set(currentPage.items.map(item => item.id))
        const appended = nextPage.items.filter(item => !known.has(item.id))
        this.pluginHubDialog.set({ ...current,
          discoveryPage: { ...nextPage, items: Object.freeze([...currentPage.items, ...appended]) }, loadingMore: false })
      })
      : pluginHub.search({ query: snapshot.initialQuery,
        ...(snapshot.category === undefined ? {} : { category: snapshot.category }),
        ...(snapshot.installableOnly === true ? { installable: true } : {}),
        sort: snapshot.sort, cursor, limit: 20 }, controller.signal).then((nextPage) => {
        if (!this.ownsPluginHubOperation(root, generation, operation)) return
        const current = this.pluginHubDialog.getSnapshot()
        const currentPage = current?.page
        if (current === undefined || currentPage === undefined) return
        const known = new Set(currentPage.items.map(item => String(item.id)))
        const appended = nextPage.items.filter(item => !known.has(String(item.id)))
        const items = Object.freeze([...currentPage.items, ...appended])
        const mergedPage = {
          ...nextPage, items,
          ...(nextPage.nextCursor === undefined ? {} : { nextCursor: nextPage.nextCursor }),
        }
        this.pluginHubDialog.set({ ...current, page: mergedPage,
          availableCategories: current.category === undefined
            ? tuiPluginHubAvailableCategories(mergedPage)
            : current.availableCategories,
          loadingMore: false })
      })).catch((error: unknown) => {
      if (controller.signal.aborted || !this.ownsPluginHubGeneration(root, generation)) return
      const current = this.pluginHubDialog.getSnapshot()
      if (current === undefined) return
      this.pluginHubDialog.set(tuiPluginHubLoadMoreFailure(current, error, this.locale))
      if (error instanceof PluginHubError && error.code === 'INVALID_CURSOR') {
        if (current.view === 'discovery') {
          void this.searchPluginHubDiscovery(root, current.initialQuery, current.sort === 'relevance' ? 'stars' : current.sort)
        } else {
          void this.searchPluginHub(root, current.initialQuery, current.sort, current.category ?? null, current.installableOnly === true)
        }
      }
    }).finally(() => {
      if (this.pluginHubOperation === operation) this.pluginHubOperation = undefined
    })
    operation.completion = completion
    this.pluginHubOperation = operation
    await completion
  }

  private async togglePluginHubView(root: Agent, targetView?: 'discover' | 'discovery' | 'installed'): Promise<void> {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined || snapshot.phase === 'handoff' || this.handle?.agent !== root) return
    const nextView = targetView ?? (snapshot.view === 'installed' ? 'discover' : snapshot.view === 'discover' ? 'discovery' : 'installed')
    if (nextView === 'discover') {
      if (snapshot.view === 'discover') return
      this.pluginHubDialog.set({
        generation: snapshot.generation,
        phase: 'loading',
        view: 'discover',
        profileMutations: snapshot.profileMutations,
        initialQuery: snapshot.initialQuery, sort: snapshot.sort, category: snapshot.category,
        installableOnly: snapshot.installableOnly,
        availableCategories: snapshot.availableCategories,
      })
      await this.searchPluginHub(root, snapshot.initialQuery)
      return
    }
    if (nextView === 'discovery') {
      if (snapshot.view === 'discovery') return
      await this.searchPluginHubDiscovery(root, snapshot.initialQuery, snapshot.sort === 'relevance' ? 'stars' : snapshot.sort)
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
      category: snapshot.category, installableOnly: snapshot.installableOnly,
      availableCategories: snapshot.availableCategories,
      loadingMore: false })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = pluginHub.installed(controller.signal).then((installed) => {
      if (!this.ownsPluginHubOperation(root, generation, operation)) return
      this.pluginHubDialog.set({ generation, phase: 'browse', view: 'installed',
        profileMutations: snapshot.profileMutations,
        initialQuery: snapshot.initialQuery, sort: snapshot.sort, category: snapshot.category,
        installableOnly: snapshot.installableOnly,
        availableCategories: snapshot.availableCategories, loadingMore: false, installed })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || !this.ownsPluginHubGeneration(root, generation)) return
      this.pluginHubDialog.set({ generation, phase: 'error', view: 'installed',
        profileMutations: snapshot.profileMutations,
        initialQuery: snapshot.initialQuery, sort: snapshot.sort, category: snapshot.category,
        installableOnly: snapshot.installableOnly,
        availableCategories: snapshot.availableCategories, loadingMore: false,
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
    this.pluginHubDialog.set({ ...snapshot, phase: 'detail-loading', detail: undefined, discoveryDetail: undefined,
      progress: undefined, error: undefined })
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

  private openPluginHubDiscoveryDetail(root: Agent, repositoryId: string): void {
    const snapshot = this.pluginHubDialog.getSnapshot()
    if (snapshot === undefined || snapshot.view !== 'discovery' || snapshot.phase !== 'browse'
      || this.handle?.agent !== root || this.activeView !== undefined) return
    const repository = snapshot.discoveryPage?.items.find(item => item.id === repositoryId)
    if (repository === undefined) return
    this.pluginHubDialog.set({ ...snapshot, phase: 'detail', detail: undefined,
      discoveryDetail: repository, progress: undefined, error: undefined })
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
    else if (snapshot?.view === 'discovery') await this.searchPluginHubDiscovery(root, snapshot.initialQuery, snapshot.sort === 'relevance' ? 'stars' : snapshot.sort)
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
      && (snapshot.page !== undefined || snapshot.discoveryPage !== undefined)) {
      this.pluginHubDialog.set({ ...snapshot, phase: 'browse', detail: undefined, discoveryDetail: undefined,
        plan: undefined, error: undefined })
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
    const lines = tuiGroupedCommandHelpLines(
      this.commandCatalog.list(invocation.agent), this.locale,
      command => tuiCommandDescription(command, this.locale),
    )
    return { kind: 'success', text: lines.join('\n') }
  }

  private prefillComposer(text: string): void {
    this.composerPrefill.set(Object.freeze({ revision: ++this.composerPrefillRevision, text }))
  }

  private async executeSkills(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'skills.usage') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    }
    const skills = this.ctx.get('skills') as unknown as LoadedContextSkillService | undefined
    if (skills === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'skills.unavailable') }
    const entries = (await skills.list({
      scope: invocation.agent,
      cwd: invocation.agent.session.header.cwd,
      signal: invocation.signal,
    })).filter(skill => skill.invocation.userInvocable)
    invocation.signal.throwIfAborted()
    if (entries.length === 0) return { kind: 'success', text: tuiMessage(this.locale, 'skills.none') }
    const labels = new Map(entries.map(skill => [`/${skill.name}`, skill]))
    const answer = await this.askOne(invocation.agent, invocation.signal, {
      id: 'skill-selection',
      header: tuiMessage(this.locale, 'skills.header'),
      question: tuiMessage(this.locale, 'skills.question', { count: entries.length }),
      options: entries.map(skill => ({
        label: `/${skill.name}`,
        description: `${skill.description} · ${skill.source} · ${skill.provider}`,
      })),
    })
    const selected = labels.get(answer.selected[0] ?? '')
    if (selected === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'skills.cancelled') }
    this.prefillComposer(`/${selected.name} `)
    return { kind: 'success', text: tuiMessage(this.locale, 'skills.selected', { name: selected.name }) }
  }

  private executeMcp(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'mcp.usage') }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    const names = this.ctx.tools.schemas(invocation.agent).map(schema => schema.name)
    return { kind: 'success', text: tuiMcpStatusLines(names, this.locale).join('\n') }
  }

  private executeTips(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'tips.usage') }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    return { kind: 'success', text: tuiUsageTipLines(this.locale).join('\n') }
  }

  private executeProvider(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'provider.usage') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'doctor.interaction') }
    }
    if (this.resumeDialog.getSnapshot() !== undefined || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined || this.sessionExportDialog.getSnapshot() !== undefined
      || this.pluginHubDialog.getSnapshot() !== undefined || this.diagnostics.getSnapshot() !== undefined
      || this.loadedContext.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'doctor.dialog') }
    }
    this.helpOpen.set(false)
    this.providerCenter.set(Object.freeze({ phase: 'loading' }))
    void this.refreshProviderCenter(invocation.agent)
    return { kind: 'success', text: tuiMessage(this.locale, 'provider.opened') }
  }

  private collectProviderCenterSnapshot(signal: AbortSignal) {
    const settings = this.ctx.get('settings')
    const credentials = this.ctx.get('credentials')
    return collectTuiProviderCenter({
      llm: {
        listProviders: () => this.ctx.llm.listProviders(),
        listConfigurableProviders: () => this.ctx.llm.listConfigurableProviders(),
        authentication: provider => hostAuthentication(this.ctx, provider),
        listModels: provider => this.ctx.llm.listModels(provider),
      },
      ...(settings === undefined ? {} : { settings }),
      ...(credentials === undefined ? {} : { credentials }),
      credentialRef,
      signal,
    })
  }

  private async refreshProviderCenter(root: Agent): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    this.providerCenterRefresh?.controller.abort(new Error('Provider Center refresh superseded'))
    const controller = new AbortController()
    const generation = ++this.providerCenterGeneration
    const current = this.providerCenter.getSnapshot()
    const previous = current?.snapshot
    const onboarding = current?.onboarding
    this.providerCenter.set(Object.freeze({
      phase: 'loading',
      ...(previous === undefined ? {} : { snapshot: previous }),
      ...(onboarding === undefined ? {} : { onboarding }),
    }))
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    operation.completion = this.collectProviderCenterSnapshot(controller.signal).then((snapshot) => {
      if (controller.signal.aborted || generation !== this.providerCenterGeneration
        || this.providerCenter.getSnapshot() === undefined || this.handle?.agent !== root) return
      this.providerCenter.set(Object.freeze({
        phase: 'ready', snapshot,
        ...(onboarding === undefined ? {} : { onboarding }),
      }))
    }).catch(() => {
      if (controller.signal.aborted || generation !== this.providerCenterGeneration
        || this.providerCenter.getSnapshot() === undefined || this.handle?.agent !== root) return
      this.providerCenter.set(Object.freeze({
        phase: 'error', ...(previous === undefined ? {} : { snapshot: previous }),
        ...(onboarding === undefined ? {} : { onboarding }),
      }))
    }).finally(() => {
      if (this.providerCenterRefresh === operation) this.providerCenterRefresh = undefined
    })
    this.providerCenterRefresh = operation
    await operation.completion
  }

  private providerOnboardingAcknowledgedBySettings(): {
    readonly acknowledged: boolean
    readonly durable: boolean
  } {
    const settings = this.ctx.get('settings')
    if (settings === undefined) return { acknowledged: false, durable: false }
    try {
      const descriptor = settings.describe({ redactSecrets: true })
        .find(candidate => String(candidate.ns) === String(TUI_SETTINGS_NAMESPACE))
      const user = descriptor?.user
      const version = typeof user === 'object' && user !== null && !Array.isArray(user)
        ? (user as Readonly<Record<string, unknown>>)['providerOnboardingVersion']
        : undefined
      return {
        acknowledged: version === TUI_PROVIDER_ONBOARDING_VERSION,
        durable: settings.writable && descriptor !== undefined,
      }
    } catch {
      return { acknowledged: false, durable: false }
    }
  }

  private async maybeOpenProviderOnboarding(root: Agent): Promise<void> {
    if (this.handle?.agent !== root || this.providerOnboardingAcknowledged
      || this.providerCenter.getSnapshot() !== undefined || this.isClosing()) return
    const acknowledgement = this.providerOnboardingAcknowledgedBySettings()
    if (acknowledgement.acknowledged) {
      this.providerOnboardingAcknowledged = true
      return
    }
    this.providerCenterRefresh?.controller.abort(new Error('Provider onboarding refresh superseded'))
    const controller = new AbortController()
    const generation = ++this.providerCenterGeneration
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    operation.completion = this.collectProviderCenterSnapshot(controller.signal).then((snapshot) => {
      if (controller.signal.aborted || generation !== this.providerCenterGeneration
        || this.handle?.agent !== root || this.providerCenter.getSnapshot() !== undefined || this.isClosing()) return
      if (tuiProviderOnboardingReadiness(snapshot) !== 'needed') return
      this.providerCenter.set(Object.freeze({
        phase: 'ready', snapshot,
        onboarding: Object.freeze({ durable: acknowledgement.durable }),
      }))
    }).catch(() => undefined).finally(() => {
      if (this.providerCenterRefresh === operation) this.providerCenterRefresh = undefined
    })
    this.providerCenterRefresh = operation
    await operation.completion
  }

  private async acknowledgeProviderOnboarding(): Promise<boolean> {
    this.providerOnboardingAcknowledged = true
    const settings = this.ctx.get('settings')
    if (settings === undefined || !settings.writable) {
      this.externalNotice.set(tuiMessage(this.locale, 'provider.onboarding.processOnly'))
      return false
    }
    let descriptor
    try {
      descriptor = settings.describe({ redactSecrets: true })
        .find(candidate => String(candidate.ns) === String(TUI_SETTINGS_NAMESPACE))
    } catch {
      descriptor = undefined
    }
    if (descriptor === undefined) {
      this.externalNotice.set(tuiMessage(this.locale, 'provider.onboarding.processOnly'))
      return false
    }
    try {
      await settings.mutate(TUI_SETTINGS_NAMESPACE, [{
        op: 'set', path: ['providerOnboardingVersion'], value: TUI_PROVIDER_ONBOARDING_VERSION,
      }], descriptor.revision)
      return true
    } catch {
      this.externalNotice.set(tuiMessage(this.locale, 'provider.onboarding.processOnly'))
      return false
    }
  }

  private openModelsAfterProviderOnboarding(root: Agent): void {
    if (this.handle?.agent !== root || this.activeCommand !== undefined || this.isClosing()) return
    const controller = new AbortController()
    const completion = this.ctx.commands.execute(root, '/models', [], controller.signal).then((execution) => {
      if (execution !== undefined && execution.result.kind !== 'success') {
        throw new Error(execution.result.text)
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        this.externalNotice.set(tuiMessage(this.locale, 'provider.onboarding.modelsFailed'))
      }
    })
    const operation: ActiveOperation = { controller, completion }
    this.activeCommand = operation
    void completion.finally(() => {
      if (this.activeCommand === operation) this.activeCommand = undefined
    })
  }

  private async finishProviderOnboarding(root: Agent, openModels: boolean): Promise<void> {
    await this.acknowledgeProviderOnboarding()
    this.closeProviderCenter(false)
    if (openModels) this.openModelsAfterProviderOnboarding(root)
  }

  private closeProviderCenter(acknowledgeOnboarding = true): void {
    const onboarding = this.providerCenter.getSnapshot()?.onboarding
    this.providerCenterRefresh?.controller.abort(new Error('Provider Center closed'))
    this.providerCenterOperation?.controller.abort(new Error('Provider Center closed'))
    this.providerCenterRefresh = undefined
    this.providerCenterOperation = undefined
    this.providerCenter.set(undefined)
    if (acknowledgeOnboarding && onboarding !== undefined) void this.acknowledgeProviderOnboarding()
  }

  private async authenticateProvider(root: Agent, provider: string): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    const onboarding = this.providerCenter.getSnapshot()?.onboarding !== undefined
    const row = this.providerCenter.getSnapshot()?.snapshot?.providers.find(candidate => candidate.id === provider)
    if (row === undefined || !row.active || row.authenticationMethods.length === 0) return
    this.providerCenterOperation?.controller.abort(new Error('Provider Center authentication superseded'))
    const controller = new AbortController()
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    operation.completion = (async () => {
      let method = row.authenticationMethods.length === 1 ? row.authenticationMethods[0] : undefined
      if (method === undefined) {
        let answer: { selected: string[]; custom?: string }
        try {
          answer = await this.askOne(root, controller.signal, {
            id: 'provider-auth-method', header: `${row.name} (${row.id})`,
            question: tuiMessage(this.locale, 'provider.auth.question'),
            options: row.authenticationMethods.map(candidate => ({ label: candidate.name, description: candidate.id })),
          })
        } catch (error: unknown) {
          if (isTuiQuestionCancellation(error)) return
          throw error
        }
        method = row.authenticationMethods.find(candidate => candidate.name === answer.selected[0])
      }
      if (method === undefined) return
      await this.login(root, provider, method.id, controller.signal)
      if (controller.signal.aborted || this.providerCenter.getSnapshot() === undefined) return
      this.externalNotice.set(tuiMessage(this.locale, 'provider.signInComplete'))
      await this.refreshProviderCenter(root)
      if (onboarding && this.providerCenter.getSnapshot() !== undefined) {
        await this.finishProviderOnboarding(root, true)
      }
    })().finally(() => {
      if (this.providerCenterOperation === operation) this.providerCenterOperation = undefined
    })
    this.providerCenterOperation = operation
    await operation.completion
  }

  private async logoutProvider(root: Agent, provider: string): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    const row = this.providerCenter.getSnapshot()?.snapshot?.providers.find(candidate => candidate.id === provider)
    if (row === undefined || !row.active || !row.canLogout || row.authentication !== 'configured') return
    await hostLogout(this.ctx, provider)
    if (this.providerCenter.getSnapshot() === undefined || !this.ownsAgent(root)) return
    this.externalNotice.set(tuiMessage(this.locale, 'provider.logout.complete'))
    await this.refreshProviderCenter(root)
  }

  private async saveProviderApiKey(root: Agent, provider: string, key: string): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    const onboarding = this.providerCenter.getSnapshot()?.onboarding !== undefined
    const row = this.providerCenter.getSnapshot()?.snapshot?.providers.find(candidate => candidate.id === provider)
    if (row === undefined) return
    const settings = this.ctx.get('settings')
    const credentials = this.ctx.get('credentials')
    try {
      await saveTuiProviderApiKey(row, key, {
        ...(settings === undefined ? {} : { settings }),
        ...(credentials === undefined ? {} : { credentials }),
      })
    } catch (error: unknown) {
      if (error instanceof TuiProviderApiKeyError && error.code === 'settings-conflict') {
        await this.refreshProviderCenter(root)
      }
      throw error
    }
    if (this.providerCenter.getSnapshot() === undefined || !this.ownsAgent(root)) return
    this.externalNotice.set(tuiMessage(this.locale, 'provider.key.complete'))
    await this.refreshProviderCenter(root)
    if (onboarding && this.providerCenter.getSnapshot() !== undefined) {
      await this.finishProviderOnboarding(root, true)
    }
  }

  private async saveProviderEndpoint(
    root: Agent,
    provider: string,
    endpoint: string | undefined,
  ): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    const row = this.providerCenter.getSnapshot()?.snapshot?.providers.find(candidate => candidate.id === provider)
    if (row === undefined) return
    try {
      await saveTuiProviderEndpoint(row, endpoint, this.ctx.get('settings'))
    } catch (error: unknown) {
      if (error instanceof TuiProviderEndpointError && error.code === 'settings-conflict') {
        await this.refreshProviderCenter(root)
      }
      throw error
    }
    if (this.providerCenter.getSnapshot() === undefined || !this.ownsAgent(root)) return
    this.externalNotice.set(tuiMessage(this.locale, 'provider.endpoint.complete'))
    await this.refreshProviderCenter(root)
  }

  private async saveProviderProfile(
    root: Agent,
    provider: string,
    draft: TuiProviderProfileDraft,
  ): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    const row = this.providerCenter.getSnapshot()?.snapshot?.providers.find(candidate => candidate.id === provider)
    if (row === undefined) return
    const settings = this.ctx.get('settings')
    try {
      await saveTuiProviderProfile(row, draft, settings)
    } catch (error: unknown) {
      if (error instanceof TuiProviderProfileError && error.code === 'settings-conflict') {
        await this.refreshProviderCenter(root)
      }
      throw error
    }
    if (this.providerCenter.getSnapshot() === undefined || !this.ownsAgent(root)) return
    this.externalNotice.set(tuiMessage(this.locale, 'provider.profile.complete'))
    await this.refreshProviderCenter(root)
  }

  private async removeProvider(root: Agent, provider: string): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    const row = this.providerCenter.getSnapshot()?.snapshot?.providers.find(candidate => candidate.id === provider)
    if (row === undefined) return
    const settings = this.ctx.get('settings')
    const credentials = this.ctx.get('credentials')
    try {
      await removeTuiProviderProfile(row, {
        ...(settings === undefined ? {} : { settings }),
        ...(credentials === undefined ? {} : { credentials }),
      })
    } catch (error: unknown) {
      if (error instanceof TuiProviderRemoveError && (error.code === 'settings-conflict'
        || error.code === 'credential-remove-failed')) await this.refreshProviderCenter(root)
      throw error
    }
    if (this.providerCenter.getSnapshot() === undefined || !this.ownsAgent(root)) return
    this.externalNotice.set(tuiMessage(this.locale, 'provider.remove.complete'))
    await this.refreshProviderCenter(root)
  }

  private currentProviderCreationTarget(
    requested: TuiProviderCreationTarget,
  ): TuiProviderCreationTarget | undefined {
    return this.providerCenter.getSnapshot()?.snapshot?.creationTargets.find(candidate => (
      candidate.namespace === requested.namespace
      && candidate.path.length === requested.path.length
      && candidate.path.every((segment, index) => segment === requested.path[index])
    ))
  }

  private async discoverCustomProviderModels(
    root: Agent,
    requested: TuiProviderCreationTarget,
    draft: TuiCustomProviderDraft,
  ): Promise<readonly TuiCustomProviderModelDraft[]> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return []
    const target = this.currentProviderCreationTarget(requested)
    if (target === undefined) throw new TuiCustomProviderError('settings-unavailable')
    this.providerCenterOperation?.controller.abort(new Error('Provider Center operation superseded'))
    const controller = new AbortController()
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const discovered = discoverTuiCustomProviderModels(target, draft, {
      discoverModels: (settingsNs, request) => this.ctx.llm.discoverModels(settingsNs, request),
    }, controller.signal)
    operation.completion = discovered.then(() => undefined, () => undefined).finally(() => {
      if (this.providerCenterOperation === operation) this.providerCenterOperation = undefined
    })
    this.providerCenterOperation = operation
    return discovered
  }

  private async createCustomProvider(
    root: Agent,
    requested: TuiProviderCreationTarget,
    draft: TuiCustomProviderDraft,
  ): Promise<void> {
    if (this.handle?.agent !== root || this.providerCenter.getSnapshot() === undefined) return
    const onboarding = this.providerCenter.getSnapshot()?.onboarding !== undefined
    const target = this.currentProviderCreationTarget(requested)
    if (target === undefined) throw new TuiCustomProviderError('settings-unavailable')
    this.providerCenterOperation?.controller.abort(new Error('Provider Center operation superseded'))
    const controller = new AbortController()
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const settings = this.ctx.get('settings')
    const credentials = this.ctx.get('credentials')
    const created = createTuiCustomProvider(target, draft, {
      ...(settings === undefined ? {} : { settings }),
      ...(credentials === undefined ? {} : { credentials }),
    })
    operation.completion = created.then(() => undefined, () => undefined).finally(() => {
      if (this.providerCenterOperation === operation) this.providerCenterOperation = undefined
    })
    this.providerCenterOperation = operation
    try {
      await created
      controller.signal.throwIfAborted()
      if (this.providerCenter.getSnapshot() === undefined || !this.ownsAgent(root)) return
      this.externalNotice.set(tuiMessage(this.locale, 'provider.custom.complete'))
      await this.refreshProviderCenter(root)
      if (onboarding && this.providerCenter.getSnapshot() !== undefined) {
        await this.finishProviderOnboarding(root, true)
      }
    } catch (error: unknown) {
      controller.signal.throwIfAborted()
      if (error instanceof TuiCustomProviderError
        && (error.code === 'settings-conflict' || error.code === 'credential-write-failed'
          || error.code === 'credentials-unavailable')) {
        await this.refreshProviderCenter(root)
      }
      throw error
    }
  }

  private async executeUpdate(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'update.usage') }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    const notice = tuiMessage(this.locale, 'update.checking')
    this.externalNotice.set(notice)
    try {
      const status = await checkTuiUpdate(AbortSignal.any([invocation.signal, AbortSignal.timeout(4_000)]))
      return { kind: 'success', text: this.updateStatusText(status) }
    } catch (error: unknown) {
      invocation.signal.throwIfAborted()
      return { kind: 'success', text: tuiMessage(this.locale, 'update.failed', {
        version: tuiUpdateStatus().currentVersion,
        error: errorChain(error),
      }) }
    } finally {
      if (this.externalNotice.getSnapshot() === notice) this.externalNotice.set('')
    }
  }

  private updateStatusText(status: TuiUpdateStatus): string {
    if (status.updateAvailable && status.latestVersion !== undefined && status.command !== undefined) {
      return tuiMessage(this.locale, 'update.available', {
        current: status.currentVersion, latest: status.latestVersion, command: status.command,
      })
    }
    if (status.latestVersion !== undefined && !status.compatible) {
      return tuiMessage(this.locale, 'update.incompatible', {
        current: status.currentVersion, latest: status.latestVersion,
      })
    }
    return tuiMessage(this.locale, 'update.current', { version: status.currentVersion })
  }

  private scheduleUpdateCheck(): void {
    this.updateCheck?.controller.abort(new Error('TUI update check superseded'))
    const controller = new AbortController()
    const completion = checkTuiUpdate(AbortSignal.any([controller.signal, AbortSignal.timeout(4_000)]))
      .then((status) => {
        if (!status.updateAvailable || status.latestVersion === undefined || controller.signal.aborted || this.isClosing()) return
        if (this.externalNotice.getSnapshot() === '') {
          this.externalNotice.set(tuiMessage(this.locale, 'update.notice', {
            current: status.currentVersion, latest: status.latestVersion,
          }))
        }
      }).catch(() => undefined)
    const operation = { controller, completion }
    this.updateCheck = operation
    void completion.finally(() => {
      if (this.updateCheck === operation) this.updateCheck = undefined
    })
  }

  private async executeWorkspace(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    }
    let target = invocation.rawInput.trim()
    if (target === '') {
      this.openSessionManager(invocation.agent, 'workspaces')
      return { kind: 'success', text: tuiMessage(this.locale, 'sessions.opened') }
    }
    if (invocation.agent.status !== 'idle') {
      return { kind: 'error', text: tuiMessage(this.locale, 'fresh.error.agentBusy', { status: invocation.agent.status }) }
    }
    target = resolve(invocation.agent.session.header.cwd ?? process.cwd(), target)
    try {
      if (!(await stat(target)).isDirectory()) {
        return { kind: 'error', text: tuiMessage(this.locale, 'workspace.invalid', { path: target }) }
      }
    } catch {
      return { kind: 'error', text: tuiMessage(this.locale, 'workspace.invalid', { path: target }) }
    }
    this.freshSessionDialog.set({
      generation: ++this.freshSessionGeneration,
      command: 'workspace', phase: 'confirming',
      currentSessionId: invocation.agent.session.id,
      workspaceLabel: target,
    })
    return { kind: 'success', text: tuiMessage(this.locale, 'workspace.opened', { path: target }) }
  }

  private executeSessions(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: tuiMessage(this.locale, 'sessions.usage') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'sessions.interaction') }
    }
    this.openSessionManager(invocation.agent, 'sessions')
    return { kind: 'success', text: tuiMessage(this.locale, 'sessions.opened') }
  }

  private async executeBtw(invocation: CommandInvocation): Promise<CommandResult> {
    const question = invocation.rawInput.trim()
    if (question === '') return { kind: 'error', text: tuiMessage(this.locale, 'btw.usage') }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: tuiMessage(this.locale, 'system.session.changed') }
    }
    const subagents = this.ctx.get('subagents')
    if (subagents === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'btw.unavailable') }
    const provider = subagents.list().find(candidate => candidate === 'fork')
      ?? subagents.list().find(candidate => candidate === 'spawn')
    if (provider === undefined) return { kind: 'error', text: tuiMessage(this.locale, 'btw.unavailable') }
    const selection = this.selection?.current ?? this.modelSelection.getSnapshot()
    const run = await subagents.start(provider, {
      parent: invocation.agent,
      prompt: [{ type: 'text', text: question }],
      label: tuiMessage(this.locale, 'btw.label'),
      signal: invocation.signal,
      toolFilter: { allow: [] },
      persona: this.locale === 'zh'
        ? '只回答用户的临时侧问。不要调用工具，不要提出后续任务，给出简洁、独立的回答。'
        : 'Answer only the user\'s side question. Use no tools, create no follow-up work, and give a concise standalone answer.',
      ...selection === undefined ? {} : { agentOptions: selection },
    })
    let result: SubagentResult
    try {
      result = await run.result
    } finally {
      await run.dispose()
    }
    const text = result.output.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim()
    if (result.stopReason !== 'completed') {
      return {
        kind: 'error',
        text: result.diagnostic ?? (text || tuiMessage(this.locale, 'btw.failed', { reason: result.stopReason })),
      }
    }
    return { kind: 'success', text: text || tuiMessage(this.locale, 'btw.empty') }
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
        const authentication = await hostAuthentication(this.ctx, provider.id)
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
    const persistence = this.ctx.get('sessionPersistence')
    let storageDiagnostic: TuiSessionStorageDiagnostic = { state: 'unavailable' }
    if (persistence !== undefined) {
      try {
        const headers = (await persistence.list({ signal: invocation.signal })).map(snapshot => snapshot.header)
        invocation.signal.throwIfAborted()
        storageDiagnostic = Object.freeze({
          state: 'available',
          backend: persistence.name,
          currentFormat: invocation.agent.session.header.version,
          expectedFormat: SESSION_FORMAT_VERSION,
          compatibleSessions: headers.length,
          incompatibleSessions: 0,
          supportsRawArtifacts: false,
        })
      } catch (error: unknown) {
        invocation.signal.throwIfAborted()
        storageDiagnostic = Object.freeze({
          state: 'failed', error: diagnosticFailureLabel(error, 'Session persistence'),
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
      storage: storageDiagnostic,
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
    const currentId = resolveSessionPreset({
      header: invocation.agent.session.header,
      events: invocation.agent.session.snapshotEvents(),
    })
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
    if (invocation.agent.session.snapshotEvents().some(event => event.type === 'turn/start')) {
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
    const themeValue = current.themeFile ?? tuiMessage(this.locale, current.theme === 'auto'
      ? 'config.theme.auto' : current.theme === 'dark'
        ? 'config.theme.dark' : current.theme === 'light' ? 'config.theme.light' : 'config.theme.no-color')
    const mouseValue = tuiMessage(this.locale, current.mouse === 'auto' ? 'config.mouse.auto' : 'config.mouse.off')
    const activityValue = tuiMessage(this.locale, `config.activity.${current.activity}`)
    const themeLabel = tuiMessage(this.locale, 'config.theme.option', { value: themeValue })
    const mouseLabel = tuiMessage(this.locale, 'config.mouse.option', { value: mouseValue })
    const activityLabel = tuiMessage(this.locale, 'config.activity.option', { value: activityValue })
    const actionLabel = tuiMessage(this.locale, 'config.keybindings.option')
    const resetLabel = tuiMessage(this.locale, 'config.reset.option')
    const choice = await this.askOne(invocation.agent, invocation.signal, {
      id: 'tui-config',
      header: tuiMessage(this.locale, 'config.header'),
      question: tuiMessage(this.locale, 'config.question'),
      options: [
        { label: themeLabel, description: tuiMessage(this.locale, 'config.theme.description') },
        { label: mouseLabel, description: tuiMessage(this.locale, 'config.mouse.description') },
        { label: activityLabel, description: tuiMessage(this.locale, 'config.activity.description') },
        { label: actionLabel, description: tuiMessage(this.locale, 'config.keybindings.description') },
        { label: resetLabel, description: tuiMessage(this.locale, 'config.reset.description') },
      ],
    })
    const selected = choice.selected[0]
    if (selected === themeLabel) {
      const customThemes = await listTuiCustomThemes(invocation.signal)
      const themeChoices = [
        ...TUI_THEME_PREFERENCES.map(theme => ({
          kind: 'builtin' as const,
          value: theme,
          label: tuiMessage(this.locale, current.themeFile === undefined && theme === current.theme ? 'config.current' : theme === 'auto'
            ? 'config.theme.auto' : theme === 'dark' ? 'config.theme.dark'
              : theme === 'light' ? 'config.theme.light' : 'config.theme.no-color', {
            value: tuiMessage(this.locale, theme === 'auto'
              ? 'config.theme.auto' : theme === 'dark' ? 'config.theme.dark'
                : theme === 'light' ? 'config.theme.light' : 'config.theme.no-color'),
          }),
        })),
        ...customThemes.map(file => ({
          kind: 'custom' as const,
          value: file.fileName,
          label: tuiMessage(this.locale, current.themeFile === file.fileName ? 'config.current' : 'config.theme.custom', {
            value: tuiMessage(this.locale, 'config.theme.custom', {
              name: file.theme.name, file: file.fileName,
            }),
            name: file.theme.name,
            file: file.fileName,
          }),
        })),
      ]
      const themeAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-theme',
        header: tuiMessage(this.locale, 'config.theme.header'),
        question: tuiMessage(this.locale, 'config.theme.question'),
        options: themeChoices.map(theme => ({ label: theme.label })),
      })
      const selectedTheme = themeChoices.find(theme => theme.label === themeAnswer.selected[0])
      if (selectedTheme === undefined) return { kind: 'success', text: tuiMessage(this.locale, 'config.theme.cancelled') }
      try {
        await settings.mutate(TUI_SETTINGS_NAMESPACE, selectedTheme.kind === 'builtin'
          ? [
            { op: 'set', path: ['theme'], value: selectedTheme.value },
            { op: 'unset', path: ['themeFile'] },
          ]
          : [{ op: 'set', path: ['themeFile'], value: selectedTheme.value }])
      } catch (error: unknown) {
        return { kind: 'error', text: tuiMessage(this.locale, 'config.theme.failed', { error: errorChain(error) }) }
      }
      return { kind: 'success', text: tuiMessage(this.locale, 'config.theme.updated', {
        value: selectedTheme.kind === 'custom'
          ? selectedTheme.value
          : tuiMessage(this.locale, selectedTheme.value === 'auto'
            ? 'config.theme.auto' : selectedTheme.value === 'dark' ? 'config.theme.dark'
              : selectedTheme.value === 'light' ? 'config.theme.light' : 'config.theme.no-color'),
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
    if (selected === activityLabel) {
      const activityChoices = TUI_ACTIVITY_PREFERENCES.map(activity => ({
        value: activity,
        label: tuiMessage(this.locale, activity === current.activity ? 'config.current' : `config.activity.${activity}`, {
          value: tuiMessage(this.locale, `config.activity.${activity}`),
        }),
      }))
      const activityAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-activity',
        header: tuiMessage(this.locale, 'config.activity.header'),
        question: tuiMessage(this.locale, 'config.activity.question'),
        options: activityChoices.map(activity => ({ label: activity.label })),
      })
      const selectedActivity = activityChoices.find(activity => activity.label === activityAnswer.selected[0])?.value
      if (selectedActivity === undefined) {
        return { kind: 'success', text: tuiMessage(this.locale, 'config.activity.cancelled') }
      }
      try {
        await settings.update(TUI_SETTINGS_NAMESPACE, { activity: selectedActivity })
      } catch (error: unknown) {
        return { kind: 'error', text: tuiMessage(this.locale, 'config.activity.failed', { error: errorChain(error) }) }
      }
      return { kind: 'success', text: tuiMessage(this.locale, 'config.activity.updated', {
        value: tuiMessage(this.locale, `config.activity.${selectedActivity}`),
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
    this.detachedRewindSource = undefined
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
      candidates: tuiRewindCandidates(agent.session.snapshotEvents()),
    })
  }

  private closeRewind(): void {
    if (this.activeAgentSwitch?.kind === 'rewind') {
      this.activeAgentSwitch.controller.abort(new Error('TUI Session rewind cancelled'))
    }
    this.rewindGeneration += 1
    this.detachedRewindSource = undefined
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
    const detached = this.detachedRewindSource?.id === dialog.currentSessionId
      ? this.detachedRewindSource : undefined
    const sourceId = detached?.id ?? agent.session.id
    const sourceEvents = detached?.events ?? agent.session.snapshotEvents()
    const cwd = detached?.cwd ?? agent.session.header.cwd
    const selectedModel = detached?.selection ?? this.selection?.current ?? this.modelSelection.getSnapshot()
    const preset = detached?.preset ?? resolveSessionPreset({
      header: agent.session.header,
      events: agent.session.snapshotEvents(),
    })
    if (cwd === undefined || selectedModel === undefined) {
      this.rewindDialog.set({ ...dialog, error: cwd === undefined
        ? tuiMessage(this.locale, 'session.error.workspace')
        : tuiMessage(this.locale, 'session.error.model') })
      return
    }
    if (preset === undefined) {
      this.rewindDialog.set({ ...dialog, error: tuiMessage(this.locale, 'rewind.error.preset') })
      return
    }
    const rewindDecision = await this.ctx.tuiExtensions.decide({
      kind: 'rewind', sessionId: sourceId, targetEventSeq: current.eventSeq, operation: 'rewind',
    })
    if (rewindDecision.outcome === 'deny') {
      this.rewindDialog.set({
        ...dialog, error: rewindDecision.reason ?? tuiMessage(this.locale, 'rewind.error.denied'),
      })
      return
    }
    const anchor = resolveSessionForkAnchor(sourceEvents, current.eventSeq)
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
      agent, sourceId, sourceEvents, cwd, selectedModel, preset, anchor.seedLength, controller.signal,
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
    sourceSessionId: SessionId,
    sourceEvents: readonly SessionEvent[],
    cwd: string,
    selectedModel: ModelSelection,
    preset: string,
    seedLength: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
    const initialStatus = this.agentStatus(oldAgent)
    if (initialStatus !== 'idle') throw new Error(`current Agent is ${initialStatus}`)
    const seed = sourceEvents.slice(0, seedLength)
    const prepared = await this.prepareAgent({
      kind: 'rewind',
      parentSession: sourceSessionId,
      cwd,
      selection: selectedModel,
      seed,
      preset,
    }, signal)
    const workspace = await hostWorkspaceRegistry(this.ctx).resolveByPath(cwd)
    let attached = false
    let retiredHandle: AgentHandle
    try {
      if (workspace !== undefined) {
        await workspace.attachSession(prepared.handle.agent.session.id)
        attached = true
      }
      signal.throwIfAborted()
      if (this.isClosing()) throw new Error('TUI is shutting down')
      if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
      const currentStatus = this.agentStatus(oldAgent)
      if (currentStatus !== 'idle') throw new Error(`current Agent became ${currentStatus}`)
      retiredHandle = this.commitAgentSwitch(oldAgent, prepared)
    } catch (error: unknown) {
      if (attached) await workspace?.detachSession(prepared.handle.agent.session.id).catch(() => undefined)
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
    this.detachedRewindSource = undefined
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

  private async exportTuiOutput(
    agent: Agent,
    markdown: string,
    kind: TuiOutputExportKind,
  ): Promise<TuiOutputExportResult> {
    const workspace = agent.session.header.cwd
    if (workspace === undefined) {
      return { ok: false, message: tuiMessage(this.locale, 'output.export.noWorkspace') }
    }
    if (this.isClosing()) return { ok: false, message: tuiMessage(this.locale, 'output.export.failed') }
    return writeTuiOutputMarkdown(this.ctx.fs, workspace, markdown, Date.now(), kind)
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

  private openSessionManager(agent: Agent, initialTab: 'sessions' | 'workspaces'): void {
    this.closeSessionManager(true)
    const generation = ++this.sessionManagerGeneration
    const controller = new AbortController()
    this.sessionManager.set({
      generation,
      phase: 'loading',
      initialTab,
      currentSessionId: agent.session.id,
      currentWorkspaceLabel: agent.session.header.cwd ?? tuiMessage(this.locale, 'resume.workspace.none'),
    })
    this.externalNotice.set('')
    const completion = this.scanSessionManager(agent, generation, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted || this.sessionManagerGeneration !== generation || this.isClosing()) return
      const snapshot = this.sessionManager.getSnapshot()
      if (snapshot?.generation !== generation) return
      this.sessionManager.set({ ...snapshot, phase: 'ready', error: errorChain(error) })
    })
    const operation = { controller, completion }
    this.sessionManagerScan = operation
    void completion.finally(() => {
      if (this.sessionManagerScan === operation) this.sessionManagerScan = undefined
    })
  }

  private closeSessionManager(superseded = false): void {
    if (!superseded && this.sessionManager.getSnapshot()?.phase === 'mutating'
      && this.activeAgentSwitch?.kind === 'resume') {
      this.activeAgentSwitch.controller.abort(new Error('TUI Session Manager resume cancelled'))
    }
    this.sessionManagerScan?.controller.abort(new Error('TUI Session Manager closed'))
    this.sessionManagerScan = undefined
    if (!superseded) this.sessionManagerGeneration += 1
    this.sessionManager.set(undefined)
  }

  private async scanSessionManager(
    agent: Agent,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    const registry = hostWorkspaceRegistry(this.ctx)
    const [candidates, workspaces] = await Promise.all([
      this.collectSessionCandidates(agent, signal, { includePreviews: false }),
      collectTuiWorkspaceRows(registry.list(), signal),
    ])
    signal.throwIfAborted()
    if (!this.ownsAgent(agent) || this.sessionManagerGeneration !== generation) return
    const snapshot = this.sessionManager.getSnapshot()
    if (snapshot?.generation !== generation) return
    const { error: _error, ...settled } = snapshot
    this.sessionManager.set({
      ...settled,
      phase: 'ready',
      candidates,
      workspaces,
      archivedSessionIds: Object.freeze([...registry.archivedSessionIds]),
    })
  }

  private async refreshSessionManager(agent: Agent): Promise<void> {
    const snapshot = this.sessionManager.getSnapshot()
    if (snapshot === undefined || !this.ownsAgent(agent)) return
    this.openSessionManager(agent, snapshot.initialTab)
    await this.sessionManagerScan?.completion
  }

  private async updateSessionManagerPreferences(patch: Partial<TuiSettings['sessionManager']>): Promise<void> {
    const settings = hostSettings(this.ctx)
    await settings.update(TUI_SETTINGS_NAMESPACE, { sessionManager: patch })
  }

  private async openPresetManager(agent: Agent): Promise<void> {
    if (!this.ownsAgent(agent)) return
    const presets = this.ctx.agentPresets as unknown as TuiAgentPresets | undefined
    if (presets === undefined) return
    const currentPresetId = presets.composedPreset(agent.ctx)
    try {
      const snapshot = await collectTuiPresetManager(presets, currentPresetId, this.locale)
      this.presetManagerStore.set(snapshot)
    } catch {
      this.presetManagerStore.set(undefined)
    }
  }

  private closePresetManager(): void {
    this.presetManagerStore.set(undefined)
  }

  private async refreshPresetManager(agent: Agent): Promise<void> {
    if (this.presetManagerStore.getSnapshot() === undefined || !this.ownsAgent(agent)) return
    await this.openPresetManager(agent)
  }

  private scheduleSnapshot(agent: Agent): TuiScheduleSnapshot {
    if (!this.ownsAgent(agent)) return TUI_SCHEDULES_UNAVAILABLE
    const value = this.ctx.get('sessionProjections')?.snapshot(agent.session, ['schedule']).values.schedule
    return collectTuiSchedules(value)
  }

  private openScheduleDialog(agent: Agent): void {
    const snapshot = this.scheduleSnapshot(agent)
    this.schedulesStore.set(snapshot)
    this.scheduleDialogStore.set(snapshot)
  }

  private closeScheduleDialog(): void {
    this.scheduleDialogStore.set(undefined)
  }

  private async copyPreset(_agent: Agent, sourceId: string, newId: string, displayName?: string): Promise<void> {
    const presets = this.ctx.agentPresets as unknown as TuiAgentPresets | undefined
    if (presets === undefined) throw new Error('Agent presets unavailable')
    await presets.copy(sourceId, newId, displayName)
  }

  private async deletePreset(_agent: Agent, id: string): Promise<void> {
    const presets = this.ctx.agentPresets as unknown as TuiAgentPresets | undefined
    if (presets === undefined) throw new Error('Agent presets unavailable')
    await presets.remove(id)
  }

  private async setDefaultPreset(_agent: Agent, id: string, expectedRevision: number | undefined): Promise<void> {
    const presets = this.ctx.agentPresets as unknown as TuiAgentPresets | undefined
    if (presets === undefined) throw new Error('Agent presets unavailable')
    await setTuiDefaultPreset(presets, id, expectedRevision)
  }

  private async openPresetLocation(agent: Agent, id: string): Promise<void> {
    const preset = await hostAgentPresets(agent.ctx).resolve(id)
    await this.openTuiPath(agent, dirname(preset.path))
  }

  private async openPresetFile(agent: Agent, id: string): Promise<void> {
    const preset = await hostAgentPresets(agent.ctx).resolve(id)
    await this.openTuiPath(agent, preset.path)
  }

  private async refreshFeedback(requestedAgent?: Agent): Promise<void> {
    const root = requestedAgent ?? this.handle?.agent
    if (root === undefined) return
    const sessionId = root.session.id
    try {
      const owner = root.ctx.get('messageFeedback')
      if (owner === undefined) {
        if (this.handle?.agent === root) this.messageFeedbackStore.set(undefined)
        return
      }
      const result = await owner.list({ sessionId })
      if (this.handle?.agent === root) this.messageFeedbackStore.set(projectMessageFeedback(sessionId, result))
    } catch {
      if (this.handle?.agent === root) this.messageFeedbackStore.set(undefined)
    }
  }

  private async submitFeedback(
    messageId: string, rating: 'positive' | 'negative', note?: string,
  ): Promise<void> {
    const root = this.handle?.agent
    if (root === undefined) return
    const sessionId = root.session.id
    const targetMessageId = MessageId(messageId)
    const generation = ++this.feedbackMutationGeneration
    try {
      const owner = root.ctx.get('messageFeedback')
      if (owner === undefined) {
        if (this.handle?.agent === root && generation === this.feedbackMutationGeneration) {
          this.feedbackMutationStore.set({
            status: 'error', sessionId, targetMessageId, errorCode: 'owner-unavailable',
          })
        }
        return
      }
      this.feedbackMutationStore.set({ status: 'pending', sessionId, targetMessageId })
      const existing = this.messageFeedbackStore.getSnapshot()
      const item = existing?.sessionId === sessionId
        ? existing.items.find(i => (i.messageId as string) === messageId)
        : undefined
      const result = await owner.put({
        sessionId,
        messageId: targetMessageId,
        rating,
        ...(note !== undefined ? { note } : {}),
        ifVersion: item?.version ?? null,
      })
      if (this.handle?.agent !== root || generation !== this.feedbackMutationGeneration) return
      this.feedbackMutationStore.set(processPutResult(result, sessionId, targetMessageId))
      await this.refreshFeedback(root)
    } catch {
      if (this.handle?.agent === root && generation === this.feedbackMutationGeneration) {
        this.feedbackMutationStore.set({ status: 'error', sessionId, targetMessageId, errorCode: 'unknown' })
      }
    }
  }

  private async clearFeedback(messageId: string): Promise<void> {
    const root = this.handle?.agent
    if (root === undefined) return
    const sessionId = root.session.id
    const targetMessageId = MessageId(messageId)
    const generation = ++this.feedbackMutationGeneration
    try {
      const owner = root.ctx.get('messageFeedback')
      if (owner === undefined) {
        if (this.handle?.agent === root && generation === this.feedbackMutationGeneration) {
          this.feedbackMutationStore.set({
            status: 'error', sessionId, targetMessageId, errorCode: 'owner-unavailable',
          })
        }
        return
      }
      const existing = this.messageFeedbackStore.getSnapshot()
      const item = existing?.sessionId === sessionId
        ? existing.items.find(i => (i.messageId as string) === messageId)
        : undefined
      if (item === undefined) {
        if (this.handle?.agent === root && generation === this.feedbackMutationGeneration) {
          this.feedbackMutationStore.set({ status: 'success', sessionId, targetMessageId })
        }
        return
      }
      this.feedbackMutationStore.set({ status: 'pending', sessionId, targetMessageId })
      const result = await owner.delete({ sessionId, messageId: targetMessageId, ifVersion: item.version })
      if (this.handle?.agent !== root || generation !== this.feedbackMutationGeneration) return
      this.feedbackMutationStore.set(processDeleteResult(result, sessionId, targetMessageId))
      await this.refreshFeedback(root)
    } catch {
      if (this.handle?.agent === root && generation === this.feedbackMutationGeneration) {
        this.feedbackMutationStore.set({ status: 'error', sessionId, targetMessageId, errorCode: 'unknown' })
      }
    }
  }

  private openTrajectory(): void {
    const root = this.handle?.agent
    if (root === undefined) return
    const events = root.session.snapshotEvents()
    const snapshot = this.trajectoryProjection.update(events, this.trajectoryLimit)
    this.trajectoryStore.set(snapshot)
  }

  private closeTrajectory(): void {
    this.trajectoryStore.set(undefined)
    this.trajectoryLimit = 256
    this.trajectoryProjection.reset()
  }

  private loadOlderTrajectory(): void {
    if (this.trajectoryStore.getSnapshot()?.omitted === 0) return
    this.trajectoryLimit = Math.min(100_000, this.trajectoryLimit + 256)
    this.openTrajectory()
  }

  private async openHostPluginCenter(): Promise<void> {
    const generation = ++this.hostPluginCenterGeneration
    const inventory = this.ctx.get('pluginInventory') as {
      list(): Promise<import('@deepseek-ai/dsh-host-plugin-inventory/types').PluginInventorySnapshot>
    } | undefined
    const settings = this.ctx.get('settings') as {
      readonly writable: boolean
      describe(options?: { redactSecrets?: boolean }): import('@deepseek-ai/dsh-settings').SettingsDescriptor[]
    } | undefined
    const options: import('./host-plugin-center.ts').TuiHostPluginCenterCollectOptions = {
      ...(inventory !== undefined ? { inventory } : {}),
      ...(settings !== undefined ? { settings } : {}),
    }
    const snapshot = await collectTuiHostPluginCenter(options, this.locale)
    if (generation === this.hostPluginCenterGeneration) this.hostPluginCenterStore.set(snapshot)
  }

  private closeHostPluginCenter(): void {
    this.hostPluginCenterGeneration += 1
    this.hostPluginCenterStore.set(undefined)
  }

  private async refreshHostPluginCenter(): Promise<void> {
    if (this.hostPluginCenterStore.getSnapshot() === undefined) return Promise.resolve()
    await this.openHostPluginCenter()
  }

  private async mutateHostSettings(mutation: TuiHostSettingsMutation): Promise<void> {
    try {
      await hostSettings(this.ctx).mutate(mutation.ns, [...mutation.ops], mutation.expectedRevision)
    } finally {
      if (this.hostPluginCenterStore.getSnapshot() !== undefined) await this.openHostPluginCenter()
    }
  }

  private async createManagedWorkspace(agent: Agent, path: string): Promise<void> {
    const registry = hostWorkspaceRegistry(this.ctx)
    await registry.create(resolve(agent.session.header.cwd ?? process.cwd(), path))
    await this.refreshSessionManager(agent)
  }

  private async renameManagedWorkspace(agent: Agent, row: TuiWorkspaceManagerRow, title: string): Promise<void> {
    const workspace = hostWorkspaceRegistry(this.ctx).get(row.id)
    if (workspace === undefined) throw new Error('Workspace was removed before it could be renamed')
    await workspace.setTitle(title.trim())
    await this.refreshSessionManager(agent)
  }

  private async moveManagedWorkspace(
    agent: Agent,
    row: TuiWorkspaceManagerRow,
    direction: -1 | 1,
  ): Promise<void> {
    const registry = hostWorkspaceRegistry(this.ctx)
    const roster = registry.list()
    const index = roster.findIndex(workspace => workspace.id === row.id)
    if (index < 0) throw new Error('Workspace was removed before it could be moved')
    if (direction < 0) {
      if (index === 0) return
      await registry.insertBefore(row.id, roster[index - 1]?.id)
    } else {
      if (index === roster.length - 1) return
      await registry.insertBefore(row.id, roster[index + 2]?.id)
    }
    await this.refreshSessionManager(agent)
  }

  private async deleteManagedWorkspace(agent: Agent, row: TuiWorkspaceManagerRow): Promise<void> {
    await hostWorkspaceRegistry(this.ctx).delete(row.id)
    await this.refreshSessionManager(agent)
  }

  private async setManagedSessionArchived(
    agent: Agent,
    candidate: TuiResumeCandidate,
    archived: boolean,
  ): Promise<void> {
    const registry = hostWorkspaceRegistry(this.ctx)
    if (archived) await registry.archiveSession(candidate.record.header.id)
    else if (typeof registry.unarchiveSession === 'function') {
      await registry.unarchiveSession(candidate.record.header.id)
    } else {
      throw new Error('Session restore is unavailable on this DeepSeek Harness version')
    }
    await this.refreshSessionManager(agent)
  }

  private async renameManagedSession(
    agent: Agent,
    candidate: TuiResumeCandidate,
    title: string,
  ): Promise<void> {
    if (!this.ownsAgent(agent)) throw new Error('TUI Session changed before rename')
    const titles = this.ctx.get('sessionTitle')
    if (titles === undefined) throw new Error('Session title owner is unavailable')
    const id = candidate.record.header.id
    const live = this.ctx.sessions.get(id)
    if (live !== undefined) {
      if (live === agent.session && agent.status !== 'idle') throw new Error(`current Agent is ${agent.status}`)
      titles.rename(live, title)
      await this.ctx.sessions.flush(live)
    } else {
      const persistence = this.ctx.get('sessionPersistence')
      if (persistence === undefined) throw new Error('Session persistence is unavailable')
      const handle = await persistence.open(id, 'write')
      try {
        const loaded = await handle.read()
        const session = Session.fromRestore(id, loaded.events, handle.header, handle.inheritedEventCount, loaded.eventState)
        const detach = this.ctx.sessions.enter(session)
        try {
          this.ctx.sessions.announce(session)
          const before = session.seq
          titles.rename(session, title)
          await handle.append(session.snapshotEvents(before))
          await handle.flush()
        } finally {
          detach()
        }
      } finally {
        await handle.close()
      }
    }
    await this.refreshSessionManager(agent)
  }

  private async activateManagedResume(agent: Agent, candidate: TuiResumeCandidate): Promise<void> {
    const dialog = this.sessionManager.getSnapshot()
    if (dialog?.phase !== 'ready' || !this.ownsAgent(agent) || this.activeAgentSwitch !== undefined) return
    const current = dialog.candidates?.find(item => item.record.header.id === candidate.record.header.id)
    if (current === undefined) return
    if (current.disabledReason !== undefined) {
      this.sessionManager.set({ ...dialog, error: current.disabledReason })
      return
    }
    if (agent.status !== 'idle') {
      this.sessionManager.set({ ...dialog, error: tuiMessage(this.locale, 'resume.error.agentBusy', { status: agent.status }) })
      return
    }
    const decision = await this.ctx.tuiExtensions.decide({
      kind: 'session-switch', sessionId: agent.session.id,
      targetSessionId: current.record.header.id, operation: 'resume',
    })
    if (decision.outcome === 'deny') {
      this.sessionManager.set({ ...dialog, error: decision.reason ?? tuiMessage(this.locale, 'resume.error.denied') })
      return
    }
    const controller = new AbortController()
    const { error: _error, ...mutating } = dialog
    this.sessionManager.set({ ...mutating, phase: 'mutating' })
    const completion = this.resumeCandidate(agent, current, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted || this.isClosing()) return
      const latest = this.sessionManager.getSnapshot()
      if (latest?.generation !== dialog.generation) return
      this.sessionManager.set({ ...latest, phase: 'ready', error: errorChain(error) })
    })
    const operation: ActiveAgentSwitch = { kind: 'resume', controller, completion }
    this.activeAgentSwitch = operation
    await completion.finally(() => {
      if (this.activeAgentSwitch === operation) this.activeAgentSwitch = undefined
    })
  }

  private async openManagedFork(agent: Agent, candidate: TuiResumeCandidate): Promise<void> {
    const dialog = this.sessionManager.getSnapshot()
    if (dialog?.phase !== 'ready' || !this.ownsAgent(agent) || this.activeAgentSwitch !== undefined) return
    const current = dialog.candidates?.find(item => item.record.header.id === candidate.record.header.id)
    if (current === undefined) return
    if (agent.status !== 'idle') throw new Error(`current Agent is ${agent.status}`)
    if (this.interactions.getSnapshot() !== undefined) throw new Error(tuiMessage(this.locale, 'session.error.interaction'))
    const id = current.record.header.id
    const live = this.ctx.sessions.get(id)
    const source = live === undefined
      ? await this.ctx.sessionQuery.readSession(id)
      : { session: live.header, events: live.snapshotEvents() }
    if (source.session.origin === 'subagent') throw new Error('subagent-owned Sessions cannot be forked here')
    const cwd = source.session.cwd
    if (cwd === undefined) throw new Error(tuiMessage(this.locale, 'session.error.workspace'))
    const preset = resolveSessionPreset({ header: source.session, events: source.events })
    if (preset === undefined) throw new Error(tuiMessage(this.locale, 'rewind.error.preset'))
    const fallback = this.selection?.current ?? this.modelSelection.getSnapshot()
    const selection = sessionForkSelection(source.events, fallback)
    if (selection === undefined) throw new Error(tuiMessage(this.locale, 'session.error.model'))
    if (!this.ctx.llm.listProviders().some(provider => provider.id === selection.provider)) {
      throw new Error(`session route is unavailable (${selection.provider}/${selection.model})`)
    }
    const candidates = tuiRewindCandidates(source.events)
    if (candidates.length === 0) throw new Error(tuiMessage(this.locale, 'rewind.turn.none'))
    this.detachedRewindSource = { id, cwd, events: source.events, selection, preset }
    this.closeSessionManager()
    this.rewindDialog.set({
      generation: ++this.rewindGeneration,
      phase: 'browsing',
      currentSessionId: id,
      candidates,
    })
  }

  private currentGoal(agent: Agent): NonNullable<TuiGoalProjection>['goal'] {
    if (!this.ownsAgent(agent)) throw new Error('TUI Session changed before Goal mutation')
    const goal = this.goalProjection.getSnapshot()?.goal
    if (goal === undefined || goal.phase === 'complete') throw new Error(tuiMessage(this.locale, 'goalPlan.goal.none'))
    return goal
  }

  private editGoal(agent: Agent, objective: string): Promise<void> {
    const goal = this.currentGoal(agent)
    hostGoals(agent).edit(agent, { id: goal.id, revision: goal.revision }, { objective })
    return Promise.resolve()
  }

  private pauseGoal(agent: Agent): Promise<void> {
    const goal = this.currentGoal(agent)
    hostGoals(agent).pause(agent, { id: goal.id, revision: goal.revision })
    return Promise.resolve()
  }

  private resumeGoal(agent: Agent): Promise<void> {
    const goal = this.currentGoal(agent)
    hostGoals(agent).resume(agent, { id: goal.id, revision: goal.revision })
    return Promise.resolve()
  }

  private clearGoal(agent: Agent): Promise<void> {
    const goal = this.currentGoal(agent)
    hostGoals(agent).clear(agent, { id: goal.id, revision: goal.revision })
    return Promise.resolve()
  }

  private async scanResume(
    agent: Agent,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    const candidates = await this.collectSessionCandidates(agent, signal)
    signal.throwIfAborted()
    if (!this.ownsAgent(agent) || this.resumeGeneration !== generation) return
    this.resumeDialog.set({
      generation,
      phase: 'ready',
      currentWorkspaceLabel: agent.session.header.cwd ?? tuiMessage(this.locale, 'resume.workspace.none'),
      candidates,
    })
  }

  private async collectSessionCandidates(
    agent: Agent,
    signal: AbortSignal,
    options: { readonly includePreviews?: boolean } = {},
  ): Promise<readonly TuiResumeCandidate[]> {
    const records = await this.ctx.sessionQuery.listSessions(signal)
    signal.throwIfAborted()
    const [titles, activity, previews, presetResolutions] = await Promise.all([
      this.resolveResumeTitles(records, signal),
      this.resolveResumeActivity(records, signal),
      options.includePreviews === false
        ? Promise.resolve<ResumePreviewResolution[]>(records.map(() => ({ lines: [], truncated: false })))
        : this.resolveResumePreviews(records, signal),
      this.resolveResumePresets(records, signal),
    ])
    signal.throwIfAborted()
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
    return sortTuiResumeCandidates(candidates)
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
            : { session: live.header, events: live.snapshotEvents() }
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
    if (live !== undefined) return live.snapshotEvents().at(-1)?.time
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return undefined
    const snapshot = await persistence.stat(record.header.id, { signal })
    if (snapshot === undefined) return undefined
    const handle = await persistence.open(record.header.id, 'read', { signal })
    try {
      const offset = snapshot.eventCount === undefined ? 0 : Math.max(0, snapshot.eventCount - 1)
      const { events } = await handle.read(offset, undefined, { signal })
      signal.throwIfAborted()
      return events.at(-1)?.time
    } finally {
      await handle.close()
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
    const cached = record.header.isSeeded
      ? undefined
      : cache.cachedSnapshot(record.header, SessionLogOffset(0), ['title'])
    if (cached !== undefined && 'title' in cached.values) return cached.values.title
    const observation = await this.ctx.sessionQuery.observeSession(record.header.id, { signal })
    try {
      return observation.projections?.values.title
    } finally {
      observation[Symbol.dispose]()
    }
  }

  private async activateResume(
    agent: Agent,
    candidate: TuiResumeCandidate,
    followup?: 'rename',
  ): Promise<void> {
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
    const completion = this.resumeCandidate(agent, current, controller.signal, followup).catch((error: unknown) => {
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
    followup?: 'rename',
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
      ? prepared.legacyPresetMigrated
        ? tuiMessage(this.locale, 'mode.legacy.resumed', { title: candidate.title })
        : `Resumed ${candidate.title}.`
      : `Resumed ${candidate.title}; previous Session cleanup failed: ${errorChain(retirementError)}`)
    if (followup === 'rename') this.prefillComposer('/rename ')
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
    const cwd = dialog.workspaceLabel
    const selectedModel = this.selection?.current ?? this.modelSelection.getSnapshot()
    if (selectedModel === undefined) {
      this.freshSessionDialog.set({ ...dialog, error: tuiMessage(this.locale, 'session.error.model') })
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
    const preset = targetPreset?.id ?? resolveSessionPreset({
      header: oldAgent.session.header,
      events: oldAgent.session.snapshotEvents(),
    })
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
    const oldGoalProjection = this.goalProjection.getSnapshot()
    const oldPlanProjection = this.planProjection.getSnapshot()
    const oldGoalPlanProjectionFrame = this.goalPlanProjectionFrame
    const oldMessageFeedback = this.messageFeedbackStore.getSnapshot()
    const oldFeedbackMutation = this.feedbackMutationStore.getSnapshot()
    const oldDialog = this.resumeDialog.getSnapshot()
    const oldSessionManager = this.sessionManager.getSnapshot()
    const oldFreshDialog = this.freshSessionDialog.getSnapshot()
    const oldRewindDialog = this.rewindDialog.getSnapshot()
    const oldExportDialog = this.sessionExportDialog.getSnapshot()
    const oldActiveView = this.activeView
    if (oldHandle?.agent !== oldAgent || oldEvents === undefined || oldStatus === undefined || this.instance === undefined) {
      throw new Error('TUI Agent switch lost its current owner')
    }
    const nextEvents = new SessionEventStore(prepared.handle.agent.session.snapshotEvents())
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
    this.providerCenter.set(undefined)
    this.feedbackMutationGeneration += 1
    this.messageFeedbackStore.set(undefined)
    this.feedbackMutationStore.set({ status: 'idle' })
    this.refreshAgentDerivedState(prepared.handle.agent)
    try {
      this.instance.rerender(this.appElement(prepared.handle.agent, nextEvents, nextStatus))
      this.resumeDialog.set(undefined)
      this.sessionManager.set(undefined)
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
      this.goalProjection.set(oldGoalProjection)
      this.planProjection.set(oldPlanProjection)
      this.goalPlanProjectionFrame = oldGoalPlanProjectionFrame
      this.messageFeedbackStore.set(oldMessageFeedback)
      this.feedbackMutationStore.set(oldFeedbackMutation.status === 'pending' ? { status: 'idle' } : oldFeedbackMutation)
      this.resumeDialog.set(oldDialog)
      this.sessionManager.set(oldSessionManager)
      this.freshSessionDialog.set(oldFreshDialog)
      this.rewindDialog.set(oldRewindDialog)
      this.sessionExportDialog.set(oldExportDialog)
      this.instance.rerender(this.appElement(oldAgent, oldEvents, oldStatus))
      throw error
    }
    this.bindWorkRoot(prepared.handle.agent)
    void this.refreshFeedback(prepared.handle.agent)
    this.scheduleStartupGuidanceRefresh(prepared.selectedModel)
    return oldHandle
  }

  private refreshPermission(agent: Agent): void {
    const service = this.ctx.get('permissionPresets')
    if (service === undefined) {
      this.permissions.set(undefined)
      return
    }
    const currentValue = service.current(agent.session)
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
    if (itemId === 'schedules') {
      this.openScheduleDialog(agent)
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
      question: tuiMessage(this.locale, 'permissions.question', { current: service.current(agent.session) }),
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
    const outcome = await hostLogin(this.ctx, provider, method, interaction)
    signal.throwIfAborted()
    if (outcome === 'cancelled') {
      this.externalNotice.set(tuiMessage(this.locale, 'models.signin.cancelled'))
      return
    }
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
          const auth = await hostAuthentication(this.ctx, provider.id)
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
        await this.ctx.get('settings')?.update(TUI_SETTINGS_NAMESPACE, { defaultModel: selected })
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
        throw new Error(tuiMessage(this.locale, 'attachment.preflight.commandUnsupported', { command: command.name }))
      }
      const completion = (async () => {
        if (composerAttachments.length > 0) {
          this.assertImageAttachmentLimits(composerAttachments)
          await this.assertImageCapableRoute(agent, controller.signal)
        }
        const images = composerAttachments.length === 0
          ? []
          : await this.encodeImageAttachments(composerAttachments, controller.signal)
        return this.ctx.commands.execute(agent, text, images.map(image => ({ type: 'image' as const, ...image })), controller.signal)
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
    if (composerAttachments.length > 0 || text.includes('dsh-session:')) {
      const controller = new AbortController()
      const completion = (async () => {
        await preflightTuiReferenceText(text, (value, signal) => (
          hostSessionReferences(this.ctx).validateText(agent, value, signal)
        ), controller.signal)
        if (composerAttachments.length === 0) return []
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
    if (composerAttachments.length > 0 || text.includes('dsh-session:')) {
      const preflight = new AbortController()
      const completion = (async () => {
        await preflightTuiReferenceText(text, (value, signal) => (
          hostSessionReferences(this.ctx).validateText(view.agent, value, signal)
        ), preflight.signal)
        if (composerAttachments.length === 0) return []
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
    const completion = queueHostSubagentPrompt(
      this.ctx.subagents,
      parent,
      view.agent.id,
      [{ type: 'text', text }, ...imageBlocks],
      { kind: 'user' },
      controller.signal,
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
    requestTuiExit(() => {
      this.instance?.unmount()
      this.terminal.restore()
    }, this.ownerDisposed ? undefined : () => { this.ctx.get('appExit')?.(this.requestedExit) })
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
    this.goalProjection.set(undefined)
    this.planProjection.set(undefined)
    this.schedulesStore.set(TUI_SCHEDULES_UNAVAILABLE)
    this.scheduleDialogStore.set(undefined)
    const activeCommand = this.activeCommand
    const startupGuidanceRefresh = this.startupGuidanceRefresh
    const activeSessionExport = this.activeSessionExport
    const pluginHubOperation = this.pluginHubOperation
    const providerCenterRefresh = this.providerCenterRefresh
    const providerCenterOperation = this.providerCenterOperation
    const resumeScan = this.resumeScan
    const sessionManagerScan = this.sessionManagerScan
    const activeAgentSwitch = this.activeAgentSwitch
    const workRefresh = this.workRefresh
    const externalEditor = this.externalEditor
    const updateCheck = this.updateCheck
    const themeLoad = this.themeLoad
    this.externalEditorHandoff?.cancel()
    this.activeCommand = undefined
    this.startupGuidanceRefresh = undefined
    this.exitAfterCommand = undefined
    this.activeSessionExport = undefined
    this.pluginHubOperation = undefined
    this.providerCenterRefresh = undefined
    this.providerCenterOperation = undefined
    this.resumeScan = undefined
    this.sessionManagerScan = undefined
    if (this.sessionManagerRefreshTimer !== undefined) clearTimeout(this.sessionManagerRefreshTimer)
    this.sessionManagerRefreshTimer = undefined
    this.activeAgentSwitch = undefined
    this.workRefresh = undefined
    this.externalEditor = undefined
    this.updateCheck = undefined
    this.themeLoad = undefined
    activeCommand?.controller.abort(new Error('TUI command cancelled during shutdown'))
    startupGuidanceRefresh?.controller.abort(new Error('TUI startup guidance refresh cancelled during shutdown'))
    activeSessionExport?.controller.abort(new Error('TUI Session export cancelled during shutdown'))
    pluginHubOperation?.controller.abort(new Error('TUI Plugin Hub request cancelled during shutdown'))
    providerCenterRefresh?.controller.abort(new Error('TUI Provider Center refresh cancelled during shutdown'))
    providerCenterOperation?.controller.abort(new Error('TUI Provider Center authentication cancelled during shutdown'))
    resumeScan?.controller.abort(new Error('TUI Session scan cancelled during shutdown'))
    sessionManagerScan?.controller.abort(new Error('TUI Session Manager scan cancelled during shutdown'))
    activeAgentSwitch?.controller.abort(new Error('TUI Agent switch cancelled during shutdown'))
    workRefresh?.controller.abort(new Error('TUI work catalog refresh cancelled during shutdown'))
    externalEditor?.controller.abort(new Error('TUI external editor cancelled during shutdown'))
    updateCheck?.controller.abort(new Error('TUI update check cancelled during shutdown'))
    themeLoad?.controller.abort(new Error('TUI custom theme load cancelled during shutdown'))
    this.resumeDialog.set(undefined)
    this.sessionManager.set(undefined)
    this.freshSessionDialog.set(undefined)
    this.rewindDialog.set(undefined)
    this.detachedRewindSource = undefined
    this.sessionExportDialog.set(undefined)
    this.pluginHubDialog.set(undefined)
    this.providerCenter.set(undefined)
    this.activeView = undefined
    this.disposers.approval?.()
    this.disposers.helpCommand?.()
    this.disposers.doctorCommand?.()
    this.disposers.contextCommand?.()
    this.disposers.configCommand?.()
    this.disposers.providerCommand?.()
    this.disposers.updateCommand?.()
    this.disposers.skillsCommand?.()
    this.disposers.mcpCommand?.()
    this.disposers.tipsCommand?.()
    this.disposers.btwCommand?.()
    this.disposers.workspaceCommand?.()
    this.disposers.sessionsCommand?.()
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
    this.disposers.settingsDocumentUpdated?.()
    this.disposers.credentialsUpdated?.()
    this.disposers.workspaceChanged?.()
    this.disposeWorkRootBindings()
    this.disposers.agentDisposed?.()
    this.disposers.agentCreated?.()
    this.disposers.jobsChanged?.()
    this.disposers.jobsController?.()
    this.disposers.agentStatus?.()
    this.disposers.sessionEvents?.()
    this.disposers.assistantStream?.()
    this.assistantStreams.clear()
    this.disposers.questionProvider?.()
    this.terminal.restore()
    const releaseAgent = async (): Promise<void> => {
      // A cancelled switch still owns any staged/replaced handle until it settles.
      await activeAgentSwitch?.completion.catch(() => undefined)
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
    await Promise.all([
      releaseAgent(),
      activeCommand?.completion.catch(() => undefined),
      startupGuidanceRefresh?.completion.catch(() => undefined),
      activeSessionExport?.completion.catch(() => undefined),
      pluginHubOperation?.completion.catch(() => undefined),
      providerCenterRefresh?.completion.catch(() => undefined),
      providerCenterOperation?.completion.catch(() => undefined),
      resumeScan?.completion.catch(() => undefined),
      sessionManagerScan?.completion.catch(() => undefined),
      activeAgentSwitch?.completion.catch(() => undefined),
      workRefresh?.completion.catch(() => undefined),
      externalEditor?.completion.catch(() => undefined),
      updateCheck?.completion.catch(() => undefined),
      themeLoad?.completion.catch(() => undefined),
    ])
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

function sessionForkSelection(
  events: readonly SessionEvent[],
  fallback: ModelSelection | undefined,
): ModelSelection | undefined {
  const header = events.findLast(event => event.type === 'request/header')
  if (header?.type === 'request/header') {
    const config = header.data.header.config
    return {
      provider: config.provider,
      model: config.model,
      ...config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort },
    }
  }
  const route = resumeRoute(events)
  return route ?? fallback
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
  TranscriptTodoNode, TranscriptToolActivityNode, TranscriptToolGroupNode, TranscriptToolNode,
  TranscriptTurnUsageNode, TranscriptQuestionItem, TranscriptQuestionNode, TuiTranscriptTurnAnchor,
} from './transcript.ts'
export {
  foldTranscript, navigateTuiTranscriptTurn, tuiTranscriptTurnAnchors, TuiTranscriptProjectionCache,
} from './transcript.ts'
export { formatTuiTurnUsage, tuiTurnUsageDetailLines } from './turn-usage.ts'
export { preflightTuiSessionStorage } from './storage-preflight.ts'
export type { TuiSessionStoragePreflight } from './storage-preflight.ts'
export {
  toolActivityActiveText, toolActivityHeadingText,
  tuiToolActivityCategory, tuiToolActivityRows, tuiToolActivitySummary,
} from './tool-activity.tsx'
export type { TuiToolActivityCategory, TuiToolActivitySummary } from './tool-activity.tsx'
export { TuiAppendOnlySessionWindow } from './session-window.ts'
export type { TuiSessionWindowUpdate } from './session-window.ts'
export type { TuiKnownSessionEventRenderer } from './transcript.ts'
export { tuiAssistantResponseParts, tuiAssistantResponseText } from './assistant-response.ts'
export type { TuiAssistantResponsePart } from './assistant-response.ts'
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
  DEFAULT_TUI_SETTINGS, resolveTuiTheme, TUI_ACTIVITY_PREFERENCES, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA,
  TUI_MOUSE_PREFERENCES, TUI_PROVIDER_ONBOARDING_VERSION, TUI_THEME_PREFERENCES, TuiThemeProvider, useTuiTheme,
} from './theme.tsx'
export type {
  TuiActivityPreference, TuiCustomThemeDefinition, TuiMousePreference, TuiResolvedThemePreference,
  TuiSemanticThemeTokens, TuiSettings, TuiTheme, TuiThemePreference,
} from './theme.tsx'
export { listTuiCustomThemes, loadTuiCustomTheme } from './custom-theme.ts'
export type { TuiCustomThemeFile } from './custom-theme.ts'
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
  tuiContextSegmentBar, visibleTuiFooterItems,
} from './footer.ts'
export type {
  TuiFooterItemDescriptor, TuiFooterItemId, TuiFooterPointerTarget, TuiFooterSources, TuiFooterTranscriptPosition,
} from './footer.ts'
export { projectTuiLatestSpeed, projectTuiSettledSpeed } from './live-feedback.ts'
export type { TuiSpeedProjection } from './live-feedback.ts'
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
export { resolveTuiOutputExportPath, tuiOutputMarkdown, writeTuiOutputMarkdown } from './output-export.ts'
export type { TuiOutputExportKind, TuiOutputExportResult } from './output-export.ts'
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
  collectTuiReferenceResolution, preflightTuiReferenceText, tuiReferenceQuery, tuiReferenceSuggestionState,
} from './references.ts'
export type { TuiReferenceProviders, TuiReferenceQuery, TuiReferenceResolution } from './references.ts'
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
  formatTuiPluginHubRelativeTime, formatTuiPluginHubStars, tuiPluginHubAvailableCategories, tuiPluginHubCardHeight,
  tuiPluginHubDiscoveryRows,
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
  TuiWorkItemView, TuiWorkProjectionInput, TuiWorkRouteFacts, TuiWorkSnapshot, TuiWorkSummary,
} from './work.ts'
export { formatTuiWorkElapsed, formatTuiWorkOwner, formatTuiWorkRoute } from './work-panel.tsx'
export {
  previousTranscriptPageAnchor, selectTranscriptPage, selectTranscriptWindow,
  terminalWrappedLines, tuiTranscriptWindowEntryRows, TuiTranscriptScrollController,
  TuiTranscriptViewportIndex, TuiTranscriptWheelBoundaryGuard,
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
  advanceTuiScreenClick, extendTuiScreenSelection, resolveTuiScreenSelection,
  tuiScreenSelectionText, tuiScreenTextSegments,
} from './selection.ts'
export type {
  TuiScreenClick, TuiScreenPosition, TuiScreenSelection, TuiScreenSelectionDirection,
  TuiScreenSelectionGesture, TuiScreenTextSegment,
} from './selection.ts'
export {
  TuiPointerRegionRegistry, tuiApprovalPointerRegions, tuiFooterPointerRegions, tuiModalClosePointerRegions,
  tuiAssistantOutputPointerRegions,
  tuiGoalPlanDialogPointerRegions, tuiGoalPlanPointerRegions,
  tuiPluginHubPointerRegions, tuiProviderPointerRegions, tuiQuestionPointerRegions, tuiQueuePointerRegions,
  tuiResumePointerRegions, tuiSchedulePointerRegions, tuiSessionManagerPointerRegions, tuiSuggestionPointerRegions,
  tuiWorkPointerRegions,
} from './pointer.ts'
export {
  createTuiGoalPlanProjectionFrame, effectiveTuiPlanTarget, projectTuiGoalPlan,
  tuiGoalPlanMutationErrorMessage, updateTuiGoalPlanProjectionFrame,
} from './goal-plan.ts'
export type { TuiGoalPlanProjectionFrame, TuiGoalPlanSurface } from './goal-plan.ts'
export { projectTuiDeliverables } from './deliverables.ts'
export type { TuiDeliverableItem, TuiDeliverableOperation, TuiDeliverableSnapshot } from './deliverables.ts'
export {
  collectTuiPresetManager, copyTuiPreset, deleteTuiPreset,
  readTuiPresetComposition, setTuiDefaultPreset, tuiPresetMutationErrorMessage,
  TuiPresetIdError, validateTuiPresetId,
} from './preset-manager.ts'
export type {
  TuiPresetCopyResult, TuiPresetCompositionPreview,
  TuiPresetManagerRow, TuiPresetManagerSnapshot,
} from './preset-manager.ts'
export { collectTuiSchedules, TUI_SCHEDULES_UNAVAILABLE } from './schedules.ts'
export type { TuiScheduleRow, TuiScheduleSnapshot } from './schedules.ts'
export {
  collectTuiHostPluginCenter, filterTuiHostPlugins, planTuiHostSettingsMutation,
  tuiHostSettingsErrorMessage,
} from './host-plugin-center.ts'
export type {
  TuiHostPluginRow, TuiHostPresetPluginGroup, TuiHostSettingsField, TuiHostSettingsMutation, TuiHostSettingsRow,
  TuiHostPluginCenterSnapshot, TuiHostPluginCenterCollectOptions,
  TuiHostPluginFilter,
} from './host-plugin-center.ts'
export {
  createTuiTrajectoryTimelineScale, formatTuiTrajectoryTimeline,
  projectTuiTrajectory, TuiTrajectoryProjectionCache, formatTrajectoryDuration,
  reconcileTuiTrajectorySelection, trajectoryKindLabel, trajectoryTimingFacts,
} from './trajectory.ts'
export type {
  TuiTrajectoryKind, TuiTrajectoryEntry,
  TuiTrajectorySnapshot, TuiTrajectoryTimelineScale, TuiTrajectoryTimingFacts,
} from './trajectory.ts'
export type {
  TuiApprovalPointerOptions, TuiAssistantOutputPointerOptions, TuiHostPluginCenterPointerOptions,
  TuiTrajectoryPointerOptions,
  TuiPluginHubPointerOptions, TuiPointerAction, TuiPointerHit, TuiPointerPoint,
  TuiPointerRect, TuiPointerRegion, TuiPresetManagerPointerOptions,
  TuiSchedulePointerOptions,
  TuiProviderPointerOptions, TuiQuestionPointerOptions, TuiQueuePointerOptions,
  TuiResumePointerOptions, TuiSessionManagerPointerOptions,
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
  TuiSessionStorageDiagnostic,
} from './diagnostics.ts'
export { inspectTuiStartupProvider, projectTuiStartupGuidance } from './startup-guidance.ts'
export type {
  TuiStartupGuidanceLine, TuiStartupGuidanceSnapshot, TuiStartupProviderInspector, TuiStartupProviderState,
} from './startup-guidance.ts'
export {
  canRemoveTuiProvider, collectTuiProviderCenter, createTuiCustomProvider, deriveTuiProviderCredentialRef,
  discoverTuiCustomProviderModels, saveTuiProviderApiKey,
  formatTuiProviderModelDrafts, parseTuiProviderModelDrafts,
  removeTuiProviderProfile, saveTuiProviderEndpoint, saveTuiProviderProfile,
  TuiProviderApiKeyError, TuiProviderEndpointError, TuiProviderProfileError, TuiProviderRemoveError,
  TuiCustomProviderError, tuiProviderOnboardingReadiness,
  validateTuiProviderApiKey, validateTuiProviderEndpoint,
} from './provider-center.ts'
export type {
  TuiCustomProviderDraft, TuiCustomProviderErrorCode, TuiCustomProviderModelDraft, TuiCustomProviderWriters,
  TuiProviderApiKeyErrorCode, TuiProviderApiKeyWriters, TuiProviderEndpointErrorCode,
  TuiProviderAuthenticationMethod, TuiProviderAuthenticationState, TuiProviderCenterCollectOptions,
  TuiProviderCenterCredentialInspector, TuiProviderCenterDialogSnapshot, TuiProviderCenterLlmInspector, TuiProviderCenterRow,
  TuiProviderCenterSettingsInspector, TuiProviderCenterSnapshot, TuiProviderCreationTarget, TuiProviderCredentialSnapshot,
  TuiProviderEditableProfileSnapshot, TuiProviderModelDiscovery,
  TuiProviderOnboardingReadiness,
  TuiProviderProfileDraft, TuiProviderProfileErrorCode, TuiProviderProfileWriter,
  TuiProviderRemoveErrorCode, TuiProviderSettingsSnapshot,
} from './provider-center.ts'
export {
  deleteTuiQueueItem, editTuiQueueItem, formatTuiQueueAge, projectTuiQueue, readTuiQueue,
} from './queue.ts'
export type {
  TuiInboxMutationResult, TuiInboxPendingItem, TuiInboxSnapshot, TuiQueueItem, TuiQueueSnapshot,
} from './queue.ts'
export {
  collectTuiWorkspaceRows, projectTuiSessionManager,
} from './session-manager.ts'
export type {
  TuiSessionArchiveFilter, TuiSessionManagerDialogSnapshot, TuiSessionManagerProjection,
  TuiSessionManagerRow, TuiWorkspaceManagerRow,
} from './session-manager.ts'
export { projectTuiDirectoryBrowser } from './directory-browser.ts'
export type {
  TuiDirectoryBrowserPage, TuiDirectoryBrowserRow,
} from './directory-browser.ts'
