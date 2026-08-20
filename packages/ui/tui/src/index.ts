/**
 * `@lingxi-ai-cn/dsh-tui-runtime` — one full-screen terminal frontend over an owned,
 * in-process Agent and its durable Session log.
 */

import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import React from 'react'
import { render, type Instance } from 'ink'
import {
  createUserMessage,
  errorChain,
  hostAuthentication,
  hostCompletePaths,
  hostLogin,
  installModelSelection,
  installSettingsSection,
  JobId,
  resolveSessionForkAnchor,
  resolveSessionPreset,
  SESSION_FORMAT_VERSION,
  SessionId,
  UserQuestionError,
  z,
  type Agent,
  type AgentCreateSource,
  type AgentHandle,
  type AskUserQuestionItem,
  type CommandInvocation,
  type CommandResult,
  type Context,
  type ContextPressureProjection,
  type FsPathCompletionResult,
  type JobSnapshot,
  type LlmAuthenticationEvent,
  type LlmAuthenticationInteraction,
  type LlmAuthenticationPrompt,
  type ModelSelection,
  type ModelSelectionRef,
  type PermissionSelect,
  type SessionEvent,
  type SessionProjectionCache,
  type SessionRecord,
  type SubagentDescendantListEntry,
  type SubagentRunEndInfo,
  type SubagentRunInfo,
} from './host.ts'
import { SessionLogExportError } from '@lingxi-ai-cn/dsh-session-export'
import { PluginHubError, type PluginCatalogSort, type PluginCategory, type PluginChangePlan, type PluginId } from '@lingxi-ai-cn/dsh-plugin-hub'
import type {} from '@lingxi-ai-cn/dsh-plugin-hub'
import { TuiApp } from './app.tsx'
import type { TuiAgentViewDescriptor } from './agent-view.ts'
import type { TuiFooterItemId } from './footer.ts'
import {
  resolveTuiInteractionRegistry, TUI_INTERACTION_REGISTRY,
  type TuiInteractionDescriptor,
} from './keybindings.ts'
import { openExternalUrl } from './open-url.ts'
import {
  sortTuiResumeCandidates, summarizeTuiResumeCandidate,
  type TuiResumeCandidate, type TuiResumeDialogSnapshot,
} from './resume.ts'
import {
  type TuiFreshSessionCommand, type TuiFreshSessionDialogSnapshot,
} from './session-lifecycle.ts'
import {
  resolveTuiSessionExportDirectory, type TuiSessionExportDialogSnapshot,
} from './session-export.ts'
import {
  tuiRewindCandidates, type TuiRewindCandidate, type TuiRewindDialogSnapshot,
} from './rewind.ts'
import { AgentStatusStore, InteractionStore, SessionEventStore, ValueStore } from './store.ts'
import {
  TerminalSession, terminalInternals, type TuiTerminalColorDepth,
} from './terminal-session.ts'
import {
  DEFAULT_TUI_SETTINGS, resolveTuiTheme, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA,
  TUI_THEME_PREFERENCES,
  TuiThemeProvider, type TuiSettings, type TuiTheme,
} from './theme.tsx'
import {
  EMPTY_TUI_WORK_SNAPSHOT, projectTuiWork,
  type TuiObservedSubagentRun, type TuiWorkAgentSnapshot, type TuiWorkItemView, type TuiWorkSnapshot,
} from './work.ts'
import { tuiPluginHubNextCategory, tuiPluginHubNextSort, type TuiPluginHubDialogSnapshot } from './plugin-hub.ts'

export const name = 'tui'

export const inject = [
  'agentDefaultModel', 'agents', 'sessions', 'sessionPersistence',
  'sessionQuery', 'commands', 'userQuestions', 'approval', 'llm', 'tools',
  'fs', 'sessionLogExporter', 'jobs', 'subagents',
]

const PATH_COMPLETION_LIMITS = {
  maxDepth: 4,
  maxItems: 32,
  maxScannedEntries: 256,
} as const

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

interface RuntimeDisposers {
  questionProvider?: () => void
  sessionEvents?: () => void
  agentStatus?: () => void
  approval?: () => void
  modelsCommand?: () => void
  configCommand?: () => void
  helpCommand?: () => void
  resumeCommand?: () => void
  clearCommand?: () => void
  newCommand?: () => void
  rewindCommand?: () => void
  exportCommand?: () => void
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

type PrepareTuiAgentRequest =
  | { kind: 'startup' }
  | { kind: 'resume'; sessionId: SessionId }
  | {
    kind: 'fresh'
    source: AgentCreateSource
    cwd: string
    selection: ModelSelection
  }
  | {
    kind: 'rewind'
    parentSession: SessionId
    cwd: string
    selection: ModelSelection
    seed: readonly SessionEvent[]
  }

/** One activation's owned Agent, interactions, Ink root, signals, and terminal transaction. */
class TuiController {
  private readonly terminal = new TerminalSession(terminalInternals)
  private readonly interactions = new InteractionStore()
  private readonly externalNotice = new ValueStore('')
  private readonly modelSelection = new ValueStore<ModelSelection | undefined>(undefined)
  private readonly helpOpen = new ValueStore(false)
  private readonly permissions = new ValueStore<PermissionSelect | undefined>(undefined)
  private readonly contextPressure = new ValueStore<ContextPressureProjection | undefined>(undefined)
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
  private handle: AgentHandle | undefined
  private events: SessionEventStore | undefined
  private status: AgentStatusStore | undefined
  private instance: Instance | undefined
  private requestedExit = 0
  private closing: Promise<void> | undefined
  private ownerDisposed = false
  private selection: ModelSelectionRef | undefined
  private activeCommand: ActiveOperation | undefined
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
  private settingsSource: () => TuiSettings = () => DEFAULT_TUI_SETTINGS
  private terminalColorDepth: TuiTerminalColorDepth = 'ansi16'
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
    this.theme = resolveTuiTheme(settings.theme, this.terminalColorDepth)
    this.interactionRegistry = resolveTuiInteractionRegistry(settings.keybindings)
    const root = this.handle?.agent
    if (root === undefined || this.events === undefined || this.status === undefined || this.instance === undefined) return
    this.instance.rerender(this.appElement(root, this.events, this.status))
  }

