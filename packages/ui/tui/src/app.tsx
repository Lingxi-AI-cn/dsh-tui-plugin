/** Ink component tree for transcript, interactions, composer, and status. */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Text, useStdout } from 'ink'
import stringWidth from 'string-width'
import type {
  Agent, ApprovalPresentation, AskUserQuestionAnswer, AskUserQuestionAnswerItem,
  CommandDescriptor, ContextBreakdownProjection, ContextPressureProjection, FsPathCompletionResult,
  ImageAttachmentRef, ModelSelection, PermissionSelect, SessionStatsProjection, TokenUsageProjection,
} from './host.ts'
import {
  AgentStatusStore, InteractionStore, SessionEventStore, ValueStore, type PendingQuestion,
} from './store.ts'
import { STRUCTURED_CHILD_LIMIT, TuiTranscriptProjectionCache } from './transcript.ts'
import { TodoPanel, todoPanelRows, todoPanelScreenMapLines } from './todo-panel.tsx'
import { TuiTranscriptSearchText, TuiTranscriptView, tuiTranscriptScreenMapLines } from './transcript-view.tsx'
import { TuiTranscriptDetailCache, tuiTranscriptDetailText } from './detail.ts'
import { toolSummary } from './tool-card.tsx'
import { terminalSafe } from './sanitize.ts'
import { tuiOsc8Text, tuiSafeHyperlinkUrl } from './hyperlink.ts'
import { tuiBidiVisualText } from './bidi.ts'
import type { InputCursorTarget } from './terminal-session.ts'
import {
  advanceTuiScreenClick, resolveTuiScreenSelection,
  tuiScreenSelectionText, tuiScreenTextSegments,
  type TuiScreenClick, type TuiScreenPosition, type TuiScreenSelection,
} from './selection.ts'
import { projectTuiScreenMap, type TuiScreenMap } from './screen-map.ts'
import {
  TuiTranscriptScrollController, TuiTranscriptViewportIndex, terminalWrappedLines,
  tuiTranscriptWindowEntryRows, type TranscriptWindowEntry, type TuiTranscriptViewportAnchor,
} from './viewport.ts'
import type { TranscriptNode, TranscriptToolNode } from './transcript.ts'
import {
  createComposerState, deleteComposerText, insertComposerPasteReference, insertComposerText,
  insertComposerClipboard, isLargeComposerPaste, layoutComposer, materializeComposerText, moveComposerCursor,
  redoComposerEdit, replaceComposerText, restoreTuiComposerDraft, toggleTuiComposerStash,
  addComposerImageAttachment, removeLastComposerImageAttachment,
  traverseComposerHistory, tuiComposerDraft, undoComposerEdit,
  type ComposerLayout, type ComposerState, type TuiComposerDraft, type TuiComposerImageAttachment,
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
  visibleTuiFooterItems, type TuiFooterItemDescriptor, type TuiFooterItemId,
} from './footer.ts'
import {
  resolveTuiTranscriptSearchHit, TuiTranscriptSearchIndex,
} from './transcript-search.ts'
import {
  filterTuiResumeCandidates, formatTuiRelativeTime,
  type TuiResumeCandidate, type TuiResumeDialogSnapshot, type TuiResumeScope,
} from './resume.ts'
import type { TuiFreshSessionDialogSnapshot } from './session-lifecycle.ts'
import type { TuiSessionExportDialogSnapshot, TuiSessionExportFormat } from './session-export.ts'
import type { TuiRewindCandidate, TuiRewindDialogSnapshot } from './rewind.ts'
import type { TuiWorkItemView, TuiWorkSnapshot } from './work.ts'
import { TuiWorkPanel } from './work-panel.tsx'
import {
  tuiPluginHubCardHeight, tuiPluginHubCardLayout, tuiPluginHubCatalogLine, tuiPluginHubDetailLines, tuiPluginHubInstalledRows,
  tuiPluginHubPlanLines, tuiPluginHubQueryCursor, tuiPluginHubRows, tuiPluginHubViewportRows,
  type TuiPluginHubDetailLine, type TuiPluginHubDialogSnapshot,
} from './plugin-hub.ts'
import type { PluginId } from '@lingxi-ai-cn/dsh-plugin-hub'
import { TuiAgentViewStateCache, type TuiAgentViewDescriptor } from './agent-view.ts'
import {
  tuiTerminalMouseReportKind, useTuiTerminalInput, type TuiTerminalInputEvent,
} from './terminal-input.ts'
import {
  TuiPointerRegionRegistry, tuiApprovalPointerRegions, tuiFooterPointerRegions, tuiModalClosePointerRegions,
  tuiPluginHubPointerRegions, tuiQuestionPointerRegions, tuiResumePointerRegions, tuiSuggestionPointerRegions,
  tuiWorkPointerRegions,
  type TuiPointerRegion,
} from './pointer.ts'
import { tuiBorderStyle, tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'
import { tuiMessage, useTuiLocale, type TuiLocale } from './locale.ts'
import {
  resolveTuiStartupLogoVariant, tuiStartupLogoHeight, TuiStartupLogo,
  type TuiStartupLogoVariant,
} from './startup-logo.tsx'
import {
  tuiDiagnosticPanelLines,
  type TuiDiagnosticPanelLine,
  type TuiDiagnosticSnapshot,
} from './diagnostics.ts'
import { tuiLoadedContextPanelLines, type TuiLoadedContextSnapshot } from './loaded-context.ts'
import {
  projectTuiStartupGuidance,
  type TuiStartupGuidanceSnapshot,
} from './startup-guidance.ts'
import {
  TuiEmptyState, TuiHintLine, TuiListRow, TuiLoadingState, TuiPane, TuiScrollablePanel,
  TuiSection, tuiScrollableWindow,
} from './design-system.tsx'
import { resolveTuiComposerDelivery, tuiRunningDeliveryHelpLines, type TuiSubmitMode } from './delivery.ts'
import { selectTuiReclaimableMessage, tuiReclaimMessageText } from './reclaim.ts'
import { consumeTuiDoubleEscape } from './double-escape.ts'
import type { TuiExternalEditorResult } from './external-editor.ts'
import type { TuiClipboardInsert } from './clipboard.ts'
import type { TuiExtensionRegistry, TuiKnownSessionEvent } from './extensions.ts'

export interface TuiAppProps {
  agent: Agent
  view: TuiAgentViewDescriptor
  events: SessionEventStore
  status: AgentStatusStore
  interactions: InteractionStore
  externalNotice: ValueStore<string>
  modelSelection: ValueStore<ModelSelection | undefined>
  helpOpen: ValueStore<boolean>
  diagnostics: ValueStore<TuiDiagnosticSnapshot | undefined>
  loadedContext: ValueStore<TuiLoadedContextSnapshot | undefined>
  startupGuidance: ValueStore<TuiStartupGuidanceSnapshot | undefined>
  permissions: ValueStore<PermissionSelect | undefined>
  contextPressure: ValueStore<ContextPressureProjection | undefined>
  tokenUsage: ValueStore<TokenUsageProjection | undefined>
  contextBreakdown: ValueStore<ContextBreakdownProjection | undefined>
  sessionStats: ValueStore<SessionStatsProjection | undefined>
  resumeDialog: ValueStore<TuiResumeDialogSnapshot | undefined>
  freshSessionDialog: ValueStore<TuiFreshSessionDialogSnapshot | undefined>
  rewindDialog: ValueStore<TuiRewindDialogSnapshot | undefined>
  sessionExportDialog: ValueStore<TuiSessionExportDialogSnapshot | undefined>
  pluginHubDialog: ValueStore<TuiPluginHubDialogSnapshot | undefined>
  work: ValueStore<TuiWorkSnapshot>
  extensions: TuiExtensionRegistry
  maxResumeOptions: number
  commands: readonly CommandDescriptor[]
  interactionRegistry: readonly TuiInteractionDescriptor[]
  completePaths(query: string, signal: AbortSignal): Promise<FsPathCompletionResult>
  onAttachPath(path: string): Promise<ImageAttachmentRef>
  onInputCursor(target: InputCursorTarget | undefined): void
  /** Enable only button-motion reports while a text drag is active. */
  onSelectionMouseMode?: (enabled: boolean) => boolean
  onSubmit(
    text: string,
    mode?: TuiSubmitMode,
    attachments?: readonly TuiComposerImageAttachment[],
  ): Promise<string | undefined>
  /** Temporarily hand the current draft to the user's shell-free editor. */
  onExternalEditor(draft: string): Promise<TuiExternalEditorResult>
  /** Read and validate one system clipboard payload for the active composer. */
  onClipboardPaste(): Promise<TuiClipboardInsert>
  /** Copy non-secret UI text through the negotiated terminal clipboard path. */
  onCopy(text: string): { readonly ok: boolean; readonly message?: string }
  /** Open one safe HTTP(S) hyperlink through the host browser hand-off. */
  onOpenUrl(url: string): Promise<void>
  onActivateFooter(itemId: TuiFooterItemId): Promise<void>
  onResume(candidate: TuiResumeCandidate): Promise<void>
  onCloseResume(): void
  onConfirmFreshSession(): Promise<void>
  onCloseFreshSession(): void
  onRewind(candidate: TuiRewindCandidate): Promise<void>
  onCloseRewind(): void
  onExportSession(directory: string, includeDescendants: boolean, format: TuiSessionExportFormat): Promise<void>
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
  onCloseDoctor(): void
  onCloseLoadedContext(): void
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

function diagnosticLineColor(theme: TuiTheme, line: TuiDiagnosticPanelLine): string | undefined {
  if (line.kind === 'remediation') return theme.tokens.warning
  if (line.kind === 'source') return theme.tokens.muted
  if (line.kind !== 'summary') return theme.tokens.text
  if (line.severity === 'pass') return theme.tokens.success
  if (line.severity === 'warning') return theme.tokens.warning
  if (line.severity === 'error') return theme.tokens.error
  return theme.tokens.accent
}

function detailLineView(
  theme: TuiTheme,
  line: string,
  map?: TuiScreenMap,
  mapRow?: number,
  selection?: TuiScreenSelection,
): React.ReactElement {
  if (map !== undefined && mapRow !== undefined && selection !== undefined) {
    const segments = tuiScreenTextSegments(map, mapRow, selection)
    if (segments.length > 0) {
      const color = line.startsWith('+ ') ? theme.tokens.diffAdd
        : line.startsWith('- ') ? theme.tokens.diffDelete : theme.tokens.text
      return <Text wrap="truncate-end">{segments.map((segment, index) => <Text
        key={`${mapRow}:${index}:${segment.text}`}
        {...tuiTextStyle(segment.selected ? theme.tokens.selection : color)}
        inverse={segment.selected}
      >{segment.text}</Text>)}</Text>
    }
  }
  const separator = ' │ '
  const separatorIndex = line.indexOf(separator)
  if (separatorIndex > 1) {
    const left = line.slice(0, separatorIndex)
    const right = line.slice(separatorIndex + separator.length)
    const leftColor = left.startsWith('- ') ? theme.tokens.diffDelete : theme.tokens.text
    const rightColor = right.startsWith('+ ') ? theme.tokens.diffAdd : theme.tokens.text
    return <Text wrap="truncate-end">
      <Text {...tuiTextStyle(leftColor)}>{left}</Text>
      <Text {...tuiTextStyle(theme.tokens.muted)}>{separator}</Text>
      <Text {...tuiTextStyle(rightColor)}>{right}</Text>
    </Text>
  }
  const color = line.startsWith('+ ') ? theme.tokens.diffAdd
    : line.startsWith('- ') ? theme.tokens.diffDelete : theme.tokens.text
  return <Text {...tuiTextStyle(color)} wrap="truncate-end">{tuiOsc8Text(tuiBidiVisualText(line))}</Text>
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

interface TuiSelectionState {
  readonly surface: 'detail' | 'transcript' | 'tasks'
  readonly map: TuiScreenMap
  readonly range: TuiScreenSelection
}

interface TuiSelectionPending {
  readonly surface: 'detail' | 'transcript' | 'tasks'
  readonly map: TuiScreenMap
  readonly anchor: TuiScreenPosition
  focus: TuiScreenPosition
}

interface TuiAgentViewLocalState {
  readonly composer: ComposerState
  readonly history: TuiComposerDraft[]
  readonly historySearch: TuiHistorySearchState | undefined
  readonly focus: FocusState | undefined
  readonly transcriptAnchor: TuiTranscriptViewportAnchor | undefined
  readonly transcriptSearch: TranscriptSearchState | undefined
}

type TuiResumeView = 'list' | 'preview'

function focusTitle(tool: TranscriptToolNode): string {
  return tool.resultView?.title ?? tool.callView.title
}

function pointerTextWidth(value: string): number {
  return Math.max(1, ...value.split('\n').map(line => stringWidth(line)))
}

function composerAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kib = bytes / 1024
  if (kib < 1024) return `${kib >= 10 ? Math.round(kib) : Math.round(kib * 10) / 10} KiB`
  return `${Math.round(kib / 1024 * 10) / 10} MiB`
}

function composerAttachmentLine(
  attachments: readonly TuiComposerImageAttachment[] | undefined,
): string | undefined {
  if (attachments === undefined || attachments.length === 0) return undefined
  return attachments.map(({ ref }: { ref: ImageAttachmentRef }) => {
    const label = ref.name ?? ref.attachmentId
    return `[${terminalSafe(label)} · ${terminalSafe(ref.mediaType)} · ${composerAttachmentBytes(ref.bytes)} · ${terminalSafe(ref.attachmentId)}]`
  }).join(' ')
}

function isImagePath(path: string): boolean {
  return /\.(?:png|jpe?g|webp|gif)$/iu.test(path)
}

function pointerEntryWidth(
  entry: TranscriptWindowEntry,
  width: number,
  workspace: string | undefined,
  locale: TuiLocale,
): number {
  const bounded = Math.max(1, width)
  if (entry.node.kind === 'text') {
    return Math.min(bounded, 2 + Math.max(pointerTextWidth(entry.node.label), pointerTextWidth(entry.text ?? '')))
  }
  if (entry.node.kind === 'tool') {
    return Math.min(bounded, 2 + Math.max(
      pointerTextWidth(entry.node.resultView?.title ?? entry.node.callView.title),
      pointerTextWidth(toolSummary(entry.node, workspace)),
    ))
  }
  if (entry.node.kind === 'tool-group') {
    return Math.min(bounded, 2 + Math.max(
      pointerTextWidth(entry.node.activity === 'explore'
        ? tuiMessage(locale, 'transcript.group.explore')
        : entry.node.activity === 'parallel'
          ? tuiMessage(locale, 'transcript.group.parallel')
          : tuiMessage(locale, 'transcript.group.exclusive')),
      ...entry.node.tools.slice(-STRUCTURED_CHILD_LIMIT).map(tool => pointerTextWidth(
        `${focusTitle(tool)} ${toolSummary(tool, workspace)}`,
      )),
    ))
  }
  if (entry.node.kind === 'compaction') {
    return Math.min(bounded, 2 + Math.max(
      pointerTextWidth(entry.node.state === 'running' ? tuiMessage(locale, 'transcript.compaction.running')
        : entry.node.state === 'success'
          ? tuiMessage(locale, 'transcript.compaction.success')
          : tuiMessage(locale, 'transcript.compaction.failed')),
      pointerTextWidth(entry.node.summary ?? ''),
      pointerTextWidth(entry.node.error ?? ''),
    ))
  }
  return Math.min(bounded, 2 + pointerTextWidth(tuiMessage(locale, 'transcript.tasks.title')))
}

function transcriptPointerRegions(
  entries: readonly TranscriptWindowEntry[],
  targets: readonly FocusTarget[],
  topRow: number,
  columns: number,
  width: number,
  workspace: string | undefined,
  context: Extract<TuiInteractionContext, 'Composer' | 'Transcript'>,
  locale: TuiLocale,
): readonly TuiPointerRegion[] {
  const targetByKey = new Map(targets.map((target, index) => [target.key, { target, index }]))
  const left = 1
  const regions: TuiPointerRegion[] = []
  let row = Math.max(1, Math.floor(topRow))
  for (const entry of entries) {
    const parent = targetByKey.get(entry.node.key)
    const height = tuiTranscriptWindowEntryRows(entry, width)
    if (parent !== undefined) {
      const right = Math.min(columns, left + pointerEntryWidth(entry, width, workspace, locale) - 1)
      regions.push({
        id: `transcript:${entry.node.key}`,
        rect: { left, top: row, right, bottom: row + height - 1 },
        context,
        priority: 10,
        action: { id: 'transcript.focus', key: parent.target.key, index: parent.index },
      })
      if (entry.node.kind === 'tool-group') {
        const visible = entry.node.tools.slice(-STRUCTURED_CHILD_LIMIT)
        const omitted = entry.node.tools.length - visible.length
        visible.forEach((tool, childIndex) => {
          const childKey = `${entry.node.key}:${tool.callId}`
          const child = targetByKey.get(childKey)
          if (child === undefined) return
          const childRow = row + 1 + omitted + childIndex
          const childWidth = Math.min(width, 2 + pointerTextWidth(
            `${focusTitle(tool)} ${toolSummary(tool, workspace)}`,
          ))
          regions.push({
            id: `transcript:${childKey}`,
            rect: { left, top: childRow, right: Math.min(columns, left + childWidth - 1), bottom: childRow },
            context,
            priority: 20,
            action: {
              id: 'transcript.focus',
              key: child.target.key,
              index: child.index,
              childCallId: tool.callId,
            },
          })
        })
      }
    }
    row += height
  }
  return Object.freeze(regions)
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
 * @param trailingRows - physical rows following a bottom-workspace editor; defaults to its border and footer.
 * @returns one-based terminal row and column for the insertion point.
 */
export function inputCursorTarget(
  stdout: Pick<NodeJS.WriteStream, 'rows' | 'columns'>,
  prefix: string,
  layout: ComposerLayout,
  placement?: { readonly firstInputRow: number; readonly leftColumn: number },
  trailingRows = 2,
): InputCursorTarget {
  return {
    row: placement === undefined
      ? Math.max(1, (stdout.rows || 24) - trailingRows - (layout.lines.length - 1 - layout.cursorRow))
      : Math.max(1, placement.firstInputRow + layout.cursorRow),
    column: (placement?.leftColumn ?? 0)
      + 3 + (layout.cursorRow === 0 ? stringWidth(prefix) : 0) + layout.cursorColumn,
  }
}

/**
 * Resolve the bounded startup composer frame and its first editable terminal row.
 * @param stdout - terminal dimensions used by the active Ink frame.
 * @param composerRows - mounted editor rows inside the bordered composer.
 * @param supplementalRows - suggestion rows mounted between the brand and composer.
 * @param trailingRows - guidance rows mounted after the composer beyond the existing one-row allowance.
 * @returns centered width, zero-based horizontal origin, one-based first input row, and selected mark.
 */
export function tuiStartupComposerFrame(
  stdout: Pick<NodeJS.WriteStream, 'rows' | 'columns'>,
  composerRows: number,
  supplementalRows = 0,
  trailingRows = 0,
): {
  readonly width: number
  readonly leftColumn: number
  readonly firstInputRow: number
  readonly logo: TuiStartupLogoVariant
} {
  const columns = stdout.columns || 80
  const rows = stdout.rows || 24
  const width = Math.max(1, Math.min(columns, 76, Math.max(33, Math.floor(columns * 0.72))))
  const logo = resolveTuiStartupLogoVariant(
    { columns, rows }, composerRows, supplementalRows + Math.max(0, trailingRows),
  )
  const logoRows = tuiStartupLogoHeight(logo)
  const contentRows = Math.max(1, composerRows) + Math.max(0, supplementalRows)
    + Math.max(0, trailingRows) + logoRows + 5
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
  const locale = useTuiLocale()
  const eventSnapshot = useSyncExternalStore(props.events.subscribe, props.events.getSnapshot)
  const agentStatus = useSyncExternalStore(props.status.subscribe, props.status.getSnapshot)
  const interaction = useSyncExternalStore(props.interactions.subscribe, props.interactions.getSnapshot)
  const externalNotice = useSyncExternalStore(props.externalNotice.subscribe, props.externalNotice.getSnapshot)
  const extensionSubscribe = useCallback(
    (listener: () => void) => props.extensions.subscribe(listener),
    [props.extensions],
  )
  const extensionGetSnapshot = useCallback(() => props.extensions.getSnapshot(), [props.extensions])
  const extensionSnapshot = useSyncExternalStore(extensionSubscribe, extensionGetSnapshot)
  const renderKnownSessionEvent = useMemo(
    () => (event: TuiKnownSessionEvent) => props.extensions.renderKnownSessionEvent(event),
    [extensionSnapshot.revision, props.extensions],
  )
  const modelSelection = useSyncExternalStore(props.modelSelection.subscribe, props.modelSelection.getSnapshot)
  const helpOpen = useSyncExternalStore(props.helpOpen.subscribe, props.helpOpen.getSnapshot)
  const diagnostics = useSyncExternalStore(props.diagnostics.subscribe, props.diagnostics.getSnapshot)
  const loadedContext = useSyncExternalStore(props.loadedContext.subscribe, props.loadedContext.getSnapshot)
  const startupGuidance = useSyncExternalStore(
    props.startupGuidance.subscribe,
    props.startupGuidance.getSnapshot,
  )
  const permissions = useSyncExternalStore(props.permissions.subscribe, props.permissions.getSnapshot)
  const contextPressure = useSyncExternalStore(props.contextPressure.subscribe, props.contextPressure.getSnapshot)
  const tokenUsage = useSyncExternalStore(props.tokenUsage.subscribe, props.tokenUsage.getSnapshot)
  const contextBreakdown = useSyncExternalStore(props.contextBreakdown.subscribe, props.contextBreakdown.getSnapshot)
  const sessionStats = useSyncExternalStore(props.sessionStats.subscribe, props.sessionStats.getSnapshot)
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
  const pointerRegistry = useMemo(() => new TuiPointerRegionRegistry(), [props.agent])
  const resolveTool = useMemo(
    () => (name: string) => props.agent.ctx.get('tools')?.get(name, props.agent),
    [props.agent],
  )
  const projection = useMemo(
    () => transcriptProjection.update(eventSnapshot, resolveTool, renderKnownSessionEvent),
    [eventSnapshot, renderKnownSessionEvent, resolveTool, transcriptProjection],
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
  const [externalEditorActive, setExternalEditorActive] = useState(false)
  const [notice, setNotice] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionAnswers, setQuestionAnswers] = useState<AskUserQuestionAnswerItem[]>([])
  const [questionCursor, setQuestionCursor] = useState(0)
  const [approvalOffset, setApprovalOffset] = useState(0)
  const [focus, setFocus] = useState<FocusState | undefined>()
  const [transcriptAnchor, setTranscriptAnchor] = useState<TuiTranscriptViewportAnchor | undefined>()
  const [transcriptSearch, setTranscriptSearch] = useState<TranscriptSearchState | undefined>()
  const [helpOffset, setHelpOffset] = useState(0)
  const [doctorOffset, setDoctorOffset] = useState(0)
  const [loadedContextOffset, setLoadedContextOffset] = useState(0)
  const [footerSelection, setFooterSelection] = useState<TuiFooterItemId | undefined>()
  const [footerDetail, setFooterDetail] = useState<FooterDetailState | undefined>()
  const [screenSelection, setScreenSelection] = useState<TuiSelectionState | undefined>()
  const [workOpen, setWorkOpen] = useState(false)
  const [workSelection, setWorkSelection] = useState(0)
  const [workClock, setWorkClock] = useState(Date.now)
  const [workingFrameTick, setWorkingFrameTick] = useState(0)
  const [resumeScope, setResumeScope] = useState<TuiResumeScope>('workspace')
  const [resumeView, setResumeView] = useState<TuiResumeView>('list')
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
  const submittedPendingIds = useRef<string[]>([])
  const selectionPending = useRef<TuiSelectionPending | undefined>()
  const lastScreenClick = useRef<TuiScreenClick | undefined>()
  const lastEscapeAt = useRef<number | undefined>()
  const currentAgentViewId = useRef(props.view.id)
  const currentAgentViewState = useRef<TuiAgentViewLocalState>({
    composer, history, historySearch, focus, transcriptAnchor, transcriptSearch,
  })
  currentAgentViewState.current = {
    composer, history, historySearch, focus, transcriptAnchor, transcriptSearch,
  }
  useEffect(() => { props.onMounted() }, [props.onMounted])
  useEffect(() => {
    submittedPendingIds.current = []
    lastEscapeAt.current = undefined
    selectionPending.current = undefined
    lastScreenClick.current = undefined
    setScreenSelection(undefined)
    props.onSelectionMouseMode?.(false)
  }, [props.agent])
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
    setResumeView('list')
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
          label: node.kind === 'todo' ? tuiMessage(locale, 'transcript.tasks.title')
            : node.kind === 'text' ? node.label
              : node.kind === 'compaction' ? tuiMessage(locale, 'transcript.compaction.title') : node.name,
          node,
        }]
      }
      return [
        { key: node.key, label: node.activity === 'explore'
          ? tuiMessage(locale, 'transcript.group.explore')
          : node.activity === 'parallel'
            ? tuiMessage(locale, 'transcript.group.parallel')
            : tuiMessage(locale, 'transcript.group.exclusive'), node },
        ...node.tools.slice(-6).map(tool => ({ key: `${node.key}:${tool.callId}`, label: focusTitle(tool), node, child: tool })),
      ]
    })
  const exactFocusedIndex = focusTargets.findIndex(target => target.key === focus?.focusedKey)
  const focusedIndex = focus === undefined || focusTargets.length === 0
    ? -1
    : exactFocusedIndex >= 0 ? exactFocusedIndex : Math.min(focus.focusedIndex, focusTargets.length - 1)
  const focusedTarget = focusTargets[focusedIndex]
  const focusedTargetKey = focus?.mode === 'browse' ? focusedTarget?.key : undefined
  const focusedTargetNodeKind = focus?.mode === 'browse' ? focusedTarget?.node.kind : undefined
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
  const selectedResumeCandidate = resumeCandidates[effectiveResumeSelection]
  const narrowResume = columns < 100
  const resumePreviewVisible = !narrowResume || resumeView === 'preview'
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
  const model = activeSelection?.model
  const reasoningEffort = activeSelection?.reasoningEffort
  const modelMetadata = [
    model,
    reasoningEffort === undefined ? undefined : tuiMessage(locale, 'startup.thinking', { effort: reasoningEffort }),
  ].filter(value => value !== undefined && value !== '').join(' · ')
  const startupSurface = props.view.kind === 'root'
    && rows.length === 0 && currentTodo === undefined && agentStatus === 'idle' && !busy
    && interaction === undefined && !helpOpen && diagnostics === undefined && loadedContext === undefined
    && resumeDialog === undefined && freshSessionDialog === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
    && !workOpen && work.items.length === 0
    && focus === undefined && transcriptSearch === undefined && historySearch === undefined
    && footerSelection === undefined && footerDetail === undefined && stashedDraft === undefined
  const startupWidth = tuiStartupComposerFrame(stdout, 1).width
  const startupGuidanceLines = startupGuidance === undefined
    ? [Object.freeze({
      key: 'primary' as const,
      text: modelMetadata === ''
        ? `${tuiMessage(locale, 'startup.model.unavailable')} · ${tuiMessage(locale, 'command.help')}`
        : `${modelMetadata} · ${tuiMessage(locale, 'command.help')}`,
      tone: modelMetadata === '' ? 'warning' as const : 'success' as const,
    })]
    : projectTuiStartupGuidance(startupGuidance, modelMetadata, startupWidth, locale)
  const composerWidth = Math.max(1, (startupSurface ? startupWidth : (stdout.columns || 80)) - 4)
  const historyMatch = historySearch === undefined ? undefined : tuiHistorySearchResult(historySearch, history)
  const editorComposer = sessionExportDialog?.phase === 'selecting'
    ? exportDirectory
    : transcriptSearch !== undefined
      ? createComposerState(transcriptSearch.query)
      : historySearch === undefined ? composer : createComposerState(historySearch.query)
  const composerLayout = layoutComposer(editorComposer, composerWidth)
  const attachmentLine = sessionExportDialog?.phase === 'selecting'
    ? undefined
    : composerAttachmentLine(composer.attachments)
  const composerRows = composerLayout.lines.length + (attachmentLine === undefined ? 0 : 1)
  const hasComposerDraft = composer.text.trim() !== '' || (composer.attachments?.length ?? 0) > 0
  const suggestionLimit = Math.max(1, Math.min(6, stdout.rows - 12))
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
  const pathQuery = historySearch === undefined && transcriptSearch === undefined
    && diagnostics === undefined && loadedContext === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined
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
    && diagnostics === undefined && loadedContext === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined
    ? pathSuggestion ?? commandSuggestionState(composer.text, composer.cursor, props.commands, locale)
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
    && diagnostics === undefined && loadedContext === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined
  const doctorVisible = diagnostics !== undefined && interaction === undefined
    && resumeDialog === undefined && freshSessionDialog === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
  const loadedContextVisible = loadedContext !== undefined && interaction === undefined
    && resumeDialog === undefined && freshSessionDialog === undefined
    && diagnostics === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined
  const inputContext = resolveTuiInteractionContext({
    approval: interaction?.kind === 'approval',
    dialog: resumeDialog !== undefined || freshSessionDialog !== undefined
      || rewindDialog !== undefined || sessionExportDialog !== undefined
      || helpVisible || doctorVisible || loadedContextVisible || interaction?.kind === 'question',
    pluginHub: pluginHubDialog !== undefined,
    work: workOpen,
    detail: focus?.mode === 'detail' || footerDetail !== undefined,
    transcript: focus?.mode === 'browse',
    transcriptSearch: transcriptSearch !== undefined,
    historySearch: historySearch !== undefined,
    suggestion: suggestion !== undefined,
    footer: footerSelection !== undefined,
  })
  const doubleEscapeRewindAvailable = props.view.kind === 'root'
    && props.view.acceptsInput
    && agentStatus === 'idle'
    && !busy
    && !hasComposerDraft
    && inputContext === 'Composer'
    && interaction === undefined
    && suggestion === undefined
    && historySearch === undefined
    && transcriptSearch === undefined
    && focus === undefined
    && footerSelection === undefined
    && footerDetail === undefined
    && !workOpen
    && !helpVisible
    && !doctorVisible
    && !loadedContextVisible
    && resumeDialog === undefined
    && freshSessionDialog === undefined
    && rewindDialog === undefined
    && sessionExportDialog === undefined
    && pluginHubDialog === undefined
  const helpDescriptors = effectiveTuiInteractionDescriptors({
    modelPicker: props.commands.some(command => command.name === 'models'),
    resumePicker: props.commands.some(command => command.name === 'resume'),
    approval: true,
    childView: props.view.kind === 'child',
  }, props.interactionRegistry)
  const helpLines = [
    ...tuiInteractionHelpLines(helpDescriptors, Math.max(1, (stdout.columns || 80) - 4), locale),
    ...(props.view.kind === 'root' && agentStatus === 'running' ? tuiRunningDeliveryHelpLines() : []),
  ]
  const doctorLines = diagnostics === undefined
    ? []
    : tuiDiagnosticPanelLines(diagnostics, Math.max(1, (stdout.columns || 80) - 6), locale)
  const doctorBodyRows = Math.max(1, terminalRows - 6)
  const visibleDoctorOffset = Math.min(doctorOffset, Math.max(0, doctorLines.length - doctorBodyRows))
  const loadedContextLines = loadedContext === undefined
    ? []
    : tuiLoadedContextPanelLines(loadedContext, Math.max(1, (stdout.columns || 80) - 6))
  const loadedContextBodyRows = Math.max(1, terminalRows - 6)
  const visibleLoadedContextOffset = Math.min(
    loadedContextOffset, Math.max(0, loadedContextLines.length - loadedContextBodyRows),
  )
  const pluginHubDiscoverRows = tuiPluginHubRows(pluginHubDialog?.page, pluginHubSelection, stdout.columns || 80)
  const pluginHubInstalledRows = tuiPluginHubInstalledRows(
    pluginHubDialog?.installed,
    pluginHubSelection,
    stdout.columns || 80,
    locale,
  )
  const pluginHubRows = pluginHubDialog?.view === 'installed'
    ? pluginHubInstalledRows
    : pluginHubDiscoverRows
  const pluginHubDetailLines = tuiPluginHubDetailLines(
    pluginHubDialog?.detail, stdout.columns || 80, Date.now(), locale,
  )
  const pluginHubDetailOpen = pluginHubDialog?.phase === 'detail' && pluginHubDialog.detail !== undefined
  const pluginHubPlanLines = tuiPluginHubPlanLines(
    pluginHubDialog?.plan,
    pluginHubDialog?.detail,
    stdout.columns || 80,
    locale,
  )
  const pluginHubPlanOpen = pluginHubDialog?.phase === 'confirm' && pluginHubDialog.plan !== undefined
  const pluginHubSearchVisible = pluginHubDialog?.view === 'discover'
    && !pluginHubDetailOpen && !pluginHubPlanOpen
    && pluginHubDialog.phase !== 'planning' && pluginHubDialog.phase !== 'staging'
    && pluginHubDialog.phase !== 'handoff'
  const pluginHubBodyRows = tuiPluginHubViewportRows(terminalRows, pluginHubSearchVisible)
  const pluginHubRowHeight = tuiPluginHubCardHeight(stdout.columns || 80)
  const pluginHubVisibleCount = Math.max(1, Math.floor(pluginHubBodyRows / pluginHubRowHeight))
  const pluginHubVisibleStart = Math.max(0, Math.min(
    Math.max(0, pluginHubRows.length - pluginHubVisibleCount),
    pluginHubSelection - Math.floor(pluginHubVisibleCount / 2),
  ))
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
  const pluginHubDetailPageSize = pluginHubBodyRows
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
    visibleDetailHeight + helpHeight + visibleTasksHeight + approvalHeight + (helpVisible ? -1 : composerRows - 1)
      + suggestionRows + historySearchRows + transcriptSearchRows + stashRows,
  )
  const transcriptColumns = Math.max(1, (stdout.columns || 80) - (focus === undefined ? 2 : 4))
  transcriptViewport.update(rows, transcriptColumns)
  const transcriptPage = transcriptViewport.page(transcriptRows, transcriptAnchor)
  const visible = transcriptPage.entries
  const pointerContext: TuiInteractionContext | undefined = inputContext
  const transcriptContentRows = visible.length === 0
    ? 1
    : visible.reduce((total, entry) => total + tuiTranscriptWindowEntryRows(entry, transcriptColumns), 0)
  const transcriptScreenMapLines = tuiTranscriptScreenMapLines(visible, transcriptColumns, workspace)
  const visibleTranscriptFingerprint = transcriptScreenMapLines.map(line => `${line.semanticBlockKey}\u0000${line.text}\u0000${line.gutter ?? ''}\u0000${line.selectable === false ? '0' : '1'}`).join('\u0001')
  const transcriptScreenMap = useMemo(() => {
    if (visible.length === 0) return undefined
    return projectTuiScreenMap(
      transcriptScreenMapLines,
      { columns: transcriptColumns + 3, maxRows: transcriptRows, bidi: 'visual' },
    )
  }, [columns, transcriptColumns, transcriptRows, visibleTranscriptFingerprint])
  const transcriptScreenTopRow = Math.max(1, 1 + transcriptRows - transcriptContentRows)
  const tasksScreenMapLines = visibleTasksHeight === 0 || currentTodo === undefined
    ? [] : todoPanelScreenMapLines(currentTodo)
  const tasksScreenFingerprint = tasksScreenMapLines
    .map(line => `${line.semanticBlockKey}\u0000${line.text}\u0000${line.gutter ?? ''}\u0000${line.selectable === false ? '0' : '1'}`)
    .join('\u0001')
  const tasksScreenMap = useMemo(() => {
    if (tasksScreenMapLines.length === 0) return undefined
    return projectTuiScreenMap(tasksScreenMapLines, {
      columns: Math.max(1, columns - 2),
      maxRows: tasksHeight,
      bidi: 'visual',
    })
  }, [columns, tasksHeight, tasksScreenFingerprint])
  const tasksScreenTopRow = transcriptRows + visibleDetailHeight + 1
  const completeFooterItems = tuiFooterItems({
    modelSelection: props.view.kind === 'root' ? activeSelection : undefined,
    modelSelectionKind: agentStatus === 'running' ? 'running request' : 'next request',
    permissions: props.view.kind === 'root' ? permissions : undefined,
    context: props.view.kind === 'root' ? contextPressure : undefined,
    tokenUsage: props.view.kind === 'root' ? tokenUsage : undefined,
    contextBreakdown: props.view.kind === 'root' ? contextBreakdown : undefined,
    sessionStats: props.view.kind === 'root' ? sessionStats : undefined,
    work: work.summary,
    workspace,
    transcript: {
      startIndex: transcriptPage.startIndex,
      endIndex: transcriptPage.endIndex,
      total: rows.length,
      hasOlder: transcriptPage.hasOlder,
      hasNewer: transcriptPage.hasNewer,
    },
  }, locale)
  const mountedFooterItems = visibleTuiFooterItems(completeFooterItems, Math.max(1, columns - 2))
  const pointerRegions: readonly TuiPointerRegion[] = (() => {
    if (startupSurface || extensionSnapshot.fullscreenScene !== undefined) {
      return Object.freeze([])
    }
    if (interaction?.kind === 'approval') {
      const hintStart = 2
      const navigationLabel = tuiMessage(locale, 'approval.navigation')
      const allowLabel = tuiMessage(locale, 'approval.allow')
      const rejectLabel = tuiMessage(locale, 'approval.reject')
      const separator = ' · '
      const allowLeft = hintStart + stringWidth(navigationLabel)
      const allowRight = allowLeft + stringWidth(allowLabel) - 1
      const rejectLeft = allowRight + 1 + stringWidth(separator)
      const rejectRight = rejectLeft + stringWidth(rejectLabel) - 1
      return tuiApprovalPointerRegions({
        columns,
        actionRow: terminalRows - 2,
        allowRange: { left: allowLeft, right: allowRight },
        rejectRange: { left: rejectLeft, right: rejectRight },
        context: 'Approval',
      })
    }
    if (question !== undefined) {
      const questionTextRows = Math.max(1, terminalWrappedLines(
        terminalSafe(question.question), Math.max(1, columns - 4),
      ).length)
      const questionDetailRows = question.detail === undefined ? 0 : Math.max(1, terminalWrappedLines(
        terminalSafe(question.detail), Math.max(1, columns - 4),
      ).length)
      const questionBodyRows = 3 + questionTextRows + questionDetailRows
        + visibleOptions.length + (questionOptions.length > optionLimit ? 1 : 0)
        + composerRows + (attachmentLine === undefined ? 0 : 1)
      const questionTop = terminalRows - 2 - questionBodyRows + 1
      return tuiQuestionPointerRegions({
        columns,
        optionTop: questionTop + 2 + questionTextRows + questionDetailRows,
        optionStart,
        visibleCount: visibleOptions.length,
        rowHeight: 1,
        context: 'Dialog',
      })
    }
    if (helpVisible || doctorVisible || loadedContextVisible) {
      return tuiModalClosePointerRegions({
        columns, row: terminalRows, context: 'Dialog', id: 'dialog:close', action: 'dialog.close',
      })
    }
    if (footerDetail !== undefined || focus?.mode === 'detail') {
      return tuiModalClosePointerRegions({
        columns, row: terminalRows, context: 'Detail', id: 'detail:close', action: 'detail.close',
      })
    }
    if (footerSelection !== undefined || freshSessionDialog !== undefined
      || rewindDialog !== undefined || sessionExportDialog !== undefined) {
      return Object.freeze([])
    }
    if (pointerContext === 'PluginHub' && pluginHubDialog !== undefined) {
      return tuiPluginHubPointerRegions({
        columns,
        rows: terminalRows,
        searchVisible: pluginHubSearchVisible,
        detail: pluginHubDetailOpen,
        confirmation: pluginHubPlanOpen,
        view: pluginHubDialog.view,
        phase: pluginHubDialog.phase,
        visibleStart: pluginHubVisibleStart,
        rowHeights: pluginHubRows.slice(
          pluginHubVisibleStart, pluginHubVisibleStart + pluginHubVisibleCount,
        ).map(row => tuiPluginHubCardLayout(row, columns, Date.now(), locale).height),
        context: 'PluginHub',
      })
    }
    if (pointerContext === 'Dialog' && resumeDialog !== undefined) {
      const previewVisible = resumeDialog.phase === 'ready'
        && resumePreviewVisible && selectedResumeCandidate !== undefined
      return tuiResumePointerRegions({
        columns,
        rows: terminalRows,
        narrow: narrowResume,
        previewVisible,
        listVisible: !previewVisible || !narrowResume,
        phase: resumeDialog.phase === 'loading' ? 'loading' : resumeDialog.phase === 'resuming' ? 'resuming' : 'ready',
        confirmation: resumeConfirmation !== undefined,
        visibleStart: resumeVisibleStart,
        visibleCount: visibleResumeCandidates.length,
        rowHeight: resumeRowHeight,
        context: 'Dialog',
      })
    }
    if (workOpen) return tuiWorkPointerRegions(
      work.items.length, effectiveWorkSelection, transcriptRows, columns, 'Work',
    )
    if (pointerContext === 'Composer' || pointerContext === 'Transcript') {
      const suggestionTop = Math.max(1, terminalRows - 2 - (composerRows + 2) - suggestionRows + 1)
      return Object.freeze([
        ...(pointerContext === 'Composer' && suggestion !== undefined
          ? tuiSuggestionPointerRegions({
            columns,
            top: suggestionTop,
            visibleStart: suggestion.visibleStart,
            visibleCount: visibleSuggestions.length,
            context: 'Composer',
          })
          : []),
        ...transcriptPointerRegions(
          visible,
          focusTargets,
          Math.max(1, 1 + transcriptRows - transcriptContentRows),
          columns,
          transcriptColumns,
          workspace,
          pointerContext,
          locale,
        ),
        ...tuiFooterPointerRegions(mountedFooterItems, columns, terminalRows, pointerContext),
      ])
    }
    return Object.freeze([])
  })()
  useLayoutEffect(() => {
    pointerRegistry.replace(pointerRegions)
  }, [pointerRegions, pointerRegistry, terminalSize, props.view.id])
  useEffect(() => () => { pointerRegistry.clear() }, [pointerRegistry])
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
  const detailVisibleLines = useMemo(
    () => detailLines.slice(detailOffset, detailOffset + detailRows),
    [detailLines, detailOffset, detailRows],
  )
  const detailScreenMap = useMemo(() => {
    if (detailHeight === 0 || detailVisibleLines.length === 0) return undefined
    const semanticBlockKey = footerDetailItem?.id === undefined
      ? `${focusedTarget?.key ?? 'detail'}:detail`
      : `footer:${footerDetailItem.id}`
    return projectTuiScreenMap(detailVisibleLines.map(text => ({
      semanticBlockKey,
      gutter: ' '.repeat(4),
      text,
    })), { columns, maxRows: detailRows, bidi: 'visual' })
  }, [columns, detailHeight, detailRows, detailVisibleLines, footerDetailItem?.id, focusedTarget?.key])
  // The framed detail title occupies the two rows immediately above its text.
  const detailScreenTopRow = transcriptRows + 3
  const selectionFrameKey = [
    detailHeight,
    detailRows,
    detailOffset,
    detailScreenTopRow,
    detailVisibleLines.join('\u0001'),
    transcriptColumns,
    transcriptRows,
    transcriptScreenTopRow,
    visibleTranscriptFingerprint,
    tasksScreenTopRow,
    tasksScreenFingerprint,
    workspace,
  ].join('\u0002')
  useEffect(() => {
    const hadSelection = selectionPending.current !== undefined || screenSelection !== undefined
    selectionPending.current = undefined
    lastScreenClick.current = undefined
    if (hadSelection) {
      setScreenSelection(undefined)
      props.onSelectionMouseMode?.(false)
    }
  }, [selectionFrameKey])
  const footerStatus = tuiFooterStatusLine(mountedFooterItems, Math.max(1, columns - 2))
  const selectedFooterStatus = tuiSelectedFooterLine(
    mountedFooterItems, effectiveFooterSelection, Math.max(1, columns - 2), locale,
  )
  const extensionStatus = useMemo(
    () => props.extensions.renderStatus(Math.max(1, columns - 2), locale),
    [extensionSnapshot.revision, props.extensions, columns, locale],
  )
  const fullscreenScene = extensionSnapshot.fullscreenScene
  const fullscreenFrame = useMemo(
    () => fullscreenScene === undefined ? undefined : props.extensions.renderFullscreenScene(columns, terminalRows, locale),
    [extensionSnapshot.revision, fullscreenScene, props.extensions, columns, terminalRows, locale],
  )
  const startupFrame = tuiStartupComposerFrame(
    stdout,
    composerRows,
    suggestionRows,
    Math.max(0, startupGuidanceLines.length - 1),
  )

  useEffect(() => {
    if (helpOpen) setHelpOffset(0)
  }, [helpOpen])

  useEffect(() => {
    if (diagnostics !== undefined) setDoctorOffset(0)
  }, [diagnostics])

  useEffect(() => {
    if (loadedContext !== undefined) setLoadedContextOffset(0)
  }, [loadedContext])

  useEffect(() => {
    if (focus?.mode !== 'browse' || focusedTargetKey === undefined) return
    if (focusedTargetNodeKind === 'todo') return
    const parentIndex = transcriptViewport.indexOfKey(focusedTargetKey)
    setTranscriptAnchor((previous) => {
      const next = transcriptScroll.ensureVisible(
        previous, transcriptPage, focusedTargetKey, parentIndex,
      )
      return previous?.key === next?.key && previous?.index === next?.index ? previous : next
    })
  }, [
    focus?.mode,
    focusedTargetKey,
    focusedTargetNodeKind,
    transcriptPage.endIndex,
    transcriptPage.startIndex,
    transcriptScroll,
    transcriptViewport,
  ])

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
      setNotice(tuiMessage(locale, 'question.answer.required'))
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

  const selectQuestionOption = (index: number): void => {
    if (interaction?.kind !== 'question') return
    const options = interaction.request.questions[questionIndex]?.options ?? []
    if (index < 0 || index >= options.length) return
    setQuestionCursor(index)
    updateComposer(createComposerState(String(index + 1)))
    setNotice('')
  }

  const activateSuggestion = (requestedIndex?: number): void => {
    if (suggestion === undefined || suggestion.items.length === 0) return
    const index = requestedIndex === undefined
      ? suggestion.selectedIndex
      : Math.max(0, Math.min(suggestion.items.length - 1, requestedIndex))
    const selectedItem = suggestion.items[index]
    const selectedPath = selectedItem?.source === 'path' && selectedItem.description === 'file'
      ? selectedItem.label.slice(1)
      : undefined
    if (selectedPath !== undefined && isImagePath(selectedPath)) {
      const viewId = props.view.id
      setBusy(true)
      setNotice('')
      setSuggestionOverride(undefined)
      void props.onAttachPath(selectedPath).then((ref) => {
        if (currentAgentViewId.current !== viewId) return
        updateComposer(previous => addComposerImageAttachment(
          replaceComposerText(
            previous,
            previous.text.slice(0, suggestion.queryStart) + previous.text.slice(suggestion.queryEnd),
            suggestion.queryStart,
            'suggestion',
          ),
          ref,
        ))
      }).catch((error: unknown) => {
        if (currentAgentViewId.current === viewId) {
          setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
        }
      }).finally(() => { setBusy(false) })
      return
    }
    const accepted = acceptTuiSuggestion(composer.text, { ...suggestion, selectedIndex: index })
    if (accepted !== undefined) updateComposer(previous => replaceComposerText(
      previous, accepted.text, accepted.cursor, 'suggestion',
    ))
  }

  const submitComposer = (mode?: TuiSubmitMode): void => {
    const text = materializeComposerText(composer)
    const attachments = composer.attachments
    if ((text.trim() === '' && (attachments?.length ?? 0) === 0) || busy || !props.view.acceptsInput) return
    const submittedComposer = composer
    const submittedViewId = props.view.id
    setSuggestionOverride(undefined)
    setComposer(createComposerState())
    setHistory(previous => [...previous, tuiComposerDraft(composer)])
    setBusy(true)
    setNotice('')
    void props.onSubmit(text, mode, attachments).then((messageId) => {
      if (messageId !== undefined && props.view.kind === 'root') {
        submittedPendingIds.current = [...submittedPendingIds.current, messageId]
      }
    }).catch((error: unknown) => {
      if (currentAgentViewId.current === submittedViewId) {
        setComposer(previous => previous.text === '' && (previous.attachments?.length ?? 0) === 0
          ? submittedComposer : previous)
        setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
      }
    }).finally(() => { setBusy(false) })
  }

  const reclaimPendingInput = (): void => {
    if (props.view.kind !== 'root' || hasComposerDraft || busy) return
    const pending = [...props.agent.inbox.nextStep, ...props.agent.inbox.nextTurn]
    const candidate = selectTuiReclaimableMessage(pending, submittedPendingIds.current)
    if (candidate === undefined) {
      setNotice(tuiMessage(locale, 'reclaim.none'))
      return
    }
    if (!props.agent.inbox.remove(candidate.id)) {
      submittedPendingIds.current = submittedPendingIds.current.filter(id => id !== candidate.id)
      setNotice(tuiMessage(locale, 'reclaim.claimed'))
      return
    }
    submittedPendingIds.current = submittedPendingIds.current.filter(id => id !== candidate.id)
    setSuggestionOverride(undefined)
    setComposer(createComposerState(tuiReclaimMessageText(candidate)))
    setNotice(tuiMessage(locale, 'reclaim.complete'))
  }

  const executeLocalCommand = (command: string): void => {
    if (busy) return
    setBusy(true)
    setNotice('')
    void props.onSubmit(command).catch((error: unknown) => {
      setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
    }).finally(() => { setBusy(false) })
  }

  const activateFooterItem = (item: TuiFooterItemDescriptor | undefined = selectedFooterItem): void => {
    if (item === undefined || busy) return
    if (item.action === 'work') {
      setFooterSelection(undefined)
      setWorkSelection(0)
      setWorkClock(Date.now())
      setWorkOpen(true)
      return
    }
    if (item.action === 'detail') {
      setFooterDetail({ itemId: item.id, offset: 0 })
      return
    }
    const itemId = item.id
    setFooterSelection(undefined)
    setBusy(true)
    setNotice('')
    void props.onActivateFooter(itemId).catch((error: unknown) => {
      setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
    }).finally(() => { setBusy(false) })
  }

  const activatePluginHubPointer = (index: number | undefined): void => {
    if (pluginHubDialog === undefined || busy) return
    if (pluginHubDialog.phase === 'confirm') {
      void props.onPluginHubConfirm()
      return
    }
    if (pluginHubDialog.phase !== 'browse' || index === undefined) return
    const selected = pluginHubRows[index]
    if (selected === undefined) return
    setPluginHubSelection(index)
    if (pluginHubDialog.view === 'installed') {
      if (pluginHubDialog.profileMutations !== false) void props.onPluginHubRemove(selected.packageName)
      return
    }
    const catalogItem = pluginHubItems?.find(item => String(item.id) === selected.id)
    if (catalogItem !== undefined) void props.onPluginHubDetail(catalogItem.id)
  }

  const activateResumeCandidate = (candidate: TuiResumeCandidate): void => {
    if (candidate.disabledReason !== undefined) {
      setResumeError(candidate.disabledReason)
      return
    }
    const activeDraft = composer.text.trim()
    if (hasComposerDraft && activeDraft !== '/resume') {
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
        setResumeError(tuiMessage(locale, 'draft.stash.failed'))
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
    const activeDraft = hasComposerDraft && composer.text.trim() !== '/rewind'
    if (activeDraft && action === 'none') return
    if (activeDraft && action === 'stash') {
      if (stashedDraft !== undefined) {
        setRewindError('A draft is already stashed. Cancel and restore or discard it first.')
        return
      }
      const transition = toggleTuiComposerStash(composer, undefined)
      if (transition.stash === undefined) {
        setRewindError(tuiMessage(locale, 'draft.stash.failed'))
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

  const focusTranscriptTarget = (target: FocusTarget, index: number): void => {
    setFocus({ mode: 'browse', focusedKey: target.key, focusedIndex: index })
    if (target.node.kind !== 'todo') {
      const parentIndex = transcriptViewport.indexOfNode(target.node)
      setTranscriptAnchor(previous => transcriptScroll.ensureVisible(
        previous, transcriptPage, target.node.key, parentIndex,
      ))
    }
  }

  const detailSelectionPosition = (column: number, row: number): TuiScreenPosition | undefined => {
    if (detailScreenMap === undefined || inputContext !== 'Detail') return undefined
    const position = { row: row - detailScreenTopRow, column: column - 1 }
    const cell = detailScreenMap.rows[position.row]?.cells[position.column]
    if (cell === undefined || cell.source !== 'text' || !cell.selectable) return undefined
    return position
  }

  const transcriptSelectionPosition = (column: number, row: number): TuiScreenPosition | undefined => {
    if (transcriptScreenMap === undefined || (inputContext !== 'Composer' && inputContext !== 'Transcript')) return undefined
    const position = { row: row - transcriptScreenTopRow, column: column - 1 }
    const cell = transcriptScreenMap.rows[position.row]?.cells[position.column]
    if (cell === undefined || cell.source !== 'text' || !cell.selectable) return undefined
    return position
  }

  const hyperlinkAtScreen = (column: number, row: number): string | undefined => {
    const surfaces = [
      detailScreenMap === undefined || inputContext !== 'Detail' ? undefined : {
        map: detailScreenMap, top: detailScreenTopRow,
      },
      transcriptScreenMap === undefined || (inputContext !== 'Composer' && inputContext !== 'Transcript') ? undefined : {
        map: transcriptScreenMap, top: transcriptScreenTopRow,
      },
      tasksScreenMap === undefined || (inputContext !== 'Composer' && inputContext !== 'Transcript') ? undefined : {
        map: tasksScreenMap, top: tasksScreenTopRow,
      },
    ]
    for (const surface of surfaces) {
      if (surface === undefined) continue
      const cell = surface.map.rows[row - surface.top]?.cells[column - 1]
      const safe = cell?.hyperlink === undefined ? undefined : tuiSafeHyperlinkUrl(cell.hyperlink)
      if (safe !== undefined) return safe
    }
    return undefined
  }

  const tasksSelectionPosition = (column: number, row: number): TuiScreenPosition | undefined => {
    if (tasksScreenMap === undefined || (inputContext !== 'Composer' && inputContext !== 'Transcript')) return undefined
    const position = { row: row - tasksScreenTopRow, column: column - 1 }
    const cell = tasksScreenMap.rows[position.row]?.cells[position.column]
    if (cell === undefined || cell.source !== 'text' || !cell.selectable) return undefined
    return position
  }

  const copyScreenSelection = (
    surface: 'detail' | 'transcript' | 'tasks',
    map: TuiScreenMap,
    range: TuiScreenSelection,
  ): void => {
    setScreenSelection({ surface, map, range })
    const text = tuiScreenSelectionText(map, range)
    const result = props.onCopy(text)
    setNotice(result.ok
      ? tuiMessage(locale, 'clipboard.selection.copied')
      : result.message ?? tuiMessage(locale, 'clipboard.selection.retained'))
  }

  const cancelInteraction = (): void => {
    if (interaction === undefined) return
    setComposer(createComposerState())
    setNotice('')
    props.interactions.cancelCurrent()
  }

  const dispatchPointerAction = (column: number, row: number): void => {
    const hyperlink = hyperlinkAtScreen(column, row)
    if (hyperlink !== undefined) {
      void props.onOpenUrl(hyperlink)
      return
    }
    const hit = pointerRegistry.hitTest({ column, row }, pointerContext)
    const action = hit?.region.action
    if (hit === undefined || hit.region.disabledReason !== undefined || action === undefined) return
    if (action.id === 'transcript.focus') {
      const target = focusTargets[action.index]
      if (target?.key === action.key) focusTranscriptTarget(target, action.index)
    } else if (action.id === 'footer.activate') {
      activateFooterItem(mountedFooterItems.find(item => item.id === action.itemId))
    } else if (action.id === 'work.select') {
      setWorkSelection(Math.max(0, Math.min(work.items.length - 1, action.index)))
      setWorkClock(Date.now())
    } else if (action.id === 'pluginHub.toggleView') {
      if (pluginHubDialog !== undefined && pluginHubDialog.view !== action.targetView) {
        setPluginHubSelection(0)
        setPluginHubDetailOffset(0)
        void props.onPluginHubToggleView()
      }
    } else if (action.id === 'pluginHub.accept') {
      activatePluginHubPointer(action.index)
    } else if (action.id === 'pluginHub.close') {
      props.onClosePluginHub()
    } else if (action.id === 'resume.scope') {
      if (resumeDialog !== undefined && action.scope !== resumeScope) {
        setResumeScope(action.scope)
        setResumeQuery('')
        setResumeSelection(0)
        setResumeView('list')
        setResumeError('')
      }
    } else if (action.id === 'resume.accept') {
      if (resumeDialog !== undefined) {
        const candidate = resumeCandidates[action.index ?? effectiveResumeSelection]
        if (candidate === undefined) setResumeError(tuiMessage(locale, 'resume.search.none'))
        else activateResumeCandidate(candidate)
      }
    } else if (action.id === 'resume.toggleView') {
      if (resumeDialog !== undefined && narrowResume) {
        setResumeView(action.view)
        setResumeError('')
      }
    } else if (action.id === 'dialog.option') {
      selectQuestionOption(action.index)
    } else if (action.id === 'dialog.accept') {
      if (question !== undefined) submitQuestion()
    } else if (action.id === 'dialog.close') {
      if (helpVisible) props.onCloseHelp()
      else if (doctorVisible) props.onCloseDoctor()
      else if (loadedContextVisible) props.onCloseLoadedContext()
      else cancelInteraction()
    } else if (action.id === 'approval.allowOnce') {
      if (interaction?.kind === 'approval') props.interactions.answerApproval('allowed-once')
    } else if (action.id === 'approval.reject') {
      if (interaction?.kind === 'approval') props.interactions.answerApproval('rejected')
    } else if (action.id === 'detail.close') {
      if (footerDetail !== undefined) setFooterDetail(undefined)
      else setFocus(previous => previous?.mode !== 'detail' ? previous : {
        mode: 'browse', focusedKey: previous.focusedKey, focusedIndex: previous.focusedIndex,
      })
    } else if (action.id === 'suggestion.accept') {
      activateSuggestion(action.index)
    } else {
      props.onCloseResume()
    }
  }

  const updateComposer = (update: React.SetStateAction<ComposerState>): void => {
    setSuggestionOverride(undefined)
    setComposer(update)
  }

  const openExternalEditor = (): void => {
    if (busy || externalEditorActive || !props.view.acceptsInput) return
    const viewId = props.view.id
    const draft = materializeComposerText(composer)
    setExternalEditorActive(true)
    setBusy(true)
    setNotice('')
    void props.onExternalEditor(draft).then((result) => {
      if (currentAgentViewId.current !== viewId) return
      if (result.ok) updateComposer(previous => replaceComposerText(
        previous, result.text, result.text.length, 'external-editor', Date.now(), undefined,
      ))
      else setNotice(result.message)
    }).catch((error: unknown) => {
      if (currentAgentViewId.current === viewId) {
        setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
      }
    }).finally(() => {
      setExternalEditorActive(false)
      setBusy(false)
    })
  }

  const pasteFromClipboard = (): void => {
    if (busy || externalEditorActive || !props.view.acceptsInput) return
    const viewId = props.view.id
    setBusy(true)
    setNotice('')
    void props.onClipboardPaste().then((result) => {
      if (currentAgentViewId.current !== viewId) return
      updateComposer(previous => insertComposerClipboard(previous, result.text, result.attachments))
    }).catch((error: unknown) => {
      if (currentAgentViewId.current === viewId) {
        setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
      }
    }).finally(() => { setBusy(false) })
  }

  useTuiTerminalInput((terminalInput) => {
    if (externalEditorActive) return
    if (extensionSnapshot.fullscreenScene !== undefined) {
      if (terminalInput.kind !== 'input') return
      if (terminalInput.key.escape && !terminalInput.key.ctrl && !terminalInput.key.meta) {
        props.extensions.closeFullscreenScene()
        return
      }
      void props.extensions.handleFullscreenSceneInput(terminalInput.input)
      return
    }
    if (terminalInput.kind === 'mouse') {
      const mouseKind = tuiTerminalMouseReportKind(terminalInput.button, terminalInput.release)
      const wheelDirection = mouseKind === 'wheel'
        ? (terminalInput.button & 1) === 0 ? -1 : 1
        : undefined
      const primaryButton = (terminalInput.button & 0b11) === 0
        && (terminalInput.button & 0b11100) === 0
      const pending = selectionPending.current
      if (mouseKind === 'motion' && primaryButton && pending !== undefined) {
        const next = pending.surface === 'detail'
          ? detailSelectionPosition(terminalInput.column, terminalInput.row)
          : pending.surface === 'transcript'
            ? transcriptSelectionPosition(terminalInput.column, terminalInput.row)
            : tasksSelectionPosition(terminalInput.column, terminalInput.row)
        if (next !== undefined) {
          pending.focus = next
          const range = resolveTuiScreenSelection(pending.map, {
            kind: 'drag', anchor: pending.anchor, focus: next,
          })
          if (range !== undefined) setScreenSelection({ surface: pending.surface, map: pending.map, range })
        }
        return
      }
      if (mouseKind === 'release' && primaryButton && pending !== undefined) {
        selectionPending.current = undefined
        props.onSelectionMouseMode?.(false)
        const next = pending.surface === 'detail'
          ? detailSelectionPosition(terminalInput.column, terminalInput.row)
          : pending.surface === 'transcript'
            ? transcriptSelectionPosition(terminalInput.column, terminalInput.row)
            : tasksSelectionPosition(terminalInput.column, terminalInput.row)
        if (next !== undefined) pending.focus = next
        if (pending.focus.row !== pending.anchor.row || pending.focus.column !== pending.anchor.column) {
          const range = resolveTuiScreenSelection(pending.map, {
            kind: 'drag', anchor: pending.anchor, focus: pending.focus,
          })
          if (range !== undefined) copyScreenSelection(pending.surface, pending.map, range)
          lastScreenClick.current = undefined
        } else {
          const click = advanceTuiScreenClick(
            lastScreenClick.current,
            { surface: pending.surface, at: pending.anchor },
            Date.now(),
          )
          lastScreenClick.current = click
          if (click.count === 2 || click.count === 3) {
            const range = resolveTuiScreenSelection(pending.map, {
              kind: click.count === 2 ? 'double' : 'triple', at: pending.anchor,
            })
            if (range !== undefined) copyScreenSelection(pending.surface, pending.map, range)
          } else {
            setScreenSelection(undefined)
            dispatchPointerAction(terminalInput.column, terminalInput.row)
          }
        }
        return
      }
      if (mouseKind === 'wheel' && wheelDirection !== undefined) {
        if (inputContext === 'Approval') {
          setApprovalOffset(previous => Math.max(
            0, Math.min(Math.max(0, approvalLines.length - approvalBodyRows), previous + wheelDirection),
          ))
          return
        }
        if (interaction?.kind === 'question') {
          const options = interaction.request.questions[questionIndex]?.options ?? []
          if (options.length > 0) {
            const next = Math.max(0, Math.min(options.length - 1, questionCursor + wheelDirection))
            setQuestionCursor(next)
            updateComposer(createComposerState(String(next + 1)))
          }
          return
        }
        if (helpVisible) {
          setHelpOffset(previous => Math.max(
            0, Math.min(Math.max(0, helpLines.length - helpBodyRows), previous + wheelDirection),
          ))
          return
        }
        if (doctorVisible) {
          setDoctorOffset(previous => Math.max(
            0, Math.min(Math.max(0, doctorLines.length - doctorBodyRows), previous + wheelDirection),
          ))
          return
        }
        if (loadedContextVisible) {
          setLoadedContextOffset(previous => Math.max(
            0, Math.min(Math.max(0, loadedContextLines.length - loadedContextBodyRows), previous + wheelDirection),
          ))
          return
        }
        if (pluginHubDialog !== undefined && interaction === undefined) {
          if (pluginHubDialog.phase === 'detail' && pluginHubDialog.detail !== undefined) {
            setPluginHubDetailOffset(previous => Math.max(
              0, Math.min(Math.max(0, pluginHubDetailLines.length - pluginHubBodyRows), previous + wheelDirection),
            ))
          } else if (pluginHubDialog.phase === 'confirm' && pluginHubDialog.plan !== undefined) {
            setPluginHubDetailOffset(previous => Math.max(
              0, Math.min(Math.max(0, pluginHubPlanLines.length - pluginHubBodyRows), previous + wheelDirection),
            ))
          } else if (pluginHubDialog.phase === 'browse') {
            setPluginHubSelection(previous => Math.max(
              0, Math.min(Math.max(0, pluginHubRows.length - 1), previous + wheelDirection),
            ))
          }
          return
        }
        if (sessionExportDialog !== undefined || freshSessionDialog !== undefined
          || rewindDialog !== undefined || resumeDialog !== undefined) return
        if (footerDetail !== undefined || focus?.mode === 'detail') {
          setFooterDetail(previous => previous === undefined ? previous : {
            ...previous,
            offset: Math.max(0, Math.min(Math.max(0, detailLines.length - detailRows), previous.offset + wheelDirection)),
          })
          if (footerDetail === undefined) {
            setFocus(previous => previous?.mode !== 'detail' ? previous : {
              ...previous,
              detailOffset: Math.max(0, Math.min(Math.max(0, detailLines.length - detailRows), previous.detailOffset + wheelDirection)),
            })
          }
          return
        }
        if (workOpen) {
          setWorkSelection(previous => work.items.length === 0 ? previous : Math.max(
            0, Math.min(work.items.length - 1, previous + wheelDirection),
          ))
          return
        }
        if (footerSelection !== undefined) return
        if (suggestion !== undefined && interaction === undefined && focus === undefined) {
          const state = moveTuiSuggestion(
            suggestion, wheelDirection < 0 ? 'previous' : 'next', suggestionLimit,
          )
          if (suggestionKey !== undefined) setSuggestionOverride({ key: suggestionKey, state, dismissed: false })
          return
        }
        if (transcriptSearch !== undefined) {
          if (transcriptSearchHits.length > 0) {
            const current = transcriptSearchSelectedIndex < 0 ? 0 : transcriptSearchSelectedIndex
            const next = (current + wheelDirection + transcriptSearchHits.length) % transcriptSearchHits.length
            const hit = transcriptSearchHits[next]
            if (hit !== undefined) {
              setTranscriptSearch(previous => previous === undefined ? previous : { ...previous, selectedKey: hit.key })
              if (hit.key !== currentTodo?.key) setTranscriptAnchor(transcriptScroll.reveal(hit.key, hit.nodeIndex))
            }
          }
          return
        }
        setTranscriptAnchor(wheelDirection < 0
          ? transcriptScroll.previous(transcriptPage, transcriptRows)
          : transcriptScroll.next(transcriptPage, transcriptRows))
        return
      }
      const primaryPress = mouseKind === 'press' && primaryButton
      if (primaryPress) {
        const detailPosition = detailSelectionPosition(terminalInput.column, terminalInput.row)
        const transcriptPosition = transcriptSelectionPosition(terminalInput.column, terminalInput.row)
        const tasksPosition = tasksSelectionPosition(terminalInput.column, terminalInput.row)
        const surface = detailPosition !== undefined && detailScreenMap !== undefined
          ? { kind: 'detail' as const, map: detailScreenMap, position: detailPosition }
          : transcriptPosition !== undefined && transcriptScreenMap !== undefined
            ? { kind: 'transcript' as const, map: transcriptScreenMap, position: transcriptPosition }
            : tasksPosition !== undefined && tasksScreenMap !== undefined
              ? { kind: 'tasks' as const, map: tasksScreenMap, position: tasksPosition }
              : undefined
        if (surface !== undefined) {
          const enabled = props.onSelectionMouseMode === undefined
            || props.onSelectionMouseMode(true)
          if (enabled) {
            selectionPending.current = {
              surface: surface.kind, map: surface.map, anchor: surface.position, focus: surface.position,
            }
            setScreenSelection(undefined)
            return
          }
        }
        setScreenSelection(undefined)
        dispatchPointerAction(terminalInput.column, terminalInput.row)
      }
      return
    }
    if (terminalInput.kind !== 'input') return
    if (terminalInput.truncated === true) setNotice(tuiMessage(locale, 'input.paste.truncated'))
    const { input, key } = terminalInput
    const standaloneEscape = input === ''
      && key.escape === true
      && key.ctrl !== true
      && key.meta !== true
      && key.shift !== true
      && key.super !== true
      && key.hyper !== true
    if (standaloneEscape) {
      if (doubleEscapeRewindAvailable) {
        const transition = consumeTuiDoubleEscape(Date.now(), lastEscapeAt.current)
        lastEscapeAt.current = transition.lastEscapeAt
        if (transition.triggered) executeLocalCommand('/rewind')
        return
      }
      lastEscapeAt.current = undefined
    } else {
      lastEscapeAt.current = undefined
    }
    const globalAction = matchAction('Global', input, key)
    if (globalAction === 'app.interrupt') {
      if (interaction !== undefined) cancelInteraction()
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
      else if (doctorVisible) {
        props.onCloseDoctor()
      }
      else if (loadedContextVisible) {
        props.onCloseLoadedContext()
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
    if (doctorVisible) {
      const action = matchAction('Dialog', input, key)
      if (action === 'dialog.previous') setDoctorOffset(previous => Math.max(0, previous - 1))
      else if (action === 'dialog.next') {
        setDoctorOffset(previous => Math.min(Math.max(0, doctorLines.length - doctorBodyRows), previous + 1))
      } else if (action === 'dialog.previousPage') {
        setDoctorOffset(previous => Math.max(0, previous - doctorBodyRows))
      } else if (action === 'dialog.nextPage') {
        setDoctorOffset(previous => Math.min(
          Math.max(0, doctorLines.length - doctorBodyRows), previous + doctorBodyRows,
        ))
      } else if (action === 'dialog.cancel') props.onCloseDoctor()
      return
    }
    if (loadedContextVisible) {
      const action = matchAction('Dialog', input, key)
      if (action === 'dialog.previous') setLoadedContextOffset(previous => Math.max(0, previous - 1))
      else if (action === 'dialog.next') {
        setLoadedContextOffset(previous => Math.min(
          Math.max(0, loadedContextLines.length - loadedContextBodyRows), previous + 1,
        ))
      } else if (action === 'dialog.previousPage') {
        setLoadedContextOffset(previous => Math.max(0, previous - loadedContextBodyRows))
      } else if (action === 'dialog.nextPage') {
        setLoadedContextOffset(previous => Math.min(
          Math.max(0, loadedContextLines.length - loadedContextBodyRows), previous + loadedContextBodyRows,
        ))
      } else if (action === 'dialog.cancel') props.onCloseLoadedContext()
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
        void props.onExportSession(exportDirectory.text, exportDescendants, sessionExportDialog.format)
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
        const activeDraft = hasComposerDraft && composer.text.trim() !== '/rewind'
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
        if (candidate === undefined) setRewindError(tuiMessage(locale, 'rewind.turn.none'))
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
      if (narrowResume && (key.leftArrow || key.rightArrow)) {
        setResumeView(previous => previous === 'list' ? 'preview' : 'list')
        setResumeError('')
      } else if (key.tab) {
        setResumeScope(previous => previous === 'workspace' ? 'all' : 'workspace')
        setResumeQuery('')
        setResumeSelection(0)
        setResumeView('list')
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
        if (resumeDialog.phase === 'loading') setResumeError(tuiMessage(locale, 'resume.loading.pending'))
        else {
          const candidate = resumeCandidates[effectiveResumeSelection]
          if (candidate === undefined) setResumeError(tuiMessage(locale, 'resume.search.none.current'))
          else activateResumeCandidate(candidate)
        }
      } else if (key.backspace) {
        setResumeQuery(previous => deleteComposerText(createComposerState(previous), 'backward').text)
        setResumeSelection(0)
        setResumeView('list')
        setResumeError('')
      } else if (input !== '' && acceptsCommittedText(key)) {
        setResumeQuery(previous => insertComposerText(createComposerState(previous), input).text)
        setResumeSelection(0)
        setResumeView('list')
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
        const copyText = screenSelection?.surface === 'detail'
          ? tuiScreenSelectionText(screenSelection.map, screenSelection.range)
          : footerDetailItem === undefined && focusedTarget !== undefined
            ? tuiTranscriptDetailText(focusedTarget.node, focusedTarget.child)
            : footerDetailItem?.detailLines.join('\n') ?? ''
        const result = props.onCopy(copyText)
        setNotice(result.ok
          ? tuiMessage(locale, 'clipboard.detail.copied')
          : result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
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
        if (screenSelection?.surface === 'detail') setScreenSelection(undefined)
        else if (footerDetail !== undefined) setFooterDetail(undefined)
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
        const copyText = (screenSelection?.surface === 'transcript' || screenSelection?.surface === 'tasks')
          ? tuiScreenSelectionText(screenSelection.map, screenSelection.range)
          : focusedTarget === undefined
            ? ''
            : tuiTranscriptDetailText(focusedTarget.node, focusedTarget.child)
        const result = props.onCopy(copyText)
        setNotice(result.ok
          ? tuiMessage(locale, 'clipboard.transcript.copied')
          : result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
        return
      }
      if (action === 'transcript.previous' || action === 'transcript.next') {
        const next = action === 'transcript.previous'
          ? Math.max(0, focusedIndex - 1)
          : Math.min(focusTargets.length - 1, focusedIndex + 1)
        const target = focusTargets[next]
        if (target !== undefined) focusTranscriptTarget(target, next)
        return
      }
      if (action === 'transcript.inspect') {
        if (focusedTarget !== undefined) setFocus({
          mode: 'detail', focusedKey: focusedTarget.key, focusedIndex, detailOffset: 0,
        })
        return
      }
      if (action === 'transcript.close') {
        if (screenSelection?.surface === 'transcript' || screenSelection?.surface === 'tasks') setScreenSelection(undefined)
        else setFocus(undefined)
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
            original, restored.text, restored.cursor, 'history', Date.now(), restored.references, restored.attachments,
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
    if (interaction === undefined && focus === undefined && composerAction === 'composer.externalEditor') {
      openExternalEditor()
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.clipboardPaste') {
      pasteFromClipboard()
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
    if (inputContext === 'Composer' && props.view.kind === 'root'
      && key.meta === true && key.upArrow === true && key.shift !== true
      && !hasComposerDraft && suggestion === undefined) {
      reclaimPendingInput()
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
        activateSuggestion()
        return
      }
      if (action === 'suggestion.dismiss') {
        if (suggestionKey !== undefined) setSuggestionOverride({ key: suggestionKey, state: suggestion, dismissed: true })
        return
      }
    }
    const delivery = resolveTuiComposerDelivery({
      rootView: props.view.kind === 'root',
      running: agentStatus === 'running',
      hasDraft: hasComposerDraft,
      suggestionVisible: suggestion !== undefined,
      key,
    })
    if (delivery !== undefined) {
      submitComposer(delivery)
      return
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
    if (interaction === undefined && composer.text === '' && (composer.attachments?.length ?? 0) === 0
      && (composerAction === 'composer.transcriptOldest' || composerAction === 'composer.transcriptLatest')) {
      setTranscriptAnchor(composerAction === 'composer.transcriptOldest'
        ? transcriptScroll.oldest()
        : transcriptScroll.latest())
      return
    }
    if (composerAction === 'composer.cancel' || (inputContext === 'Dialog'
      && matchAction('Dialog', input, key) === 'dialog.cancel')) {
      if (interaction !== undefined) cancelInteraction()
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
      else submitComposer(props.view.kind === 'root' && agentStatus === 'running' ? 'steer' : 'followup')
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
      updateComposer(previous => previous.text === '' && previous.attachments?.length
        ? removeLastComposerImageAttachment(previous)
        : deleteComposerText(
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
  }, props.initialTerminalInput, !externalEditorActive)

  const sessionLabel = props.agent.id.length > 24 ? `${props.agent.id.slice(0, 21)}…` : props.agent.id
  const viewLabel = props.view.kind === 'root'
    ? tuiMessage(locale, 'common.root')
    : tuiMessage(locale, 'common.agent', { label: props.view.label })
  const inputTarget = props.view.acceptsInput
    ? tuiMessage(locale, 'common.target', { label: props.view.label })
    : tuiMessage(locale, 'common.readonly')
  const compactTerminal = columns < 60
  const compactStatusMetadata = modelMetadata.length > 24 ? `${modelMetadata.slice(0, 21)}…` : modelMetadata
  const sessionMetadata = columns < 120 ? '' : ` · ${terminalSafe(sessionLabel)}`
  const activityMetadata = compactTerminal
    ? `${terminalSafe(viewLabel)} · ${terminalSafe(inputTarget)}${compactStatusMetadata === '' ? '' : ` · ${terminalSafe(compactStatusMetadata)}`}`
    : `${terminalSafe(viewLabel)} · ${terminalSafe(inputTarget)}${modelMetadata === '' ? '' : ` · ${terminalSafe(modelMetadata)}`}${sessionMetadata}`
  const suggestionPanel = !helpVisible && interaction === undefined && focus === undefined && suggestion !== undefined
    ? <Box flexDirection="column" paddingX={2} flexShrink={0}>
      {suggestion.status === 'loading' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{tuiMessage(locale, 'suggestion.searching')}</Text>}
      {suggestion.status === 'empty' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{suggestion.kind === 'path' ? tuiMessage(locale, 'suggestion.empty.paths') : tuiMessage(locale, 'suggestion.empty.commands')}</Text>}
      {visibleSuggestions.map((item, index) => <Text key={item.id} wrap="truncate-end">
        <Text {...item.disabledReason !== undefined
          ? tuiTextStyle(theme.tokens.muted)
          : suggestion.visibleStart + index === suggestion.selectedIndex
            ? tuiTextStyle(theme.tokens.selection)
            : {}}>
          {suggestion.visibleStart + index === suggestion.selectedIndex ? '› ' : '  '}{item.label}
        </Text>{item.detail === undefined ? '' : ` ${item.detail}`} · {item.description}
        {item.disabledReason === undefined ? '' : ` · ${tuiMessage(locale, 'suggestion.unavailable', {
          reason: item.disabledReason,
        })}`}
      </Text>)}
      {suggestion.items.length > visibleSuggestions.length && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
        {tuiMessage(locale, 'suggestion.showing', {
          start: suggestion.visibleStart + 1,
          end: suggestion.visibleStart + visibleSuggestions.length,
          total: suggestion.items.length,
        })}
      </Text>}
      {suggestion.status === 'truncated' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
        {suggestion.items.length === 0 ? tuiMessage(locale, 'suggestion.search.limit') : tuiMessage(locale, 'suggestion.paths.omitted')}
      </Text>}
    </Box>
    : undefined
  const cursorPrefix = sessionExportDialog?.phase === 'selecting'
    ? `${tuiMessage(locale, 'composer.path')} › `
    : resumeDialog !== undefined || freshSessionDialog !== undefined
      || rewindDialog !== undefined || sessionExportDialog !== undefined
      || (pluginHubDialog !== undefined && interaction === undefined)
      || helpVisible || doctorVisible || loadedContextVisible || footerSelection !== undefined || footerDetail !== undefined || workOpen
      ? undefined
      : question !== undefined
        ? '> '
        : transcriptSearch !== undefined && interaction === undefined
          ? `${tuiMessage(locale, 'composer.find')} › `
          : historySearch !== undefined
            ? `${tuiMessage(locale, 'composer.search')} › `
            : interaction === undefined && focus === undefined && props.view.acceptsInput
              ? `${tuiMessage(locale, props.view.kind === 'child'
                ? 'composer.followup'
                : agentStatus === 'running' ? 'composer.steer' : 'composer.prompt')} › `
              : undefined
  props.onInputCursor(fullscreenScene !== undefined || doctorVisible || loadedContextVisible
    ? undefined
    : pluginHubDialog !== undefined && interaction === undefined
      ? pluginHubDialog.view === 'discover' && !pluginHubDetailOpen && !pluginHubPlanOpen
        && (pluginHubDialog.phase === 'browse' || pluginHubDialog.phase === 'loading')
        ? tuiPluginHubQueryCursor(pluginHubQuery, columns)
        : undefined
      : cursorPrefix === undefined ? undefined : inputCursorTarget(
        stdout,
        cursorPrefix,
        composerLayout,
        startupSurface ? startupFrame : undefined,
        2 + (question === undefined ? 0 : 1) + (attachmentLine === undefined ? 0 : 1),
      ))

  const runningDeliveryHint = props.view.kind === 'root'
    && agentStatus === 'running'
    && hasComposerDraft
    && interaction === undefined
    && focus === undefined
    && suggestion === undefined
    ? tuiMessage(locale, 'status.running.delivery')
    : undefined

  if (fullscreenScene !== undefined) {
    const frame = fullscreenFrame ?? {
      title: fullscreenScene.id, lines: [], footer: tuiMessage(locale, 'common.esc.close'),
    }
    return <TuiPane title={frame.title} titleTone="default" height={stdout.rows}>
      <TuiScrollablePanel framed marginX={1} paddingX={1}>
        {frame.lines.map((line, index) => <Text key={`${index}:${line}`} wrap="truncate-end">{line}</Text>)}
      </TuiScrollablePanel>
      <TuiSection paddingX={2} height={1}>
        <TuiHintLine>{frame.footer ?? tuiMessage(locale, 'common.esc.close')}</TuiHintLine>
      </TuiSection>
    </TuiPane>
  }

  if (doctorVisible) {
    return <TuiPane title={tuiMessage(locale, 'pane.doctor')} titleTone="default" height={stdout.rows}>
      <TuiScrollablePanel
        framed
        marginX={1}
        paddingX={1}
      >
        {doctorLines.slice(visibleDoctorOffset, visibleDoctorOffset + doctorBodyRows).map(line => <Text
          key={line.key}
          bold={line.kind === 'summary'}
          {...tuiTextStyle(diagnosticLineColor(theme, line))}
          wrap="truncate-end"
        >{line.text}</Text>)}
      </TuiScrollablePanel>
      <TuiSection paddingX={2} height={2}>
        <TuiHintLine>
          {doctorLines.length === 0 ? 0 : visibleDoctorOffset + 1}–{Math.min(
            visibleDoctorOffset + doctorBodyRows, doctorLines.length,
          )} / {doctorLines.length}
        </TuiHintLine>
        <TuiHintLine>{tuiMessage(locale, 'common.updown')} · {tuiMessage(locale, 'common.page')} · {tuiMessage(locale, 'common.esc.close')}</TuiHintLine>
      </TuiSection>
    </TuiPane>
  }

  if (loadedContextVisible) {
    return <TuiPane title={tuiMessage(locale, 'pane.context')} titleTone="default" height={stdout.rows}>
      <TuiScrollablePanel framed marginX={1} paddingX={1}>
        {loadedContextLines.slice(visibleLoadedContextOffset, visibleLoadedContextOffset + loadedContextBodyRows).map(line => <Text
          key={line.key}
          wrap="truncate-end"
        >{line.text}</Text>)}
      </TuiScrollablePanel>
      <TuiSection paddingX={2} height={2}>
        <TuiHintLine>
          {loadedContextLines.length === 0 ? 0 : visibleLoadedContextOffset + 1}–{Math.min(
            visibleLoadedContextOffset + loadedContextBodyRows, loadedContextLines.length,
          )} / {loadedContextLines.length}
        </TuiHintLine>
        <TuiHintLine>{tuiMessage(locale, 'common.updown')} · {tuiMessage(locale, 'common.page')} · {tuiMessage(locale, 'common.esc.close')}</TuiHintLine>
      </TuiSection>
    </TuiPane>
  }

  if (startupSurface) {
    return <Box flexDirection="column" height={stdout.rows} width="100%">
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" overflow="hidden">
        <Box flexDirection="column" alignItems="center" marginBottom={1} flexShrink={0}>
          <TuiStartupLogo variant={startupFrame.logo} />
          <TuiHintLine subtle>{tuiMessage(locale, 'startup.prompt')}</TuiHintLine>
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
              {index === 0 && <Text {...tuiTextStyle(theme.tokens.success)}>{tuiMessage(locale, 'composer.prompt')} › </Text>}
              {index === 0 ? '' : '  '}{line === '' && composer.text === '' && index === 0
                ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{tuiMessage(locale, 'startup.placeholder')}</Text>
                : line}
            </Text>)}
            {attachmentLine !== undefined && <Text wrap="truncate-end" {...tuiTextStyle(theme.tokens.accent)}>
              {tuiMessage(locale, 'common.attachments', { attachments: attachmentLine })}
            </Text>}
          </Box>
        </Box>
        <Box flexDirection="column" alignItems="center" width={startupFrame.width} flexShrink={0}>
          {startupGuidanceLines.map(line => <TuiHintLine
            key={line.key}
            tone={line.tone === 'success' ? 'success' : line.tone === 'warning' ? 'warning'
              : line.tone === 'info' ? 'accent' : 'muted'}
            bold={line.tone === 'warning'}
          >{line.text}</TuiHintLine>)}
        </Box>
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
    const detailWindow = tuiScrollableWindow(lines.length, pluginHubDetailOffset, pluginHubBodyRows)
    const searchVisible = pluginHubSearchVisible
    const title = confirmation
      ? tuiMessage(locale, 'plugin.title.confirm')
      : detail
        ? tuiMessage(locale, 'plugin.title.detail')
        : pluginHubDialog.view === 'installed'
          ? tuiMessage(locale, 'plugin.title.installed')
          : tuiMessage(locale, 'plugin.title.discover')
    const statusLine = pluginHubDialog.view === 'installed'
      ? tuiMessage(locale, 'plugin.status.profile', {
        revision: pluginHubDialog.installed?.profileRevision ?? tuiMessage(locale, 'common.loading'),
      })
      : tuiPluginHubCatalogLine(pluginHubDialog, locale)
    const working = pluginHubDialog.phase === 'loading' || pluginHubDialog.phase === 'detail-loading'
      ? tuiMessage(locale, 'plugin.working.loading')
      : pluginHubDialog.phase === 'planning'
        ? tuiMessage(locale, 'plugin.working.planning')
        : pluginHubDialog.phase === 'staging'
          ? tuiMessage(locale, 'plugin.working.staging')
          : pluginHubDialog.phase === 'handoff'
            ? tuiMessage(locale, 'plugin.working.handoff')
            : undefined
    const footer = pluginHubDialog.phase === 'handoff'
      ? tuiMessage(locale, 'plugin.footer.handoff')
      : pluginHubDialog.profileMutations === false && detail
        ? pluginHubDialog.detail.latestVersion?.installable === true
          ? tuiMessage(locale, 'plugin.footer.install', {
            command: `dsh plugin --profile tui add --save-exact ${pluginHubDialog.detail.packageName}@${pluginHubDialog.detail.latestVersion.version}`,
          })
          : tuiMessage(locale, 'plugin.footer.notInstallable')
        : pluginHubDialog.profileMutations === false && pluginHubDialog.view === 'installed'
          ? pluginHubInstalled === undefined
            ? tuiMessage(locale, 'plugin.footer.installed.external')
            : tuiMessage(locale, 'plugin.footer.remove', {
              command: `dsh plugin --profile tui remove ${pluginHubInstalled.packageName}`,
            })
          : confirmation
            ? tuiMessage(locale, 'plugin.footer.confirm')
            : detail
              ? pluginHubDialog.detail.latestVersion?.installable === true
                ? tuiMessage(locale, 'plugin.footer.detail.install')
                : tuiMessage(locale, 'plugin.footer.detail.unavailable')
              : pluginHubDialog.view === 'installed'
                ? tuiMessage(locale, 'plugin.footer.installed')
                : tuiMessage(locale, 'plugin.footer.discover')
    const progress = pluginHubDialog.progress
    return <TuiPane title={tuiMessage(locale, 'pane.plugins')} height={stdout.rows}>
      <TuiSection paddingX={2}>
        <Text>
          <Text {...pluginHubDialog.view === 'discover' ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)} bold={pluginHubDialog.view === 'discover'}>{tuiMessage(locale, 'plugin.view.discover')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
          <Text {...pluginHubDialog.view === 'installed' ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)} bold={pluginHubDialog.view === 'installed'}>{tuiMessage(locale, 'plugin.view.installed')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
          <Text bold>{title}</Text>
        </Text>
        <TuiHintLine>{statusLine}</TuiHintLine>
      </TuiSection>
      {searchVisible && <TuiSection framed direction="row" paddingX={1} marginX={1} height={3}>
        <Text {...tuiTextStyle(theme.tokens.selection)}>{tuiMessage(locale, 'composer.find')} › </Text><Text wrap="truncate-start">{terminalSafe(pluginHubQuery)}</Text>
      </TuiSection>}
      <TuiScrollablePanel paddingX={2}>
        {working !== undefined
          ? <TuiLoadingState
            message={terminalSafe(progress?.message ?? working)}
            completed={progress?.completed}
            total={progress?.total}
            columns={Math.max(1, columns - 4)}
          />
          : pluginHubDialog.phase === 'error'
            ? <TuiEmptyState
              tone="error"
              message={terminalSafe(pluginHubDialog.error ?? tuiMessage(locale, 'plugin.unavailable'))}
            />
            : detail || confirmation
              ? lines.slice(detailWindow.start, detailWindow.end).map((line, index) => <Text
                key={`${detailWindow.start + index}:${line.kind}:${line.text}`}
                {...tuiPluginHubDetailTextStyle(theme, line)}
                bold={line.kind === 'title' || line.kind === 'section'}
                wrap="truncate-end"
              >{line.text}</Text>)
              : pluginHubRows.length === 0
                ? <TuiEmptyState
                  tone="warning"
                  message={pluginHubDialog.view === 'installed'
                    ? tuiMessage(locale, 'plugin.empty.installed')
                    : tuiMessage(locale, 'plugin.empty.discover')}
                />
                : pluginHubRows.slice(pluginHubVisibleStart, pluginHubVisibleStart + pluginHubVisibleCount).map((row) => {
                  const layout = tuiPluginHubCardLayout(row, stdout.columns || 80, Date.now(), locale)
                  const trailingTone = row.verificationLevel === 'curated'
                    ? 'accent' as const
                    : row.installable ? 'success' as const : 'muted' as const
                  return <TuiListRow
                    key={row.id}
                    selected={row.selected}
                    height={layout.height}
                    title={layout.displayName}
                    trailing={layout.badges === '' ? undefined : layout.badges}
                    trailingTone={trailingTone}
                    description={layout.summary}
                    metadata={layout.metadata}
                  />
                })}
      </TuiScrollablePanel>
      <TuiSection height={2} paddingX={2}>
        <TuiHintLine>{footer}</TuiHintLine>
        {!detail && !confirmation && pluginHubDialog.view === 'discover' && pluginHubRows.length > 0
          && <TuiHintLine>
            {tuiMessage(locale, 'common.showing.range', {
              start: pluginHubVisibleStart + 1, end: pluginHubVisibleEnd,
            })}
            {pluginHubDialog.loadingMore
              ? tuiMessage(locale, 'plugin.loading.more')
              : pluginHubDialog.page?.nextCursor !== undefined ? tuiMessage(locale, 'plugin.more.available') : ''}
          </TuiHintLine>}
      </TuiSection>
    </TuiPane>
  }

  if (sessionExportDialog !== undefined && interaction === undefined) {
    const scope = sessionExportDialog.phase === 'exporting'
      ? sessionExportDialog.includeDescendants === true
      : exportDescendants
    return <TuiPane title={tuiMessage(locale, 'pane.export')} height={stdout.rows}>
      <TuiSection grow center paddingX={2} title={tuiMessage(locale, 'export.title')}>
        <TuiHintLine>{tuiMessage(locale, 'export.session', { session: sessionExportDialog.sessionId })}</TuiHintLine>
        <TuiHintLine>{tuiMessage(locale, 'export.workspace', { workspace: sessionExportDialog.workspaceLabel })}</TuiHintLine>
        <TuiHintLine>{tuiMessage(locale, 'export.format', {
          format: tuiMessage(locale, sessionExportDialog.format === 'markdown'
            ? 'export.format.markdown' : 'export.format.zip'),
        })}</TuiHintLine>
        {sessionExportDialog.phase === 'opening' && <Text>{tuiMessage(locale, 'export.settling')}</Text>}
        {sessionExportDialog.phase === 'selecting' && <>
          <Text>{tuiMessage(locale, 'export.scope')}<Text bold {...tuiTextStyle(theme.tokens.selection)}>
            {tuiMessage(locale, scope ? 'export.scope.descendants' : 'export.scope.current')}
          </Text></Text>
          <TuiHintLine>
            {tuiMessage(locale, 'export.scope.hint')}
          </TuiHintLine>
          {sessionExportDialog.error !== undefined && <Text {...tuiTextStyle(theme.tokens.error)} wrap="wrap">
            {terminalSafe(sessionExportDialog.error)}
          </Text>}
        </>}
        {sessionExportDialog.phase === 'exporting' && <>
          <TuiLoadingState message={sessionExportDialog.format === 'markdown'
            ? tuiMessage(locale, 'export.writing.markdown') : tuiMessage(locale, 'export.writing.zip')} />
          <TuiHintLine>{tuiMessage(locale, 'export.destination', {
            destination: sessionExportDialog.destination ?? '',
          })}</TuiHintLine>
          <TuiHintLine>{tuiMessage(locale, scope
            ? 'export.including.descendants' : 'export.including.current')}</TuiHintLine>
        </>}
      </TuiSection>
      {sessionExportDialog.phase === 'selecting' && <TuiSection framed paddingX={1}>
        {composerLayout.lines.map((line, index) => <Text key={`${index}:${line}`}>
          {index === 0 && <Text {...tuiTextStyle(theme.tokens.selection)}>{tuiMessage(locale, 'composer.path')} › </Text>}{index === 0 ? '' : '  '}{line}
        </Text>)}
      </TuiSection>}
      <TuiSection paddingX={1}>
        <TuiHintLine tone="default">{sessionExportDialog.phase === 'selecting'
          ? tuiMessage(locale, 'export.footer.selecting')
          : sessionExportDialog.phase === 'exporting'
            ? tuiMessage(locale, 'export.footer.exporting') : tuiMessage(locale, 'common.esc.close')}</TuiHintLine>
      </TuiSection>
    </TuiPane>
  }

  if (freshSessionDialog !== undefined && interaction === undefined) {
    const commandLabel = `/${freshSessionDialog.command}`
    return <TuiPane title={tuiMessage(locale, 'pane.fresh')} height={stdout.rows}>
      <TuiSection grow center paddingX={2}>
        <TuiSection framed tone="warning" title={tuiMessage(locale, 'fresh.title')}>
          <Text wrap="wrap">
            {tuiMessage(locale, 'fresh.description', { command: commandLabel })}
          </Text>
          <TuiHintLine>{tuiMessage(locale, 'fresh.current', { session: freshSessionDialog.currentSessionId })}</TuiHintLine>
          <TuiHintLine>{tuiMessage(locale, 'fresh.workspace', { workspace: freshSessionDialog.workspaceLabel })}</TuiHintLine>
          {freshSessionDialog.error !== undefined && <Text {...tuiTextStyle(theme.tokens.error)} wrap="wrap">
            {terminalSafe(freshSessionDialog.error)}
          </Text>}
          {freshSessionDialog.phase === 'creating'
            ? <TuiLoadingState message={tuiMessage(locale, 'fresh.creating')} />
            : <Text>{tuiMessage(locale, 'fresh.confirm')}</Text>}
        </TuiSection>
      </TuiSection>
    </TuiPane>
  }

  if (rewindDialog !== undefined && interaction === undefined
    && (rewindDialog.phase !== 'browsing' || rewindConfirmation !== undefined)) {
    const selected = rewindCandidates[effectiveRewindSelection]
    const position = selected === undefined ? 0 : effectiveRewindSelection + 1
    const activeDraft = hasComposerDraft && composer.text.trim() !== '/rewind'
    const effectiveError = rewindError || rewindDialog.error || ''
    return <TuiPane title={tuiMessage(locale, 'pane.rewind')} height={stdout.rows}>
      <TuiSection paddingX={2}>
        <Text bold>{rewindDialog.phase === 'opening'
          ? tuiMessage(locale, 'rewind.settling')
          : rewindDialog.phase === 'rewinding'
            ? tuiMessage(locale, 'rewind.creating', { event: String(rewindDialog.rewindingSeq ?? '') })
            : tuiMessage(locale, 'rewind.select', { position, total: rewindCandidates.length })}</Text>
        <TuiHintLine>{tuiMessage(locale, 'rewind.parent', { session: rewindDialog.currentSessionId })}</TuiHintLine>
      </TuiSection>
      <TuiScrollablePanel paddingX={2}>
        {rewindConfirmation !== undefined
          ? <TuiSection framed tone="warning" title={tuiMessage(locale, 'rewind.confirm.title')}>
            <Text wrap="truncate-end">{tuiMessage(locale, 'rewind.prompt', {
              prompt: rewindConfirmation.promptText.replace(/\s+/gu, ' '),
            })}</Text>
            <Text>{tuiMessage(locale, 'rewind.retain', { count: rewindConfirmation.retainedEventCount })}</Text>
            <Text>{tuiMessage(locale, 'rewind.hide', { count: rewindConfirmation.hiddenEventCount })}</Text>
            {activeDraft
              ? <>
                <Text>{tuiMessage(locale, 'rewind.stash')}</Text>
                <Text>{tuiMessage(locale, 'rewind.discard')}</Text>
                <Text>{tuiMessage(locale, 'rewind.cancel')}</Text>
              </>
              : <Text>{tuiMessage(locale, 'rewind.confirm')}</Text>}
          </TuiSection>
          : rewindDialog.phase === 'opening'
            ? <TuiLoadingState message={tuiMessage(locale, 'rewind.waiting')} />
            : <TuiLoadingState message={tuiMessage(locale, 'rewind.preparing')} />}
      </TuiScrollablePanel>
      <TuiSection height={2} paddingX={2}>
        {effectiveError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(effectiveError)}</Text>
          : <TuiHintLine>{rewindDialog.phase === 'browsing' && rewindConfirmation === undefined
            ? tuiMessage(locale, 'rewind.footer.browse')
            : rewindDialog.phase === 'rewinding'
              ? tuiMessage(locale, 'rewind.footer.cancel') : tuiMessage(locale, 'common.esc.close')}</TuiHintLine>}
      </TuiSection>
    </TuiPane>
  }

  if (resumeDialog !== undefined && interaction === undefined) {
    const inWorkspace = (resumeDialog.candidates ?? []).filter(candidate => candidate.currentWorkspace).length
    const position = selectedResumeCandidate === undefined ? 0 : effectiveResumeSelection + 1
    const effectiveError = resumeError || resumeDialog.error || ''
    const showResumePreviewPanel = resumeDialog.phase === 'ready'
      && resumePreviewVisible && selectedResumeCandidate !== undefined
    const showResumeListPanel = !showResumePreviewPanel || !narrowResume
    return <TuiPane title={tuiMessage(locale, 'pane.resume')} height={stdout.rows}>
      <TuiSection paddingX={2}>
        <Text bold>{resumeDialog.phase === 'loading'
          ? tuiMessage(locale, 'resume.loading')
          : resumeDialog.phase === 'resuming'
            ? tuiMessage(locale, 'resume.resuming', { session: resumeDialog.resumingId ?? '' })
            : tuiMessage(locale, 'resume.select', { position, total: resumeCandidates.length })}</Text>
        <Text>
          <Text {...resumeScope === 'workspace' ? tuiTextStyle(theme.tokens.selection) : {}} bold={resumeScope === 'workspace'}>
            {tuiMessage(locale, resumeScope === 'workspace'
              ? 'resume.scope.workspace.active' : 'resume.scope.workspace')}
          </Text>
          <Text> </Text>
          <Text {...resumeScope === 'all' ? tuiTextStyle(theme.tokens.selection) : {}} bold={resumeScope === 'all'}>
            {tuiMessage(locale, resumeScope === 'all' ? 'resume.scope.all.active' : 'resume.scope.all')}
          </Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · Tab</Text>
        </Text>
        <TuiHintLine>{resumeScope === 'workspace'
          ? `${terminalSafe(resumeDialog.currentWorkspaceLabel)} · ${tuiMessage(locale, 'resume.sessions', { count: inWorkspace })}`
          : tuiMessage(locale, 'resume.sessions', { count: resumeDialog.candidates?.length ?? 0 })}</TuiHintLine>
      </TuiSection>
      <TuiSection framed direction="row" paddingX={1} marginX={1}>
        <Text {...tuiTextStyle(theme.tokens.selection)}>{tuiMessage(locale, 'composer.find')} › </Text><Text>{terminalSafe(resumeQuery)}</Text>
      </TuiSection>
      {resumeConfirmation !== undefined
        ? <TuiScrollablePanel paddingX={2}>
          <TuiSection title={tuiMessage(locale, 'resume.unsaved.title')} tone="warning" paddingX={0}>
            <Text wrap="wrap">{tuiMessage(locale, 'resume.unsaved.description')}</Text>
            <Text>{tuiMessage(locale, 'resume.stash')}</Text>
            <Text>{tuiMessage(locale, 'resume.discard')}</Text>
            <Text>{tuiMessage(locale, 'resume.cancel')}</Text>
          </TuiSection>
        </TuiScrollablePanel>
        : resumeDialog.phase === 'loading'
          ? <TuiScrollablePanel paddingX={2}><TuiLoadingState message={tuiMessage(locale, 'resume.reading')} /></TuiScrollablePanel>
          : <Box flexDirection={showResumePreviewPanel && !narrowResume ? 'row' : 'column'} flexGrow={1} flexShrink={1} overflow="hidden">
            {showResumeListPanel && <Box
              width={showResumePreviewPanel && !narrowResume ? '55%' : undefined}
              flexGrow={1}
              flexShrink={1}
              overflow="hidden"
            >
              <TuiScrollablePanel paddingX={2}>
                {visibleResumeCandidates.length === 0
                  ? <TuiEmptyState tone="warning" message={tuiMessage(locale, 'resume.empty')} />
                  : visibleResumeCandidates.map((candidate, visibleIndex) => {
                    const index = resumeVisibleStart + visibleIndex
                    const active = index === effectiveResumeSelection
                    const status = [
                      candidate.record.header.id === props.agent.session.id ? tuiMessage(locale, 'common.current') : undefined,
                      candidate.record.live ? tuiMessage(locale, 'common.live') : undefined,
                      candidate.record.persisted ? tuiMessage(locale, 'common.persisted') : undefined,
                    ].filter((value): value is string => value !== undefined).join(' · ')
                    const detail = candidate.disabledReason === undefined
                      ? candidate.previewError === undefined ? undefined : tuiMessage(locale, 'resume.status.previewUnavailable', {
                        error: candidate.previewError,
                      })
                      : tuiMessage(locale, 'resume.status.unavailable', { reason: candidate.disabledReason })
                    return <TuiListRow
                      key={candidate.record.header.id}
                      selected={active}
                      height={resumeRowHeight}
                      title={terminalSafe(candidate.title)}
                      description={`${formatTuiRelativeTime(candidate.updatedAt, Date.now())} · ${terminalSafe(status)} · ${terminalSafe(candidate.record.header.id)}`}
                      metadata={resumeScope === 'all' ? terminalSafe(candidate.workspaceLabel) : undefined}
                      detail={detail}
                    />
                  })}
              </TuiScrollablePanel>
            </Box>}
            {showResumePreviewPanel && <Box
              width={narrowResume ? undefined : '45%'}
              flexGrow={1}
              flexShrink={1}
              overflow="hidden"
            >
              <TuiScrollablePanel framed paddingX={2} marginX={1}>
                <Text bold wrap="truncate-end">{terminalSafe(selectedResumeCandidate.title)}</Text>
                <TuiHintLine>
                  {terminalSafe(selectedResumeCandidate.workspaceLabel)} · {terminalSafe(selectedResumeCandidate.record.header.id)}
                </TuiHintLine>
                {selectedResumeCandidate.previewError !== undefined
                  ? <Text {...tuiTextStyle(theme.tokens.warning)} wrap="wrap">{tuiMessage(locale, 'resume.status.previewUnavailable', {
                    error: selectedResumeCandidate.previewError,
                  })}</Text>
                  : selectedResumeCandidate.preview.length === 0
                    ? <TuiEmptyState message={tuiMessage(locale, 'resume.preview.empty')} />
                    : selectedResumeCandidate.preview.map(line => <Text key={`${line.seq}:${line.kind}`} wrap="wrap">
                      <Text bold {...tuiTextStyle(line.kind === 'human'
                        ? theme.tokens.selection : line.kind === 'assistant' ? theme.tokens.accent : theme.tokens.muted)}>
                        {tuiMessage(locale, line.kind === 'human' ? 'common.you'
                          : line.kind === 'assistant' ? 'common.assistant' : 'common.tool')}
                      </Text>{' '}{terminalSafe(line.text)}
                    </Text>)}
                {selectedResumeCandidate.previewTruncated && <TuiHintLine>{tuiMessage(locale, 'resume.preview.omitted')}</TuiHintLine>}
              </TuiScrollablePanel>
            </Box>}
          </Box>}
      <TuiSection height={2} paddingX={2}>
        {effectiveError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(effectiveError)}</Text>
          : <TuiHintLine>{resumeDialog.phase === 'resuming'
            ? tuiMessage(locale, 'resume.footer.cancel')
            : narrowResume
              ? tuiMessage(locale, 'resume.footer.narrow', {
                direction: tuiMessage(locale, resumeView === 'list'
                  ? 'resume.direction.preview' : 'resume.direction.list'),
              })
              : tuiMessage(locale, 'resume.footer.wide')}</TuiHintLine>}
        {resumeCandidates.length > resumeVisibleCount && <TuiHintLine>
          {tuiMessage(locale, 'common.showing', {
            start: resumeVisibleStart + 1,
            end: resumeVisibleStart + visibleResumeCandidates.length,
            total: resumeCandidates.length,
          })}
        </TuiHintLine>}
      </TuiSection>
    </TuiPane>
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
        selectionMap={screenSelection?.surface === 'transcript' && screenSelection.map === transcriptScreenMap
          ? transcriptScreenMap : undefined}
        selection={screenSelection?.surface === 'transcript' && screenSelection.map === transcriptScreenMap
          ? screenSelection.range : undefined}
      />}
    </Box>
    {!helpVisible && detailHeight > 0 && (footerDetailItem !== undefined || focusedTarget !== undefined) && <TuiScrollablePanel
      height={detailHeight}
      paddingX={1}
    >
      <TuiSection framed title={terminalSafe(footerDetailItem === undefined
        ? focusedTarget?.label ?? tuiMessage(locale, 'common.detail')
        : `${tuiMessage(locale, 'common.status')} · ${footerDetailItem.label}`)}>
        {detailVisibleLines
          .map((line, index) => <React.Fragment key={`${detailOffset + index}:${line}`}>
            {detailLineView(
              theme,
              line,
              screenSelection?.map === detailScreenMap ? detailScreenMap : undefined,
              index,
              screenSelection?.map === detailScreenMap ? screenSelection?.range : undefined,
            )}
          </React.Fragment>)}
        <TuiHintLine>
          {detailLines.length === 0 ? 0 : detailOffset + 1}–{Math.min(
            detailOffset + detailRows, detailLines.length,
          )} / {detailLines.length}
        </TuiHintLine>
      </TuiSection>
    </TuiScrollablePanel>}
    {!helpVisible && !workOpen && currentTodo !== undefined && <Box paddingX={1} flexShrink={0}>
      <TodoPanel
        node={currentTodo}
        focused={(focus?.mode === 'browse' && focusedTarget?.node === currentTodo)
          || transcriptSearchHit?.key === currentTodo.key}
        emphasized={emphasizedTodos}
        selectionMap={screenSelection?.surface === 'tasks' && screenSelection.map === tasksScreenMap
          ? tasksScreenMap : undefined}
        selection={screenSelection?.surface === 'tasks' && screenSelection.map === tasksScreenMap
          ? screenSelection.range : undefined}
      />
    </Box>}
    {helpVisible && <TuiScrollablePanel
      height={helpHeight}
      paddingX={1}
    >
      <TuiSection framed title={tuiMessage(locale, 'pane.help')}>
        {helpLines.slice(visibleHelpOffset, visibleHelpOffset + helpBodyRows).map(line => <Text
          key={line.key}
          bold={line.kind === 'heading' || line.kind === 'binding'}
          {...tuiTextStyle(line.kind === 'description' ? theme.tokens.muted : theme.tokens.text)}
          dimColor={theme.dim && line.kind === 'description'}
          wrap="truncate-end"
        >{line.text}</Text>)}
        <TuiHintLine>{helpLines.length === 0 ? 0 : visibleHelpOffset + 1}–{Math.min(
          visibleHelpOffset + helpBodyRows, helpLines.length,
        )} / {helpLines.length}</TuiHintLine>
      </TuiSection>
    </TuiScrollablePanel>}
    {interaction?.kind === 'approval' && <TuiSection
      framed
      tone="permission"
      height={approvalHeight}
      paddingX={1}
      title={tuiMessage(locale, 'approval.title', { tool: interaction.request.toolName })}
    >
      {interaction.request.reason !== undefined && <Text wrap="truncate-end">{terminalSafe(interaction.request.reason)}</Text>}
      <TuiScrollablePanel height={approvalBodyRows} paddingX={0}>
        {approvalLines.slice(visibleApprovalOffset, visibleApprovalOffset + approvalBodyRows).map((line, index) => <Text
          key={`${visibleApprovalOffset + index}:${line}`}
          {...tuiTextStyle(line.startsWith('+ ') ? theme.tokens.diffAdd
            : line.startsWith('- ') ? theme.tokens.diffDelete : theme.tokens.text)}
          wrap="truncate-end"
        >{line}</Text>)}
      </TuiScrollablePanel>
      <TuiHintLine subtle>
        {approvalLines.length === 0
          ? tuiMessage(locale, 'approval.none')
          : tuiMessage(locale, 'approval.details', {
            start: visibleApprovalOffset + 1,
            end: Math.min(visibleApprovalOffset + approvalBodyRows, approvalLines.length),
            total: approvalLines.length,
          })}
      </TuiHintLine>
      <TuiHintLine subtle>{tuiMessage(locale, 'approval.actions')}</TuiHintLine>
    </TuiSection>}
    {question !== undefined && <TuiSection
      framed
      tone="permission"
      paddingX={1}
      title={terminalSafe(question.header ?? tuiMessage(locale, 'common.question', {
        current: questionIndex + 1,
        total: interaction?.kind === 'question' ? interaction.request.questions.length : 1,
      }))}
    >
      <Text>{terminalSafe(question.question)}</Text>
      {question.detail !== undefined && <TuiHintLine subtle>{terminalSafe(question.detail)}</TuiHintLine>}
      {visibleOptions.map((option, index) => <TuiListRow
        key={`${question.id}:${optionStart + index}`}
        selected={optionStart + index === questionCursor}
        height={1}
        title={<>{optionStart + index + 1}. {terminalSafe(option.label)}
          {option.description === undefined ? '' : ` — ${terminalSafe(option.description)}`}</>}
      />)}
      {questionOptions.length > optionLimit && <TuiHintLine subtle>
        {tuiMessage(locale, 'question.showing', {
          start: optionStart + 1, end: optionStart + visibleOptions.length, total: questionOptions.length,
        })}
      </TuiHintLine>}
      {composerLayout.lines.map((line, index) => <Text key={`${index}:${line}`}>
        {index === 0 ? '> ' : '  '}{line}
      </Text>)}
      {attachmentLine !== undefined && <Text wrap="truncate-end" {...tuiTextStyle(theme.tokens.accent)}>
        {tuiMessage(locale, 'common.attachments', { attachments: attachmentLine })}
      </Text>}
    </TuiSection>}
    {suggestionPanel}
    {!helpVisible && historySearch !== undefined && <Box paddingX={2} flexShrink={0}>
      <Text wrap="truncate-end" {...tuiTextStyle(historyMatch?.match === undefined ? theme.tokens.muted : theme.tokens.text)} dimColor={theme.dim && historyMatch?.match === undefined}>
        {historyMatch?.match === undefined
          ? tuiMessage(locale, 'history.none')
          : tuiMessage(locale, 'history.match', {
            position: historyMatch.position,
            count: historyMatch.count,
            text: historyMatch.match.split('\n')[0] ?? '',
          })}
      </Text>
    </Box>}
    {!helpVisible && interaction === undefined && transcriptSearch !== undefined && <Box paddingX={2} flexShrink={0}>
      <Text wrap="truncate-end" {...tuiTextStyle(transcriptSearchHit === undefined ? theme.tokens.muted : theme.tokens.text)} dimColor={theme.dim && transcriptSearchHit === undefined}>
        {transcriptSearchHit === undefined
          ? tuiMessage(locale, 'transcript.none', { query: JSON.stringify(transcriptSearch.query) })
          : <>
            {tuiMessage(locale, 'transcript.match', {
              position: transcriptSearchSelectedIndex + 1, count: transcriptSearchHits.length,
            })} · <TuiTranscriptSearchText
              text={transcriptSearchHit.text}
              query={transcriptSearch.query}
            />
          </>}
      </Text>
    </Box>}
    {!helpVisible && stashedDraft !== undefined && <Box paddingX={2} flexShrink={0}>
      <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{tuiMessage(locale, 'draft.stashed')}</Text>
    </Box>}
    <TuiSection paddingX={2} height={1}>
      {agentStatus === 'running'
        ? <Text wrap="truncate-end">
          <Text bold {...tuiTextStyle(theme.tokens.warning)}>{tuiWorkingFrame(workingFrameTick)} {tuiMessage(locale, 'common.working')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · {tuiMessage(locale, 'common.esc.stop')} · {activityMetadata}</Text>
        </Text>
        : <Text wrap="truncate-end">
          <Text bold {...tuiTextStyle(theme.tokens.success)}>{tuiMessage(locale, 'common.ready')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · {activityMetadata}</Text>
        </Text>}
    </TuiSection>
    {!helpVisible && !workOpen && interaction === undefined && rewindDialog === undefined
      && (props.view.acceptsInput
        ? <TuiSection framed tone={agentStatus === 'running' ? 'warning' : 'success'} paddingX={1}>
          <Box flexDirection="column">
            {composerLayout.lines.map((line, index) => <Text key={`${index}:${line}`}>
              {index === 0 && <Text {...tuiTextStyle(transcriptSearch !== undefined || historySearch !== undefined ? theme.tokens.selection : agentStatus === 'running' ? theme.tokens.warning : theme.tokens.success)}>
                {tuiMessage(locale, transcriptSearch !== undefined ? 'composer.find'
                  : historySearch !== undefined ? 'composer.search'
                    : props.view.kind === 'child' ? 'composer.followup'
                      : agentStatus === 'running' ? 'composer.steer' : 'composer.prompt')} › </Text>}
              {index === 0 ? '' : '  '}{line}
            </Text>)}
            {attachmentLine !== undefined && <Text wrap="truncate-end" {...tuiTextStyle(theme.tokens.accent)}>
              {tuiMessage(locale, 'common.attachments', { attachments: attachmentLine })}
            </Text>}
          </Box>
        </TuiSection>
        : <TuiSection framed tone="warning" paddingX={1}>
          <TuiHintLine tone="warning">
            {tuiMessage(locale, 'composer.readonly', {
              reason: props.view.readOnlyReason ?? tuiMessage(locale, 'composer.readonly.default'),
            })}
          </TuiHintLine>
        </TuiSection>)}
    <TuiSection paddingX={1}>
      {extensionStatus.length > 0 && <Text wrap="truncate-end">{extensionStatus.join(' · ')}</Text>}
      {workOpen
        ? <Text {...tuiTextStyle(theme.tokens.selection)} bold wrap="truncate-end">
          {tuiMessage(locale, 'footer.work.title', {
            position: work.items.length === 0 ? '0/0' : `${effectiveWorkSelection + 1}/${work.items.length}`,
          })}
          {' · '}{tuiMessage(locale, 'footer.work.select')}
          {selectedWorkItem?.inspectable === true ? ` · ${tuiMessage(locale, 'footer.work.open')}` : ''}
          {selectedWorkItem?.action === undefined || selectedWorkItem.action === 'none'
            ? '' : ` · ${tuiMessage(locale, 'footer.work.stop')}`}
          {' · '}{tuiMessage(locale, 'common.esc.close')}
        </Text>
        : footerDetail !== undefined
          ? <Text {...tuiTextStyle(theme.tokens.selection)} wrap="truncate-end">{tuiMessage(locale, 'footer.detail')}</Text>
          : footerSelection !== undefined
            ? <Text {...tuiTextStyle(theme.tokens.selection)} bold wrap="truncate-end">{selectedFooterStatus}</Text>
            : notice !== ''
              ? <Text {...tuiTextStyle(theme.tokens.error)}>{notice}</Text>
              : externalNotice !== ''
                ? <Text {...tuiTextStyle(theme.tokens.warning)}>{terminalSafe(externalNotice)}</Text>
                : runningDeliveryHint !== undefined
                  ? <Text {...tuiTextStyle(theme.tokens.warning)} wrap="truncate-end">{runningDeliveryHint}</Text>
                  : rewindDialog?.phase === 'browsing'
                    ? <Text {...tuiTextStyle(theme.tokens.selection)} bold wrap="truncate-end">
                      {tuiMessage(locale, 'footer.rewind.title', {
                        position: rewindSelectedCandidate === undefined
                          ? '0/0' : `${effectiveRewindSelection + 1}/${rewindCandidates.length}`,
                      })}
                      {' · '}{rewindSelectedCandidate === undefined
                        ? tuiMessage(locale, 'footer.rewind.empty')
                        : tuiMessage(locale, 'footer.rewind.actions')}
                    </Text>
                    : <Text wrap="truncate-end">{helpVisible
                      ? tuiMessage(locale, 'footer.help')
                      : transcriptSearch !== undefined
                        ? tuiMessage(locale, 'footer.transcript.query', {
                          query: JSON.stringify(transcriptSearch.query),
                          match: transcriptSearchHit === undefined
                            ? tuiMessage(locale, 'footer.match.none')
                            : `${transcriptSearchSelectedIndex + 1}/${transcriptSearchHits.length}`,
                        })
                        : historySearch !== undefined
                          ? tuiMessage(locale, 'footer.history.query', {
                            query: JSON.stringify(historySearch.query),
                            match: historyMatch?.match === undefined
                              ? tuiMessage(locale, 'footer.match.none')
                              : `${historyMatch.position}/${historyMatch.count}`,
                          })
                          : focus?.mode === 'browse'
                            ? tuiMessage(locale, 'footer.browse')
                            : focus?.mode === 'detail'
                              ? tuiMessage(locale, 'footer.detail.close')
                              : footerStatus}</Text>}
    </TuiSection>
  </Box>
}
