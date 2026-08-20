/** Ink component tree for transcript, interactions, composer, and status. */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Text, useStdout } from 'ink'
import type {
  Agent, ApprovalPresentation, AskUserQuestionAnswer, AskUserQuestionAnswerItem,
  CommandDescriptor, ContextPressureProjection, FsPathCompletionResult, ModelSelection, PermissionSelect,
} from './host.ts'
import {
  AgentStatusStore, InteractionStore, SessionEventStore, ValueStore, type PendingQuestion,
} from './store.ts'
import { TuiTranscriptProjectionCache } from './transcript.ts'
import { TodoPanel, todoPanelRows } from './todo-panel.tsx'
import { TuiTranscriptSearchText, TuiTranscriptView } from './transcript-view.tsx'
import { TuiTranscriptDetailCache, tuiTranscriptDetailText } from './detail.ts'
import { terminalSafe } from './sanitize.ts'
import type { InputCursorTarget } from './terminal-session.ts'
import {
  TuiTranscriptScrollController, TuiTranscriptViewportIndex, terminalWrappedLines,
  type TuiTranscriptViewportAnchor,
} from './viewport.ts'
import type { TranscriptNode, TranscriptToolNode } from './transcript.ts'
import {
  createComposerState, deleteComposerText, insertComposerPasteReference, insertComposerText,
  isLargeComposerPaste, layoutComposer, materializeComposerText, moveComposerCursor,
  redoComposerEdit, replaceComposerText, restoreTuiComposerDraft, toggleTuiComposerStash,
  traverseComposerHistory, tuiComposerDraft, undoComposerEdit,
  type ComposerLayout, type ComposerState, type TuiComposerDraft,
} from './composer.ts'
import {
  cancelTuiHistorySearch, nextTuiHistorySearchMatch, startTuiHistorySearch, tuiHistorySearchResult,
  updateTuiHistorySearchQuery, type TuiHistorySearchState,
} from './history-search.ts'
import {
  acceptTuiSuggestion, commandSuggestionState, moveTuiSuggestion, pathSuggestionQuery,
  pathSuggestionState, visibleTuiSuggestions, type TuiSuggestionState,
} from './suggestion.ts'
import {
  effectiveTuiInteractionDescriptors, matchTuiInteractionAction, resolveTuiInteractionContext,
  tuiInteractionHelpLines, type TuiInteractionContext, type TuiInteractionDescriptor, type TuiKeypress,
} from './keybindings.ts'
import {
  moveTuiFooterSelection, tuiFooterItems, tuiFooterStatusLine, tuiSelectedFooterLine,
  visibleTuiFooterItems, type TuiFooterItemId,
} from './footer.ts'
import {
  resolveTuiTranscriptSearchHit, TuiTranscriptSearchIndex,
} from './transcript-search.ts'
import {
  filterTuiResumeCandidates, formatTuiRelativeTime,
  type TuiResumeCandidate, type TuiResumeDialogSnapshot, type TuiResumeScope,
} from './resume.ts'
import type { TuiFreshSessionDialogSnapshot } from './session-lifecycle.ts'
import type { TuiSessionExportDialogSnapshot } from './session-export.ts'
import type { TuiRewindCandidate, TuiRewindDialogSnapshot } from './rewind.ts'
import type { TuiWorkItemView, TuiWorkSnapshot } from './work.ts'
import { TuiWorkPanel } from './work-panel.tsx'
import {
  tuiPluginHubCardHeight, tuiPluginHubCardLayout, tuiPluginHubCatalogLine, tuiPluginHubDetailLines, tuiPluginHubInstalledRows,
  tuiPluginHubPlanLines, tuiPluginHubQueryCursor, tuiPluginHubRows,
  type TuiPluginHubDetailLine, type TuiPluginHubDialogSnapshot,
} from './plugin-hub.ts'
import type { PluginId } from '@lingxi-ai-cn/dsh-plugin-hub'
import { TuiAgentViewStateCache, type TuiAgentViewDescriptor } from './agent-view.ts'
import { useTuiTerminalInput, type TuiTerminalInputEvent } from './terminal-input.ts'
import { tuiBorderStyle, tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'
import {
  resolveTuiStartupLogoVariant, tuiStartupLogoHeight, TuiStartupLogo,
  type TuiStartupLogoVariant,
} from './startup-logo.tsx'

export interface TuiAppProps {
  agent: Agent
  view: TuiAgentViewDescriptor
  events: SessionEventStore
  status: AgentStatusStore
  interactions: InteractionStore
  externalNotice: ValueStore<string>
  modelSelection: ValueStore<ModelSelection | undefined>
  helpOpen: ValueStore<boolean>
  permissions: ValueStore<PermissionSelect | undefined>
  contextPressure: ValueStore<ContextPressureProjection | undefined>
  resumeDialog: ValueStore<TuiResumeDialogSnapshot | undefined>
  freshSessionDialog: ValueStore<TuiFreshSessionDialogSnapshot | undefined>
  rewindDialog: ValueStore<TuiRewindDialogSnapshot | undefined>
  sessionExportDialog: ValueStore<TuiSessionExportDialogSnapshot | undefined>
  pluginHubDialog: ValueStore<TuiPluginHubDialogSnapshot | undefined>
  work: ValueStore<TuiWorkSnapshot>
  maxResumeOptions: number
  commands: readonly CommandDescriptor[]
  interactionRegistry: readonly TuiInteractionDescriptor[]
  completePaths(query: string, signal: AbortSignal): Promise<FsPathCompletionResult>
  onInputCursor(target: InputCursorTarget | undefined): void
  onSubmit(text: string): Promise<void>
  /** Copy non-secret UI text through the negotiated terminal clipboard path. */
  onCopy(text: string): { readonly ok: boolean; readonly message?: string }
  onActivateFooter(itemId: TuiFooterItemId): Promise<void>
  onResume(candidate: TuiResumeCandidate): Promise<void>
  onCloseResume(): void
  onConfirmFreshSession(): Promise<void>
  onCloseFreshSession(): void
  onRewind(candidate: TuiRewindCandidate): Promise<void>
  onCloseRewind(): void
  onExportSession(directory: string, includeDescendants: boolean): Promise<void>
  onCloseSessionExport(): void
  onClosePluginHub(): void
  onPluginHubToggleView(): Promise<void>
  onPluginHubSearch(query: string): Promise<void>
  onPluginHubDetail(pluginId: PluginId): Promise<void>
  onPluginHubInstall(): Promise<void>
  onPluginHubRemove(packageName: string): Promise<void>
  onPluginHubConfirm(): Promise<void>
  onPluginHubRefresh(): Promise<void>
  onPluginHubLoadMore(): Promise<void>
  onPluginHubSort(): Promise<void>
  onPluginHubCategory(): Promise<void>
  onMounted: () => void
  onOpenHelp(): void
  onCloseHelp(): void
  onCancelWork(item: TuiWorkItemView): Promise<void>
  onOpenWork(item: TuiWorkItemView): Promise<void>
  onReturnRoot(): void
  onCancel(): void
  onExit(): void
  /** Input events buffered while terminal capabilities were negotiated. */
  initialTerminalInput?: readonly TuiTerminalInputEvent[] | undefined
}

function pluginHubLineColor(theme: TuiTheme, line: TuiPluginHubDetailLine): string | undefined {
  switch (line.tone) {
    case 'muted': return theme.tokens.muted
    case 'accent': return theme.tokens.accent
    case 'success': return theme.tokens.success
    case 'warning': return theme.tokens.warning
    case 'error': return theme.tokens.error
    case 'default': return theme.tokens.text
  }
}

/**
 * Resolve readable semantic color for one Plugin Hub detail or confirmation line.
 * @param theme - active terminal theme.
 * @param line - projected Plugin Hub line.
 * @returns text style without ANSI dim, which would compound muted palette colors.
 */
export function tuiPluginHubDetailTextStyle(
  theme: TuiTheme,
  line: TuiPluginHubDetailLine,
): Readonly<{ color?: string }> {
  return tuiTextStyle(pluginHubLineColor(theme, line))
}

function viewportRows(stdout: NodeJS.WriteStream, reserved = 0): number {
  return Math.max(3, (stdout.rows || 24) - 5 - reserved)
}

function acceptsCommittedText(key: TuiKeypress): boolean {
  return key.ctrl !== true && key.meta !== true && key.super !== true && key.hyper !== true
}

interface TranscriptSearchState {
  query: string
  previousAnchor: TuiTranscriptViewportAnchor | undefined
  selectedKey: string | undefined
}

interface SuggestionOverride {
  key: string
  state: TuiSuggestionState
  dismissed: boolean
}

interface FocusTarget {
  key: string
  label: string
  node: TranscriptNode
  child?: TranscriptToolNode | undefined
}

type FocusState =
  | { mode: 'browse'; focusedKey: string; focusedIndex: number }
  | { mode: 'detail'; focusedKey: string; focusedIndex: number; detailOffset: number }

interface FooterDetailState {
  itemId: TuiFooterItemId
  offset: number
}

interface TuiAgentViewLocalState {
  readonly composer: ComposerState
  readonly history: TuiComposerDraft[]
  readonly historySearch: TuiHistorySearchState | undefined
  readonly focus: FocusState | undefined
  readonly transcriptAnchor: TuiTranscriptViewportAnchor | undefined
  readonly transcriptSearch: TranscriptSearchState | undefined
}

function focusTitle(tool: TranscriptToolNode): string {
  return tool.resultView?.title ?? tool.callView.title
}

function approvalPresentationLines(presentation: ApprovalPresentation | undefined): readonly string[] {
  if (presentation === undefined) return []
  if (presentation.kind === 'terminal') return [
    `Command: ${terminalSafe(presentation.command)}`,
    ...(presentation.cwd === undefined ? [] : [`Cwd: ${terminalSafe(presentation.cwd)}`]),
    ...(presentation.policy === undefined ? [] : [`Policy: ${terminalSafe(presentation.policy)}`]),
  ]
  if (presentation.kind === 'diff') return presentation.files.flatMap(file => [
    `${terminalSafe(file.path)} · +${file.additions}/-${file.deletions}`,
    ...(file.preview ?? []).map(line => `  ${terminalSafe(line)}`),
  ])
  if (presentation.kind === 'filesystem') return [
    `Operation: ${presentation.operation}`,
    `Path: ${terminalSafe(presentation.path)}`,
    ...(presentation.workspaceRoot === undefined ? [] : [`Workspace: ${terminalSafe(presentation.workspaceRoot)}`]),
  ]
  if (presentation.kind === 'web') return [
    `URL: ${terminalSafe(presentation.url)}`,
    `Host: ${terminalSafe(presentation.host)}`,
    ...(presentation.method === undefined ? [] : [`Method: ${terminalSafe(presentation.method)}`]),
    ...(presentation.purpose === undefined ? [] : [`Purpose: ${terminalSafe(presentation.purpose)}`]),
  ]
  let args = ''
  try { args = presentation.args === undefined ? '' : JSON.stringify(presentation.args) }
  catch { args = '[unavailable]' }
  return [
    `Tool: ${terminalSafe(presentation.toolName)}`,
    ...(args === '' ? [] : [`Args: ${terminalSafe(args)}`]),
  ]
}

/**
 * Resolve the real terminal cursor cell used by CJK IME preedit rendering.
 * @param stdout - terminal dimensions used by the active Ink frame.
 * @param prefix - first-line composer label rendered before the editable text.
 * @param layout - visible Unicode-aware composer layout.
 * @param placement - optional centered-composer origin; omission selects the bottom workspace.
 * @returns one-based terminal row and column for the insertion point.
 */
export function inputCursorTarget(
  stdout: Pick<NodeJS.WriteStream, 'rows' | 'columns'>,
  prefix: string,
  layout: ComposerLayout,
  placement?: { readonly firstInputRow: number; readonly leftColumn: number },
): InputCursorTarget {
  return {
    row: placement === undefined
      ? Math.max(1, (stdout.rows || 24) - 2 - (layout.lines.length - 1 - layout.cursorRow))
      : Math.max(1, placement.firstInputRow + layout.cursorRow),
    column: (placement?.leftColumn ?? 0)
      + 3 + (layout.cursorRow === 0 ? prefix.length : 0) + layout.cursorColumn,
  }
}

/**
 * Resolve the bounded startup composer frame and its first editable terminal row.
 * @param stdout - terminal dimensions used by the active Ink frame.
 * @param composerRows - mounted editor rows inside the bordered composer.
 * @param supplementalRows - suggestion rows mounted between the brand and composer.
 * @returns centered width, zero-based horizontal origin, one-based first input row, and selected mark.
 */
export function tuiStartupComposerFrame(
  stdout: Pick<NodeJS.WriteStream, 'rows' | 'columns'>,
  composerRows: number,
  supplementalRows = 0,
): {
  readonly width: number
  readonly leftColumn: number
  readonly firstInputRow: number
  readonly logo: TuiStartupLogoVariant
} {
  const columns = stdout.columns || 80
  const rows = stdout.rows || 24
  const width = Math.max(1, Math.min(columns, 76, Math.max(33, Math.floor(columns * 0.72))))
  const logo = resolveTuiStartupLogoVariant({ columns, rows }, composerRows, supplementalRows)
  const logoRows = tuiStartupLogoHeight(logo)
  const contentRows = Math.max(1, composerRows) + Math.max(0, supplementalRows) + logoRows + 5
  const startRow = Math.max(0, Math.ceil((Math.max(1, rows - 1) - contentRows) / 2))
  return {
    width,
    leftColumn: Math.max(0, Math.ceil((columns - width) / 2)),
    firstInputRow: startRow + Math.max(0, supplementalRows) + logoRows + 4,
    logo,
  }
}

const TUI_WORKING_FRAMES = Object.freeze(['.  ', '.. ', '...', ' ..', '  .', ' ..'] as const)

/**
 * Select one stable-width frame for the running-Agent activity indicator.
 * @param tick - monotonically increasing process-local animation tick.
 * @returns a three-cell ASCII frame.
 */
export function tuiWorkingFrame(tick: number): string {
  return TUI_WORKING_FRAMES[Math.abs(Math.trunc(tick)) % TUI_WORKING_FRAMES.length] ?? TUI_WORKING_FRAMES[0]
}

function answerFor(question: PendingQuestion['request']['questions'][number], draft: string): AskUserQuestionAnswerItem {
  const tokens = draft.split(',').map(token => token.trim()).filter(Boolean)
  const options = question.options ?? []
  const selected: string[] = []
  const custom: string[] = []
  for (const token of tokens) {
    const asNumber = Number(token)
    const byNumber = Number.isInteger(asNumber) && asNumber >= 1 ? options[asNumber - 1] : undefined
    const byLabel = options.find(option => option.label.toLocaleLowerCase() === token.toLocaleLowerCase())
    const option = byNumber ?? byLabel
    if (option === undefined) custom.push(token)
    else if (!selected.includes(option.label)) selected.push(option.label)
  }
  if (question.multiSelect !== true && selected.length > 1) selected.splice(1)
  return {
    id: question.id,
    selected,
    ...custom.length === 0 ? {} : { custom: custom.join(', ') },
  }
}

/** Render the native single-view Agent TUI. */
export function TuiApp(props: TuiAppProps): React.ReactElement {
  const theme = useTuiTheme()
  const eventSnapshot = useSyncExternalStore(props.events.subscribe, props.events.getSnapshot)
  const agentStatus = useSyncExternalStore(props.status.subscribe, props.status.getSnapshot)
  const interaction = useSyncExternalStore(props.interactions.subscribe, props.interactions.getSnapshot)
  const externalNotice = useSyncExternalStore(props.externalNotice.subscribe, props.externalNotice.getSnapshot)
  const modelSelection = useSyncExternalStore(props.modelSelection.subscribe, props.modelSelection.getSnapshot)
  const helpOpen = useSyncExternalStore(props.helpOpen.subscribe, props.helpOpen.getSnapshot)
  const permissions = useSyncExternalStore(props.permissions.subscribe, props.permissions.getSnapshot)
  const contextPressure = useSyncExternalStore(props.contextPressure.subscribe, props.contextPressure.getSnapshot)
  const resumeDialog = useSyncExternalStore(props.resumeDialog.subscribe, props.resumeDialog.getSnapshot)
  const freshSessionDialog = useSyncExternalStore(
    props.freshSessionDialog.subscribe,
    props.freshSessionDialog.getSnapshot,
  )
  const rewindDialog = useSyncExternalStore(props.rewindDialog.subscribe, props.rewindDialog.getSnapshot)
  const sessionExportDialog = useSyncExternalStore(
    props.sessionExportDialog.subscribe,
    props.sessionExportDialog.getSnapshot,
  )
  const pluginHubDialog = useSyncExternalStore(props.pluginHubDialog.subscribe, props.pluginHubDialog.getSnapshot)
  const work = useSyncExternalStore(props.work.subscribe, props.work.getSnapshot)
  const transcriptProjection = useMemo(() => new TuiTranscriptProjectionCache(), [props.agent])
  const transcriptDetailCache = useMemo(() => new TuiTranscriptDetailCache(), [props.agent])
  const transcriptViewport = useMemo(() => new TuiTranscriptViewportIndex(), [props.agent])
  const transcriptScroll = useMemo(
    () => new TuiTranscriptScrollController(transcriptViewport),
    [transcriptViewport],
  )
  const resolveTool = useMemo(
    () => (name: string) => props.agent.ctx.get('tools')?.get(name, props.agent),
    [props.agent],
  )
  const projection = useMemo(
    () => transcriptProjection.update(eventSnapshot, resolveTool),
    [eventSnapshot, resolveTool, transcriptProjection],
  )
  const currentTodo = useMemo(() => projection.find(node => node.kind === 'todo'), [projection])
  const rows = useMemo(() => projection.filter(node => node.kind !== 'todo'), [projection])
  const { stdout } = useStdout()
  const [terminalSize, setTerminalSize] = useState(() => ({
    rows: stdout.rows || 24,
    columns: stdout.columns || 80,
  }))
  const terminalRows = terminalSize.rows
  const [composer, setComposer] = useState<ComposerState>(createComposerState)
  const [suggestionOverride, setSuggestionOverride] = useState<SuggestionOverride | undefined>()
  const [pathResolution, setPathResolution] = useState<{
    key: string
    result?: FsPathCompletionResult
  } | undefined>()
  const [history, setHistory] = useState<TuiComposerDraft[]>([])
  const [historySearch, setHistorySearch] = useState<TuiHistorySearchState | undefined>()
  const [stashedDraft, setStashedDraft] = useState<TuiComposerDraft | undefined>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionAnswers, setQuestionAnswers] = useState<AskUserQuestionAnswerItem[]>([])
  const [questionCursor, setQuestionCursor] = useState(0)
  const [approvalOffset, setApprovalOffset] = useState(0)
  const [focus, setFocus] = useState<FocusState | undefined>()
  const [transcriptAnchor, setTranscriptAnchor] = useState<TuiTranscriptViewportAnchor | undefined>()
  const [transcriptSearch, setTranscriptSearch] = useState<TranscriptSearchState | undefined>()
  const [helpOffset, setHelpOffset] = useState(0)
  const [footerSelection, setFooterSelection] = useState<TuiFooterItemId | undefined>()
  const [footerDetail, setFooterDetail] = useState<FooterDetailState | undefined>()
  const [workOpen, setWorkOpen] = useState(false)
  const [workSelection, setWorkSelection] = useState(0)
  const [workClock, setWorkClock] = useState(Date.now)
  const [workingFrameTick, setWorkingFrameTick] = useState(0)
  const [resumeScope, setResumeScope] = useState<TuiResumeScope>('workspace')
  const [resumeQuery, setResumeQuery] = useState('')
  const [resumeSelection, setResumeSelection] = useState(0)
  const [resumeError, setResumeError] = useState('')
  const [resumeConfirmation, setResumeConfirmation] = useState<TuiResumeCandidate | undefined>()
  const [rewindSelection, setRewindSelection] = useState(0)
  const [rewindConfirmation, setRewindConfirmation] = useState<TuiRewindCandidate | undefined>()
  const [rewindError, setRewindError] = useState('')
  const [exportDirectory, setExportDirectory] = useState<ComposerState>(() => createComposerState('.'))
  const [exportDescendants, setExportDescendants] = useState(true)
  const [pluginHubQuery, setPluginHubQuery] = useState('')
  const [pluginHubSelection, setPluginHubSelection] = useState(0)
  const [pluginHubDetailOffset, setPluginHubDetailOffset] = useState(0)
  const agentViewStates = useRef(new TuiAgentViewStateCache<TuiAgentViewLocalState>())
  const currentAgentViewId = useRef(props.view.id)
  const currentAgentViewState = useRef<TuiAgentViewLocalState>({
    composer, history, historySearch, focus, transcriptAnchor, transcriptSearch,
  })
  currentAgentViewState.current = {
    composer, history, historySearch, focus, transcriptAnchor, transcriptSearch,
  }
  useEffect(() => { props.onMounted() }, [props.onMounted])
  const completePathsRef = useRef<TuiAppProps['completePaths']>((query, signal) => props.completePaths(query, signal))
  completePathsRef.current = (query, signal) => props.completePaths(query, signal)
  const previousTodos = useRef(currentTodo?.todos)
  const emphasizedTodos = new Set(currentTodo?.todos.filter((todo) => {
    const previous = previousTodos.current?.find(item => item.content === todo.content)
    return (previous !== undefined && previous.status !== todo.status)
      || (previousTodos.current !== undefined && previous === undefined)
  }).map(todo => todo.content))

  useEffect(() => { previousTodos.current = currentTodo?.todos }, [currentTodo])

  useEffect(() => {
    const resize = (): void => {
      const next = { rows: stdout.rows || 24, columns: stdout.columns || 80 }
      setTerminalSize(previous => previous.rows === next.rows && previous.columns === next.columns ? previous : next)
    }
    stdout.on('resize', resize)
    return () => { stdout.off('resize', resize) }
  }, [stdout])

  useEffect(() => {
    setComposer(createComposerState())
    setQuestionIndex(0)
    setQuestionAnswers([])
    setQuestionCursor(0)
    setHistorySearch(undefined)
    setApprovalOffset(0)
  }, [interaction])

  useEffect(() => {
    setResumeScope('workspace')
    setResumeQuery('')
    setResumeSelection(0)
    setResumeError('')
    setResumeConfirmation(undefined)
  }, [resumeDialog?.generation])

  useEffect(() => {
    setExportDirectory(createComposerState('.'))
    setExportDescendants(true)
  }, [sessionExportDialog?.generation])

  useEffect(() => {
    setRewindSelection(0)
    setRewindConfirmation(undefined)
    setRewindError('')
  }, [rewindDialog?.generation])

  useEffect(() => {
    setPluginHubQuery(pluginHubDialog?.initialQuery ?? '')
    setPluginHubSelection(0)
    setPluginHubDetailOffset(0)
  }, [pluginHubDialog?.generation, pluginHubDialog?.view])

  useLayoutEffect(() => {
    const previousId = currentAgentViewId.current
    if (previousId === props.view.id) return
    agentViewStates.current.set(previousId, currentAgentViewState.current)
    const next = agentViewStates.current.get(props.view.id, () => ({
      composer: createComposerState(),
      history: [],
      historySearch: undefined,
      focus: undefined,
      transcriptAnchor: undefined,
      transcriptSearch: undefined,
    }))
    currentAgentViewId.current = props.view.id
    setComposer(next.composer)
    setHistory(next.history)
    setHistorySearch(next.historySearch)
    setFocus(next.focus)
    setTranscriptAnchor(next.transcriptAnchor)
    setTranscriptSearch(next.transcriptSearch)
    setSuggestionOverride(undefined)
    setPathResolution(undefined)
    setFooterSelection(undefined)
    setFooterDetail(undefined)
    setWorkOpen(false)
    setWorkSelection(0)
    setNotice('')
  }, [props.view.id])

  useEffect(() => {
    if (work.items.length === 0) {
      setWorkOpen(false)
      setWorkSelection(0)
      return
    }
    setWorkSelection(previous => Math.min(previous, work.items.length - 1))
  }, [work.items])

  useEffect(() => {
    if (!workOpen || work.summary.running === 0) return
    const interval = setInterval(() => { setWorkClock(Date.now()) }, 1000)
    return () => { clearInterval(interval) }
  }, [work.summary.running, workOpen])

  useEffect(() => {
    if (agentStatus !== 'running') return
    const interval = setInterval(() => { setWorkingFrameTick(previous => previous + 1) }, 120)
    return () => { clearInterval(interval) }
  }, [agentStatus])

  const focusTargets = [...rows, ...currentTodo === undefined || currentTodo.todos.length === 0 ? [] : [currentTodo]]
    .flatMap((node): FocusTarget[] => {
      if (node.kind !== 'tool-group') {
        return [{
          key: node.key,
          label: node.kind === 'todo' ? 'Tasks'
            : node.kind === 'text' ? node.label
              : node.kind === 'compaction' ? 'Compaction' : node.name,
          node,
        }]
      }
      return [
        { key: node.key, label: node.activity === 'explore' ? 'Explore' : node.activity === 'parallel' ? 'Parallel' : 'Exclusive', node },
        ...node.tools.slice(-6).map(tool => ({ key: `${node.key}:${tool.callId}`, label: focusTitle(tool), node, child: tool })),
      ]
    })
  const exactFocusedIndex = focusTargets.findIndex(target => target.key === focus?.focusedKey)
  const focusedIndex = focus === undefined || focusTargets.length === 0
    ? -1
    : exactFocusedIndex >= 0 ? exactFocusedIndex : Math.min(focus.focusedIndex, focusTargets.length - 1)
  const focusedTarget = focusTargets[focusedIndex]
  const detailHeight = (focus?.mode === 'detail' && focusedTarget !== undefined) || footerDetail !== undefined
    ? Math.min(12, Math.max(7, Math.floor(terminalRows / 3)))
    : 0
  const detailRows = Math.max(1, detailHeight - 4)
  const detailColumns = Math.max(1, (stdout.columns || 80) - 4)
  const transcriptDetailLines = focusedTarget === undefined
    ? []
    : transcriptDetailCache.lines(focusedTarget.node, detailColumns, focusedTarget.child)
  const tasksHeight = todoPanelRows(currentTodo)
  const approvalLines = interaction?.kind === 'approval'
    ? approvalPresentationLines(interaction.request.presentation)
    : []
  const approvalReasonRows = interaction?.kind === 'approval' && interaction.request.reason !== undefined ? 1 : 0
  const approvalHeight = interaction?.kind === 'approval'
    ? Math.min(16, Math.max(7 + approvalReasonRows, Math.floor(terminalRows / 3)))
    : 0
  const approvalBodyRows = Math.max(1, approvalHeight - 5 - approvalReasonRows)
  const visibleApprovalOffset = Math.min(approvalOffset, Math.max(0, approvalLines.length - approvalBodyRows))
  const workspace = props.agent.session.header.cwd
  const columns = stdout.columns || 80
  const resumeCandidates = filterTuiResumeCandidates(
    resumeDialog?.candidates ?? [],
    resumeScope,
    resumeQuery,
  )
  const effectiveResumeSelection = resumeCandidates.length === 0
    ? 0
    : Math.min(resumeSelection, resumeCandidates.length - 1)
  const resumeRowHeight = resumeScope === 'all' ? 5 : 4
  const resumeVisibleCount = Math.max(1, Math.min(
    props.maxResumeOptions,
    Math.floor(Math.max(1, terminalRows - 10) / resumeRowHeight),
  ))
  const resumeVisibleStart = Math.max(0, Math.min(
    effectiveResumeSelection - Math.floor(resumeVisibleCount / 2),
    resumeCandidates.length - resumeVisibleCount,
  ))
  const visibleResumeCandidates = resumeCandidates.slice(
    resumeVisibleStart,
    resumeVisibleStart + resumeVisibleCount,
  )
  const rewindCandidates = rewindDialog?.candidates ?? []
  const effectiveRewindSelection = rewindCandidates.length === 0
    ? 0
    : Math.min(rewindSelection, rewindCandidates.length - 1)
  const rewindSelectedCandidate = rewindCandidates[effectiveRewindSelection]
  const rewindSelectedKey = rewindSelectedCandidate === undefined
    ? undefined
    : `event:${rewindSelectedCandidate.eventSeq}`
  const transcriptSearchIndex = useMemo(() => new TuiTranscriptSearchIndex(), [props.agent])
  const transcriptSearchNodes = useMemo(
    () => currentTodo === undefined ? rows : [...rows, currentTodo],
    [currentTodo, rows],
  )
  const transcriptSearchHits = useMemo(() => {
    transcriptSearchIndex.update(transcriptSearchNodes)
    return transcriptSearchIndex.search(transcriptSearch?.query ?? '')
  }, [transcriptSearch?.query, transcriptSearchIndex, transcriptSearchNodes])
  const transcriptSearchSelectedIndex = transcriptSearch === undefined || transcriptSearchHits.length === 0
    ? -1
    : Math.max(0, transcriptSearchHits.findIndex(hit => hit.key === transcriptSearch.selectedKey))
  const transcriptSearchHit = transcriptSearchHits[transcriptSearchSelectedIndex]
  const transcriptSearchQuery = transcriptSearch?.query
  const requestConfig = props.agent.session.requestHeader()?.config
  const agentSelection: ModelSelection | undefined = props.agent.options.provider === undefined
    || props.agent.options.model === undefined
    ? undefined
    : { provider: props.agent.options.provider, model: props.agent.options.model }
  const selectedModel = props.view.kind === 'root' ? modelSelection : agentSelection
  const activeSelection = agentStatus === 'running'
    ? requestConfig ?? selectedModel
    : selectedModel ?? requestConfig
  const startupSurface = props.view.kind === 'root'
    && rows.length === 0 && currentTodo === undefined && agentStatus === 'idle' && !busy
    && interaction === undefined && !helpOpen && resumeDialog === undefined && freshSessionDialog === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
    && !workOpen && work.items.length === 0
    && focus === undefined && transcriptSearch === undefined && historySearch === undefined
    && footerSelection === undefined && footerDetail === undefined && stashedDraft === undefined
  const startupWidth = tuiStartupComposerFrame(stdout, 1).width
  const composerWidth = Math.max(1, (startupSurface ? startupWidth : (stdout.columns || 80)) - 4)
  const historyMatch = historySearch === undefined ? undefined : tuiHistorySearchResult(historySearch, history)
  const editorComposer = sessionExportDialog?.phase === 'selecting'
    ? exportDirectory
    : transcriptSearch !== undefined
      ? createComposerState(transcriptSearch.query)
      : historySearch === undefined ? composer : createComposerState(historySearch.query)
  const composerLayout = layoutComposer(editorComposer, composerWidth)
  const suggestionLimit = Math.max(1, Math.min(6, stdout.rows - 12))
  const pathQuery = historySearch === undefined && transcriptSearch === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
    ? pathSuggestionQuery(composer.text, composer.cursor)
    : undefined
  const pathQueryText = pathQuery?.query
  const pathKey = pathQuery === undefined
    ? undefined
    : `${props.view.id}:${pathQuery.queryStart}:${pathQuery.queryEnd}:${pathQuery.query}`
  useEffect(() => {
    if (pathQueryText === undefined || pathKey === undefined) {
      setPathResolution(undefined)
      return
    }
    const controller = new AbortController()
    const key = pathKey
    setPathResolution({ key })
    void completePathsRef.current(pathQueryText, controller.signal).then((result) => {
      setPathResolution(previous => previous?.key === key ? { key, result } : previous)
    }).catch(() => {
      if (!controller.signal.aborted) setPathResolution(previous => previous?.key === key ? {
        key, result: { entries: [], truncated: false },
      } : previous)
    })
    return () => { controller.abort() }
  }, [pathKey, pathQueryText, props.view.id])
  const pathResult = pathResolution?.key === pathKey ? pathResolution?.result : undefined
  const pathSuggestion = pathQuery === undefined
    ? undefined
    : pathSuggestionState(pathQuery, pathResult)
  const baseSuggestion = historySearch === undefined && transcriptSearch === undefined
    && footerSelection === undefined && footerDetail === undefined
    && !workOpen
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
    ? pathSuggestion ?? commandSuggestionState(composer.text, composer.cursor, props.commands)
    : undefined
  const suggestionKey = baseSuggestion === undefined ? undefined
    : `${baseSuggestion.kind}:${baseSuggestion.queryStart}:${baseSuggestion.queryEnd}:${composer.text.slice(
      baseSuggestion.queryStart, baseSuggestion.queryEnd,
    )}`
  const suggestion = suggestionKey !== undefined && suggestionOverride?.key === suggestionKey
    ? suggestionOverride.dismissed ? undefined : suggestionOverride.state
    : baseSuggestion
  const visibleSuggestions = suggestion === undefined ? [] : visibleTuiSuggestions(suggestion, suggestionLimit)
  const effectiveWorkSelection = work.items.length === 0 ? 0 : Math.min(workSelection, work.items.length - 1)
  const selectedWorkItem = work.items[effectiveWorkSelection]
  const helpVisible = helpOpen && interaction === undefined
    && resumeDialog === undefined && freshSessionDialog === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
  const inputContext = resolveTuiInteractionContext({
    approval: interaction?.kind === 'approval',
    dialog: resumeDialog !== undefined || freshSessionDialog !== undefined
      || rewindDialog !== undefined || sessionExportDialog !== undefined
      || helpVisible || interaction?.kind === 'question',
    pluginHub: pluginHubDialog !== undefined,
    work: workOpen,
    detail: focus?.mode === 'detail' || footerDetail !== undefined,
    transcript: focus?.mode === 'browse',
    transcriptSearch: transcriptSearch !== undefined,
    historySearch: historySearch !== undefined,
    suggestion: suggestion !== undefined,
    footer: footerSelection !== undefined,
  })
  const helpDescriptors = effectiveTuiInteractionDescriptors({
    modelPicker: props.commands.some(command => command.name === 'models'),
    resumePicker: props.commands.some(command => command.name === 'resume'),
    approval: true,
    childView: props.view.kind === 'child',
  }, props.interactionRegistry)
  const helpLines = tuiInteractionHelpLines(helpDescriptors, Math.max(1, (stdout.columns || 80) - 4))
  const pluginHubDiscoverRows = tuiPluginHubRows(pluginHubDialog?.page, pluginHubSelection, stdout.columns || 80)
  const pluginHubInstalledRows = tuiPluginHubInstalledRows(
    pluginHubDialog?.installed,
    pluginHubSelection,
    stdout.columns || 80,
  )
  const pluginHubRows = pluginHubDialog?.view === 'installed'
    ? pluginHubInstalledRows
    : pluginHubDiscoverRows
  const pluginHubRowHeight = tuiPluginHubCardHeight(stdout.columns || 80)
  const pluginHubVisibleCount = Math.max(1, Math.floor(Math.max(1, terminalRows - 8) / pluginHubRowHeight))
  const pluginHubVisibleStart = Math.max(0, Math.min(
    Math.max(0, pluginHubRows.length - pluginHubVisibleCount),
    pluginHubSelection - Math.floor(pluginHubVisibleCount / 2),
  ))
  const pluginHubDetailLines = tuiPluginHubDetailLines(pluginHubDialog?.detail, stdout.columns || 80)
  const pluginHubDetailOpen = pluginHubDialog?.phase === 'detail' && pluginHubDialog.detail !== undefined
  const pluginHubPlanLines = tuiPluginHubPlanLines(
    pluginHubDialog?.plan,
    pluginHubDialog?.detail,
    stdout.columns || 80,
  )
  const pluginHubPlanOpen = pluginHubDialog?.phase === 'confirm' && pluginHubDialog.plan !== undefined
  const pluginHubItems = pluginHubDialog?.page?.items
  const pluginHubSelected = pluginHubItems?.[
    Math.min(pluginHubSelection, Math.max(0, pluginHubItems.length - 1))
  ]
  const installedPlugins = pluginHubDialog?.installed?.plugins
  const pluginHubInstalled = installedPlugins?.[
    Math.min(pluginHubSelection, Math.max(0, installedPlugins.length - 1))
  ]
  const pluginHubVisibleEnd = Math.min(
    pluginHubVisibleStart + pluginHubVisibleCount,
    pluginHubRows.length,
  )
  const pluginHubDetailPageSize = Math.max(1, terminalRows - 8)
  const helpHeight = helpVisible ? Math.min(Math.max(7, terminalRows - 6), 18) : 0
  const helpBodyRows = Math.max(1, helpHeight - 4)
  const visibleHelpOffset = Math.min(helpOffset, Math.max(0, helpLines.length - helpBodyRows))
  const visibleDetailHeight = helpVisible ? 0 : detailHeight
  const visibleTasksHeight = helpVisible || workOpen ? 0 : tasksHeight
  const suggestionRows = helpVisible || suggestion === undefined ? 0
    : suggestion.status === 'loading' || suggestion.status === 'empty' ? 1
      : visibleSuggestions.length
        + (suggestion.items.length > visibleSuggestions.length ? 1 : 0)
        + (suggestion.status === 'truncated' ? 1 : 0)
  const historySearchRows = helpVisible || historySearch === undefined ? 0 : 1
  const transcriptSearchRows = helpVisible || interaction !== undefined || transcriptSearch === undefined ? 0 : 1
  const stashRows = helpVisible || stashedDraft === undefined ? 0 : 1
  const transcriptRows = viewportRows(
    stdout,
    visibleDetailHeight + helpHeight + visibleTasksHeight + approvalHeight + (helpVisible ? -1 : composerLayout.lines.length - 1)
      + suggestionRows + historySearchRows + transcriptSearchRows + stashRows,
  )
  const transcriptColumns = Math.max(1, (stdout.columns || 80) - (focus === undefined ? 2 : 4))
  transcriptViewport.update(rows, transcriptColumns)
  const transcriptPage = transcriptViewport.page(transcriptRows, transcriptAnchor)
  const visible = transcriptPage.entries
  const completeFooterItems = tuiFooterItems({
    modelSelection: props.view.kind === 'root' ? activeSelection : undefined,
    modelSelectionKind: agentStatus === 'running' ? 'running request' : 'next request',
    permissions: props.view.kind === 'root' ? permissions : undefined,
    context: props.view.kind === 'root' ? contextPressure : undefined,
    work: work.summary,
    workspace,
    transcript: {
      startIndex: transcriptPage.startIndex,
      endIndex: transcriptPage.endIndex,
      total: rows.length,
      hasOlder: transcriptPage.hasOlder,
      hasNewer: transcriptPage.hasNewer,
    },
  })
  const mountedFooterItems = visibleTuiFooterItems(completeFooterItems, Math.max(1, columns - 2))
  const effectiveFooterSelection = footerSelection !== undefined
    && mountedFooterItems.some(item => item.id === footerSelection)
    ? footerSelection
    : mountedFooterItems[0]?.id
  const selectedFooterItem = mountedFooterItems.find(item => item.id === effectiveFooterSelection)
  const footerDetailItem = footerDetail === undefined
    ? undefined
    : completeFooterItems.find(item => item.id === footerDetail.itemId)
  const detailLines = footerDetailItem === undefined
    ? transcriptDetailLines
    : footerDetailItem.detailLines.flatMap(line => terminalWrappedLines(line, detailColumns))
  const detailOffset = footerDetail !== undefined
    ? Math.min(footerDetail.offset, Math.max(0, detailLines.length - detailRows))
    : focus?.mode === 'detail'
      ? Math.min(focus.detailOffset, Math.max(0, detailLines.length - detailRows))
      : 0
  const footerStatus = tuiFooterStatusLine(mountedFooterItems, Math.max(1, columns - 2))
  const selectedFooterStatus = tuiSelectedFooterLine(
    mountedFooterItems, effectiveFooterSelection, Math.max(1, columns - 2),
  )
  const startupFrame = tuiStartupComposerFrame(stdout, composerLayout.lines.length, suggestionRows)

  useEffect(() => {
    if (helpOpen) setHelpOffset(0)
  }, [helpOpen])

  useEffect(() => {
    if (focus === undefined || focusedTarget === undefined) return
    if (focusedTarget.node.kind === 'todo') return
    const parentIndex = transcriptViewport.indexOfNode(focusedTarget.node)
    setTranscriptAnchor(previous => transcriptScroll.ensureVisible(
      previous, transcriptPage, focusedTarget.node.key, parentIndex,
    ))
  }, [focus, focusedTarget, transcriptPage, transcriptScroll, transcriptViewport])

  useEffect(() => {
    if (rewindDialog?.phase !== 'browsing' || rewindSelectedKey === undefined) return
    const index = transcriptViewport.indexOfKey(rewindSelectedKey)
    if (index < 0) return
    setTranscriptAnchor(previous => previous?.key === rewindSelectedKey && previous.index === index
      ? previous
      : transcriptScroll.reveal(rewindSelectedKey, index))
  }, [rewindDialog?.phase, rewindSelectedKey, transcriptScroll, transcriptViewport])

  useEffect(() => {
    if (transcriptSearch === undefined) return
    if (transcriptSearch.query.trim() === '' || transcriptSearchHits.length === 0) {
      if (transcriptSearch.selectedKey !== undefined) {
        setTranscriptSearch(previous => previous === undefined ? previous : { ...previous, selectedKey: undefined })
      }
      setTranscriptAnchor(transcriptSearch.previousAnchor)
      return
    }
    const selected = resolveTuiTranscriptSearchHit(transcriptSearchHits, transcriptSearch.selectedKey)
    if (selected === undefined) return
    if (selected.key !== transcriptSearch.selectedKey) {
      setTranscriptSearch(previous => previous === undefined ? previous : { ...previous, selectedKey: selected.key })
    }
    if (selected.key === currentTodo?.key) return
    setTranscriptAnchor(previous => previous?.key === selected.key && previous.index === selected.nodeIndex
      ? previous
      : transcriptScroll.reveal(selected.key, selected.nodeIndex))
  }, [currentTodo?.key, transcriptScroll, transcriptSearch, transcriptSearchHits])

  const submitQuestion = (): void => {
    if (interaction?.kind !== 'question') return
    const question = interaction.request.questions[questionIndex]
    if (question === undefined) return
    const answer = answerFor(question, composer.text)
    if (answer.selected.length === 0 && answer.custom === undefined) {
      setNotice('Choose an option number or enter a response.')
      return
    }
    const answers = [...questionAnswers, answer]
    if (questionIndex + 1 < interaction.request.questions.length) {
      setQuestionAnswers(answers)
      setQuestionIndex(questionIndex + 1)
      setQuestionCursor(0)
      setSuggestionOverride(undefined)
      setComposer(createComposerState())
      setNotice('')
    } else {
      props.interactions.answerQuestion({ answers } satisfies AskUserQuestionAnswer)
      setNotice('')
    }
  }

  const submitComposer = (): void => {
    const text = materializeComposerText(composer)
    if (text.trim() === '' || busy || !props.view.acceptsInput) return
    const submittedViewId = props.view.id
    setSuggestionOverride(undefined)
    setComposer(createComposerState())
    setHistory(previous => [...previous, tuiComposerDraft(composer)])
    setBusy(true)
    setNotice('')
    void props.onSubmit(text).catch((error: unknown) => {
      if (currentAgentViewId.current === submittedViewId) {
        setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
      }
    }).finally(() => { setBusy(false) })
  }

  const executeLocalCommand = (command: string): void => {
    if (busy) return
    setBusy(true)
    setNotice('')
    void props.onSubmit(command).catch((error: unknown) => {
      setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
    }).finally(() => { setBusy(false) })
  }

  const activateFooterItem = (): void => {
    if (selectedFooterItem === undefined || busy) return
    if (selectedFooterItem.action === 'work') {
      setFooterSelection(undefined)
      setWorkSelection(0)
      setWorkClock(Date.now())
      setWorkOpen(true)
      return
    }
    if (selectedFooterItem.action === 'detail') {
      setFooterDetail({ itemId: selectedFooterItem.id, offset: 0 })
      return
    }
    const itemId = selectedFooterItem.id
    setFooterSelection(undefined)
    setBusy(true)
    setNotice('')
    void props.onActivateFooter(itemId).catch((error: unknown) => {
      setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
    }).finally(() => { setBusy(false) })
  }

  const activateResumeCandidate = (candidate: TuiResumeCandidate): void => {
    if (candidate.disabledReason !== undefined) {
      setResumeError(candidate.disabledReason)
      return
    }
    const activeDraft = composer.text.trim()
    if (activeDraft !== '' && activeDraft !== '/resume') {
      setResumeConfirmation(candidate)
      setResumeError('')
      return
    }
    setResumeError('')
    void props.onResume(candidate)
  }

  const confirmResumeWithDraft = (action: 'stash' | 'discard'): void => {
    const candidate = resumeConfirmation
    if (candidate === undefined) return
    if (action === 'stash') {
      if (stashedDraft !== undefined) {
        setResumeError('A draft is already stashed. Cancel and restore or discard it first.')
        return
      }
      const transition = toggleTuiComposerStash(composer, undefined)
      if (transition.stash === undefined) {
        setResumeError('The current draft could not be stashed.')
        return
      }
      setComposer(transition.composer)
      setStashedDraft(transition.stash)
    } else {
      setComposer(createComposerState())
    }
    setResumeConfirmation(undefined)
    setResumeError('')
    void props.onResume(candidate)
  }

  const confirmRewind = (action: 'none' | 'stash' | 'discard'): void => {
    const candidate = rewindConfirmation
    if (candidate === undefined) return
    const activeDraft = composer.text.trim() !== '' && composer.text.trim() !== '/rewind'
    if (activeDraft && action === 'none') return
    if (activeDraft && action === 'stash') {
      if (stashedDraft !== undefined) {
        setRewindError('A draft is already stashed. Cancel and restore or discard it first.')
        return
      }
      const transition = toggleTuiComposerStash(composer, undefined)
      if (transition.stash === undefined) {
        setRewindError('The current draft could not be stashed.')
        return
      }
      setComposer(transition.composer)
      setStashedDraft(transition.stash)
    } else if (activeDraft && action === 'discard') {
      setComposer(createComposerState())
    }
    setRewindConfirmation(undefined)
    setRewindError('')
    void props.onRewind(candidate)
  }

  const matchAction = (context: TuiInteractionContext, input: string, keypress: TuiKeypress) =>
    matchTuiInteractionAction(context, input, keypress, props.interactionRegistry)

  useTuiTerminalInput((terminalInput) => {
    if (terminalInput.kind === 'mouse') {
      const wheel = terminalInput.button & ~0b11100
      if ((wheel === 64 || wheel === 65) && !terminalInput.release && interaction === undefined && focus === undefined
        && transcriptSearch === undefined && !helpVisible && footerSelection === undefined
        && footerDetail === undefined && !workOpen) {
        setTranscriptAnchor(wheel === 64
          ? transcriptScroll.previous(transcriptPage, transcriptRows)
          : transcriptScroll.next(transcriptPage, transcriptRows))
      }
      return
    }
    if (terminalInput.kind !== 'input') return
    if (terminalInput.truncated === true) setNotice('Paste exceeded the terminal input limit and was truncated.')
    const { input, key } = terminalInput
    const updateComposer = (update: React.SetStateAction<ComposerState>): void => {
      setSuggestionOverride(undefined)
      setComposer(update)
    }
    const globalAction = matchAction('Global', input, key)
    if (globalAction === 'app.interrupt') {
      if (interaction !== undefined) props.interactions.cancelCurrent()
      else if (workOpen) setWorkOpen(false)
      else if (freshSessionDialog !== undefined) {
        props.onCloseFreshSession()
      }
      else if (resumeDialog !== undefined) {
        props.onCloseResume()
      }
      else if (rewindDialog !== undefined) {
        props.onCloseRewind()
      }
      else if (sessionExportDialog !== undefined) {
        props.onCloseSessionExport()
      }
      else if (pluginHubDialog !== undefined) {
        props.onClosePluginHub()
      }
      else if (agentStatus === 'running') props.onCancel()
      else props.onExit()
      return
    }
    if (globalAction === 'view.root') {
      if (props.view.kind === 'child') props.onReturnRoot()
      return
    }
    if (globalAction === 'help.open' && inputContext === 'Composer' && interaction === undefined) {
      props.onOpenHelp()
      return
    }
    if (globalAction === 'transcript.open' && inputContext === 'Composer'
      && interaction === undefined && historySearch === undefined && !helpVisible) {
      const latest = focusTargets.at(-1)
      if (focus === undefined && latest !== undefined) {
        setFocus({ mode: 'browse', focusedKey: latest.key, focusedIndex: focusTargets.length - 1 })
      }
      return
    }
    if (helpVisible) {
      const action = matchAction('Dialog', input, key)
      if (action === 'dialog.previous') setHelpOffset(previous => Math.max(0, previous - 1))
      else if (action === 'dialog.next') {
        setHelpOffset(previous => Math.min(Math.max(0, helpLines.length - helpBodyRows), previous + 1))
      } else if (action === 'dialog.previousPage') {
        setHelpOffset(previous => Math.max(0, previous - helpBodyRows))
      } else if (action === 'dialog.nextPage') {
        setHelpOffset(previous => Math.min(Math.max(0, helpLines.length - helpBodyRows), previous + helpBodyRows))
      } else if (action === 'dialog.cancel') props.onCloseHelp()
      return
    }
    if (inputContext === 'Approval') {
      const action = matchAction('Approval', input, key)
      if (action === 'approval.previous' || action === 'approval.previousPage') {
        setApprovalOffset(previous => Math.max(
          0,
          previous - (action === 'approval.previousPage' ? approvalBodyRows : 1),
        ))
        return
      }
      if (action === 'approval.next' || action === 'approval.nextPage') {
        setApprovalOffset(previous => Math.min(
          Math.max(0, approvalLines.length - approvalBodyRows),
          previous + (action === 'approval.nextPage' ? approvalBodyRows : 1),
        ))
        return
      }
      if (action === 'approval.allowOnce') props.interactions.answerApproval('allowed-once')
      else if (action === 'approval.reject') props.interactions.answerApproval('rejected')
      return
    }
    if (inputContext === 'PluginHub' && pluginHubDialog !== undefined && interaction === undefined) {
      const action = matchAction('PluginHub', input, key)
      if (pluginHubDialog.phase === 'handoff') return
      if (action === 'pluginHub.toggleView') {
        setPluginHubSelection(0)
        setPluginHubDetailOffset(0)
        void props.onPluginHubToggleView()
        return
      }
      if (pluginHubDialog.phase === 'confirm') {
        if (action === 'pluginHub.accept') void props.onPluginHubConfirm()
        else if (action === 'pluginHub.close') props.onClosePluginHub()
        else if (action === 'pluginHub.previousPage') setPluginHubDetailOffset(previous => Math.max(0, previous - pluginHubDetailPageSize))
        else if (action === 'pluginHub.nextPage') setPluginHubDetailOffset(previous => Math.min(
          Math.max(0, pluginHubPlanLines.length - 1), previous + pluginHubDetailPageSize,
        ))
        return
      }
      if (pluginHubDialog.phase === 'planning' || pluginHubDialog.phase === 'staging') {
        if (action === 'pluginHub.close') props.onClosePluginHub()
        return
      }
      if (pluginHubDialog.phase === 'detail' && pluginHubDialog.detail !== undefined) {
        if (action === 'pluginHub.close') props.onClosePluginHub()
        else if (action === 'pluginHub.accept' && pluginHubDialog.profileMutations !== false
          && pluginHubDialog.detail.latestVersion?.installable === true) {
          void props.onPluginHubInstall()
        }
        else if (action === 'pluginHub.search') props.onClosePluginHub()
        else if (action === 'pluginHub.previousPage') setPluginHubDetailOffset(previous => Math.max(0, previous - pluginHubDetailPageSize))
        else if (action === 'pluginHub.nextPage') setPluginHubDetailOffset(previous => Math.min(Math.max(0, pluginHubDetailLines.length - 1), previous + pluginHubDetailPageSize))
        return
      }
      if (action === 'pluginHub.close') { props.onClosePluginHub(); return }
      if (action === 'pluginHub.refresh') { void props.onPluginHubRefresh(); return }
      if (action === 'pluginHub.sort') { setPluginHubSelection(0); void props.onPluginHubSort(); return }
      if (action === 'pluginHub.category') { setPluginHubSelection(0); void props.onPluginHubCategory(); return }
      if (action === 'pluginHub.previous') { setPluginHubSelection(previous => Math.max(0, previous - 1)); return }
      if (action === 'pluginHub.next') {
        if (pluginHubDialog.view === 'discover' && pluginHubDialog.phase === 'browse'
          && pluginHubDialog.page?.nextCursor !== undefined
          && pluginHubSelection >= pluginHubRows.length - 1) {
          void props.onPluginHubLoadMore()
          return
        }
        setPluginHubSelection(previous => Math.min(Math.max(0, pluginHubRows.length - 1), previous + 1)); return
      }
      if (action === 'pluginHub.previousPage') { setPluginHubSelection(previous => Math.max(0, previous - pluginHubVisibleCount)); return }
      if (action === 'pluginHub.nextPage') {
        if (pluginHubDialog.view === 'discover' && pluginHubDialog.phase === 'browse'
          && pluginHubDialog.page?.nextCursor !== undefined
          && pluginHubSelection + pluginHubVisibleCount >= pluginHubRows.length) {
          void props.onPluginHubLoadMore()
          return
        }
        setPluginHubSelection(previous => Math.min(Math.max(0, pluginHubRows.length - 1), previous + pluginHubVisibleCount)); return
      }
      if (action === 'pluginHub.accept') {
        if (pluginHubDialog.view === 'installed') {
          if (pluginHubDialog.profileMutations !== false && pluginHubInstalled !== undefined) {
            void props.onPluginHubRemove(pluginHubInstalled.packageName)
          }
        } else if (pluginHubSelected !== undefined) void props.onPluginHubDetail(pluginHubSelected.id)
        return
      }
      if (pluginHubDialog.view === 'installed') return
      if (key.backspace) {
        const next = pluginHubQuery.slice(0, -1)
        setPluginHubQuery(next); setPluginHubSelection(0); void props.onPluginHubSearch(next); return
      }
      if (input !== '' && acceptsCommittedText(key) && input.length <= 64) {
        const next = `${pluginHubQuery}${input}`.slice(0, 160)
        setPluginHubQuery(next); setPluginHubSelection(0); void props.onPluginHubSearch(next)
      }
      return
    }
    if (sessionExportDialog !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      if (sessionExportDialog.phase !== 'selecting') {
        if (action === 'dialog.cancel') props.onCloseSessionExport()
        return
      }
      if (key.tab) {
        setExportDescendants(previous => !previous)
      } else if (action === 'dialog.cancel') {
        props.onCloseSessionExport()
      } else if (action === 'dialog.accept') {
        void props.onExportSession(exportDirectory.text, exportDescendants)
      } else if (key.leftArrow || key.rightArrow) {
        setExportDirectory(previous => moveComposerCursor(previous, key.leftArrow ? 'left' : 'right'))
      } else if (key.backspace) {
        setExportDirectory(previous => deleteComposerText(previous, 'backward'))
      } else if (key.delete) {
        setExportDirectory(previous => deleteComposerText(previous, 'forward'))
      } else if (input !== '' && acceptsCommittedText(key)) {
        setExportDirectory(previous => insertComposerText(previous, input))
      }
      return
    }
    if (freshSessionDialog !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      if (freshSessionDialog.phase === 'creating') {
        if (action === 'dialog.cancel') props.onCloseFreshSession()
        return
      }
      if (action === 'dialog.accept' || input.toLocaleLowerCase() === 'y') {
        void props.onConfirmFreshSession()
      } else if (action === 'dialog.cancel' || input.toLocaleLowerCase() === 'n') {
        props.onCloseFreshSession()
      }
      return
    }
    if (rewindDialog !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      if (rewindDialog.phase !== 'browsing') {
        if (action === 'dialog.cancel') props.onCloseRewind()
        return
      }
      if (rewindConfirmation !== undefined) {
        const activeDraft = composer.text.trim() !== '' && composer.text.trim() !== '/rewind'
        if (action === 'dialog.cancel') {
          setRewindConfirmation(undefined)
          setRewindError('')
        } else if (activeDraft && input.toLocaleLowerCase() === 's') confirmRewind('stash')
        else if (activeDraft && input.toLocaleLowerCase() === 'd') confirmRewind('discard')
        else if (!activeDraft && (action === 'dialog.accept' || input.toLocaleLowerCase() === 'y')) {
          confirmRewind('none')
        }
        return
      }
      if (action === 'dialog.previous' || action === 'dialog.next') {
        if (rewindCandidates.length === 0) return
        setRewindSelection(previous => action === 'dialog.previous'
          ? (Math.min(previous, rewindCandidates.length - 1) + rewindCandidates.length - 1)
            % rewindCandidates.length
          : (Math.min(previous, rewindCandidates.length - 1) + 1) % rewindCandidates.length)
        setRewindError('')
      } else if (action === 'dialog.cancel') {
        props.onCloseRewind()
      } else if (action === 'dialog.accept') {
        const candidate = rewindCandidates[effectiveRewindSelection]
        if (candidate === undefined) setRewindError('No completed human turn is available to rewind.')
        else {
          setRewindConfirmation(candidate)
          setRewindError('')
        }
      }
      return
    }
    if (resumeDialog !== undefined && interaction === undefined) {
      if (resumeDialog.phase === 'resuming') {
        if (matchAction('Dialog', input, key) === 'dialog.cancel') props.onCloseResume()
        return
      }
      if (resumeConfirmation !== undefined) {
        if (matchAction('Dialog', input, key) === 'dialog.cancel') {
          setResumeConfirmation(undefined)
          setResumeError('')
        } else if (input.toLocaleLowerCase() === 's') confirmResumeWithDraft('stash')
        else if (input.toLocaleLowerCase() === 'd') confirmResumeWithDraft('discard')
        return
      }
      const action = matchAction('Dialog', input, key)
      if (key.tab) {
        setResumeScope(previous => previous === 'workspace' ? 'all' : 'workspace')
        setResumeQuery('')
        setResumeSelection(0)
        setResumeError('')
      } else if (action === 'dialog.previous' || action === 'dialog.next') {
        if (resumeCandidates.length === 0) return
        setResumeSelection(previous => action === 'dialog.previous'
          ? (Math.min(previous, resumeCandidates.length - 1) + resumeCandidates.length - 1) % resumeCandidates.length
          : (Math.min(previous, resumeCandidates.length - 1) + 1) % resumeCandidates.length)
        setResumeError('')
      } else if (action === 'dialog.previousPage' || action === 'dialog.nextPage') {
        setResumeSelection(previous => action === 'dialog.previousPage'
          ? Math.max(0, previous - resumeVisibleCount)
          : Math.min(Math.max(0, resumeCandidates.length - 1), previous + resumeVisibleCount))
        setResumeError('')
      } else if (action === 'dialog.cancel') {
        if (resumeQuery !== '') {
          setResumeQuery('')
          setResumeSelection(0)
          setResumeError('')
        } else props.onCloseResume()
      } else if (action === 'dialog.accept') {
        if (resumeDialog.phase === 'loading') setResumeError('Sessions are still loading.')
        else {
          const candidate = resumeCandidates[effectiveResumeSelection]
          if (candidate === undefined) setResumeError('No session matches this search.')
          else activateResumeCandidate(candidate)
        }
      } else if (key.backspace) {
        setResumeQuery(previous => deleteComposerText(createComposerState(previous), 'backward').text)
        setResumeSelection(0)
        setResumeError('')
      } else if (input !== '' && acceptsCommittedText(key)) {
        setResumeQuery(previous => insertComposerText(createComposerState(previous), input).text)
        setResumeSelection(0)
        setResumeError('')
      }
      return
    }
    if (inputContext === 'Footer' && footerSelection !== undefined) {
      const action = matchAction('Footer', input, key)
      if (action === 'footer.previous' || action === 'footer.next') {
        setFooterSelection(previous => moveTuiFooterSelection(
          mountedFooterItems,
          previous,
          action === 'footer.previous' ? 'previous' : 'next',
        ))
      } else if (action === 'footer.activate') activateFooterItem()
      else if (action === 'footer.close') setFooterSelection(undefined)
      return
    }
    if (inputContext === 'Work' && workOpen) {
      const action = matchAction('Work', input, key)
      if (action === 'work.previous' || action === 'work.next') {
        if (work.items.length === 0) return
        setWorkSelection(previous => action === 'work.previous'
          ? (Math.min(previous, work.items.length - 1) + work.items.length - 1) % work.items.length
          : (Math.min(previous, work.items.length - 1) + 1) % work.items.length)
        setNotice('')
      } else if (action === 'work.cancel') {
        if (selectedWorkItem === undefined || selectedWorkItem.action === 'none' || busy) return
        setBusy(true)
        setNotice('')
        void props.onCancelWork(selectedWorkItem).catch((error: unknown) => {
          setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
        }).finally(() => { setBusy(false) })
      } else if (action === 'work.inspect') {
        if (selectedWorkItem === undefined || !selectedWorkItem.inspectable || busy) return
        setBusy(true)
        setNotice('')
        void props.onOpenWork(selectedWorkItem).catch((error: unknown) => {
          setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
        }).finally(() => { setBusy(false) })
      } else if (action === 'work.close') setWorkOpen(false)
      return
    }
    if (inputContext === 'Detail' && (focus?.mode === 'detail' || footerDetail !== undefined)) {
      const action = matchAction('Detail', input, key)
      if (action === 'detail.copy') {
        const copyText = footerDetailItem === undefined && focusedTarget !== undefined
          ? tuiTranscriptDetailText(focusedTarget.node, focusedTarget.child)
          : footerDetailItem?.detailLines.join('\n') ?? ''
        const result = props.onCopy(copyText)
        setNotice(result.ok ? 'Copied detail to the terminal clipboard.' : result.message ?? 'Clipboard copy failed.')
        return
      }
      if (action === 'detail.previousPage') {
        if (footerDetail !== undefined) {
          setFooterDetail(previous => previous === undefined ? previous : {
            ...previous, offset: Math.max(0, detailOffset - detailRows),
          })
        } else {
          setFocus(previous => previous?.mode !== 'detail' ? previous : {
            ...previous, detailOffset: Math.max(0, detailOffset - detailRows),
          })
        }
        return
      }
      if (action === 'detail.nextPage') {
        const total = detailLines.length
        if (footerDetail !== undefined) {
          setFooterDetail(previous => previous === undefined ? previous : {
            ...previous, offset: Math.min(Math.max(0, total - detailRows), detailOffset + detailRows),
          })
        } else {
          setFocus(previous => previous?.mode !== 'detail' ? previous : {
            ...previous, detailOffset: Math.min(Math.max(0, total - detailRows), detailOffset + detailRows),
          })
        }
        return
      }
      if (action === 'detail.close') {
        if (footerDetail !== undefined) setFooterDetail(undefined)
        else {
          setFocus(previous => previous?.mode !== 'detail' ? previous : {
            mode: 'browse', focusedKey: previous.focusedKey, focusedIndex: previous.focusedIndex,
          })
        }
        return
      }
      return
    }
    if (inputContext === 'TranscriptSearch' && transcriptSearch !== undefined) {
      const action = matchAction('TranscriptSearch', input, key)
      if (action === 'transcriptSearch.cancel') {
        setTranscriptAnchor(transcriptSearch.previousAnchor)
        setTranscriptSearch(undefined)
        return
      }
      if (action === 'transcriptSearch.accept') {
        setTranscriptSearch(undefined)
        return
      }
      if (action === 'transcriptSearch.next' || action === 'transcriptSearch.previous') {
        if (transcriptSearchHits.length === 0) return
        const offset = action === 'transcriptSearch.previous' ? -1 : 1
        const current = transcriptSearchSelectedIndex < 0 ? 0 : transcriptSearchSelectedIndex
        const next = (current + offset + transcriptSearchHits.length) % transcriptSearchHits.length
        const hit = transcriptSearchHits[next]
        if (hit !== undefined) {
          setTranscriptSearch(previous => previous === undefined ? previous : { ...previous, selectedKey: hit.key })
          if (hit.key !== currentTodo?.key) setTranscriptAnchor(transcriptScroll.reveal(hit.key, hit.nodeIndex))
        }
        return
      }
      if (key.backspace) {
        const query = deleteComposerText(createComposerState(transcriptSearch.query), 'backward').text
        setTranscriptSearch(previous => previous === undefined ? previous : {
          ...previous, query, selectedKey: undefined,
        })
        return
      }
      if (input !== '' && acceptsCommittedText(key)) {
        const query = insertComposerText(createComposerState(transcriptSearch.query), input).text
        setTranscriptSearch(previous => previous === undefined ? previous : {
          ...previous, query, selectedKey: undefined,
        })
      }
      return
    }
    if (inputContext === 'Transcript' && focus?.mode === 'browse') {
      const action = matchAction('Transcript', input, key)
      if (action === 'transcript.copy') {
        const result = props.onCopy(focusedTarget === undefined
          ? ''
          : tuiTranscriptDetailText(focusedTarget.node, focusedTarget.child))
        setNotice(result.ok ? 'Copied transcript block to the terminal clipboard.' : result.message ?? 'Clipboard copy failed.')
        return
      }
      if (action === 'transcript.previous' || action === 'transcript.next') {
        const next = action === 'transcript.previous'
          ? Math.max(0, focusedIndex - 1)
          : Math.min(focusTargets.length - 1, focusedIndex + 1)
        const target = focusTargets[next]
        if (target !== undefined) {
          setFocus({ mode: 'browse', focusedKey: target.key, focusedIndex: next })
          if (target.node.kind !== 'todo') {
            const parentIndex = transcriptViewport.indexOfNode(target.node)
            setTranscriptAnchor(previous => transcriptScroll.ensureVisible(
              previous, transcriptPage, target.node.key, parentIndex,
            ))
          }
        }
        return
      }
      if (action === 'transcript.inspect') {
        if (focusedTarget !== undefined) setFocus({
          mode: 'detail', focusedKey: focusedTarget.key, focusedIndex, detailOffset: 0,
        })
        return
      }
      if (action === 'transcript.close') {
        setFocus(undefined)
        return
      }
      return
    }
    if (inputContext === 'HistorySearch' && historySearch !== undefined) {
      const action = matchAction('HistorySearch', input, key)
      if (action === 'historySearch.next') {
        setHistorySearch(previous => previous === undefined ? previous : nextTuiHistorySearchMatch(previous, history))
        return
      }
      if (action === 'historySearch.cancel') {
        setComposer(cancelTuiHistorySearch(historySearch))
        setHistorySearch(undefined)
        return
      }
      if (action === 'historySearch.accept') {
        if (historyMatch?.draft !== undefined) {
          const original = cancelTuiHistorySearch(historySearch)
          const restored = restoreTuiComposerDraft(historyMatch.draft)
          setComposer(replaceComposerText(
            original, restored.text, restored.cursor, 'history', Date.now(), restored.references,
          ))
          setHistorySearch(undefined)
        }
        return
      }
      if (key.backspace) {
        const query = deleteComposerText(createComposerState(historySearch.query), 'backward').text
        setHistorySearch(updateTuiHistorySearchQuery(historySearch, query, history))
        return
      }
      if (input !== '' && acceptsCommittedText(key)) {
        const query = insertComposerText(createComposerState(historySearch.query), input).text
        setHistorySearch(updateTuiHistorySearchQuery(historySearch, query, history))
      }
      return
    }
    const composerAction = matchAction('Composer', input, key)
    if (interaction === undefined && focus === undefined && historySearch === undefined
      && composerAction === 'composer.transcriptSearch') {
      setSuggestionOverride(undefined)
      setTranscriptSearch({ query: '', previousAnchor: transcriptAnchor, selectedKey: undefined })
      return
    }
    if (!props.view.acceptsInput) {
      if (composerAction === 'composer.openFooter') {
        setFooterSelection(mountedFooterItems[0]?.id)
      } else if (composerAction === 'composer.transcriptPreviousPage') {
        setTranscriptAnchor(transcriptScroll.previous(transcriptPage, transcriptRows))
      } else if (composerAction === 'composer.transcriptNextPage') {
        setTranscriptAnchor(transcriptScroll.next(transcriptPage, transcriptRows))
      } else if (composerAction === 'composer.transcriptOldest') {
        setTranscriptAnchor(transcriptScroll.oldest())
      } else if (composerAction === 'composer.transcriptLatest') {
        setTranscriptAnchor(transcriptScroll.latest())
      } else if (composerAction === 'composer.cancel' && agentStatus === 'running') {
        props.onCancel()
      }
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.historySearch') {
      setSuggestionOverride(undefined)
      setHistorySearch(startTuiHistorySearch(composer, history))
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.stash') {
      const transition = toggleTuiComposerStash(composer, stashedDraft)
      setSuggestionOverride(undefined)
      setComposer(transition.composer)
      setStashedDraft(transition.stash)
      setNotice('')
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.undo') {
      updateComposer(previous => undoComposerEdit(previous))
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.redo') {
      updateComposer(previous => redoComposerEdit(previous))
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.openModels') {
      executeLocalCommand('/models')
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.openResume') {
      executeLocalCommand('/resume')
      return
    }
    if (interaction === undefined && focus === undefined && suggestion !== undefined) {
      const action = matchAction('Suggestion', input, key)
      if (action === 'suggestion.previous' || action === 'suggestion.next') {
        const state = moveTuiSuggestion(
          suggestion,
          action === 'suggestion.previous' ? 'previous' : 'next',
          suggestionLimit,
        )
        if (suggestionKey !== undefined) setSuggestionOverride({ key: suggestionKey, state, dismissed: false })
        return
      }
      if (action === 'suggestion.accept') {
        if (suggestion.items.length > 0) {
          const accepted = acceptTuiSuggestion(composer.text, suggestion)
          if (accepted !== undefined) updateComposer(previous => replaceComposerText(
            previous, accepted.text, accepted.cursor, 'suggestion',
          ))
        }
        return
      }
      if (action === 'suggestion.dismiss') {
        if (suggestionKey !== undefined) setSuggestionOverride({ key: suggestionKey, state: suggestion, dismissed: true })
        return
      }
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.openFooter') {
      setFooterSelection(mountedFooterItems[0]?.id)
      return
    }
    if (interaction === undefined && key.tab) return
    if (interaction === undefined && composerAction === 'composer.transcriptPreviousPage') {
      setTranscriptAnchor(transcriptScroll.previous(transcriptPage, transcriptRows))
      return
    }
    if (interaction === undefined && composerAction === 'composer.transcriptNextPage') {
      setTranscriptAnchor(transcriptScroll.next(transcriptPage, transcriptRows))
      return
    }
    if (interaction === undefined && composer.text === ''
      && (composerAction === 'composer.transcriptOldest' || composerAction === 'composer.transcriptLatest')) {
      setTranscriptAnchor(composerAction === 'composer.transcriptOldest'
        ? transcriptScroll.oldest()
        : transcriptScroll.latest())
      return
    }
    if (composerAction === 'composer.cancel' || (inputContext === 'Dialog'
      && matchAction('Dialog', input, key) === 'dialog.cancel')) {
      if (interaction !== undefined) props.interactions.cancelCurrent()
      else if (agentStatus === 'running') props.onCancel()
      return
    }
    if (composerAction === 'composer.newline') {
      updateComposer(previous => insertComposerText(previous, '\n'))
      return
    }
    if (composerAction === 'composer.submit' || (inputContext === 'Dialog'
      && matchAction('Dialog', input, key) === 'dialog.accept')) {
      if (interaction?.kind === 'question') submitQuestion()
      else submitComposer()
      return
    }
    const dialogAction = inputContext === 'Dialog' ? matchAction('Dialog', input, key) : undefined
    if (interaction?.kind === 'question' && (dialogAction === 'dialog.previous' || dialogAction === 'dialog.next')) {
      const options = interaction.request.questions[questionIndex]?.options ?? []
      if (options.length === 0) return
      const next = dialogAction === 'dialog.previous'
        ? Math.max(0, questionCursor - 1)
        : Math.min(options.length - 1, questionCursor + 1)
      setQuestionCursor(next)
      updateComposer(createComposerState(String(next + 1)))
      return
    }
    if (key.leftArrow || key.rightArrow) {
      updateComposer(previous => moveComposerCursor(
        previous,
        key.ctrl || key.meta ? key.leftArrow ? 'word-left' : 'word-right' : key.leftArrow ? 'left' : 'right',
      ))
      return
    }
    if (key.home || key.end) {
      updateComposer(previous => moveComposerCursor(previous, key.home ? 'home' : 'end'))
      return
    }
    if (key.delete) {
      updateComposer(previous => deleteComposerText(previous, 'forward'))
      return
    }
    if (key.backspace || (key.ctrl && input === 'w')) {
      updateComposer(previous => deleteComposerText(
        previous,
        key.ctrl && input === 'w' ? 'word-backward'
          : 'backward',
      ))
      return
    }
    if (interaction === undefined && composerAction === 'composer.historyPrevious' && history.length > 0) {
      updateComposer(previous => traverseComposerHistory(previous, history, 'older'))
      return
    }
    if (interaction === undefined && composerAction === 'composer.historyNext' && composer.historyIndex >= 0) {
      updateComposer(previous => traverseComposerHistory(previous, history, 'newer'))
      return
    }
    if (input !== '' && acceptsCommittedText(key)) {
      updateComposer(previous => key.paste === true && isLargeComposerPaste(input)
        ? insertComposerPasteReference(previous, input)
        : insertComposerText(previous, input))
    }
  }, props.initialTerminalInput)

  const question = interaction?.kind === 'question'
    ? interaction.request.questions[questionIndex]
    : undefined
  const questionOptions = question?.options ?? []
  const optionLimit = Math.max(2, Math.floor((stdout.rows - 12) / 2))
  const optionStart = Math.min(
    Math.max(0, questionCursor - Math.floor(optionLimit / 2)),
    Math.max(0, questionOptions.length - optionLimit),
  )
  const visibleOptions = questionOptions.slice(optionStart, optionStart + optionLimit)

  const sessionLabel = props.agent.id.length > 24 ? `${props.agent.id.slice(0, 21)}…` : props.agent.id
  const viewLabel = props.view.kind === 'root' ? 'root' : `Agent ${props.view.label}`
  const inputTarget = props.view.acceptsInput ? `target: ${props.view.label}` : 'read-only'
  const model = activeSelection?.model
  const compactTerminal = columns < 60
  const reasoningEffort = activeSelection?.reasoningEffort
  const modelMetadata = [
    model,
    reasoningEffort === undefined ? undefined : `thinking: ${reasoningEffort}`,
  ].filter(value => value !== undefined && value !== '').join(' · ')
  const compactStatusMetadata = modelMetadata.length > 24 ? `${modelMetadata.slice(0, 21)}…` : modelMetadata
  const sessionMetadata = columns < 120 ? '' : ` · ${terminalSafe(sessionLabel)}`
  const activityMetadata = compactTerminal
    ? `${terminalSafe(viewLabel)} · ${terminalSafe(inputTarget)}${compactStatusMetadata === '' ? '' : ` · ${terminalSafe(compactStatusMetadata)}`}`
    : `${terminalSafe(viewLabel)} · ${terminalSafe(inputTarget)}${modelMetadata === '' ? '' : ` · ${terminalSafe(modelMetadata)}`}${sessionMetadata}`
  const suggestionPanel = !helpVisible && interaction === undefined && focus === undefined && suggestion !== undefined
    ? <Box flexDirection="column" paddingX={2} flexShrink={0}>
      {suggestion.status === 'loading' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>Searching workspace…</Text>}
      {suggestion.status === 'empty' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{suggestion.kind === 'path' ? 'No matching paths' : 'No matching commands'}</Text>}
      {visibleSuggestions.map((item, index) => <Text key={item.id} wrap="truncate-end">
        <Text {...suggestion.visibleStart + index === suggestion.selectedIndex ? tuiTextStyle(theme.tokens.selection) : {}}>
          {suggestion.visibleStart + index === suggestion.selectedIndex ? '› ' : '  '}{item.label}
        </Text>{item.detail === undefined ? '' : ` ${item.detail}`} · {item.description}
      </Text>)}
      {suggestion.items.length > visibleSuggestions.length && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
        Showing {suggestion.visibleStart + 1}-{suggestion.visibleStart + visibleSuggestions.length} of {suggestion.items.length}
      </Text>}
      {suggestion.status === 'truncated' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
        {suggestion.items.length === 0 ? 'Search limit reached with no matching paths' : 'More workspace paths omitted'}
      </Text>}
    </Box>
    : undefined
  const cursorPrefix = sessionExportDialog?.phase === 'selecting'
    ? 'path › '
    : resumeDialog !== undefined || freshSessionDialog !== undefined
      || rewindDialog !== undefined || sessionExportDialog !== undefined
      || (pluginHubDialog !== undefined && interaction === undefined)
      || helpVisible || footerSelection !== undefined || footerDetail !== undefined || workOpen
      ? undefined
      : question !== undefined
        ? '> '
        : transcriptSearch !== undefined && interaction === undefined
          ? 'find › '
          : historySearch !== undefined
            ? 'search › '
            : interaction === undefined && focus === undefined && props.view.acceptsInput
              ? props.view.kind === 'child' ? 'followup › ' : agentStatus === 'running' ? 'steer › ' : 'prompt › '
              : undefined
  props.onInputCursor(pluginHubDialog !== undefined && interaction === undefined
    ? pluginHubDialog.view === 'discover' && !pluginHubDetailOpen && !pluginHubPlanOpen
      && (pluginHubDialog.phase === 'browse' || pluginHubDialog.phase === 'loading')
      ? tuiPluginHubQueryCursor(pluginHubQuery, columns)
      : undefined
    : cursorPrefix === undefined ? undefined : inputCursorTarget(
      stdout,
      cursorPrefix,
      composerLayout,
      startupSurface ? startupFrame : undefined,
    ))

  if (startupSurface) {
    return <Box flexDirection="column" height={stdout.rows} width="100%">
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" overflow="hidden">
        <Box flexDirection="column" alignItems="center" marginBottom={1} flexShrink={0}>
          <TuiStartupLogo variant={startupFrame.logo} />
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>Start a conversation. Type / for commands.</Text>
        </Box>
        {suggestionPanel === undefined ? undefined : <Box width={startupFrame.width} flexShrink={0}>
          {suggestionPanel}
        </Box>}
        <Box
          width={startupFrame.width}
          borderStyle="round"
          {...tuiBorderStyle(theme.tokens.success)}
          paddingX={1}
          flexShrink={0}
        >
          <Box flexDirection="column">
            {composerLayout.lines.map((line, index) => <Text key={`${index}:${line}`}>
              {index === 0 && <Text {...tuiTextStyle(theme.tokens.success)}>prompt › </Text>}
              {index === 0 ? '' : '  '}{line === '' && composer.text === '' && index === 0
                ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>Ask anything...</Text>
                : line}
            </Text>)}
          </Box>
        </Box>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">
          {modelMetadata === '' ? 'Model unavailable' : terminalSafe(modelMetadata)} · /help commands
        </Text>
      </Box>
      <Box paddingX={1} flexShrink={0} overflow="hidden">
        {notice !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)}>{notice}</Text>
          : externalNotice !== ''
            ? <Text {...tuiTextStyle(theme.tokens.warning)}>{terminalSafe(externalNotice)}</Text>
            : <Text wrap="truncate-end">{footerStatus}</Text>}
      </Box>
    </Box>
  }

  if (pluginHubDialog !== undefined && interaction === undefined) {
    const detail = pluginHubDetailOpen
    const confirmation = pluginHubPlanOpen
    const lines = confirmation ? pluginHubPlanLines : detail ? pluginHubDetailLines : []
    const offset = Math.min(pluginHubDetailOffset, Math.max(0, lines.length - Math.max(1, terminalRows - 8)))
    const searchVisible = pluginHubDialog.view === 'discover' && !detail && !confirmation
      && pluginHubDialog.phase !== 'planning' && pluginHubDialog.phase !== 'staging'
      && pluginHubDialog.phase !== 'handoff'
    const title = confirmation
      ? 'Confirm profile change'
      : detail
        ? 'Plugin detail'
        : pluginHubDialog.view === 'installed'
          ? 'Installed plugins'
          : 'Discover plugins'
    const statusLine = pluginHubDialog.view === 'installed'
      ? `Active profile ${pluginHubDialog.installed?.profileRevision ?? 'loading'}`
      : tuiPluginHubCatalogLine(pluginHubDialog)
    const working = pluginHubDialog.phase === 'loading' || pluginHubDialog.phase === 'detail-loading'
      ? 'Loading Plugin Hub…'
      : pluginHubDialog.phase === 'planning'
        ? 'Verifying descriptor and preparing exact plan…'
        : pluginHubDialog.phase === 'staging'
          ? 'Building and validating inactive profile generation…'
          : pluginHubDialog.phase === 'handoff'
            ? 'Maintenance helper accepted activation; closing TUI…'
            : undefined
    const footer = pluginHubDialog.phase === 'handoff'
      ? 'Activation is owned by the maintenance helper'
      : pluginHubDialog.profileMutations === false && detail
        ? pluginHubDialog.detail.latestVersion?.installable === true
          ? `Install: dsh plugin --profile tui add --save-exact ${pluginHubDialog.detail.packageName}@${pluginHubDialog.detail.latestVersion.version} · PgUp/PgDn scroll · Esc back`
          : 'Not installable · PgUp/PgDn scroll · Esc back'
        : pluginHubDialog.profileMutations === false && pluginHubDialog.view === 'installed'
          ? pluginHubInstalled === undefined
            ? 'Tab Discover · Up/Down select · R refresh · Esc close'
            : `Remove: dsh plugin --profile tui remove ${pluginHubInstalled.packageName} · Tab Discover · Esc close`
          : confirmation
            ? 'Enter confirm and restart · PgUp/PgDn scroll · Esc back'
            : detail
              ? pluginHubDialog.detail.latestVersion?.installable === true
                ? 'Enter plan install · PgUp/PgDn scroll · Tab Installed · Esc back'
                : 'Not installable · PgUp/PgDn scroll · Tab Installed · Esc back'
              : pluginHubDialog.view === 'installed'
                ? 'Tab Discover · Up/Down select · Enter plan remove · R refresh · Esc close'
                : 'Tab Installed · Alt+S sort · Alt+C category · Type to search · Up/Down select · Enter detail · R refresh · Esc close'
    return <Box flexDirection="column" height={stdout.rows} width="100%">
      <Box paddingX={2} height={2} flexShrink={0}>
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>DeepSeek Harness</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · Plugin Hub</Text>
      </Box>
      <Box paddingX={2} flexDirection="column" flexShrink={0}>
        <Text>
          <Text {...pluginHubDialog.view === 'discover' ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)} bold={pluginHubDialog.view === 'discover'}>Discover</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · </Text>
          <Text {...pluginHubDialog.view === 'installed' ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)} bold={pluginHubDialog.view === 'installed'}>Installed</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · </Text>
          <Text bold>{title}</Text>
        </Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">
          {statusLine}
        </Text>
      </Box>
      {searchVisible && <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.border)} paddingX={1} marginX={1} height={3} flexShrink={0} overflow="hidden">
        <Text {...tuiTextStyle(theme.tokens.selection)}>find › </Text><Text wrap="truncate-start">{terminalSafe(pluginHubQuery)}</Text>
      </Box>}
      <Box flexDirection="column" flexGrow={1} paddingX={2} overflow="hidden">
        {working !== undefined
          ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{working}</Text>
          : pluginHubDialog.phase === 'error'
            ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="wrap">{terminalSafe(pluginHubDialog.error ?? 'Plugin Hub unavailable.')}</Text>
            : detail || confirmation
              ? lines.slice(offset, offset + Math.max(1, terminalRows - 8)).map((line, index) => <Text
                key={`${offset + index}:${line.kind}:${line.text}`}
                {...tuiPluginHubDetailTextStyle(theme, line)}
                bold={line.kind === 'title' || line.kind === 'section'}
                wrap="truncate-end"
              >{line.text}</Text>)
              : pluginHubRows.length === 0
                ? <Text {...tuiTextStyle(theme.tokens.warning)}>{pluginHubDialog.view === 'installed' ? 'No third-party profile plugins installed.' : 'No matching installable TUI plugins.'}</Text>
                : pluginHubRows.slice(pluginHubVisibleStart, pluginHubVisibleStart + pluginHubVisibleCount).map((row) => {
                  const layout = tuiPluginHubCardLayout(row, stdout.columns || 80)
                  const badgeToken = row.verificationLevel === 'curated'
                    ? theme.tokens.accent
                    : row.installable ? theme.tokens.success : theme.tokens.muted
                  return <Box key={row.id} flexDirection="column" height={layout.height} flexShrink={0} overflow="hidden">
                    <Box justifyContent="space-between" flexShrink={0} overflow="hidden">
                      <Box flexGrow={1} flexShrink={1} overflow="hidden">
                        <Text {...row.selected ? tuiTextStyle(theme.tokens.selection) : {}} bold={row.selected} wrap="truncate-end">
                          {row.selected ? '› ' : '  '}{layout.displayName}
                        </Text>
                      </Box>
                      {layout.badges !== '' && <Box flexShrink={0} overflow="hidden">
                        <Text {...tuiTextStyle(badgeToken)} wrap="truncate-end">{layout.badges}</Text>
                      </Box>}
                    </Box>
                    <Text wrap="truncate-end">  {layout.summary}</Text>
                    {layout.metadata !== undefined && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">
                      {'  '}{layout.metadata}
                    </Text>}
                  </Box>
                })}
      </Box>
      <Box height={2} paddingX={2} flexDirection="column" flexShrink={0} overflow="hidden">
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">
          {footer}
        </Text>
        {!detail && !confirmation && pluginHubDialog.view === 'discover' && pluginHubRows.length > 0
          && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
            Showing {pluginHubVisibleStart + 1}–{pluginHubVisibleEnd}
            {pluginHubDialog.loadingMore ? ' · loading more…' : pluginHubDialog.page?.nextCursor !== undefined ? ' · more available' : ''}
          </Text>}
      </Box>
    </Box>
  }

  if (sessionExportDialog !== undefined && interaction === undefined) {
    const scope = sessionExportDialog.phase === 'exporting'
      ? sessionExportDialog.includeDescendants === true
      : exportDescendants
    return <Box flexDirection="column" height={stdout.rows} width="100%">
      <Box paddingX={2} height={2} flexShrink={0}>
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>DeepSeek Harness</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · Export Session</Text>
      </Box>
      <Box flexGrow={1} paddingX={2} justifyContent="center" flexDirection="column">
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>Durable Session archive</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">Session: {terminalSafe(sessionExportDialog.sessionId)}</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">Workspace: {terminalSafe(sessionExportDialog.workspaceLabel)}</Text>
        {sessionExportDialog.phase === 'opening' && <Text>Settling command audit...</Text>}
        {sessionExportDialog.phase === 'selecting' && <>
          <Text>Scope: <Text bold {...tuiTextStyle(theme.tokens.selection)}>
            {scope ? 'current Session + descendants' : 'current Session only'}
          </Text></Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
            Tab changes scope · relative paths start at the Session workspace
          </Text>
          {sessionExportDialog.error !== undefined && <Text {...tuiTextStyle(theme.tokens.error)} wrap="wrap">
            {terminalSafe(sessionExportDialog.error)}
          </Text>}
        </>}
        {sessionExportDialog.phase === 'exporting' && <>
          <Text {...tuiTextStyle(theme.tokens.warning)}>Writing archive...</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">Destination: {terminalSafe(sessionExportDialog.destination ?? '')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{scope ? 'Including durable descendants' : 'Current Session only'}</Text>
        </>}
      </Box>
      {sessionExportDialog.phase === 'selecting' && <Box
        borderStyle="round" {...tuiBorderStyle(theme.tokens.border)} paddingX={1} flexShrink={0} flexDirection="column"
      >
        {composerLayout.lines.map((line, index) => <Text key={`${index}:${line}`}>
          {index === 0 && <Text {...tuiTextStyle(theme.tokens.selection)}>path › </Text>}{index === 0 ? '' : '  '}{line}
        </Text>)}
      </Box>}
      <Box paddingX={1} flexShrink={0} overflow="hidden">
        <Text wrap="truncate-end">{sessionExportDialog.phase === 'selecting'
          ? 'Enter export · Tab scope · Esc cancel'
          : sessionExportDialog.phase === 'exporting' ? 'Esc cancel export' : 'Esc close'}</Text>
      </Box>
    </Box>
  }

  if (freshSessionDialog !== undefined && interaction === undefined) {
    const commandLabel = `/${freshSessionDialog.command}`
    return <Box flexDirection="column" height={stdout.rows} width="100%">
      <Box paddingX={2} height={2} flexShrink={0}>
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>DeepSeek Harness</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · Fresh Session</Text>
      </Box>
      <Box flexGrow={1} paddingX={2} justifyContent="center" flexDirection="column">
        <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.warning)} paddingX={1} flexDirection="column" flexShrink={0}>
          <Text bold {...tuiTextStyle(theme.tokens.warning)}>Start a fresh Session?</Text>
          <Text wrap="wrap">
            {commandLabel} keeps the current Session available through /resume and starts an empty context in the same workspace.
          </Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">Current: {terminalSafe(freshSessionDialog.currentSessionId)}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">Workspace: {terminalSafe(freshSessionDialog.workspaceLabel)}</Text>
          {freshSessionDialog.error !== undefined && <Text {...tuiTextStyle(theme.tokens.error)} wrap="wrap">
            {terminalSafe(freshSessionDialog.error)}
          </Text>}
          {freshSessionDialog.phase === 'creating'
            ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>Creating... · Esc cancels</Text>
            : <Text><Text bold {...tuiTextStyle(theme.tokens.selection)}>Enter/y</Text> confirm · <Text bold>Esc/n</Text> cancel</Text>}
        </Box>
      </Box>
    </Box>
  }

  if (rewindDialog !== undefined && interaction === undefined
    && (rewindDialog.phase !== 'browsing' || rewindConfirmation !== undefined)) {
    const selected = rewindCandidates[effectiveRewindSelection]
    const position = selected === undefined ? 0 : effectiveRewindSelection + 1
    const activeDraft = composer.text.trim() !== '' && composer.text.trim() !== '/rewind'
    const effectiveError = rewindError || rewindDialog.error || ''
    return <Box flexDirection="column" height={stdout.rows} width="100%">
      <Box paddingX={2} height={2} flexShrink={0}>
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>DeepSeek Harness</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · Rewind Session</Text>
      </Box>
      <Box paddingX={2} flexDirection="column" flexShrink={0}>
        <Text bold>{rewindDialog.phase === 'opening'
          ? 'Settling command audit'
          : rewindDialog.phase === 'rewinding'
            ? `Creating child from event ${String(rewindDialog.rewindingSeq ?? '')}`
            : `Select a completed human turn (${position}/${rewindCandidates.length})`}</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">Parent: {terminalSafe(rewindDialog.currentSessionId)}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={2} overflow="hidden">
        {rewindConfirmation !== undefined
          ? <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.warning)} paddingX={1} flexDirection="column" flexShrink={0}>
            <Text bold {...tuiTextStyle(theme.tokens.warning)}>Create a child Session here?</Text>
            <Text wrap="truncate-end">Prompt: {rewindConfirmation.promptText.replace(/\s+/gu, ' ')}</Text>
            <Text>Retain {rewindConfirmation.retainedEventCount} durable events in the child.</Text>
            <Text>Keep {rewindConfirmation.hiddenEventCount} later events only in the parent.</Text>
            {activeDraft
              ? <>
                <Text><Text bold {...tuiTextStyle(theme.tokens.selection)}>s</Text> stash draft and rewind</Text>
                <Text><Text bold {...tuiTextStyle(theme.tokens.error)}>d</Text> discard draft and rewind</Text>
                <Text><Text bold>Esc</Text> cancel</Text>
              </>
              : <Text><Text bold {...tuiTextStyle(theme.tokens.selection)}>Enter/y</Text> confirm · <Text bold>Esc</Text> cancel</Text>}
          </Box>
          : rewindDialog.phase === 'opening'
            ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
              Waiting for command/run and command/done to settle on the parent...
            </Text>
            : <Text {...tuiTextStyle(theme.tokens.warning)}>Preparing and publishing the child Agent...</Text>}
      </Box>
      <Box height={2} paddingX={2} flexDirection="column" flexShrink={0} overflow="hidden">
        {effectiveError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(effectiveError)}</Text>
          : <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">{rewindDialog.phase === 'browsing' && rewindConfirmation === undefined
            ? 'Up/Down move · Enter inspect boundary · Esc close'
            : rewindDialog.phase === 'rewinding' ? 'Ctrl+C/Esc cancel' : 'Esc close'}</Text>}
      </Box>
    </Box>
  }

  if (resumeDialog !== undefined && interaction === undefined) {
    const inWorkspace = (resumeDialog.candidates ?? []).filter(candidate => candidate.currentWorkspace).length
    const selected = resumeCandidates[effectiveResumeSelection]
    const position = selected === undefined ? 0 : effectiveResumeSelection + 1
    const effectiveError = resumeError || resumeDialog.error || ''
    return <Box flexDirection="column" height={stdout.rows} width="100%">
      <Box paddingX={2} height={2} flexShrink={0}>
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>DeepSeek Harness</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · Resume Session</Text>
      </Box>
      <Box paddingX={2} flexDirection="column" flexShrink={0}>
        <Text bold>{resumeDialog.phase === 'loading'
          ? 'Loading sessions'
          : resumeDialog.phase === 'resuming'
            ? `Resuming ${terminalSafe(resumeDialog.resumingId ?? '')}`
            : `Select a Session (${position}/${resumeCandidates.length})`}</Text>
        <Text>
          <Text {...resumeScope === 'workspace' ? tuiTextStyle(theme.tokens.selection) : {}} bold={resumeScope === 'workspace'}>
            {resumeScope === 'workspace' ? '[This workspace]' : ' This workspace '}
          </Text>
          <Text> </Text>
          <Text {...resumeScope === 'all' ? tuiTextStyle(theme.tokens.selection) : {}} bold={resumeScope === 'all'}>
            {resumeScope === 'all' ? '[All workspaces]' : ' All workspaces '}
          </Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · Tab</Text>
        </Text>
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">{resumeScope === 'workspace'
          ? `${terminalSafe(resumeDialog.currentWorkspaceLabel)} · ${inWorkspace} sessions`
          : `${resumeDialog.candidates?.length ?? 0} sessions`}</Text>
      </Box>
      <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.border)} paddingX={1} marginX={1} flexShrink={0}>
        <Text {...tuiTextStyle(theme.tokens.selection)}>find › </Text><Text>{terminalSafe(resumeQuery)}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={2} overflow="hidden">
        {resumeConfirmation !== undefined
          ? <Box flexDirection="column">
            <Text bold {...tuiTextStyle(theme.tokens.warning)}>Unsaved draft</Text>
            <Text wrap="wrap">A non-empty draft must be retained or explicitly discarded before switching Sessions.</Text>
            <Text><Text bold {...tuiTextStyle(theme.tokens.selection)}>s</Text> stash and resume</Text>
            <Text><Text bold {...tuiTextStyle(theme.tokens.error)}>d</Text> discard and resume</Text>
            <Text><Text bold>Esc</Text> cancel</Text>
          </Box>
          : resumeDialog.phase === 'loading'
            ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>Reading Session metadata and titles...</Text>
            : visibleResumeCandidates.length === 0
              ? <Text {...tuiTextStyle(theme.tokens.warning)}>No matching sessions.</Text>
              : visibleResumeCandidates.map((candidate, visibleIndex) => {
                const index = resumeVisibleStart + visibleIndex
                const active = index === effectiveResumeSelection
                const status = [
                  candidate.record.header.id === props.agent.session.id ? 'current' : undefined,
                  candidate.record.live ? 'live' : undefined,
                  candidate.record.persisted ? 'persisted' : undefined,
                ].filter((value): value is string => value !== undefined).join(' · ')
                return <Box
                  key={candidate.record.header.id}
                  flexDirection="column"
                  height={resumeRowHeight}
                  flexShrink={0}
                >
                  <Text {...active ? tuiTextStyle(theme.tokens.selection) : {}} bold={active} wrap="truncate-end">
                    {active ? '› ' : '  '}{terminalSafe(candidate.title)}
                  </Text>
                  <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">
                    {'  '}{formatTuiRelativeTime(candidate.updatedAt, Date.now())} · {terminalSafe(status)} · {terminalSafe(candidate.record.header.id)}
                  </Text>
                  {resumeScope === 'all' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">
                    {'  '}{terminalSafe(candidate.workspaceLabel)}
                  </Text>}
                  {candidate.disabledReason !== undefined && <Text {...tuiTextStyle(theme.tokens.warning)} wrap="truncate-end">
                    {'  '}Unavailable: {terminalSafe(candidate.disabledReason)}
                  </Text>}
                </Box>
              })}
      </Box>
      <Box height={2} paddingX={2} flexDirection="column" flexShrink={0} overflow="hidden">
        {effectiveError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(effectiveError)}</Text>
          : <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">{resumeDialog.phase === 'resuming'
            ? 'Ctrl+C/Esc cancel'
            : 'Type to search · Up/Down move · Tab scope · Enter resume · Esc clear/close'}</Text>}
        {resumeCandidates.length > resumeVisibleCount && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
          Showing {resumeVisibleStart + 1}-{resumeVisibleStart + visibleResumeCandidates.length} of {resumeCandidates.length}
        </Text>}
      </Box>
    </Box>
  }

  return <Box flexDirection="column" height={stdout.rows} width="100%">
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
      overflow="hidden"
      justifyContent={workOpen ? 'flex-start' : 'flex-end'}
    >
      {workOpen ? <TuiWorkPanel
        snapshot={work}
        selectedIndex={workSelection}
        maxRows={transcriptRows}
        now={workClock}
      /> : <TuiTranscriptView
        entries={visible}
        overscanBefore={transcriptPage.overscanBefore}
        overscanAfter={transcriptPage.overscanAfter}
        workspace={workspace}
        focusedNode={focus?.mode === 'browse' ? focusedTarget?.node : undefined}
        focusedCallId={focus?.mode === 'browse' ? focusedTarget?.child?.callId : undefined}
        rewindSelectedKey={rewindSelectedKey}
        searchSelectedKey={transcriptSearchHit?.key}
        searchQuery={transcriptSearchQuery}
      />}
    </Box>
    {!helpVisible && detailHeight > 0 && (footerDetailItem !== undefined || focusedTarget !== undefined) && <Box
      flexDirection="column"
      height={detailHeight}
      paddingX={1}
      overflow="hidden"
      flexShrink={0}
    >
      <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.border)} flexDirection="column" paddingX={1} flexShrink={0}>
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>{terminalSafe(footerDetailItem === undefined
          ? focusedTarget?.label ?? 'Detail'
          : `Status · ${footerDetailItem.label}`)}</Text>
        {detailLines.slice(detailOffset, detailOffset + detailRows)
          .map((line, index) => <Text key={`${detailOffset + index}:${line}`} wrap="truncate-end">{line}</Text>)}
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
          {detailLines.length === 0 ? 0 : detailOffset + 1}–{Math.min(
            detailOffset + detailRows, detailLines.length,
          )} / {detailLines.length}
        </Text>
      </Box>
    </Box>}
    {!helpVisible && !workOpen && currentTodo !== undefined && <Box paddingX={1} flexShrink={0}>
      <TodoPanel
        node={currentTodo}
        focused={(focus?.mode === 'browse' && focusedTarget?.node === currentTodo)
          || transcriptSearchHit?.key === currentTodo.key}
        emphasized={emphasizedTodos}
      />
    </Box>}
    {helpVisible && <Box
      flexDirection="column"
      height={helpHeight}
      paddingX={1}
      overflow="hidden"
      flexShrink={0}
    >
      <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.border)} flexDirection="column" paddingX={1} flexShrink={0}>
        <Text bold {...tuiTextStyle(theme.tokens.accent)}>Interaction help</Text>
        {helpLines.slice(visibleHelpOffset, visibleHelpOffset + helpBodyRows).map(line => <Text
          key={line.key}
          bold={line.kind === 'heading' || line.kind === 'binding'}
          {...tuiTextStyle(line.kind === 'description' ? theme.tokens.muted : theme.tokens.text)}
          dimColor={theme.dim && line.kind === 'description'}
          wrap="truncate-end"
        >{line.text}</Text>)}
        <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{helpLines.length === 0 ? 0 : visibleHelpOffset + 1}–{Math.min(
          visibleHelpOffset + helpBodyRows, helpLines.length,
        )} / {helpLines.length}</Text>
      </Box>
    </Box>}
    {interaction?.kind === 'approval' && <Box
      borderStyle="round"
      {...tuiBorderStyle(theme.tokens.permission)}
      flexDirection="column"
      height={approvalHeight}
      paddingX={1}
      flexShrink={0}
      overflow="hidden"
    >
      <Text bold {...tuiTextStyle(theme.tokens.permission)}>Approval requested · {terminalSafe(interaction.request.toolName)}</Text>
      {interaction.request.reason !== undefined && <Text wrap="truncate-end">{terminalSafe(interaction.request.reason)}</Text>}
      <Box height={approvalBodyRows} flexDirection="column" overflow="hidden">
        {approvalLines.slice(visibleApprovalOffset, visibleApprovalOffset + approvalBodyRows).map((line, index) => <Text
          key={`${visibleApprovalOffset + index}:${line}`}
          {...tuiTextStyle(line.startsWith('+ ') ? theme.tokens.diffAdd
            : line.startsWith('- ') ? theme.tokens.diffDelete : theme.tokens.text)}
          wrap="truncate-end"
        >{line}</Text>)}
      </Box>
      <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">
        {approvalLines.length === 0 ? 'No structured details' : `Details ${visibleApprovalOffset + 1}–${Math.min(visibleApprovalOffset + approvalBodyRows, approvalLines.length)} / ${approvalLines.length}`}
      </Text>
      <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">↑↓ · PgUp/PgDn · <Text bold>y</Text> allow · <Text bold>n</Text> reject</Text>
    </Box>}
    {question !== undefined && <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.permission)} flexDirection="column" paddingX={1} flexShrink={0}>
      <Text bold {...tuiTextStyle(theme.tokens.permission)}>{terminalSafe(question.header ?? `Question ${questionIndex + 1}/${interaction?.kind === 'question' ? interaction.request.questions.length : 1}`)}</Text>
      <Text>{terminalSafe(question.question)}</Text>
      {question.detail !== undefined && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
        {terminalSafe(question.detail)}
      </Text>}
      {visibleOptions.map((option, index) => <Text key={`${question.id}:${optionStart + index}`}>
        {optionStart + index === questionCursor ? '› ' : '  '}{optionStart + index + 1}. {terminalSafe(option.label)}
        {option.description === undefined ? '' : ` — ${terminalSafe(option.description)}`}
      </Text>)}
      {questionOptions.length > optionLimit && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
        Showing {optionStart + 1}–{optionStart + visibleOptions.length} of {questionOptions.length} · ↑/↓ scroll
      </Text>}
      {composerLayout.lines.map((line, index) => <Text key={`${index}:${line}`}>
        {index === 0 ? '> ' : '  '}{line}
      </Text>)}
    </Box>}
    {suggestionPanel}
    {!helpVisible && historySearch !== undefined && <Box paddingX={2} flexShrink={0}>
      <Text wrap="truncate-end" {...tuiTextStyle(historyMatch?.match === undefined ? theme.tokens.muted : theme.tokens.text)} dimColor={theme.dim && historyMatch?.match === undefined}>
        {historyMatch?.match === undefined
          ? 'No matching submitted prompt'
          : `History ${historyMatch.position}/${historyMatch.count} › ${terminalSafe(historyMatch.match.split('\n')[0] ?? '')}`}
      </Text>
    </Box>}
    {!helpVisible && interaction === undefined && transcriptSearch !== undefined && <Box paddingX={2} flexShrink={0}>
      <Text wrap="truncate-end" {...tuiTextStyle(transcriptSearchHit === undefined ? theme.tokens.muted : theme.tokens.text)} dimColor={theme.dim && transcriptSearchHit === undefined}>
        {transcriptSearchHit === undefined
          ? `Transcript 0/0 · ${JSON.stringify(transcriptSearch.query)}`
          : <>
            Transcript {transcriptSearchSelectedIndex + 1}/{transcriptSearchHits.length} · <TuiTranscriptSearchText
              text={transcriptSearchHit.text}
              query={transcriptSearch.query}
            />
          </>}
      </Text>
    </Box>}
    {!helpVisible && stashedDraft !== undefined && <Box paddingX={2} flexShrink={0}>
      <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>Stashed draft</Text>
    </Box>}
    <Box paddingX={2} height={1} flexShrink={0} overflow="hidden">
      {agentStatus === 'running'
        ? <Text wrap="truncate-end">
          <Text bold {...tuiTextStyle(theme.tokens.warning)}>{tuiWorkingFrame(workingFrameTick)} Working</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · Esc stop · {activityMetadata}</Text>
        </Text>
        : <Text wrap="truncate-end">
          <Text bold {...tuiTextStyle(theme.tokens.success)}>Ready</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · {activityMetadata}</Text>
        </Text>}
    </Box>
    {!helpVisible && !workOpen && interaction === undefined && rewindDialog === undefined
      && (props.view.acceptsInput
        ? <Box borderStyle="round" {...tuiBorderStyle(agentStatus === 'running' ? theme.tokens.warning : theme.tokens.success)} paddingX={1} flexShrink={0}>
          <Box flexDirection="column">
            {composerLayout.lines.map((line, index) => <Text key={`${index}:${line}`}>
              {index === 0 && <Text {...tuiTextStyle(transcriptSearch !== undefined || historySearch !== undefined ? theme.tokens.selection : agentStatus === 'running' ? theme.tokens.warning : theme.tokens.success)}>
                {transcriptSearch !== undefined ? 'find' : historySearch !== undefined ? 'search'
                  : props.view.kind === 'child' ? 'followup' : agentStatus === 'running' ? 'steer' : 'prompt'} › </Text>}
              {index === 0 ? '' : '  '}{line}
            </Text>)}
          </Box>
        </Box>
        : <Box borderStyle="round" {...tuiBorderStyle(theme.tokens.warning)} paddingX={1} flexShrink={0}>
          <Text {...tuiTextStyle(theme.tokens.warning)} wrap="truncate-end">
            Read only · {terminalSafe(props.view.readOnlyReason ?? 'This Agent view does not accept input.')} · Ctrl+G root
          </Text>
        </Box>)}
    <Box paddingX={1} flexShrink={0} overflow="hidden">
      {workOpen
        ? <Text {...tuiTextStyle(theme.tokens.selection)} bold wrap="truncate-end">
          Work {work.items.length === 0 ? '0/0' : `${effectiveWorkSelection + 1}/${work.items.length}`}
          {' · '}Up/Down select
          {selectedWorkItem?.inspectable === true ? ' · Enter open' : ''}
          {selectedWorkItem?.action === undefined || selectedWorkItem.action === 'none' ? '' : ' · X stop'}
          {' · '}Esc close
        </Text>
        : footerDetail !== undefined
          ? <Text {...tuiTextStyle(theme.tokens.selection)} wrap="truncate-end">Status detail · PgUp/PgDn · Enter/Esc close</Text>
          : footerSelection !== undefined
            ? <Text {...tuiTextStyle(theme.tokens.selection)} bold wrap="truncate-end">{selectedFooterStatus}</Text>
            : notice !== ''
              ? <Text {...tuiTextStyle(theme.tokens.error)}>{notice}</Text>
              : externalNotice !== ''
                ? <Text {...tuiTextStyle(theme.tokens.warning)}>{terminalSafe(externalNotice)}</Text>
                : rewindDialog?.phase === 'browsing'
                  ? <Text {...tuiTextStyle(theme.tokens.selection)} bold wrap="truncate-end">
                    Rewind {rewindSelectedCandidate === undefined ? '0/0' : `${effectiveRewindSelection + 1}/${rewindCandidates.length}`}
                    {' · '}{rewindSelectedCandidate === undefined
                      ? 'No completed human turn · Esc close'
                      : 'Up/Down human turns · Enter review · Esc close'}
                  </Text>
                  : <Text wrap="truncate-end">{helpVisible
                    ? 'Help Up/Down · PgUp/PgDn · Esc close'
                    : transcriptSearch !== undefined
                      ? `Transcript query ${JSON.stringify(transcriptSearch.query)} · ${transcriptSearchHit === undefined ? 'no match' : `${transcriptSearchSelectedIndex + 1}/${transcriptSearchHits.length}`}`
                      : historySearch !== undefined
                        ? `History query ${JSON.stringify(historySearch.query)} · ${historyMatch?.match === undefined ? 'no match' : `${historyMatch.position}/${historyMatch.count}`}`
                        : focus?.mode === 'browse'
                          ? 'Browse ↑/↓ · Enter detail · Esc composer'
                          : focus?.mode === 'detail'
                            ? 'Detail PgUp/Dn · Enter/Esc close'
                            : footerStatus}</Text>}
    </Box>
  </Box>
}