  async run(): Promise<void> {
    try {
      this.terminal.assertInteractive()
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
      this.refreshAgentDerivedState(handle.agent)
      this.installRuntimeBindings()
      this.bindWorkRoot(handle.agent)
      const terminalCapabilities = await this.terminal.negotiate()
      this.terminalColorDepth = terminalCapabilities.colorDepth
      this.refreshSettings()
      this.terminal.enter(terminalCapabilities)
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
      helpOpen: this.helpOpen,
      permissions: this.permissions,
      contextPressure: this.contextPressure,
      resumeDialog: this.resumeDialog,
      freshSessionDialog: this.freshSessionDialog,
      rewindDialog: this.rewindDialog,
      sessionExportDialog: this.sessionExportDialog,
      pluginHubDialog: this.pluginHubDialog,
      work: this.work,
      maxResumeOptions: this.config.maxResumeOptions ?? 8,
      commands: activeView === undefined ? this.ctx.commands.list(root) : [],
      interactionRegistry: this.interactionRegistry,
      completePaths: (query, signal) => this.completePaths(root, agent, query, signal),
      onInputCursor: (target) => { this.terminal.setInputCursor(target) },
      initialTerminalInput: this.terminal.takeBufferedInput(),
      onCopy: text => this.terminal.copyToClipboard(text),
      onSubmit: (text: string) => activeView === undefined
        ? this.submit(root, text)
        : this.submitChild(root, activeView, text),
      onActivateFooter: itemId => this.activateFooter(root, itemId),
      onResume: candidate => this.activateResume(root, candidate),
      onCloseResume: () => { this.closeResume() },
      onConfirmFreshSession: () => this.activateFreshSession(root),
      onCloseFreshSession: () => { this.closeFreshSession() },
      onRewind: candidate => this.activateRewind(root, candidate),
      onCloseRewind: () => { this.closeRewind() },
      onExportSession: (directory, includeDescendants) => this.activateSessionExport(
        root, directory, includeDescendants,
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
      onCancelWork: item => this.cancelWork(root, item),
      onOpenWork: item => this.openWorkView(root, item),
      onReturnRoot: () => { this.showRootView(root) },
      onCancel: () => { this.cancelView(root, activeView) },
      onExit: () => { this.requestExit(0) },
    })
    return React.createElement(TuiThemeProvider, { theme: this.theme }, app)
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
    const setup = (agentCtx: Context): void => {
      const session = agentCtx.agent?.session
      if (session === undefined) throw new Error('TUI Agent setup cannot resolve its unpublished Session')
      if (request.kind === 'resume') this.assertResumeCompatible(session.header, session.events)
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
    }
    const handle = request.kind !== 'resume'
      ? await agents.create({
        sessionId: SessionId(`session-${randomUUID()}`),
        meta: request.kind === 'startup'
          ? { cwd: process.cwd() }
          : request.kind === 'fresh'
            ? { cwd: request.cwd }
            : {
              cwd: request.cwd,
              parentSession: request.parentSession,
              seedLength: request.seed.length,
            },
        ...request.kind === 'rewind' ? { seed: request.seed } : {},
        agentOptions: { provider: defaultSelection.provider, model: defaultSelection.model },
        setup,
        // Official rc.8 ignores this additive lifecycle field; newer Hosts use
        // it to publish the exact create reason without changing the Agent API.
        ...{ source: request.kind === 'fresh' ? request.source : request.kind === 'rewind' ? 'rewind' : 'startup' },
        ...signal === undefined ? {} : { signal },
      })
      : await agents.resume({
        resumeSessionId: request.sessionId,
        agentOptions: { provider: defaultSelection.provider, model: defaultSelection.model },
        setup,
        ...signal === undefined ? {} : { signal },
      })
    return { handle, selection: selected, selectedModel: selected.current ?? defaultSelection }
  }

  private assertResumeCompatible(
    header: Agent['session']['header'],
    events: readonly SessionEvent[],
  ): void {
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
    if (preset !== undefined) {
      throw new Error(
        `cannot resume preset-bearing Session ${JSON.stringify(header.id)} in the process-wide TUI composition `
        + `(recorded preset: ${JSON.stringify(preset)})`,
      )
    }
    const route = resumeRoute(events)
    if (route !== undefined && !this.ctx.llm.listProviders().some(provider => provider.id === route.provider)) {
      throw new Error(`session route is unavailable (${route.provider}/${route.model})`)
    }
  }

  private refreshAgentDerivedState(agent: Agent): void {
    this.refreshPermission(agent)
    const projections = this.ctx.get('sessionProjections')
    this.contextPressure.set(projections?.snapshot(agent.session).values.contextPressure)
  }

  private installRuntimeBindings(): void {
    const projections = this.ctx.get('sessionProjections')
    if (projections !== undefined) {
      this.disposers.projectionChanged = projections.onChanged((session, key, value) => {
        if (session === this.handle?.agent.session && key === 'contextPressure') {
          this.contextPressure.set(value as ContextPressureProjection)
        }
        if (key === 'subagentTiming' && this.workCatalog.some(entry => entry.id === session.id)) {
          this.rebuildWorkSnapshot()
        }
      })
    }
    this.disposers.sessionEvents = this.ctx.on('session/event', (session, event) => {
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
      this.disposers.pluginHubCommand = this.ctx.commands.register({
        name: 'plugins',
        description: 'Browse the Plugin Hub catalog',
        input: { hint: '[search]' },
        handler: invocation => this.executePlugins(invocation),
      })
    }
    this.disposers.modelsCommand = this.ctx.commands.register({
      name: 'models',
      description: 'Select and configure a model',
      handler: invocation => this.executeModels(invocation),
    })
    this.disposers.configCommand = this.ctx.commands.register({
      name: 'config',
      description: 'Configure TUI theme and keybindings',
      handler: invocation => this.executeConfig(invocation),
    })
    this.disposers.helpCommand = this.ctx.commands.register({
      name: 'help',
      description: 'List available commands',
      handler: invocation => this.executeHelp(invocation),
    })
    this.disposers.resumeCommand = this.ctx.commands.register({
      name: 'resume',
      description: 'Select and resume a Session',
      handler: invocation => this.executeResume(invocation),
    })
    this.disposers.clearCommand = this.ctx.commands.register({
      name: 'clear',
      description: 'Start a fresh Session',
      handler: invocation => this.executeFreshSession(invocation, 'clear'),
    })
    this.disposers.newCommand = this.ctx.commands.register({
      name: 'new',
      description: 'Start a fresh Session',
      handler: invocation => this.executeFreshSession(invocation, 'new'),
    })
    this.disposers.rewindCommand = this.ctx.commands.register({
      name: 'rewind',
      description: 'Branch from an earlier human turn',
      handler: invocation => this.executeRewind(invocation),
    })
    this.disposers.exportCommand = this.ctx.commands.register({
      name: 'export',
      description: 'Export the durable Session archive',
      handler: invocation => this.executeSessionExport(invocation),
    })
    this.disposers.quitCommand = this.ctx.commands.register({
      name: 'quit',
      description: 'Exit the TUI',
      handler: invocation => this.executeExit(invocation, 'quit'),
    })
    this.disposers.exitCommand = this.ctx.commands.register({
      name: 'exit',
      description: 'Exit the TUI',
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
    if (query.length > 160) return { kind: 'error', text: 'Plugin search is limited to 160 characters.' }
    if (invocation.agent !== this.handle?.agent || this.activeView !== undefined) {
      return { kind: 'error', text: 'Plugin Hub is available only from the owned root Agent view.' }
    }
    const pluginHub = this.ctx.get('pluginHub')
    if (pluginHub === undefined || !pluginHub.hasProvider()) {
      return { kind: 'error', text: 'The Plugin Hub provider is unavailable in this TUI composition.' }
    }
    if (this.interactions.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Plugin Hub is unavailable while an interaction is waiting.' }
    }
    if (this.resumeDialog.getSnapshot() !== undefined || this.freshSessionDialog.getSnapshot() !== undefined
      || this.rewindDialog.getSnapshot() !== undefined || this.sessionExportDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Close the current Session dialog before opening Plugin Hub.' }
    }
    if (this.pluginHubDialog.getSnapshot() !== undefined) {
      return { kind: 'error', text: 'Plugin Hub is already open.' }
    }
    const generation = ++this.pluginHubGeneration
    this.helpOpen.set(false)
    this.pluginHubDialog.set({ generation, phase: 'loading', view: 'discover', initialQuery: query, sort: 'stars',
      profileMutations: pluginHub.supportsProfileMutations() })
    void this.searchPluginHub(invocation.agent, query, 'stars', null)
    return { kind: 'success', text: 'Opened Plugin Hub.' }
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
      ...(category === undefined ? { category: undefined } : { category }), loadingMore: false, detail: undefined, error: undefined })
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
        error: `Plugin Hub catalog unavailable: ${errorChain(error)}` })
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
    this.pluginHubDialog.set({ ...snapshot, loadingMore: true, error: undefined })
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
      this.pluginHubDialog.set({ ...current, loadingMore: false, phase: 'error', error: `Plugin Hub catalog unavailable: ${errorChain(error)}` })
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
        initialQuery: snapshot.initialQuery, sort: snapshot.sort, category: snapshot.category, loadingMore: false, error: `Installed plugins unavailable: ${errorChain(error)}` })
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
    this.pluginHubDialog.set({ ...snapshot, phase: 'detail-loading', detail: undefined, error: undefined })
    const operation: ActiveOperation = { controller, completion: Promise.resolve() }
    const completion = pluginHub.plugin(pluginId, controller.signal).then((detail) => {
      const current = this.pluginHubDialog.getSnapshot()
      if (controller.signal.aborted || this.pluginHubOperation !== operation
        || this.handle?.agent !== root || current?.generation !== generation) return
      this.pluginHubDialog.set({ ...current, phase: 'detail', detail, error: undefined })
    }).catch((error: unknown) => {
      const current = this.pluginHubDialog.getSnapshot()
      if (controller.signal.aborted || this.pluginHubOperation !== operation || current?.generation !== generation) return
      this.pluginHubDialog.set({ ...current, phase: 'error', error: `Plugin detail unavailable: ${errorChain(error)}` })
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
    this.pluginHubDialog.set({ ...snapshot, phase: 'planning', plan: undefined, error: undefined })
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
      this.pluginHubDialog.set({ ...current, phase: 'error', error: `Plugin plan failed: ${errorChain(error)}` })
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
    this.pluginHubDialog.set({ ...snapshot, phase: 'staging', error: undefined })
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
        this.pluginHubDialog.set({ ...current, phase: 'error', error: `Plugin activation failed: ${errorChain(error)}` })
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
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: 'Usage: /help' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
    this.helpOpen.set(true)
    const lines = this.ctx.commands.list(invocation.agent).map(command =>
      `/${command.name}${command.input === undefined ? '' : ` ${command.input.hint}`} — ${command.description}`)
    return { kind: 'success', text: lines.join('\n') }
  }

  private async executeConfig(invocation: CommandInvocation): Promise<CommandResult> {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: 'Usage: /config' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
    const settings = this.ctx.get('settings')
    if (settings === undefined) return { kind: 'error', text: 'The settings provider is unavailable in this TUI composition.' }
    this.helpOpen.set(false)
    this.externalNotice.set('')
    const current = this.settingsSource()
    const themeLabel = `Theme (${current.theme})`
    const actionLabel = 'Keybindings'
    const resetLabel = 'Reset TUI settings'
    const choice = await this.askOne(invocation.agent, invocation.signal, {
      id: 'tui-config',
      header: 'Config',
      question: 'Choose a TUI setting:',
      options: [
        { label: themeLabel, description: 'Choose dark, light, or no-color output.' },
        { label: actionLabel, description: 'Replace one interaction action\'s key gestures.' },
        { label: resetLabel, description: 'Remove TUI overrides and restore defaults.' },
      ],
    })
    const selected = choice.selected[0]
    if (selected === themeLabel) {
      const themeChoices = TUI_THEME_PREFERENCES.map(theme => ({
        value: theme,
        label: theme === current.theme ? `${theme} (current)` : theme,
      }))
      const themeAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-theme',
        header: 'Theme',
        question: 'Choose a terminal theme:',
        options: themeChoices.map(theme => ({ label: theme.label })),
      })
      const selectedTheme = themeChoices.find(theme => theme.label === themeAnswer.selected[0])?.value
      if (selectedTheme === undefined) return { kind: 'error', text: 'Theme selection cancelled.' }
      try {
        await settings.update(TUI_SETTINGS_NAMESPACE, { theme: selectedTheme })
      } catch (error: unknown) {
        return { kind: 'error', text: `Could not update theme: ${errorChain(error)}` }
      }
      return { kind: 'success', text: `Theme set to ${selectedTheme}.` }
    }
    if (selected === actionLabel) {
      const configurableActionIds = new Set(TUI_INTERACTION_REGISTRY
        .filter(candidate => candidate.bindings.some(binding => binding.kind === 'key'))
        .map(candidate => candidate.id))
      const actions = this.interactionRegistry.filter(candidate => configurableActionIds.has(candidate.id))
      const actionLabels = new Map(actions.map(candidate => [
        `${candidate.id} · ${candidate.description}`,
        candidate,
      ]))
      const actionAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-keybinding-action',
        header: 'Keybindings',
        question: 'Choose an interaction action:',
        options: actions.map(candidate => ({
          label: `${candidate.id} · ${candidate.description}`,
          description: candidate.bindings.filter(binding => binding.kind === 'key').map(binding => binding.label).join(', '),
        })),
      })
      const action = actionLabels.get(actionAnswer.selected[0] ?? '')
      if (action === undefined) return { kind: 'error', text: 'Keybinding selection cancelled.' }
      const currentBindings = action.bindings.filter(binding => binding.kind === 'key').map(binding => binding.label).join(', ')
      const bindingAnswer = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-keybinding-value',
        header: action.id,
        question: 'Enter comma-separated canonical key sequences:',
        detail: `Current: ${currentBindings || 'none'}. Type "default" to remove this override.`,
      })
      const input = bindingAnswer.custom?.trim()
      if (input === undefined || input === '') return { kind: 'error', text: 'Keybinding update cancelled.' }
      try {
        if (input.toLocaleLowerCase() === 'default') {
          await settings.mutate(TUI_SETTINGS_NAMESPACE, [{ op: 'unset', path: ['keybindings', action.id] }])
        } else {
          const sequences = input.split(',').map(sequence => sequence.trim()).filter(Boolean)
          await settings.update(TUI_SETTINGS_NAMESPACE, { keybindings: { [action.id]: sequences } })
        }
      } catch (error: unknown) {
        return { kind: 'error', text: `Could not update keybinding: ${errorChain(error)}` }
      }
      return { kind: 'success', text: input.toLocaleLowerCase() === 'default'
        ? `Reset ${action.id} to its default binding.`
        : `Updated ${action.id} binding.` }
    }
    if (selected === resetLabel) {
      const confirmation = await this.askOne(invocation.agent, invocation.signal, {
        id: 'tui-config-reset',
        header: 'Reset config',
        question: 'Remove all persisted TUI settings?',
        options: [{ label: 'Reset TUI settings' }, { label: 'Cancel' }],
      })
      if (confirmation.selected[0] !== resetLabel) return { kind: 'success', text: 'TUI settings unchanged.' }
      try {
        await settings.replace(TUI_SETTINGS_NAMESPACE, {})
      } catch (error: unknown) {
        return { kind: 'error', text: `Could not reset TUI settings: ${errorChain(error)}` }
      }
      return { kind: 'success', text: 'TUI settings reset to defaults.' }
    }
    return { kind: 'error', text: 'Config selection cancelled.' }
  }

  private executeExit(invocation: CommandInvocation, name: 'quit' | 'exit'): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: `Usage: /${name}` }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
    this.exitAfterCommand = invocation.agent
    return { kind: 'success', text: 'Exiting the TUI.' }
  }

  private executeResume(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: 'Usage: /resume' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
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
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
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
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
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
      this.rewindDialog.set({ ...dialog, error: `Rewind requires an idle Agent (status: ${agent.status}).` })
      return
    }
    if (this.interactions.getSnapshot() !== undefined) {
      this.rewindDialog.set({ ...dialog, error: 'An interaction is waiting for the current Session.' })
      return
    }
    const cwd = agent.session.header.cwd
    const selectedModel = this.selection?.current ?? this.modelSelection.getSnapshot()
    if (cwd === undefined || selectedModel === undefined) {
      this.rewindDialog.set({ ...dialog, error: cwd === undefined
        ? 'The current Session has no workspace to retain.'
        : 'The current model selection is unavailable.' })
      return
    }
    const anchor = resolveSessionForkAnchor(agent.session.events, current.eventSeq)
    if (anchor.kind === 'unavailable') {
      this.rewindDialog.set({ ...dialog, error: 'The selected human turn no longer has a safe completed boundary.' })
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
        error: `Rewind failed: ${errorChain(error)}`,
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
    const prepared = await this.prepareAgent({
      kind: 'rewind',
      parentSession: oldAgent.session.id,
      cwd,
      selection: selectedModel,
      seed,
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
      ? 'Rewound into a child Session. Later history remains available in the parent through /resume.'
      : `Rewound into a child Session; parent cleanup failed: ${errorChain(retirementError)}`)
  }

  private executeSessionExport(invocation: CommandInvocation): CommandResult {
    if (invocation.rawInput.trim() !== '') return { kind: 'error', text: 'Usage: /export' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
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
    if (exporting) this.externalNotice.set('Session export cancelled.')
  }

  private async activateSessionExport(
    agent: Agent,
    directoryInput: string,
    includeDescendants: boolean,
  ): Promise<void> {
    const dialog = this.sessionExportDialog.getSnapshot()
    if (dialog?.phase !== 'selecting' || !this.ownsAgent(agent) || this.activeSessionExport !== undefined) return
    if (agent.status !== 'idle') {
      this.sessionExportDialog.set({
        ...dialog,
        error: `Session export requires an idle Agent (status: ${agent.status}).`,
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
      destination,
      includeDescendants,
    })
    const completion = this.writeSessionExport(
      agent, dialog.generation, destination, includeDescendants, controller.signal,
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
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const result = await this.ctx.sessionLogExporter.writeToDirectory({
        sessionId: agent.session.id,
        includeDescendants,
      }, destination, signal)
      signal.throwIfAborted()
      if (!this.ownsAgent(agent) || this.sessionExportGeneration !== generation || this.isClosing()) return
      this.sessionExportDialog.set(undefined)
      this.externalNotice.set(`Exported Session archive to ${result.path}.`)
    } catch (error: unknown) {
      if (signal.aborted || this.sessionExportGeneration !== generation || this.isClosing()) return
      const dialog = this.sessionExportDialog.getSnapshot()
      if (dialog?.generation !== generation) return
      this.sessionExportDialog.set({
        generation,
        phase: 'selecting',
        sessionId: dialog.sessionId,
        workspaceLabel: dialog.workspaceLabel,
        error: error instanceof SessionLogExportError
          ? error.message
          : 'Session export failed while writing the archive.',
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
    const [titles, activity] = await Promise.all([
      this.resolveResumeTitles(records, signal),
      this.resolveResumeActivity(records, signal),
    ])
    signal.throwIfAborted()
    if (!this.ownsAgent(agent) || this.resumeGeneration !== generation) return
    const candidates = records.map((record, index): TuiResumeCandidate => {
      const resolution = titles[index] as { title?: string; failure?: unknown }
      const candidate = summarizeTuiResumeCandidate(
        record,
        resolution.title,
        activity[index],
        agent.session.id,
        agent.session.header.cwd,
      )
      if (resolution.failure === undefined) return candidate
      return {
        ...candidate,
        title: 'Unreadable session',
        disabledReason: `session cannot be read: ${errorChain(resolution.failure)}`,
      }
    })
    this.resumeDialog.set({
      generation,
      phase: 'ready',
      currentWorkspaceLabel: agent.session.header.cwd ?? '(no workspace)',
      candidates: sortTuiResumeCandidates(candidates),
    })
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
    if (agent.status !== 'idle') {
      this.resumeDialog.set({ ...dialog, error: `Resume requires an idle Agent (status: ${agent.status}).` })
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
        error: `Resume failed: ${errorChain(error)}`,
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
      this.freshSessionDialog.set({ ...dialog, error: `Starting a fresh Session requires an idle Agent (status: ${agent.status}).` })
      return
    }
    if (this.interactions.getSnapshot() !== undefined) {
      this.freshSessionDialog.set({ ...dialog, error: 'An interaction is waiting for the current Session.' })
      return
    }
    const cwd = agent.session.header.cwd
    const selectedModel = this.selection?.current ?? this.modelSelection.getSnapshot()
    if (cwd === undefined || selectedModel === undefined) {
      this.freshSessionDialog.set({ ...dialog, error: cwd === undefined
        ? 'The current Session has no workspace to retain.'
        : 'The current model selection is unavailable.' })
      return
    }
    const controller = new AbortController()
    this.freshSessionDialog.set({
      generation: dialog.generation,
      command: dialog.command,
      phase: 'creating',
      currentSessionId: dialog.currentSessionId,
      workspaceLabel: dialog.workspaceLabel,
    })
    const completion = this.startFreshSession(agent, cwd, selectedModel, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted || this.isClosing()) return
      const latest = this.freshSessionDialog.getSnapshot()
      if (latest?.generation !== dialog.generation) return
      this.freshSessionDialog.set({ ...latest, phase: 'confirming', error: `New Session failed: ${errorChain(error)}` })
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
  ): Promise<void> {
    if (!this.ownsAgent(oldAgent)) throw new Error('the active TUI Session changed')
    const initialStatus = this.agentStatus(oldAgent)
    if (initialStatus !== 'idle') throw new Error(`current Agent is ${initialStatus}`)
    const prepared = await this.prepareAgent({
      kind: 'fresh', source: 'clear', cwd, selection: selectedModel,
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
      ? 'Started a fresh Session. The previous Session remains available through /resume.'
      : `Started a fresh Session; previous Session cleanup failed: ${errorChain(retirementError)}`)
  }

  private commitAgentSwitch(oldAgent: Agent, prepared: PreparedTuiAgent): AgentHandle {
    const oldHandle = this.handle
    const oldEvents = this.events
    const oldStatus = this.status
    const oldSelection = this.selection
    const oldModel = this.modelSelection.getSnapshot()
    const oldPermissions = this.permissions.getSnapshot()
    const oldContext = this.contextPressure.getSnapshot()
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
    this.helpOpen.set(false)
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
      this.permissions.set(oldPermissions)
      this.contextPressure.set(oldContext)
      this.resumeDialog.set(oldDialog)
      this.freshSessionDialog.set(oldFreshDialog)
      this.rewindDialog.set(oldRewindDialog)
      this.sessionExportDialog.set(oldExportDialog)
      this.instance.rerender(this.appElement(oldAgent, oldEvents, oldStatus))
      throw error
    }
    this.bindWorkRoot(prepared.handle.agent)
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
    if (itemId !== 'permission') return
    if (this.activeCommand !== undefined) throw new Error('Another TUI command is already running')
    const controller = new AbortController()
    const completion = this.selectPermission(agent, controller.signal)
    const operation = { controller, completion }
    this.activeCommand = operation
    try {
      await completion
    } finally {
      if (this.activeCommand === operation) this.activeCommand = undefined
    }
  }

  private async selectPermission(agent: Agent, signal: AbortSignal): Promise<void> {
    if (this.handle?.agent !== agent) throw new Error('TUI Session changed before permission selection')
    const service = this.ctx.get('permissionPresets')
    if (service === undefined) throw new Error('Permission presets are unavailable in this TUI composition')
    const choices = service.names.map((value) => {
      const option = service.optionOf(value)
      return {
        value,
        label: option.name === value ? value : `${option.name} (${value})`,
        description: option.description,
      }
    })
    if (choices.length === 0) throw new Error('No permission presets are available')
    const answer = await this.askOne(agent, signal, {
      id: 'permission-selection',
      header: 'Permissions',
      question: `Choose a permission preset (current: ${service.current(agent.session.events)}):`,
      options: choices.map(choice => ({
        label: choice.label,
        ...choice.description === undefined ? {} : { description: choice.description },
      })),
    })
    const selected = choices.find(choice => choice.label === answer.selected[0])
    if (selected === undefined) throw new Error('Permission selection was cancelled')
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
      throw new Error('This TUI build cannot safely render a secret authentication prompt')
    }
    const signal = this.interactionSignal(operationSignal, prompt.signal)
    if (prompt.type === 'select') {
      const labels = new Map(prompt.options.map(option => [option.label, option.id]))
      const answer = await this.askOne(agent, signal, {
        id: 'oauth-select', header: 'Authentication', question: prompt.message,
        options: prompt.options.map(option => ({
          label: option.label,
          ...option.description === undefined ? {} : { description: option.description },
        })),
      })
      const label = answer.selected[0]
      const id = label === undefined ? undefined : labels.get(label)
      if (id === undefined) throw new Error('Authentication method selection was cancelled')
      return id
    }
    const answer = await this.askOne(agent, signal, {
      id: 'oauth-text', header: 'Authentication', question: prompt.message,
      ...prompt.placeholder === undefined ? {} : { detail: `Expected: ${prompt.placeholder}` },
    })
    const value = answer.custom?.trim()
    if (value === undefined || value.length === 0) throw new Error('Authentication input was empty')
    return value
  }

  private authNotify(event: LlmAuthenticationEvent, signal: AbortSignal): void {
    if (signal.aborted) return
    if (event.type === 'auth-url') {
      this.externalNotice.set(`Complete sign-in in your browser: ${event.url}`)
      void openExternalUrl(event.url, signal).catch(() => {
        if (!signal.aborted) this.externalNotice.set(`Open this URL to sign in: ${event.url}`)
      })
      return
    }
    if (event.type === 'device-code') {
      this.externalNotice.set(`Open ${event.verificationUri} and enter code ${event.userCode}`)
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
    this.externalNotice.set('Sign-in complete. Refreshing models…')
  }

  private async executeModels(invocation: CommandInvocation): Promise<CommandResult> {
    const input = invocation.rawInput.trim().toLocaleLowerCase()
    if (input !== '') return { kind: 'error', text: 'Usage: /models' }
    if (invocation.agent !== this.handle?.agent) return { kind: 'error', text: 'The active TUI Session changed.' }
    const providers = this.ctx.llm.listProviders()

    this.externalNotice.set('Loading available models…')
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
                description: 'Authenticate and load the account model catalog',
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
        if (choices.length === 0) return { kind: 'error', text: 'No authenticated provider advertises selectable models.' }
        invocation.signal.throwIfAborted()
        this.externalNotice.set('')
        const answer = await this.askOne(invocation.agent, invocation.signal, {
          id: 'model-selection', header: 'Models', question: 'Choose a model or sign-in action:',
          options: choices.map(choice => ({
            label: choice.label,
            ...choice.description === undefined ? {} : { description: choice.description },
          })),
        })
        const chosen = choices.find(choice => choice.label === answer.selected[0])
        if (chosen === undefined) return { kind: 'error', text: 'Model selection cancelled.' }
        if (chosen.login !== undefined) {
          await this.login(invocation.agent, chosen.login.provider, chosen.login.method, invocation.signal)
          continue
        }
        if (chosen.selection === undefined) return { kind: 'error', text: 'Selected row has no model.' }
        const modelInfo = await this.ctx.llm.resolveModelInfo(
          chosen.selection.provider, chosen.selection.model, invocation.signal,
        )
        let requested: ModelSelection = chosen.selection
        if (modelInfo.reasoning !== undefined) {
          const efforts = modelInfo.reasoning.efforts
          const effortLabels = new Map(efforts.map(effort => [`${effort.name} (${effort.id})`, effort]))
          const effortAnswer = await this.askOne(invocation.agent, invocation.signal, {
            id: 'reasoning-effort',
            header: 'Thinking',
            question: 'Choose a reasoning effort:',
            options: efforts.map(effort => ({
              label: `${effort.name} (${effort.id})`,
              description: effort.description ?? String(effort.id),
            })),
          })
          const effort = effortLabels.get(effortAnswer.selected[0] ?? '')
          if (effort === undefined) return { kind: 'error', text: 'Reasoning effort selection cancelled.' }
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
        return { kind: 'success', text: `Selected ${chosen.label} for this Session and future TUI Sessions.` }
      }
    } finally {
      if (!invocation.signal.aborted) this.externalNotice.set('')
    }
  }

  private async submit(agent: Agent, text: string): Promise<void> {
    if (this.handle?.agent !== agent) throw new Error('TUI Session changed before input submission')
    if (text.startsWith('/')) {
      const controller = new AbortController()
      const completion = this.ctx.commands.execute(agent, text, [], controller.signal)
      const operation = { controller, completion }
      this.activeCommand = operation
      let admittedSuccess = false
      try {
        const execution = await completion
        if (execution !== undefined) {
          admittedSuccess = execution.result.kind === 'success'
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
    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    })
    if (agent.status === 'running') agent.steer(message)
    else agent.followup(message)
  }

  private async submitChild(root: Agent, view: ActiveTuiAgentView, text: string): Promise<void> {
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
    const controller = new AbortController()
    const completion = this.ctx.subagents.followup(
      parent,
      view.agent.id,
      [{ type: 'text', text }],
      { source: { kind: 'user' }, signal: controller.signal },
    )
    const operation = { controller, completion }
    this.activeCommand = operation
    try {
      await completion
    } finally {
      if (this.activeCommand === operation) this.activeCommand = undefined
    }
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
    const activeCommand = this.activeCommand
    const activeSessionExport = this.activeSessionExport
    const pluginHubOperation = this.pluginHubOperation
    const resumeScan = this.resumeScan
    const activeAgentSwitch = this.activeAgentSwitch
    const workRefresh = this.workRefresh
    this.activeCommand = undefined
    this.exitAfterCommand = undefined
    this.activeSessionExport = undefined
    this.pluginHubOperation = undefined
    this.resumeScan = undefined
    this.activeAgentSwitch = undefined
    this.workRefresh = undefined
    activeCommand?.controller.abort(new Error('TUI command cancelled during shutdown'))
    activeSessionExport?.controller.abort(new Error('TUI Session export cancelled during shutdown'))
    pluginHubOperation?.controller.abort(new Error('TUI Plugin Hub request cancelled during shutdown'))
    resumeScan?.controller.abort(new Error('TUI Session scan cancelled during shutdown'))
    activeAgentSwitch?.controller.abort(new Error('TUI Agent switch cancelled during shutdown'))
    workRefresh?.controller.abort(new Error('TUI work catalog refresh cancelled during shutdown'))
    this.resumeDialog.set(undefined)
    this.freshSessionDialog.set(undefined)
    this.rewindDialog.set(undefined)
    this.sessionExportDialog.set(undefined)
    this.pluginHubDialog.set(undefined)
    this.activeView = undefined
    this.disposers.approval?.()
    this.disposers.helpCommand?.()
    this.disposers.resumeCommand?.()
    this.disposers.clearCommand?.()
    this.disposers.newCommand?.()
    this.disposers.rewindCommand?.()
    this.disposers.exportCommand?.()
    this.disposers.quitCommand?.()
    this.disposers.exitCommand?.()
    this.disposers.pluginHubCommand?.()
    this.disposers.pluginHubProgress?.()
    this.disposers.projectionChanged?.()
    this.disposers.modelsCommand?.()
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
      activeSessionExport?.completion.catch(() => undefined),
      pluginHubOperation?.completion.catch(() => undefined),
      resumeScan?.completion.catch(() => undefined),
      activeAgentSwitch?.completion.catch(() => undefined),
      workRefresh?.completion.catch(() => undefined),
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
export { TuiTranscriptDetailCache, tuiTranscriptDetailText } from './detail.ts'
export {
  createComposerState, deleteComposerText, insertComposerPasteReference, insertComposerText,
  isLargeComposerPaste, layoutComposer, materializeComposerText, moveComposerCursor,
  redoComposerEdit, replaceComposerText, restoreTuiComposerDraft, toggleTuiComposerStash,
  traverseComposerHistory, tuiComposerDraft, undoComposerEdit,
} from './composer.ts'
export {
  DEFAULT_TUI_SETTINGS, resolveTuiTheme, TUI_SETTINGS_NAMESPACE, TUI_SETTINGS_SCHEMA,
  TUI_THEME_PREFERENCES, TuiThemeProvider, useTuiTheme,
} from './theme.tsx'
export type {
  TuiSemanticThemeTokens, TuiSettings, TuiTheme, TuiThemePreference,
} from './theme.tsx'
export type {
  TuiComposerDraft, TuiComposerEditHistory, TuiComposerEditKind,
  TuiComposerPasteReference, TuiComposerSnapshot, TuiComposerStashTransition,
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
  moveTuiFooterSelection, tuiFooterItems, tuiFooterStatusLine, tuiSelectedFooterLine,
  visibleTuiFooterItems,
} from './footer.ts'
export type {
  TuiFooterItemDescriptor, TuiFooterItemId, TuiFooterSources, TuiFooterTranscriptPosition,
} from './footer.ts'
export { terminalMarkdownText } from './markdown.ts'
export { terminalSafe } from './sanitize.ts'
export {
  filterTuiResumeCandidates, formatTuiRelativeTime,
  sortTuiResumeCandidates, summarizeTuiResumeCandidate,
} from './resume.ts'
export type {
  TuiResumeCandidate, TuiResumeDialogSnapshot, TuiResumeScope,
} from './resume.ts'
export { resolveTuiSessionExportDirectory } from './session-export.ts'
export type { TuiSessionExportDialogSnapshot, TuiSessionExportPhase } from './session-export.ts'
export { tuiRewindCandidates } from './rewind.ts'
export type { TuiRewindCandidate, TuiRewindDialogSnapshot } from './rewind.ts'
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
  TuiClipboardResult, TuiTerminalCapabilities, TuiTerminalColorDepth, TuiTerminalKeyboardProtocol,
  TuiTerminalNegotiationOptions,
} from './terminal-session.ts'
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
  terminalWrappedLines, TuiTranscriptScrollController, TuiTranscriptViewportIndex,
} from './viewport.ts'
export type {
  TuiTranscriptViewportAnchor, TuiTranscriptViewportStats, TuiTranscriptVirtualWindow,
} from './viewport.ts'
export { TuiTerminalInputDecoder } from './terminal-input.ts'
export type {
  TuiTerminalInputEvent, TuiTerminalInputWait,
} from './terminal-input.ts'
