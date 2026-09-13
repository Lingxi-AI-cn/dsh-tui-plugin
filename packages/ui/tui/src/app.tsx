/** Ink component tree for transcript, interactions, composer, and status. */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Text, useStdout } from 'ink'
import stringWidth from 'string-width'
import type {
  Agent, AgentPreset, ApprovalPresentation, AskUserQuestionAnswer, AskUserQuestionAnswerItem,
  CommandDescriptor, ContextBreakdownProjection, ContextPressureProjection,
  ImageAttachmentRef, ModelSelection, PermissionSelect, SessionStatsProjection, TokenUsageProjection,
  TuiGoalProjection, TuiPlanProjection,
  TuiDirectoryPickerCapability, TuiDirectoryListing,
} from './host.ts'
import {
  AgentStatusStore, InteractionStore, SessionEventStore, ValueStore, type PendingQuestion,
} from './store.ts'
import {
  navigateTuiTranscriptTurn, STRUCTURED_CHILD_LIMIT,
  tuiTranscriptTurnAnchors, TuiTranscriptProjectionCache, projectTuiAssistantStream,
} from './transcript.ts'
import { TodoPanel, todoPanelRows, todoPanelScreenMapLines } from './todo-panel.tsx'
import {
  TuiTranscriptSearchText, TuiTranscriptView,
  tuiTranscriptAssistantReaderActions, tuiTranscriptAssistantReaderHint, tuiTranscriptScreenMapLines,
} from './transcript-view.tsx'
import { TuiTranscriptDetailCache, tuiTranscriptDetailText } from './detail.ts'
import { toolStateMark, toolSummary } from './tool-card.tsx'
import { toolActivityActiveText, toolActivityHeadingText } from './tool-activity.tsx'
import { tuiAssistantResponseParts, tuiAssistantResponseText } from './assistant-response.ts'
import { terminalMarkdownText } from './markdown.ts'
import { terminalSafe } from './sanitize.ts'
import { tuiOsc8Text, tuiSafeHyperlinkUrl } from './hyperlink.ts'
import { tuiBidiVisualText } from './bidi.ts'
import type { InputCursorTarget } from './terminal-session.ts'
import {
  advanceTuiScreenClick, extendTuiScreenSelection, resolveTuiScreenSelection,
  tuiScreenSelectionText, tuiScreenTextSegments,
  type TuiScreenClick, type TuiScreenPosition, type TuiScreenSelection,
} from './selection.ts'
import { projectTuiScreenMap, type TuiScreenMap } from './screen-map.ts'
import {
  TuiTranscriptScrollController, TuiTranscriptViewportIndex, terminalWrappedLines,
  TuiTranscriptWheelBoundaryGuard, tuiTranscriptWindowEntryRows,
  type TranscriptWindowEntry, type TuiTranscriptViewportAnchor,
} from './viewport.ts'
import type { TranscriptNode, TranscriptToolNode } from './transcript.ts'
import {
  createComposerState, deleteComposerText, insertComposerPasteReference, insertComposerText,
  insertComposerClipboard, isLargeComposerPaste, layoutComposer, materializeComposerText, moveComposerCursor,
  redoComposerEdit, replaceComposerText, restoreTuiComposerDraft, toggleTuiComposerStash,
  addComposerImageAttachment, removeComposerImageAttachment, removeLastComposerImageAttachment,
  traverseComposerHistory, tuiComposerDraft, undoComposerEdit,
  type ComposerLayout, type ComposerState, type TuiComposerDraft, type TuiComposerImageAttachment,
} from './composer.ts'
import {
  cancelTuiHistorySearch, nextTuiHistorySearchMatch, startTuiHistorySearch, tuiHistorySearchResult,
  updateTuiHistorySearchQuery, type TuiHistorySearchState,
} from './history-search.ts'
import {
  acceptTuiSuggestion, commandSuggestionState, moveTuiSuggestion,
  visibleTuiSuggestions, type TuiSuggestionState,
} from './suggestion.ts'
import {
  tuiReferenceQuery, tuiReferenceSuggestionState, type TuiReferenceResolution,
} from './references.ts'
import { projectTuiGoalPlan, tuiGoalPlanMutationErrorMessage } from './goal-plan.ts'
import { formatTuiDeliverableDetailLines, tuiDeliverableInlineReferences } from './deliverables.ts'
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
import {
  projectTuiSessionManager,
  TUI_SESSION_MANAGER_QUERY_LIMIT,
  type TuiSessionArchiveFilter,
  type TuiSessionManagerPreferences,
  type TuiSessionScope,
  type TuiSessionSort,
  type TuiSessionManagerDialogSnapshot,
  type TuiSessionManagerRow,
  type TuiWorkspaceManagerRow,
} from './session-manager.ts'
import { projectTuiDirectoryBrowser, type TuiDirectoryBrowserPage } from './directory-browser.ts'
import {
  type TuiPresetCompositionPreview, type TuiPresetManagerSnapshot, type TuiPresetManagerRow,
  tuiPresetMutationErrorMessage, validateTuiPresetId, TuiPresetIdError,
} from './preset-manager.ts'
import type { TuiScheduleRow, TuiScheduleSnapshot } from './schedules.ts'
import {
  filterTuiHostPlugins, planTuiHostSettingsMutation, tuiHostSettingsErrorMessage,
  type TuiHostPluginCenterSnapshot,
  type TuiHostPluginRow, type TuiHostPluginFilter, type TuiHostPresetPluginGroup,
  type TuiHostSettingsMutation,
  type TuiHostSettingsRow,
} from './host-plugin-center.ts'
import {
  createTuiTrajectoryTimelineScale, formatTuiTrajectoryTimeline,
  type TuiTrajectoryEntry, type TuiTrajectorySnapshot,
  reconcileTuiTrajectorySelection, trajectoryKindLabel, formatTrajectoryDuration,
  trajectoryTimingFacts, visibleTuiTrajectoryEntries,
} from './trajectory.ts'
import {
  feedbackRatingLabel, findMessageFeedback,
  tuiMessageFeedbackErrorMessage,
  type TuiMessageFeedbackSnapshot, type TuiMessageFeedbackMutationState,
} from './message-feedback.ts'
import { formatRailEntry, parseTuiTerminalPathPaste, projectAttachmentRail } from './attachment-intake.ts'
import type { TuiFreshSessionDialogSnapshot } from './session-lifecycle.ts'
import type { TuiSessionExportDialogSnapshot, TuiSessionExportFormat } from './session-export.ts'
import type { TuiOutputExportKind, TuiOutputExportResult } from './output-export.ts'
import type { TuiRewindCandidate, TuiRewindDialogSnapshot } from './rewind.ts'
import type { TuiWorkItemView, TuiWorkSnapshot } from './work.ts'
import { TuiWorkPanel } from './work-panel.tsx'
import {
  tuiPluginHubCardHeight, tuiPluginHubCardLayout, tuiPluginHubCatalogLine, tuiPluginHubDetailLines,
  tuiPluginHubDiscoveryDetailLines, tuiPluginHubDiscoveryRows, tuiPluginHubDiscoveryUrl, tuiPluginHubInstalledRows,
  tuiPluginHubAvailableCategories, tuiPluginHubCategoryLabel, tuiPluginHubInstallableLabel,
  tuiPluginHubPlanLines, tuiPluginHubQueryCursor,
  tuiPluginHubRows, tuiPluginHubSortLabel,
  tuiPluginHubViewportRows,
  type TuiPluginHubDetailLine, type TuiPluginHubDialogSnapshot,
} from './plugin-hub.ts'
import type { PluginId } from '@lingxi-ai-cn/dsh-plugin-hub'
import { TuiAgentViewStateCache, type TuiAgentViewDescriptor } from './agent-view.ts'
import {
  tuiTerminalMouseReportKind, useTuiTerminalInput, type TuiTerminalInputEvent,
} from './terminal-input.ts'
import {
  TuiPointerRegionRegistry, tuiApprovalPointerRegions, tuiFooterPointerRegions,
  tuiPluginHubPointerRegions, tuiQuestionPointerRegions, tuiResumePointerRegions, tuiSuggestionPointerRegions,
  tuiHostPluginCenterPointerRegions, tuiAttachmentRailPointerRegions,
  tuiPresetManagerPointerRegions,
  tuiSchedulePointerRegions,
  tuiTrajectoryPointerRegions,
  tuiFeedbackPointerRegions,
  tuiActivityPointerRegions,
  tuiAssistantOutputPointerRegions,
  tuiDeliverableActionPointerRegions, tuiDeliverableInlinePointerRegions, tuiDeliverablesPointerRegions,
  tuiDialogFooterPointerRegions,
  tuiRewindCandidatePointerRegions,
  tuiProviderPointerRegions, tuiQueuePointerRegions, tuiSessionManagerPointerRegions, tuiWorkPointerRegions,
  tuiGoalPlanDialogPointerRegions, tuiGoalPlanPointerRegions,
  type TuiPointerFooterAction, type TuiPointerRegion,
} from './pointer.ts'
import {
  tuiBorderStyle, tuiTextStyle, useTuiTheme, type TuiActivityPreference, type TuiTheme,
} from './theme.tsx'
import { tuiCommandDescription, tuiMessage, useTuiLocale, type TuiLocale } from './locale.ts'
import { tuiGroupedCommandHelpLines } from './command-help.ts'
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
  TuiActionFooter, TuiEmptyState, TuiHintLine, TuiListRow, TuiLoadingState, TuiPane, TuiScrollablePanel,
  TuiSection, tuiScrollableWindow,
} from './design-system.tsx'
import { resolveTuiComposerDelivery, tuiRunningDeliveryHelpLines, type TuiSubmitMode } from './delivery.ts'
import { selectTuiReclaimableMessage, tuiReclaimMessageText } from './reclaim.ts'
import { projectTuiLatestSpeed, projectTuiSettledSpeed } from './live-feedback.ts'
import { consumeTuiDoubleEscape } from './double-escape.ts'
import type { TuiExternalEditorResult } from './external-editor.ts'
import type { TuiClipboardInsert } from './clipboard.ts'
import type { TuiExtensionRegistry, TuiKnownSessionEvent } from './extensions.ts'
import {
  canRemoveTuiProvider, formatTuiProviderModelDrafts, parseTuiProviderModelDrafts,
  TuiCustomProviderError, TuiProviderApiKeyError, TuiProviderEndpointError,
  TuiProviderProfileError, TuiProviderRemoveError,
  validateTuiProviderApiKey, validateTuiProviderEndpoint,
  type TuiCustomProviderDraft, type TuiCustomProviderModelDraft,
  type TuiProviderProfileDraft,
  type TuiProviderCenterDialogSnapshot, type TuiProviderCenterRow, type TuiProviderCreationTarget,
} from './provider-center.ts'
import {
  deleteTuiQueueItem, editTuiQueueItem, formatTuiQueueAge, readTuiQueue,
} from './queue.ts'

type TuiProviderWizardStep = 'id' | 'name' | 'endpoint' | 'protocol' | 'key' | 'models' | 'picker' | 'confirm'

interface TuiProviderWizardState {
  readonly target: TuiProviderCreationTarget
  readonly step: TuiProviderWizardStep
  readonly id: string
  readonly displayName: string
  readonly endpoint: string
  readonly protocolIndex: number
  readonly modelText: string
  readonly models: readonly TuiCustomProviderModelDraft[]
  readonly candidates: readonly TuiCustomProviderModelDraft[]
  readonly picked: ReadonlySet<string>
  readonly candidateIndex: number
  readonly error: string
}

type TuiProviderProfileField = 'displayName' | 'protocol' | 'models'

interface TuiProviderProfileEditorState {
  readonly providerId: string
  readonly field: TuiProviderProfileField
  readonly displayName: string
  readonly protocols: readonly string[]
  readonly protocolIndex: number
  readonly modelsText: string
  readonly error: string
}

interface TuiDirectoryBrowserState {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly listing?: TuiDirectoryListing
  readonly requestedPath?: string
  readonly selection: number
  readonly showHidden: boolean
  readonly error: string
}

export interface TuiAppProps {
  agent: Agent
  view: TuiAgentViewDescriptor
  events: SessionEventStore
  status: AgentStatusStore
  interactions: InteractionStore
  externalNotice: ValueStore<string>
  composerPrefill: ValueStore<{ readonly revision: number; readonly text: string } | undefined>
  modelSelection: ValueStore<ModelSelection | undefined>
  agentMode: ValueStore<AgentPreset | undefined>
  helpOpen: ValueStore<boolean>
  diagnostics: ValueStore<TuiDiagnosticSnapshot | undefined>
  loadedContext: ValueStore<TuiLoadedContextSnapshot | undefined>
  startupGuidance: ValueStore<TuiStartupGuidanceSnapshot | undefined>
  permissions: ValueStore<PermissionSelect | undefined>
  contextPressure: ValueStore<ContextPressureProjection | undefined>
  tokenUsage: ValueStore<TokenUsageProjection | undefined>
  contextBreakdown: ValueStore<ContextBreakdownProjection | undefined>
  sessionStats: ValueStore<SessionStatsProjection | undefined>
  goalProjection: ValueStore<TuiGoalProjection | null | undefined>
  planProjection: ValueStore<TuiPlanProjection | undefined>
  resumeDialog: ValueStore<TuiResumeDialogSnapshot | undefined>
  sessionManager: ValueStore<TuiSessionManagerDialogSnapshot | undefined>
  directoryPicker?: TuiDirectoryPickerCapability
  freshSessionDialog: ValueStore<TuiFreshSessionDialogSnapshot | undefined>
  rewindDialog: ValueStore<TuiRewindDialogSnapshot | undefined>
  sessionExportDialog: ValueStore<TuiSessionExportDialogSnapshot | undefined>
  pluginHubDialog: ValueStore<TuiPluginHubDialogSnapshot | undefined>
  providerCenter: ValueStore<TuiProviderCenterDialogSnapshot | undefined>
  work: ValueStore<TuiWorkSnapshot>
  extensions: TuiExtensionRegistry
  maxResumeOptions: number
  commands: readonly CommandDescriptor[]
  interactionRegistry: readonly TuiInteractionDescriptor[]
  /** Optional running-Agent activity animation selected by the user. */
  activityPreference: TuiActivityPreference
  completeReferences(query: string, signal: AbortSignal): Promise<TuiReferenceResolution>
  onAttachPath(path: string): Promise<ImageAttachmentRef>
  /** Resolve one terminal file-drag paste through image attachment and file-reference owners. */
  onTerminalPathPaste(paths: readonly string[]): Promise<TuiClipboardInsert | undefined>
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
  /** Open one filesystem path through the Host native launcher. */
  onOpenPath(path: string): Promise<void>
  /** False on a headless/remote Host where only copying the path is actionable. */
  pathOpenerAvailable: boolean
  onActivateFooter(itemId: TuiFooterItemId): Promise<void>
  onResume(candidate: TuiResumeCandidate): Promise<void>
  onResumeForRename(candidate: TuiResumeCandidate): Promise<void>
  onCloseResume(): void
  onCloseSessionManager(): void
  onRefreshSessionManager(): Promise<void>
  sessionManagerPreferences: TuiSessionManagerPreferences
  onUpdateSessionManagerPreferences(patch: Partial<TuiSessionManagerPreferences>): Promise<void>
  presetManager: ValueStore<TuiPresetManagerSnapshot | undefined>
  onClosePresetManager(): void
  onRefreshPresetManager(): Promise<void>
  schedules: ValueStore<TuiScheduleSnapshot>
  scheduleDialog: ValueStore<TuiScheduleSnapshot | undefined>
  onCloseScheduleDialog(): void
  hostPluginCenter: ValueStore<TuiHostPluginCenterSnapshot | undefined>
  onCloseHostPluginCenter(): void
  onRefreshHostPluginCenter(): Promise<void>
  onMutateHostSettings(mutation: TuiHostSettingsMutation): Promise<void>
  trajectory: ValueStore<TuiTrajectorySnapshot | undefined>
  onCloseTrajectory(): void
  onRefreshTrajectory(): void
  onLoadOlderTrajectory(): void
  messageFeedback: ValueStore<TuiMessageFeedbackSnapshot | undefined>
  feedbackMutation: ValueStore<TuiMessageFeedbackMutationState>
  onSubmitFeedback(messageId: string, rating: 'positive' | 'negative', note?: string): Promise<void>
  onClearFeedback(messageId: string): Promise<void>
  onRefreshFeedback(): Promise<void>
  onCopyPreset(sourceId: string, newId: string, displayName?: string): Promise<void>
  onDeletePreset(id: string): Promise<void>
  onSetDefaultPreset(id: string, expectedRevision: number | undefined): Promise<void>
  onReadPresetComposition(id: string): Promise<TuiPresetCompositionPreview>
  onOpenPresetFile(id: string): Promise<void>
  onOpenPresetLocation(id: string): Promise<void>
  onResumeManagedSession(candidate: TuiResumeCandidate): Promise<void>
  onForkManagedSession(candidate: TuiResumeCandidate): Promise<void>
  onRenameManagedSession(candidate: TuiResumeCandidate, title: string): Promise<void>
  onArchiveManagedSession(candidate: TuiResumeCandidate, archived: boolean): Promise<void>
  /** Newer Workspace owner capability; legacy owners keep archived Sessions read-only. */
  canUnarchiveManagedSessions?: boolean
  onCreateManagedWorkspace(path: string): Promise<void>
  onRenameManagedWorkspace(workspace: TuiWorkspaceManagerRow, title: string): Promise<void>
  onMoveManagedWorkspace(workspace: TuiWorkspaceManagerRow, direction: -1 | 1): Promise<void>
  onDeleteManagedWorkspace(workspace: TuiWorkspaceManagerRow): Promise<void>
  onEditGoal(objective: string): Promise<void>
  onPauseGoal(): Promise<void>
  onResumeGoal(): Promise<void>
  onClearGoal(): Promise<void>
  onExitPlan(): Promise<void>
  onConfirmFreshSession(): Promise<void>
  onCloseFreshSession(): void
  onRewind(candidate: TuiRewindCandidate): Promise<void>
  onCloseRewind(): void
  onExportSession(directory: string, includeDescendants: boolean, format: TuiSessionExportFormat): Promise<void>
  onCloseSessionExport(): void
  /** Export one complete assistant output without broadening `/export` Session scope. */
  onExportOutput(markdown: string, kind: TuiOutputExportKind): Promise<TuiOutputExportResult>
  onClosePluginHub(): void
  onPluginHubToggleView(targetView?: 'discover' | 'discovery' | 'installed'): Promise<void>
  onPluginHubSearch(query: string): Promise<void>
  onPluginHubDetail(pluginId: PluginId): Promise<void>
  onPluginHubDiscoveryDetail(repositoryId: string): void
  onPluginHubInstall(): Promise<void>
  onPluginHubRemove(packageName: string): Promise<void>
  onPluginHubConfirm(): Promise<void>
  onPluginHubRefresh(): Promise<void>
  onPluginHubLoadMore(): Promise<void>
  onPluginHubSort(): Promise<void>
  onPluginHubCategory(): Promise<void>
  onPluginHubInstallable(): Promise<void>
  onCloseProviderCenter(): void
  onRefreshProviderCenter(): Promise<void>
  onAuthenticateProvider(provider: string): Promise<void>
  onLogoutProvider(provider: string): Promise<void>
  onSaveProviderApiKey(provider: string, key: string): Promise<void>
  onSaveProviderEndpoint(provider: string, endpoint: string | undefined): Promise<void>
  onSaveProviderProfile(provider: string, draft: TuiProviderProfileDraft): Promise<void>
  onRemoveProvider(provider: string): Promise<void>
  onDiscoverCustomProviderModels(
    target: TuiProviderCreationTarget,
    draft: TuiCustomProviderDraft,
  ): Promise<readonly TuiCustomProviderModelDraft[]>
  onCreateCustomProvider(target: TuiProviderCreationTarget, draft: TuiCustomProviderDraft): Promise<void>
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

function providerAuthenticationLabel(row: TuiProviderCenterRow, locale: TuiLocale): string {
  const key = row.authentication === 'configured'
    ? 'provider.auth.configured'
    : row.authentication === 'sign-in-required'
      ? 'provider.auth.signIn'
      : row.authentication === 'credential-required'
        ? 'provider.auth.credential'
        : row.authentication === 'dormant'
          ? 'provider.auth.dormant'
          : 'provider.auth.unavailable'
  return tuiMessage(locale, key)
}

function providerIssueLabel(issue: TuiProviderCenterRow['issues'][number], locale: TuiLocale): string {
  if (issue === 'authentication-unavailable') return tuiMessage(locale, 'provider.issue.authentication')
  if (issue === 'models-unavailable') return tuiMessage(locale, 'provider.issue.models')
  if (issue === 'settings-unavailable') return tuiMessage(locale, 'provider.issue.settings')
  return tuiMessage(locale, 'provider.issue.credential')
}

function providerDetailLines(row: TuiProviderCenterRow, locale: TuiLocale): readonly string[] {
  const yes = tuiMessage(locale, 'provider.detail.yes')
  const no = tuiMessage(locale, 'provider.detail.no')
  const state = tuiMessage(locale, row.active ? 'provider.state.active' : 'provider.state.dormant')
  const custom = row.declared ? tuiMessage(locale, 'provider.detail.custom') : ''
  const lines = [
    tuiMessage(locale, 'provider.detail.identity', { name: row.name, id: row.id }),
    tuiMessage(locale, 'provider.detail.route', { state, custom }),
    tuiMessage(locale, 'provider.detail.authentication', { state: providerAuthenticationLabel(row, locale) }),
    ...(row.authenticationSource === undefined ? [] : [
      tuiMessage(locale, 'provider.detail.source', { source: row.authenticationSource }),
    ]),
    ...(row.authenticationMethods.length === 0 ? [] : [
      tuiMessage(locale, 'provider.detail.methods', {
        methods: row.authenticationMethods.map(method => method.name).join(', '),
      }),
    ]),
    ...(row.modelCount === undefined ? [] : [
      tuiMessage(locale, 'provider.detail.models', { count: row.modelCount }),
    ]),
  ]
  const settings = row.settings
  if (settings !== undefined) {
    const path = settings.path.length === 0 ? '/' : `/${settings.path.join('/')}`
    const access = settings.registered
      ? tuiMessage(locale, settings.writable ? 'provider.settings.writable' : 'provider.settings.readonly')
      : tuiMessage(locale, 'provider.settings.unregistered')
    lines.push(tuiMessage(locale, 'provider.detail.settings', {
      namespace: settings.namespace, path, access, applies: settings.applies ?? '?',
    }))
    lines.push(tuiMessage(locale, 'provider.detail.override', {
      state: settings.userOverride ? yes : no, revision: settings.revision ?? '?',
    }))
    if (settings.endpoint !== undefined) {
      lines.push(tuiMessage(locale, 'provider.detail.endpoint', { endpoint: settings.endpoint }))
    }
    if (settings.editable?.displayNameSupported) {
      lines.push(tuiMessage(locale, 'provider.detail.displayName', {
        value: settings.editable.displayName ?? row.id,
      }))
    }
    if (settings.editable?.protocolSupported) {
      lines.push(tuiMessage(locale, 'provider.detail.protocol', {
        value: settings.editable.protocol ?? tuiMessage(locale, 'provider.profile.inherited'),
      }))
    }
    if (settings.editable?.modelsSupported) {
      lines.push(tuiMessage(locale, 'provider.detail.modelTable', {
        value: settings.editable.models?.map(model => model.id).join(', ')
          || tuiMessage(locale, 'provider.profile.modelsEmpty'),
      }))
    }
    if (settings.credential !== undefined) {
      const credential = settings.credential
      lines.push(tuiMessage(locale, 'provider.detail.credential', {
        ref: credential.ref,
        configured: credential.configured ? yes : no,
        access: credential.writable
          ? tuiMessage(locale, 'provider.settings.writable')
          : tuiMessage(locale, 'provider.settings.readonly'),
        source: credential.source === undefined ? '' : tuiMessage(locale, 'provider.detail.credentialSource', {
          source: credential.source,
        }),
      }))
    }
  }
  if (row.issues.length > 0) {
    lines.push(tuiMessage(locale, 'provider.detail.issue', {
      issues: row.issues.map(issue => providerIssueLabel(issue, locale)).join(', '),
    }))
  }
  return Object.freeze(lines)
}

function createProviderWizard(target: TuiProviderCreationTarget): TuiProviderWizardState {
  return Object.freeze({
    target,
    step: 'id',
    id: '',
    displayName: '',
    endpoint: '',
    protocolIndex: 0,
    modelText: '',
    models: Object.freeze([]),
    candidates: Object.freeze([]),
    picked: new Set<string>(),
    candidateIndex: 0,
    error: '',
  })
}

function providerWizardModels(
  text: string,
  previous: readonly TuiCustomProviderModelDraft[],
): readonly TuiCustomProviderModelDraft[] {
  const known = new Map(previous.map(model => [model.id, model]))
  const seen = new Set<string>()
  return Object.freeze(text.split(/[\s,]+/u).flatMap((raw) => {
    const id = raw.trim()
    if (id === '' || seen.has(id)) return []
    seen.add(id)
    return [known.get(id) ?? Object.freeze({ id })]
  }))
}

function providerWizardDraft(
  wizard: TuiProviderWizardState,
  apiKey: string,
): TuiCustomProviderDraft {
  return Object.freeze({
    id: wizard.id,
    displayName: wizard.displayName,
    baseURL: wizard.endpoint,
    protocol: wizard.target.protocols[wizard.protocolIndex] ?? '',
    ...(apiKey.trim() === '' ? {} : { apiKey }),
    models: wizard.models,
  })
}

function providerWizardFailure(error: unknown, locale: TuiLocale): string {
  if (!(error instanceof TuiCustomProviderError)) return tuiMessage(locale, 'provider.custom.error.failed')
  const fieldErrors: Partial<Record<TuiCustomProviderError['code'], string>> = {
    'invalid-id': tuiMessage(locale, 'provider.custom.error.id'),
    'id-taken': tuiMessage(locale, 'provider.custom.error.taken'),
    'invalid-display-name': tuiMessage(locale, 'provider.custom.error.name'),
    'invalid-endpoint': tuiMessage(locale, 'provider.custom.error.endpoint'),
    'invalid-protocol': tuiMessage(locale, 'provider.custom.error.protocol'),
    'models-required': tuiMessage(locale, 'provider.custom.error.models'),
    'invalid-model': tuiMessage(locale, 'provider.custom.error.model'),
    'duplicate-model': tuiMessage(locale, 'provider.custom.error.duplicateModel'),
    'invalid-key': tuiMessage(locale, 'provider.custom.error.key'),
    'settings-conflict': tuiMessage(locale, 'provider.custom.error.conflict'),
    'settings-read-only': tuiMessage(locale, 'provider.custom.error.readonly'),
    'credential-write-failed': tuiMessage(locale, 'provider.custom.error.credentialPartial'),
    'credentials-unavailable': tuiMessage(locale, 'provider.custom.error.credentialPartial'),
    'discovery-unavailable': tuiMessage(locale, 'provider.custom.error.discoveryUnavailable'),
    'discovery-failed': tuiMessage(locale, 'provider.custom.error.discoveryFailed'),
  }
  return fieldErrors[error.code] ?? tuiMessage(locale, 'provider.custom.error.failed')
}

function providerWizardEndpointLabel(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return terminalSafe(url.toString().replace(/\/$/u, ''))
  } catch {
    return terminalSafe(value)
  }
}

function providerProfileFields(row: TuiProviderCenterRow): readonly TuiProviderProfileField[] {
  const editable = row.settings?.editable
  if (editable === undefined) return Object.freeze([])
  return Object.freeze([
    ...(editable.displayNameSupported ? ['displayName' as const] : []),
    ...(editable.protocolSupported ? ['protocol' as const] : []),
    ...(editable.modelsSupported ? ['models' as const] : []),
  ])
}

function createProviderProfileEditor(row: TuiProviderCenterRow): TuiProviderProfileEditorState | undefined {
  const editable = row.settings?.editable
  const fields = providerProfileFields(row)
  const firstField = fields.at(0)
  if (editable === undefined || firstField === undefined) return undefined
  const protocols = Object.freeze(row.declared ? [...editable.protocols] : ['', ...editable.protocols])
  const protocolIndex = Math.max(0, protocols.indexOf(editable.protocol ?? ''))
  return Object.freeze({
    providerId: row.id,
    field: firstField,
    displayName: editable.displayName ?? '',
    protocols,
    protocolIndex,
    modelsText: formatTuiProviderModelDrafts(editable.models ?? []),
    error: '',
  })
}

function providerProfileDraft(editor: TuiProviderProfileEditorState): TuiProviderProfileDraft {
  return Object.freeze({
    displayName: editor.displayName,
    protocol: editor.protocols[editor.protocolIndex] ?? '',
    models: parseTuiProviderModelDrafts(editor.modelsText),
  })
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
      const color = line.startsWith('› ') ? theme.tokens.selection
        : line.startsWith('+ ') ? theme.tokens.diffAdd
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
  const color = line.startsWith('› ') ? theme.tokens.selection
    : line.startsWith('+ ') ? theme.tokens.diffAdd
      : line.startsWith('- ') ? theme.tokens.diffDelete : theme.tokens.text
  return <Text bold={line.startsWith('› ')} {...tuiTextStyle(color)} wrap="truncate-end">
    {tuiOsc8Text(tuiBidiVisualText(line))}
  </Text>
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

/** Keyboard or pointer focus over one transcript row. */
export type TuiTranscriptFocusState =
  | { mode: 'browse'; focusedKey: string; focusedIndex: number }
  | {
    mode: 'detail'
    focusedKey: string
    focusedIndex: number
    detailOffset: number
    /** Pointer-opened detail returns directly to the composer on Escape. */
    returnToComposer?: boolean
  }

/**
 * Toggle one pointer-selected transcript row between browse and detail.
 * @param previous - current transcript focus, when one exists.
 * @param focusedKey - stable key of the clicked transcript target.
 * @param focusedIndex - current target index after projection.
 * @returns next focus state.
 */
export function toggleTuiTranscriptFocus(
  previous: TuiTranscriptFocusState | undefined,
  focusedKey: string,
  focusedIndex: number,
): TuiTranscriptFocusState {
  return previous?.mode === 'detail' && previous.focusedKey === focusedKey
    ? { mode: 'browse', focusedKey, focusedIndex }
    : { mode: 'detail', focusedKey, focusedIndex, detailOffset: 0, returnToComposer: true }
}

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
  readonly focus: TuiTranscriptFocusState | undefined
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
    return Math.min(bounded, 2 + Math.max(
      pointerTextWidth(entry.node.label),
      pointerTextWidth(entry.text ?? ''),
      pointerTextWidth(tuiTranscriptAssistantReaderHint(entry, locale) ?? ''),
    ))
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
  if (entry.node.kind === 'tool-activity') {
    return Math.min(bounded, 2 + Math.max(
      pointerTextWidth(toolActivityHeadingText(entry.node, locale)),
      pointerTextWidth(toolActivityActiveText(entry.node, locale, workspace) ?? ''),
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
  context: Extract<TuiInteractionContext, 'Composer' | 'Transcript' | 'Dialog'>,
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
      const assistantActions = tuiTranscriptAssistantReaderHint(entry, locale) === undefined
        ? undefined : tuiTranscriptAssistantReaderActions(locale)
      if (assistantActions !== undefined && context !== 'Dialog') {
        regions.push(...tuiAssistantOutputPointerRegions({
          columns,
          row: row + height - 1,
          lineLeft: 4,
          line: assistantActions.line,
          labels: assistantActions,
          key: parent.target.key,
          index: parent.index,
          context,
        }))
      }
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
      + 3 + stringWidth(prefix) + layout.cursorColumn,
  }
}

/**
 * Reserve a readable majority-height panel for transcript message and tool details.
 * @param terminalRows - active terminal height.
 * @param reservedRows - additional pinned rows, such as the durable Tasks surface.
 * @returns bounded detail-panel rows while retaining surrounding context and controls.
 */
export function tuiTranscriptDetailHeight(terminalRows: number, reservedRows = 0): number {
  const rows = Math.max(1, Math.floor(Number.isFinite(terminalRows) ? terminalRows : 1))
  const reserved = Math.max(0, Math.floor(Number.isFinite(reservedRows) ? reservedRows : 0))
  const available = rows - 5 - reserved
  const target = Math.floor(rows * 0.78)
  return Math.min(rows, Math.max(7, Math.min(available, target)))
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

const TUI_WORKING_FRAMES: Readonly<Record<TuiActivityPreference, readonly string[]>> = Object.freeze({
  dots: Object.freeze(['.  ', '.. ', '...', ' ..', '  .', ' ..']),
  pulse: Object.freeze(['·  ', '∙  ', '●  ', '∙  ']),
  minimal: Object.freeze(['›  ']),
  off: Object.freeze(['']),
})

/**
 * Select one stable-width frame for the running-Agent activity indicator.
 * @param tick - monotonically increasing process-local animation tick.
 * @param preference - selected optional activity style.
 * @returns a stable-width frame, or an empty string when animation is disabled.
 */
export function tuiWorkingFrame(tick: number, preference: TuiActivityPreference = 'dots'): string {
  const frames = TUI_WORKING_FRAMES[preference]
  return frames[Math.abs(Math.trunc(tick)) % frames.length] ?? frames[0] ?? ''
}

/** Whether the global status items are the content visible on the last terminal row. */
export function tuiFooterItemsOwnPointerRow(state: {
  readonly workOpen: boolean
  readonly footerDetail: boolean
  readonly footerSelection: boolean
  readonly notice: boolean
  readonly externalNotice: boolean
  readonly runningDeliveryHint: boolean
  readonly rewindBrowsing: boolean
  readonly helpVisible: boolean
  readonly transcriptSearch: boolean
  readonly historySearch: boolean
  readonly focus: boolean
}): boolean {
  return !state.workOpen
    && !state.footerDetail
    && !state.footerSelection
    && !state.notice
    && !state.externalNotice
    && !state.runningDeliveryHint
    && !state.rewindBrowsing
    && !state.helpVisible
    && !state.transcriptSearch
    && !state.historySearch
    && !state.focus
}

/** Keep extension footer hints while making the Host-owned fullscreen close action explicit. */
export function tuiFullscreenFooterLine(footer: string | undefined, closeLabel: string): string {
  if (footer === undefined || footer.trim() === '') return closeLabel
  return footer.includes(closeLabel) ? footer : `${footer} · ${closeLabel}`
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
  const composerPrefill = useSyncExternalStore(props.composerPrefill.subscribe, props.composerPrefill.getSnapshot)
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
  const agentMode = useSyncExternalStore(props.agentMode.subscribe, props.agentMode.getSnapshot)
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
  const goalProjection = useSyncExternalStore(props.goalProjection.subscribe, props.goalProjection.getSnapshot)
  const planProjection = useSyncExternalStore(props.planProjection.subscribe, props.planProjection.getSnapshot)
  const resumeDialog = useSyncExternalStore(props.resumeDialog.subscribe, props.resumeDialog.getSnapshot)
  const sessionManager = useSyncExternalStore(props.sessionManager.subscribe, props.sessionManager.getSnapshot)
  const presetManager = useSyncExternalStore(props.presetManager.subscribe, props.presetManager.getSnapshot)
  const schedules = useSyncExternalStore(props.schedules.subscribe, props.schedules.getSnapshot)
  const scheduleDialog = useSyncExternalStore(props.scheduleDialog.subscribe, props.scheduleDialog.getSnapshot)
  const hostPluginCenter = useSyncExternalStore(props.hostPluginCenter.subscribe, props.hostPluginCenter.getSnapshot)
  const trajectory = useSyncExternalStore(props.trajectory.subscribe, props.trajectory.getSnapshot)
  const messageFeedbackSnap = useSyncExternalStore(props.messageFeedback.subscribe, props.messageFeedback.getSnapshot)
  const feedbackMutationSnap = useSyncExternalStore(props.feedbackMutation.subscribe, props.feedbackMutation.getSnapshot)
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
  const providerCenter = useSyncExternalStore(props.providerCenter.subscribe, props.providerCenter.getSnapshot)
  const work = useSyncExternalStore(props.work.subscribe, props.work.getSnapshot)
  const liveStream = useSyncExternalStore(props.events.stream.subscribe, props.events.stream.getSnapshot)
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
    () => [...transcriptProjection.update(eventSnapshot, resolveTool, renderKnownSessionEvent), ...projectTuiAssistantStream(liveStream)],
    [eventSnapshot, liveStream, renderKnownSessionEvent, resolveTool, transcriptProjection],
  )
  const currentTodo = useMemo(() => projection.find(node => node.kind === 'todo'), [projection])
  const rows = useMemo(() => projection.filter(node => node.kind !== 'todo'), [projection])
  const turnAnchors = useMemo(() => tuiTranscriptTurnAnchors(rows), [rows])
  const { stdout } = useStdout()
  const [terminalSize, setTerminalSize] = useState(() => ({
    rows: stdout.rows || 24,
    columns: stdout.columns || 80,
  }))
  const terminalRows = terminalSize.rows
  const [composer, setComposer] = useState<ComposerState>(createComposerState)
  const appliedComposerPrefill = useRef(0)
  const [suggestionOverride, setSuggestionOverride] = useState<SuggestionOverride | undefined>()
  const [referenceResolution, setReferenceResolution] = useState<{
    key: string
    result?: TuiReferenceResolution
  } | undefined>()
  const [history, setHistory] = useState<TuiComposerDraft[]>([])
  const [historySearch, setHistorySearch] = useState<TuiHistorySearchState | undefined>()
  const [stashedDraft, setStashedDraft] = useState<TuiComposerDraft | undefined>()
  const [busy, setBusy] = useState(false)
  const [externalEditorActive, setExternalEditorActive] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmationNotice, setConfirmationNotice] = useState<{
    readonly text: string
    readonly generation: number
  } | undefined>()
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionAnswers, setQuestionAnswers] = useState<AskUserQuestionAnswerItem[]>([])
  const [questionCursor, setQuestionCursor] = useState(0)
  const [approvalOffset, setApprovalOffset] = useState(0)
  const [focus, setFocus] = useState<TuiTranscriptFocusState | undefined>()
  const [outputReaderScope, setOutputReaderScope] = useState<'segment' | 'response'>('segment')
  const [activityInspector, setActivityInspector] = useState<{
    readonly key: string
    readonly selection: number
    readonly callId?: string | undefined
  } | undefined>()
  const [feedbackNoteDraft, setFeedbackNoteDraft] = useState<{
    readonly messageId: string
    readonly rating: 'positive' | 'negative'
    readonly text: string
  } | undefined>()
  const [deliverableSelection, setDeliverableSelection] = useState(0)
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
  const [sessionManagerTab, setSessionManagerTab] = useState<'sessions' | 'workspaces'>('sessions')
  const [sessionManagerScope, setSessionManagerScope] = useState<TuiSessionScope>(props.sessionManagerPreferences.scope)
  const [sessionManagerArchive, setSessionManagerArchive] = useState<TuiSessionArchiveFilter>(props.sessionManagerPreferences.archive)
  const [sessionManagerSort, setSessionManagerSort] = useState<TuiSessionSort>(props.sessionManagerPreferences.sort)
  const [sessionManagerGroup, setSessionManagerGroup] = useState(props.sessionManagerPreferences.groupByWorkspace)
  const [sessionManagerQuery, setSessionManagerQuery] = useState('')
  const [sessionManagerSelection, setSessionManagerSelection] = useState(0)
  const [sessionManagerDetail, setSessionManagerDetail] = useState(false)
  const [sessionManagerEdit, setSessionManagerEdit] = useState<{
    readonly kind: 'session-rename' | 'workspace-add' | 'workspace-rename'
    readonly draft: string
  } | undefined>()
  const [sessionManagerConfirm, setSessionManagerConfirm] = useState<
    'session-archive' | 'session-unarchive' | 'workspace-delete' | undefined
  >()
  const [sessionManagerError, setSessionManagerError] = useState('')
  const [directoryBrowser, setDirectoryBrowser] = useState<TuiDirectoryBrowserState | undefined>()
  const [presetManagerSelection, setPresetManagerSelection] = useState(0)
  const [presetManagerDetail, setPresetManagerDetail] = useState<TuiPresetManagerRow | undefined>()
  const [presetManagerCopyDraft, setPresetManagerCopyDraft] = useState<{
    readonly sourceId: string
    readonly idDraft: string
    readonly nameDraft: string
    readonly step: 'id' | 'name'
  } | undefined>()
  const [presetManagerDeleteConfirm, setPresetManagerDeleteConfirm] = useState<TuiPresetManagerRow | undefined>()
  const [presetManagerComposition, setPresetManagerComposition] = useState<{
    readonly id: string
    readonly phase: 'loading' | 'ready'
    readonly text?: string
    readonly truncated?: boolean
  } | undefined>()
  const [presetManagerError, setPresetManagerError] = useState('')
  const [scheduleSelection, setScheduleSelection] = useState(0)
  const [scheduleDetail, setScheduleDetail] = useState<TuiScheduleRow | undefined>()
  const [trajectorySelection, setTrajectorySelection] = useState(0)
  const [trajectoryDetailKey, setTrajectoryDetailKey] = useState<string | undefined>()
  const [trajectoryQuery, setTrajectoryQuery] = useState('')
  const [trajectorySearchEditing, setTrajectorySearchEditing] = useState(false)
  const [trajectoryCollapsedTurns, setTrajectoryCollapsedTurns] = useState<ReadonlySet<number>>(new Set())
  const [trajectoryCollapsedSteps, setTrajectoryCollapsedSteps] = useState<ReadonlySet<string>>(new Set())
  const [trajectoryInspectorTab, setTrajectoryInspectorTab] = useState<'summary' | 'input' | 'output' | 'timing'>('summary')
  const [trajectoryTailFollow, setTrajectoryTailFollow] = useState(true)
  const [hostPluginTab, setHostPluginTab] = useState<'plugins' | 'presets' | 'settings'>('plugins')
  const [hostPluginSelection, setHostPluginSelection] = useState(0)
  const [hostPluginFilter, setHostPluginFilter] = useState<TuiHostPluginFilter>('all')
  const [hostPluginQuery, setHostPluginQuery] = useState('')
  const [hostPluginDetail, setHostPluginDetail] = useState<TuiHostPluginRow | undefined>()
  const [hostPresetDetail, setHostPresetDetail] = useState<TuiHostPresetPluginGroup | undefined>()
  const [hostSettingsDetailNs, setHostSettingsDetailNs] = useState<string | undefined>()
  const [hostSettingsFieldSelection, setHostSettingsFieldSelection] = useState(0)
  const [hostSettingsDrafts, setHostSettingsDrafts] = useState<Readonly<Record<string, {
    readonly text: string
    readonly reset?: boolean
  }>>>({})
  const [hostSettingsEditing, setHostSettingsEditing] = useState(false)
  const [hostSettingsSaving, setHostSettingsSaving] = useState(false)
  const [hostSettingsError, setHostSettingsError] = useState('')
  const [goalPlanOpen, setGoalPlanOpen] = useState(false)
  const [goalEditDraft, setGoalEditDraft] = useState<string | undefined>()
  const [goalClearConfirmation, setGoalClearConfirmation] = useState(false)
  const [goalPlanError, setGoalPlanError] = useState('')
  const [rewindSelection, setRewindSelection] = useState(0)
  const [rewindConfirmation, setRewindConfirmation] = useState<TuiRewindCandidate | undefined>()
  const [rewindError, setRewindError] = useState('')
  const [exportDirectory, setExportDirectory] = useState<ComposerState>(() => createComposerState('.'))
  const [exportDescendants, setExportDescendants] = useState(true)
  const [pluginHubQuery, setPluginHubQuery] = useState('')
  const [pluginHubSelection, setPluginHubSelection] = useState(0)
  const [pluginHubDetailOffset, setPluginHubDetailOffset] = useState(0)
  const [providerSelection, setProviderSelection] = useState(0)
  const [providerDetail, setProviderDetail] = useState(false)
  const [providerDetailOffset, setProviderDetailOffset] = useState(0)
  const [providerSecretDraft, setProviderSecretDraft] = useState<string | undefined>()
  const [providerSecretError, setProviderSecretError] = useState('')
  const [providerEndpointDraft, setProviderEndpointDraft] = useState<string | undefined>()
  const [providerEndpointError, setProviderEndpointError] = useState('')
  const [providerProfileEditor, setProviderProfileEditor] = useState<TuiProviderProfileEditorState | undefined>()
  const [providerDeleteConfirmation, setProviderDeleteConfirmation] = useState<string | undefined>()
  const [providerLogoutConfirmation, setProviderLogoutConfirmation] = useState<string | undefined>()
  const [providerWizard, setProviderWizard] = useState<TuiProviderWizardState | undefined>()
  const [providerWizardSecret, setProviderWizardSecret] = useState('')
  const [queueOpen, setQueueOpen] = useState(false)
  const [queueSelection, setQueueSelection] = useState(0)
  const [queueDetail, setQueueDetail] = useState(false)
  const [queueDetailOffset, setQueueDetailOffset] = useState(0)
  const [queueEditDraft, setQueueEditDraft] = useState<string | undefined>()
  const [queueDeleteConfirmation, setQueueDeleteConfirmation] = useState(false)
  const [queueError, setQueueError] = useState('')
  const [queueClock, setQueueClock] = useState(Date.now)
  const agentViewStates = useRef(new TuiAgentViewStateCache<TuiAgentViewLocalState>())
  const submittedPendingIds = useRef<string[]>([])
  const selectionPending = useRef<TuiSelectionPending | undefined>()
  const lastScreenClick = useRef<TuiScreenClick | undefined>()
  const lastEscapeAt = useRef<number | undefined>()
  const transcriptWheelBoundaryGuard = useRef(new TuiTranscriptWheelBoundaryGuard())
  const directoryBrowserAbort = useRef<AbortController | undefined>()
  const currentAgentViewId = useRef(props.view.id)
  const currentAgentViewState = useRef<TuiAgentViewLocalState>({
    composer, history, historySearch, focus, transcriptAnchor, transcriptSearch,
  })
  currentAgentViewState.current = {
    composer, history, historySearch, focus, transcriptAnchor, transcriptSearch,
  }
  useEffect(() => { props.onMounted() }, [props.onMounted])
  useEffect(() => {
    if (confirmationNotice === undefined) return
    const timeout = setTimeout(() => { setConfirmationNotice(undefined) }, 2_500)
    return () => { clearTimeout(timeout) }
  }, [confirmationNotice])
  useEffect(() => {
    submittedPendingIds.current = []
    lastEscapeAt.current = undefined
    transcriptWheelBoundaryGuard.current.reset()
    selectionPending.current = undefined
    lastScreenClick.current = undefined
    setScreenSelection(undefined)
    setFeedbackNoteDraft(undefined)
    props.onSelectionMouseMode?.(false)
    setQueueOpen(false)
    setQueueSelection(0)
    setQueueDetail(false)
    setQueueEditDraft(undefined)
    setQueueDeleteConfirmation(false)
    setQueueError('')
  }, [props.agent])
  const completeReferencesRef = useRef<TuiAppProps['completeReferences']>(
    (query, signal) => props.completeReferences(query, signal),
  )
  completeReferencesRef.current = (query, signal) => props.completeReferences(query, signal)
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
    if (composerPrefill === undefined || composerPrefill.revision <= appliedComposerPrefill.current
      || props.view.kind !== 'root') return
    appliedComposerPrefill.current = composerPrefill.revision
    setComposer(createComposerState(composerPrefill.text))
    setSuggestionOverride(undefined)
  }, [composerPrefill, props.view.kind])

  useEffect(() => {
    setResumeScope('workspace')
    setResumeView('list')
    setResumeQuery('')
    setResumeSelection(0)
    setResumeError('')
    setResumeConfirmation(undefined)
  }, [resumeDialog?.generation])

  useEffect(() => {
    setSessionManagerTab(sessionManager?.initialTab ?? 'sessions')
    setSessionManagerScope(props.sessionManagerPreferences.scope)
    setSessionManagerArchive(props.sessionManagerPreferences.archive)
    setSessionManagerSort(props.sessionManagerPreferences.sort)
    setSessionManagerGroup(props.sessionManagerPreferences.groupByWorkspace)
    setSessionManagerQuery('')
    setSessionManagerSelection(0)
    setSessionManagerDetail(false)
    setSessionManagerEdit(undefined)
    setSessionManagerConfirm(undefined)
    setSessionManagerError('')
    directoryBrowserAbort.current?.abort(new Error('TUI directory browser reset'))
    directoryBrowserAbort.current = undefined
    setDirectoryBrowser(undefined)
  }, [sessionManager?.generation, props.sessionManagerPreferences])

  useEffect(() => () => {
    directoryBrowserAbort.current?.abort(new Error('TUI directory browser unmounted'))
  }, [])

  useEffect(() => {
    setPresetManagerSelection(0)
    setPresetManagerDetail(undefined)
    setPresetManagerCopyDraft(undefined)
    setPresetManagerDeleteConfirm(undefined)
    setPresetManagerComposition(undefined)
    setPresetManagerError('')
  }, [presetManager === undefined])

  useEffect(() => {
    setScheduleSelection(0)
    setScheduleDetail(undefined)
  }, [scheduleDialog === undefined])

  useEffect(() => {
    setTrajectorySelection(0)
    setTrajectoryDetailKey(undefined)
    setTrajectoryQuery('')
    setTrajectorySearchEditing(false)
    setTrajectoryCollapsedTurns(new Set())
    setTrajectoryCollapsedSteps(new Set())
    setTrajectoryInspectorTab('summary')
    setTrajectoryTailFollow(true)
  }, [trajectory === undefined])

  useEffect(() => {
    setHostPluginTab('plugins')
    setHostPluginSelection(0)
    setHostPluginFilter('all')
    setHostPluginQuery('')
    setHostPluginDetail(undefined)
    setHostPresetDetail(undefined)
    setHostSettingsDetailNs(undefined)
    setHostSettingsFieldSelection(0)
    setHostSettingsDrafts({})
    setHostSettingsEditing(false)
    setHostSettingsSaving(false)
    setHostSettingsError('')
  }, [hostPluginCenter === undefined])

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

  useEffect(() => {
    if (providerCenter === undefined) {
      setProviderSelection(0)
      setProviderDetail(false)
      setProviderDetailOffset(0)
      setProviderSecretDraft(undefined)
      setProviderSecretError('')
      setProviderEndpointDraft(undefined)
      setProviderEndpointError('')
      setProviderProfileEditor(undefined)
      setProviderDeleteConfirmation(undefined)
      setProviderLogoutConfirmation(undefined)
      setProviderWizard(undefined)
      setProviderWizardSecret('')
      return
    }
    const count = providerCenter.snapshot?.providers.length ?? 0
    setProviderSelection(previous => count === 0 ? 0 : Math.min(previous, count - 1))
  }, [providerCenter])

  useEffect(() => {
    if (!providerDetail) {
      setProviderSecretDraft(undefined)
      setProviderSecretError('')
      setProviderEndpointDraft(undefined)
      setProviderEndpointError('')
      setProviderProfileEditor(undefined)
      setProviderDeleteConfirmation(undefined)
      setProviderLogoutConfirmation(undefined)
    }
  }, [providerDetail])

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
    setReferenceResolution(undefined)
    setFooterSelection(undefined)
    setFooterDetail(undefined)
    setWorkOpen(false)
    setWorkSelection(0)
    setNotice('')
    setConfirmationNotice(undefined)
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
    if (agentStatus !== 'running' || props.activityPreference === 'off') return
    const interval = setInterval(() => { setWorkingFrameTick(previous => previous + 1) }, 120)
    return () => { clearInterval(interval) }
  }, [agentStatus, props.activityPreference])

  const focusTargets = [...rows, ...currentTodo === undefined || currentTodo.todos.length === 0 ? [] : [currentTodo]]
    .flatMap((node): FocusTarget[] => {
      if (node.kind !== 'tool-group') {
        return [{
          key: node.key,
          label: node.kind === 'todo' ? tuiMessage(locale, 'transcript.tasks.title')
            : node.kind === 'text' ? node.label
              : node.kind === 'compaction' ? tuiMessage(locale, 'transcript.compaction.title')
                : node.kind === 'deliverables' ? tuiMessage(locale, 'deliverables.title')
                  : node.kind === 'turn-usage' ? tuiMessage(locale, 'turn.usage.exact')
                    : node.kind === 'question' ? tuiMessage(locale, 'question.history.title')
                      : node.kind === 'tool-activity' ? toolActivityHeadingText(node, locale) : node.name,
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
  const focusedActivity = focus?.mode === 'detail' && focusedTarget?.node.kind === 'tool-activity'
    ? focusedTarget.node
    : undefined
  const activitySelection = focusedActivity === undefined ? 0 : Math.min(
    activityInspector?.key === focusedActivity.key ? activityInspector.selection : 0,
    Math.max(0, focusedActivity.tools.length - 1),
  )
  const inspectedActivityTool = focusedActivity === undefined || activityInspector?.key !== focusedActivity.key
    ? undefined
    : focusedActivity.tools.find(tool => tool.callId === activityInspector.callId)
  const focusedTargetKey = focus?.mode === 'browse' ? focusedTarget?.key : undefined
  const focusedTargetNodeKind = focus?.mode === 'browse' ? focusedTarget?.node.kind : undefined
  const focusedAssistantOutput = focus?.mode === 'detail' && focusedTarget?.child === undefined
    && focusedTarget?.node.kind === 'text' && focusedTarget.node.tone === 'assistant'
    ? focusedTarget.node
    : undefined
  const focusedAssistantParts = focusedAssistantOutput === undefined
    ? Object.freeze([])
    : tuiAssistantResponseParts(rows, focusedAssistantOutput)
  const focusedAssistantResponseText = tuiAssistantResponseText(focusedAssistantParts)
  const focusedAssistantPartIndex = focusedAssistantOutput === undefined
    ? -1 : focusedAssistantParts.findIndex(part => part.key === focusedAssistantOutput.key)
  const focusedAssistantReaderText = focusedAssistantOutput === undefined
    ? ''
    : outputReaderScope === 'response' ? focusedAssistantResponseText : focusedAssistantOutput.text
  useEffect(() => {
    setActivityInspector(undefined)
    setOutputReaderScope('segment')
  }, [focus?.mode, focusedTarget?.key])
  const focusedFeedbackMessageId = props.view.kind === 'root' && focus?.mode === 'detail'
    && focusedTarget?.node.kind === 'text' && focusedTarget.node.tone === 'assistant'
    && focusedTarget.node.closing === true
    ? focusedTarget.node.messageId
    : undefined
  const activeMessageFeedback = messageFeedbackSnap?.sessionId === props.agent.session.id
    ? messageFeedbackSnap
    : undefined
  const focusedFeedback = focusedFeedbackMessageId === undefined
    ? undefined
    : findMessageFeedback(activeMessageFeedback, focusedFeedbackMessageId)
  const focusedFeedbackMutation = focusedFeedbackMessageId !== undefined
    && feedbackMutationSnap.status !== 'idle'
    && feedbackMutationSnap.sessionId === props.agent.session.id
    && feedbackMutationSnap.targetMessageId === focusedFeedbackMessageId
    ? feedbackMutationSnap
    : undefined
  useEffect(() => {
    if (feedbackNoteDraft !== undefined && focusedFeedbackMutation?.status === 'success'
      && focusedFeedbackMutation.targetMessageId === feedbackNoteDraft.messageId) {
      setFeedbackNoteDraft(undefined)
    }
  }, [feedbackNoteDraft, focusedFeedbackMutation])
  const feedbackActionsVisible = focusedFeedbackMessageId !== undefined && feedbackNoteDraft === undefined
  const feedbackActionLabels = {
    like: tuiMessage(locale, 'feedback.action.like'),
    dislike: tuiMessage(locale, 'feedback.action.dislike'),
    note: tuiMessage(locale, 'feedback.action.note'),
    clear: tuiMessage(locale, 'feedback.action.clear'),
  }
  const feedbackActionLine = [
    feedbackActionLabels.like,
    feedbackActionLabels.dislike,
    ...(focusedFeedback === undefined ? [] : [feedbackActionLabels.note, feedbackActionLabels.clear]),
  ].join(' · ')
  const focusedDeliverables = focus?.mode === 'detail' && focusedTarget?.node.kind === 'deliverables'
    ? focusedTarget.node
    : undefined
  const selectedDeliverable = focusedDeliverables?.items[Math.min(
    deliverableSelection,
    Math.max(0, focusedDeliverables.items.length - 1),
  )]
  const deliverableActionsVisible = focusedDeliverables !== undefined
  const deliverableActionLine = tuiMessage(locale, props.pathOpenerAvailable
    ? 'deliverables.actions' : 'deliverables.actions.copyOnly')
  const detailHeight = focus?.mode === 'detail' && focusedTarget !== undefined
    ? tuiTranscriptDetailHeight(terminalRows, todoPanelRows(currentTodo))
    : footerDetail !== undefined
      ? Math.min(12, Math.max(7, Math.floor(terminalRows / 3)))
      : 0
  const detailRows = Math.max(1, detailHeight - (feedbackActionsVisible || deliverableActionsVisible ? 5 : 4))
  const detailColumns = Math.max(1, (stdout.columns || 80) - 4)
  const transcriptDetailRawLines = focusedTarget === undefined
    ? []
    : focusedAssistantOutput !== undefined
      ? terminalMarkdownText(focusedAssistantReaderText).split('\n')
        .flatMap(line => terminalWrappedLines(line, detailColumns))
      : focusedActivity !== undefined
        ? inspectedActivityTool === undefined
          ? focusedActivity.tools.map(tool => `${toolStateMark(tool)} ${focusTitle(tool)}`)
          : transcriptDetailCache.lines(focusedActivity, detailColumns, inspectedActivityTool, locale)
        : focusedDeliverables === undefined
          ? transcriptDetailCache.lines(focusedTarget.node, detailColumns, focusedTarget.child, locale)
          : formatTuiDeliverableDetailLines(focusedDeliverables, Math.max(1, detailColumns - 2), locale)
  const transcriptDetailBaseLines = focusedActivity !== undefined && inspectedActivityTool === undefined
    ? transcriptDetailRawLines.map((line, index) => index === activitySelection ? `› ${line}` : `  ${line}`)
    : focusedDeliverables === undefined
      ? transcriptDetailRawLines
      : transcriptDetailRawLines.map((line, index) => index === deliverableSelection ? `› ${line}` : `  ${line}`)
  const feedbackDetailLines = focusedFeedbackMessageId === undefined ? [] : [
    `${tuiMessage(locale, 'feedback.command')}: ${feedbackRatingLabel(focusedFeedback?.rating, locale)}`,
    ...(feedbackNoteDraft === undefined
      ? focusedFeedback?.note === undefined ? [] : [terminalSafe(focusedFeedback.note)]
      : [`${tuiMessage(locale, 'feedback.note.placeholder')}: ${terminalSafe(feedbackNoteDraft.text)}█`]),
    ...(focusedFeedbackMutation?.status === 'pending'
      ? [tuiMessage(locale, 'feedback.status.pending')]
      : focusedFeedbackMutation?.status === 'success'
        ? [tuiMessage(locale, 'feedback.status.success')]
        : focusedFeedbackMutation?.status === 'error'
          ? [tuiMessageFeedbackErrorMessage(focusedFeedbackMutation.errorCode, locale)]
          : []),
  ]
  const transcriptDetailLines = [...transcriptDetailBaseLines, ...feedbackDetailLines]
  useEffect(() => { setDeliverableSelection(0) }, [focusedTarget?.key])
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
  const goalPlanSurface = props.view.kind === 'root'
    ? projectTuiGoalPlan(goalProjection, planProjection)
    : undefined
  const compactGoalPlan = columns < 76
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
  const sessionManagerProjection = projectTuiSessionManager(
    sessionManager?.candidates ?? [],
    sessionManager?.workspaces ?? [],
    sessionManager?.archivedSessionIds ?? [],
    {
      query: sessionManagerQuery,
      archive: sessionManagerArchive,
      scope: sessionManagerScope,
      sort: sessionManagerSort,
      groupByWorkspace: sessionManagerGroup,
      ...(sessionManager === undefined ? {} : { currentSessionId: sessionManager.currentSessionId }),
    },
  )
  const normalizedManagerQuery = sessionManagerQuery.normalize('NFKC').trim().toLocaleLowerCase()
  const sessionManagerWorkspaces = normalizedManagerQuery === ''
    ? sessionManagerProjection.workspaces
    : sessionManagerProjection.workspaces.filter(row => [row.title, row.path, row.id].some(value =>
      value.normalize('NFKC').toLocaleLowerCase().includes(normalizedManagerQuery)))
  const sessionManagerItems: readonly (TuiSessionManagerRow | TuiWorkspaceManagerRow)[] = sessionManagerTab === 'sessions'
    ? sessionManagerProjection.sessions
    : sessionManagerWorkspaces
  const effectiveSessionManagerSelection = sessionManagerItems.length === 0
    ? 0
    : Math.min(sessionManagerSelection, sessionManagerItems.length - 1)
  const selectedManagedSession = sessionManagerTab === 'sessions'
    ? sessionManagerProjection.sessions[effectiveSessionManagerSelection]
    : undefined
  const selectedManagedWorkspace = sessionManagerTab === 'workspaces'
    ? sessionManagerWorkspaces[effectiveSessionManagerSelection]
    : undefined
  const canToggleManagedSessionArchive = selectedManagedSession !== undefined
    && !selectedManagedSession.current
    && (!selectedManagedSession.archived || props.canUnarchiveManagedSessions === true)
  const sessionDetailFooterKey = selectedManagedSession?.archived
    ? props.canUnarchiveManagedSessions === true
      ? 'sessions.footer.sessionDetailArchived'
      : 'sessions.footer.sessionDetailArchivedReadOnly'
    : 'sessions.footer.sessionDetailActive'
  const sessionManagerRowHeight = 3
  const sessionManagerVisibleCount = Math.max(1, Math.floor((terminalRows - 10) / sessionManagerRowHeight))
  const sessionManagerVisibleStart = Math.min(
    Math.max(0, effectiveSessionManagerSelection - Math.floor(sessionManagerVisibleCount / 2)),
    Math.max(0, sessionManagerItems.length - sessionManagerVisibleCount),
  )
  const visibleSessionManagerItems = sessionManagerItems.slice(
    sessionManagerVisibleStart, sessionManagerVisibleStart + sessionManagerVisibleCount,
  )
  const directoryBrowserPage: TuiDirectoryBrowserPage | undefined = directoryBrowser?.listing === undefined
    ? undefined
    : projectTuiDirectoryBrowser(directoryBrowser.listing, directoryBrowser.showHidden)
  const effectiveDirectorySelection = directoryBrowserPage === undefined || directoryBrowserPage.rows.length === 0
    ? 0
    : Math.min(directoryBrowser?.selection ?? 0, directoryBrowserPage.rows.length - 1)
  const directoryVisibleCount = Math.max(1, terminalRows - 9)
  const directoryVisibleStart = directoryBrowserPage === undefined
    ? 0
    : Math.min(
      Math.max(0, effectiveDirectorySelection - Math.floor(directoryVisibleCount / 2)),
      Math.max(0, directoryBrowserPage.rows.length - directoryVisibleCount),
    )
  const visibleDirectoryRows = directoryBrowserPage?.rows.slice(
    directoryVisibleStart, directoryVisibleStart + directoryVisibleCount,
  ) ?? Object.freeze([])
  const presetManagerRows = presetManager?.rows ?? []
  const effectivePresetManagerSelection = presetManagerRows.length === 0
    ? 0
    : Math.min(presetManagerSelection, presetManagerRows.length - 1)
  const selectedPresetManagerRow = presetManagerRows[effectivePresetManagerSelection]
  const currentPresetPermission = permissions?.options.find(option => option.value === permissions.currentValue)?.name
    ?? permissions?.currentValue
  const currentPresetModel = modelSelection === undefined
    ? undefined
    : `${modelSelection.provider}/${modelSelection.model}`
  const presetManagerRowHeight = 2
  const presetManagerVisibleCount = Math.max(1, Math.floor((terminalRows - 10) / presetManagerRowHeight))
  const presetManagerVisibleStart = Math.min(
    Math.max(0, effectivePresetManagerSelection - Math.floor(presetManagerVisibleCount / 2)),
    Math.max(0, presetManagerRows.length - presetManagerVisibleCount),
  )
  const visiblePresetManagerItems = presetManagerRows.slice(
    presetManagerVisibleStart, presetManagerVisibleStart + presetManagerVisibleCount,
  )
  const scheduleRows = scheduleDialog?.rows ?? []
  const effectiveScheduleSelection = scheduleRows.length === 0
    ? 0
    : Math.min(scheduleSelection, scheduleRows.length - 1)
  const selectedScheduleRow = scheduleRows[effectiveScheduleSelection]
  const currentScheduleDetail = scheduleDetail === undefined
    ? undefined
    : scheduleRows.find(row => row.id === scheduleDetail.id)
  const scheduleRowHeight = 2
  const scheduleVisibleCount = Math.max(1, Math.floor((terminalRows - 8) / scheduleRowHeight))
  const scheduleVisibleStart = Math.min(
    Math.max(0, effectiveScheduleSelection - Math.floor(scheduleVisibleCount / 2)),
    Math.max(0, scheduleRows.length - scheduleVisibleCount),
  )
  const visibleScheduleRows = scheduleRows.slice(
    scheduleVisibleStart, scheduleVisibleStart + scheduleVisibleCount,
  )

  useEffect(() => {
    if (scheduleDetail !== undefined && currentScheduleDetail === undefined) setScheduleDetail(undefined)
  }, [currentScheduleDetail, scheduleDetail])

  const trajectoryEntries = useMemo(() => visibleTuiTrajectoryEntries(
    trajectory?.entries ?? [], trajectoryQuery, trajectoryCollapsedTurns, trajectoryCollapsedSteps,
  ), [trajectory?.entries, trajectoryQuery, trajectoryCollapsedTurns, trajectoryCollapsedSteps])
  const previousTrajectoryEntries = useRef<readonly TuiTrajectoryEntry[]>(trajectoryEntries)
  const trajectoryDetail = trajectoryDetailKey === undefined
    ? undefined
    : trajectory?.entries.find(entry => entry.key === trajectoryDetailKey)
  useEffect(() => {
    if (trajectoryDetailKey !== undefined && trajectory !== undefined && trajectoryDetail === undefined) {
      setTrajectoryDetailKey(undefined)
    }
  }, [trajectory?.firstSeq, trajectoryDetail, trajectoryDetailKey])
  const effectiveTrajectorySelection = trajectoryEntries.length === 0
    ? 0
    : Math.min(trajectorySelection, trajectoryEntries.length - 1)
  const trajectoryRowHeight = 2
  const trajectoryVisibleCount = Math.max(1, Math.floor((terminalRows - 10) / trajectoryRowHeight))
  const trajectoryVisibleStart = Math.min(
    Math.max(0, effectiveTrajectorySelection - Math.floor(trajectoryVisibleCount / 2)),
    Math.max(0, trajectoryEntries.length - trajectoryVisibleCount),
  )
  const visibleTrajectoryItems = trajectoryEntries.slice(
    trajectoryVisibleStart, trajectoryVisibleStart + trajectoryVisibleCount,
  )
  const trajectoryTimeline = useMemo(() => createTuiTrajectoryTimelineScale(
    trajectoryEntries, Math.max(6, Math.min(16, Math.floor(columns / 8))),
  ), [columns, trajectoryEntries])
  useEffect(() => {
    const previous = previousTrajectoryEntries.current
    setTrajectorySelection(current => reconcileTuiTrajectorySelection(
      previous,
      trajectoryEntries,
      current,
      trajectoryTailFollow && trajectoryDetail === undefined && trajectoryQuery === '',
    ))
    previousTrajectoryEntries.current = trajectoryEntries
  }, [trajectory?.firstSeq, trajectory?.lastSeq, trajectoryDetail, trajectoryEntries, trajectoryQuery, trajectoryTailFollow])

  const hostPluginRows = hostPluginCenter === undefined ? []
    : hostPluginTab === 'plugins'
      ? filterTuiHostPlugins(hostPluginCenter.plugins, hostPluginFilter, hostPluginQuery)
      : []
  const hostSettingsRows = hostPluginCenter?.settingsNamespaces ?? []
  const hostPresetRows = hostPluginCenter?.agentPresets ?? []
  const hostSettingsDetail = hostSettingsDetailNs === undefined
    ? undefined
    : hostSettingsRows.find(row => String(row.ns) === hostSettingsDetailNs)
  const hostSettingsFields = hostSettingsDetail?.fields ?? []
  const effectiveHostSettingsFieldSelection = hostSettingsFields.length === 0
    ? 0
    : Math.min(hostSettingsFieldSelection, hostSettingsFields.length - 1)
  const selectedHostSettingsField = hostSettingsFields[effectiveHostSettingsFieldSelection]
  const hostSettingsCanEdit = hostPluginCenter?.settingsWritable === true && hostSettingsFields.length > 0
  const hostPluginItems = hostPluginTab === 'plugins'
    ? hostPluginRows
    : hostPluginTab === 'presets' ? hostPresetRows : hostSettingsRows
  const effectiveHostPluginSelection = hostPluginItems.length === 0
    ? 0
    : Math.min(hostPluginSelection, hostPluginItems.length - 1)
  const hostPluginRowHeight = 2
  const hostPluginVisibleCount = Math.max(1, Math.floor((terminalRows - 10) / hostPluginRowHeight))
  const hostPluginVisibleStart = Math.min(
    Math.max(0, effectiveHostPluginSelection - Math.floor(hostPluginVisibleCount / 2)),
    Math.max(0, hostPluginItems.length - hostPluginVisibleCount),
  )
  const visibleHostPluginItems = hostPluginItems.slice(
    hostPluginVisibleStart, hostPluginVisibleStart + hostPluginVisibleCount,
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
  const model = activeSelection?.model
  const reasoningEffort = activeSelection?.reasoningEffort
  const modelMetadata = [
    model,
    reasoningEffort === undefined ? undefined : tuiMessage(locale, 'startup.thinking', { effort: reasoningEffort }),
  ].filter(value => value !== undefined && value !== '').join(' · ')
  const providerCenterVisible = providerCenter !== undefined && interaction === undefined
    && resumeDialog === undefined && sessionManager === undefined && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined && trajectory === undefined && freshSessionDialog === undefined
    && diagnostics === undefined && loadedContext === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined && !goalPlanOpen
  const providerRows = providerCenter?.snapshot?.providers ?? []
  const providerCreationTarget = providerCenter?.snapshot?.creationTargets.find(target => target.writable)
  const effectiveProviderSelection = providerRows.length === 0
    ? 0
    : Math.min(providerSelection, providerRows.length - 1)
  const selectedProvider = providerRows[effectiveProviderSelection]
  const providerRowHeight = 2
  const providerVisibleCount = Math.max(1, Math.floor((terminalRows - 5) / providerRowHeight))
  const providerVisibleStart = Math.min(
    Math.max(0, effectiveProviderSelection - Math.floor(providerVisibleCount / 2)),
    Math.max(0, providerRows.length - providerVisibleCount),
  )
  const visibleProviderRows = providerRows.slice(
    providerVisibleStart, providerVisibleStart + providerVisibleCount,
  )
  const selectedProviderDetailLines = selectedProvider === undefined
    ? Object.freeze([]) as readonly string[]
    : providerDetailLines(selectedProvider, locale).flatMap(line => terminalWrappedLines(
      line, Math.max(1, columns - 6),
    ))
  const providerDetailBodyRows = Math.max(1, terminalRows - 6)
  const providerDetailWindow = tuiScrollableWindow(
    selectedProviderDetailLines.length, providerDetailOffset, providerDetailBodyRows,
  )
  const providerCandidateVisibleCount = Math.max(1, terminalRows - 7)
  const providerCandidateStart = providerWizard?.step !== 'picker' || providerWizard.candidates.length === 0
    ? 0
    : Math.min(
      Math.max(0, providerWizard.candidateIndex - Math.floor(providerCandidateVisibleCount / 2)),
      Math.max(0, providerWizard.candidates.length - providerCandidateVisibleCount),
    )
  const visibleProviderCandidates = providerWizard?.step === 'picker'
    ? providerWizard.candidates.slice(
      providerCandidateStart, providerCandidateStart + providerCandidateVisibleCount,
    )
    : Object.freeze([]) as readonly TuiCustomProviderModelDraft[]
  const providerCanAuthenticate = selectedProvider?.authentication === 'sign-in-required'
    && selectedProvider.authenticationMethods.length > 0
  const providerCanStoreKey = selectedProvider?.settings?.credential?.writable === true
    && (selectedProvider.settings.credentialReferenceStored || selectedProvider.settings.writable)
  const providerCanEditProfile = selectedProvider?.settings?.writable === true
    && providerProfileFields(selectedProvider).length > 0
  const providerCanRemove = selectedProvider !== undefined && canRemoveTuiProvider(selectedProvider)
  const providerCanLogout = selectedProvider?.active === true
    && selectedProvider.authentication === 'configured' && selectedProvider.canLogout
  const providerDetailPointerActions = (() => {
    if (providerProfileEditor !== undefined) return Object.freeze([
      { id: 'provider.profileSave' as const, label: tuiMessage(locale, 'provider.action.save') },
      { id: 'provider.close' as const, label: tuiMessage(locale, 'provider.action.back') },
    ])
    if (providerEndpointDraft !== undefined) return Object.freeze([
      { id: 'provider.confirm' as const, label: tuiMessage(locale, 'provider.action.confirm') },
      { id: 'provider.endpointReset' as const, label: tuiMessage(locale, 'provider.action.reset') },
      { id: 'provider.close' as const, label: tuiMessage(locale, 'provider.action.back') },
    ])
    if (providerDeleteConfirmation !== undefined || providerLogoutConfirmation !== undefined
      || providerSecretDraft !== undefined) return Object.freeze([
      { id: 'provider.confirm' as const, label: tuiMessage(locale, 'provider.action.confirm') },
      { id: 'provider.close' as const, label: tuiMessage(locale, 'provider.action.back') },
    ])
    return Object.freeze([
      ...(providerCanEditProfile
        ? [{ id: 'provider.editProfile' as const, label: tuiMessage(locale, 'provider.action.profile') }] : []),
      ...(selectedProvider?.settings?.writable === true
        ? [{ id: 'provider.editEndpoint' as const, label: tuiMessage(locale, 'provider.action.endpoint') }] : []),
      ...(providerCanStoreKey
        ? [{ id: 'provider.editApiKey' as const, label: tuiMessage(locale, 'provider.action.key') }] : []),
      ...(providerCanAuthenticate
        ? [{ id: 'provider.authenticate' as const, label: tuiMessage(locale, 'provider.action.login') }] : []),
      ...(providerCanLogout
        ? [{ id: 'provider.logout' as const, label: tuiMessage(locale, 'provider.action.logout') }] : []),
      ...(providerCanRemove
        ? [{ id: 'provider.remove' as const, label: tuiMessage(locale, 'provider.action.remove') }] : []),
      { id: 'provider.refresh' as const, label: tuiMessage(locale, 'provider.action.refresh') },
      { id: 'provider.close' as const, label: tuiMessage(locale, 'provider.action.back') },
    ])
  })()
  const providerDetailActionHint = providerDetailPointerActions.map(action => action.label).join(' · ')
  const providerProfilePointerFields = (() => {
    if (providerProfileEditor === undefined) return Object.freeze([])
    const row = providerRows.find(candidate => candidate.id === providerProfileEditor.providerId)
    if (row === undefined) return Object.freeze([])
    let top = 5
    return Object.freeze(providerProfileFields(row).map((field) => {
      const height = field === 'models'
        ? Math.max(1, terminalWrappedLines(tuiMessage(locale, 'provider.profile.models', {
          value: `${terminalSafe(providerProfileEditor.modelsText || tuiMessage(locale, 'provider.profile.modelsEmpty'))}█`,
        }), Math.max(1, columns - 8)).length)
        : 1
      const result = Object.freeze({ field, top, bottom: top + height - 1 })
      top += height
      return result
    }))
  })()
  const queue = readTuiQueue(props.agent)
  const effectiveQueueSelection = queue.items.length === 0
    ? 0
    : Math.min(queueSelection, queue.items.length - 1)
  const selectedQueueItem = queue.items[effectiveQueueSelection]
  const queueVisibleCount = Math.max(1, terminalRows - 7)
  const queueVisibleStart = Math.min(
    Math.max(0, effectiveQueueSelection - Math.floor(queueVisibleCount / 2)),
    Math.max(0, queue.items.length - queueVisibleCount),
  )
  const visibleQueueItems = queue.items.slice(queueVisibleStart, queueVisibleStart + queueVisibleCount)
  const selectedQueueDetailLines = selectedQueueItem === undefined ? Object.freeze([]) as readonly string[] : [
    tuiMessage(locale, 'queue.detail.lane', {
      lane: tuiMessage(locale, selectedQueueItem.lane === 'next-step' ? 'queue.lane.step' : 'queue.lane.turn'),
    }),
    tuiMessage(locale, 'queue.detail.source', { source: selectedQueueItem.source }),
    tuiMessage(locale, 'queue.detail.attachments', { count: selectedQueueItem.attachmentCount }),
    ...(queue.canMoveLane || queue.canSendEarly
      ? []
      : [tuiMessage(locale, 'queue.detail.ownerBoundary')]),
    '',
    ...terminalWrappedLines(selectedQueueItem.text, Math.max(1, columns - 6)),
  ]
  const queueDetailBodyRows = Math.max(1, terminalRows - 6)
  const queueDetailWindow = tuiScrollableWindow(
    selectedQueueDetailLines.length, queueDetailOffset, queueDetailBodyRows,
  )
  useEffect(() => {
    if (queue.items.length === 0) {
      setQueueOpen(false)
      setQueueSelection(0)
      setQueueDetail(false)
      setQueueEditDraft(undefined)
      setQueueDeleteConfirmation(false)
      setQueueError('')
      return
    }
    setQueueSelection(previous => Math.min(previous, queue.items.length - 1))
  }, [queue.revision, queue.items.length])
  useEffect(() => {
    if (!queueOpen) return
    setQueueClock(Date.now())
    const timer = setInterval(() => { setQueueClock(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [queueOpen])
  const startupSurface = props.view.kind === 'root'
    && rows.length === 0 && currentTodo === undefined && agentStatus === 'idle' && !busy
    && interaction === undefined && !helpOpen && diagnostics === undefined && loadedContext === undefined
    && resumeDialog === undefined && sessionManager === undefined && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined && trajectory === undefined && freshSessionDialog === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
    && providerCenter === undefined && !queueOpen
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
  const composerPrefix = sessionExportDialog?.phase === 'selecting'
    ? `${tuiMessage(locale, 'composer.path')} › `
    : interaction?.kind === 'question'
      ? '> '
      : transcriptSearch !== undefined
        ? `${tuiMessage(locale, 'composer.find')} › `
        : historySearch !== undefined
          ? `${tuiMessage(locale, 'composer.search')} › `
          : `${tuiMessage(locale, props.view.kind === 'child'
            ? 'composer.followup'
            : agentStatus === 'running' ? 'composer.steer' : 'composer.prompt')} › `
  const composerGutterWidth = stringWidth(composerPrefix)
  const composerContinuation = ' '.repeat(composerGutterWidth)
  const historyMatch = historySearch === undefined ? undefined : tuiHistorySearchResult(historySearch, history)
  const editorComposer = sessionExportDialog?.phase === 'selecting'
    ? exportDirectory
    : transcriptSearch !== undefined
      ? createComposerState(transcriptSearch.query)
      : historySearch === undefined ? composer : createComposerState(historySearch.query)
  const composerLayout = layoutComposer(editorComposer, composerWidth, 5, composerGutterWidth)
  const attachmentRail = projectAttachmentRail(sessionExportDialog?.phase === 'selecting'
    ? undefined : composer.attachments)
  const attachmentRailView = attachmentRail.entries.map((entry, index) => <Box
    key={entry.attachmentId}
    justifyContent="space-between"
    overflow="hidden"
  >
    <Text wrap="truncate-end" {...tuiTextStyle(theme.tokens.accent)}>
      {index + 1}. {terminalSafe(formatRailEntry(entry))}
    </Text>
    <Text {...tuiTextStyle(theme.tokens.success)}>
      {' '}{tuiMessage(locale, 'attachment.rail.ready')}
      <Text {...tuiTextStyle(theme.tokens.error)}> [×]</Text>
    </Text>
  </Box>)
  const composerRows = composerLayout.lines.length + attachmentRail.count
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
  const referenceQuery = historySearch === undefined && transcriptSearch === undefined
    && diagnostics === undefined && loadedContext === undefined && rewindDialog === undefined
    && resumeDialog === undefined && sessionManager === undefined && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined && trajectory === undefined && freshSessionDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined && providerCenter === undefined
    && !helpOpen && !workOpen && !queueOpen && !goalPlanOpen
    ? tuiReferenceQuery(composer.text, composer.cursor)
    : undefined
  const referenceQueryText = referenceQuery?.query
  const referenceKey = referenceQuery === undefined
    ? undefined
    : `${props.view.id}:${referenceQuery.queryStart}:${referenceQuery.queryEnd}:${referenceQuery.quoted}:${referenceQuery.query}`
  useEffect(() => {
    if (referenceQueryText === undefined || referenceKey === undefined) {
      setReferenceResolution(undefined)
      return
    }
    const controller = new AbortController()
    const key = referenceKey
    setReferenceResolution({ key })
    void completeReferencesRef.current(referenceQueryText, controller.signal).then((result) => {
      setReferenceResolution(previous => previous?.key === key ? { key, result } : previous)
    }).catch(() => {
      if (!controller.signal.aborted) setReferenceResolution(previous => previous?.key === key ? {
        key, result: { files: [], sessions: [], errors: ['file', 'session'] },
      } : previous)
    })
    return () => { controller.abort() }
  }, [referenceKey, referenceQueryText, props.view.id])
  const referenceResult = referenceResolution?.key === referenceKey ? referenceResolution?.result : undefined
  const referenceSuggestion = referenceQuery === undefined
    ? undefined
    : tuiReferenceSuggestionState(referenceQuery, referenceResult, locale)
  const baseSuggestion = historySearch === undefined && transcriptSearch === undefined
    && footerSelection === undefined && footerDetail === undefined
    && !workOpen && !queueOpen && !goalPlanOpen
    && diagnostics === undefined && loadedContext === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined && providerCenter === undefined
    && sessionManager === undefined && presetManager === undefined && hostPluginCenter === undefined && trajectory === undefined
    && scheduleDialog === undefined
    ? referenceSuggestion ?? commandSuggestionState(composer.text, composer.cursor, props.commands, locale)
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
    && resumeDialog === undefined && sessionManager === undefined && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined && trajectory === undefined && freshSessionDialog === undefined
    && diagnostics === undefined && loadedContext === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined && providerCenter === undefined
    && !queueOpen && !goalPlanOpen
  const doctorVisible = diagnostics !== undefined && interaction === undefined
    && resumeDialog === undefined && sessionManager === undefined && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined && trajectory === undefined && freshSessionDialog === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined && pluginHubDialog === undefined
    && providerCenter === undefined && !queueOpen && !goalPlanOpen
  const loadedContextVisible = loadedContext !== undefined && interaction === undefined
    && resumeDialog === undefined && sessionManager === undefined && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined && trajectory === undefined && freshSessionDialog === undefined
    && diagnostics === undefined && rewindDialog === undefined
    && sessionExportDialog === undefined && pluginHubDialog === undefined && providerCenter === undefined
    && !queueOpen && !goalPlanOpen
  const inputContext = resolveTuiInteractionContext({
    approval: interaction?.kind === 'approval',
    dialog: resumeDialog !== undefined || sessionManager !== undefined || freshSessionDialog !== undefined
      || rewindDialog !== undefined || sessionExportDialog !== undefined
      || helpVisible || doctorVisible || loadedContextVisible || providerCenterVisible || queueOpen || goalPlanOpen
      || presetManager !== undefined || scheduleDialog !== undefined || hostPluginCenter !== undefined
      || trajectory !== undefined || interaction?.kind === 'question',
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
    && !providerCenterVisible
    && !queueOpen
    && !goalPlanOpen
    && resumeDialog === undefined
    && sessionManager === undefined
    && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined
    && trajectory === undefined
    && freshSessionDialog === undefined
    && rewindDialog === undefined
    && sessionExportDialog === undefined
    && pluginHubDialog === undefined
    && providerCenter === undefined
  const helpDescriptors = effectiveTuiInteractionDescriptors({
    modelPicker: props.commands.some(command => command.name === 'models'),
    resumePicker: props.commands.some(command => command.name === 'resume'),
    approval: true,
    childView: props.view.kind === 'child',
  }, props.interactionRegistry)
  const commandHelpLines = tuiGroupedCommandHelpLines(
    props.commands, locale, command => tuiCommandDescription(command, locale),
  ).map((text, index) => ({
    key: `command:${index}`,
    kind: text !== '' && !text.startsWith('  /') ? 'heading' as const : 'description' as const,
    text,
  }))
  const helpLines = [
    ...tuiInteractionHelpLines(helpDescriptors, Math.max(1, (stdout.columns || 80) - 4), locale),
    ...(props.view.kind === 'root' && agentStatus === 'running' ? tuiRunningDeliveryHelpLines() : []),
    ...commandHelpLines.length === 0 ? [] : [
      { key: 'commands:separator', kind: 'description' as const, text: '' },
      ...commandHelpLines,
    ],
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
  const pluginHubDiscoveryRows = tuiPluginHubDiscoveryRows(pluginHubDialog?.discoveryPage, pluginHubSelection, locale)
  const pluginHubInstalledRows = tuiPluginHubInstalledRows(
    pluginHubDialog?.installed,
    pluginHubSelection,
    stdout.columns || 80,
    locale,
  )
  const pluginHubRows = pluginHubDialog?.view === 'installed'
    ? pluginHubInstalledRows
    : pluginHubDialog?.view === 'discovery' ? pluginHubDiscoveryRows : pluginHubDiscoverRows
  const pluginHubCatalogDetailLines = tuiPluginHubDetailLines(
    pluginHubDialog?.detail, stdout.columns || 80, Date.now(), locale,
  )
  const pluginHubDiscoveryDetailLines = tuiPluginHubDiscoveryDetailLines(
    pluginHubDialog?.discoveryDetail, stdout.columns || 80, Date.now(), locale,
  )
  const pluginHubDetailLines = pluginHubDialog?.discoveryDetail === undefined
    ? pluginHubCatalogDetailLines : pluginHubDiscoveryDetailLines
  const pluginHubDetailOpen = pluginHubDialog?.phase === 'detail'
    && (pluginHubDialog.detail !== undefined || pluginHubDialog.discoveryDetail !== undefined)
  const pluginHubPlanLines = tuiPluginHubPlanLines(
    pluginHubDialog?.plan,
    pluginHubDialog?.detail,
    stdout.columns || 80,
    locale,
  )
  const pluginHubPlanOpen = pluginHubDialog?.phase === 'confirm' && pluginHubDialog.plan !== undefined
  const pluginHubCatalogLine = pluginHubDialog?.view === 'discover'
    ? tuiPluginHubCatalogLine(pluginHubDialog, locale)
    : undefined
  const pluginHubInstalledTabLabel = tuiMessage(locale, 'plugin.view.installed')
  const pluginHubRegistryTabLabel = tuiMessage(locale, 'plugin.view.discover')
  const pluginHubRepositoriesTabLabel = tuiMessage(locale, 'plugin.view.discovery')
  const pluginHubTabsLine = `${pluginHubInstalledTabLabel} · ${pluginHubRegistryTabLabel} · ${pluginHubRepositoriesTabLabel}`
  const pluginHubAvailableCategories = pluginHubDialog?.availableCategories
    ?? tuiPluginHubAvailableCategories(pluginHubDialog?.page)
  const pluginHubHasCategories = pluginHubAvailableCategories.length > 0
  const pluginHubSearchVisible = (pluginHubDialog?.view === 'discover' || pluginHubDialog?.view === 'discovery')
    && !pluginHubDetailOpen && !pluginHubPlanOpen
    && pluginHubDialog.phase !== 'planning' && pluginHubDialog.phase !== 'staging'
    && pluginHubDialog.phase !== 'handoff'
  const pluginHubBodyRows = tuiPluginHubViewportRows(terminalRows, pluginHubSearchVisible)
  const pluginHubDiscoveryDetailWindow = tuiScrollableWindow(
    pluginHubDetailLines.length, pluginHubDetailOffset, pluginHubBodyRows,
  )
  const pluginHubDiscoveryDetailLinks = pluginHubDialog?.discoveryDetail === undefined
    ? undefined
    : pluginHubDetailLines.flatMap((line, index) => line.kind === 'link'
        && index >= pluginHubDiscoveryDetailWindow.start && index < pluginHubDiscoveryDetailWindow.end
      ? [{ rowOffset: index - pluginHubDiscoveryDetailWindow.start, text: line.text }]
      : [])
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
  const pluginHubDiscoveryItems = pluginHubDialog?.discoveryPage?.items
  const pluginHubSelectedDiscovery = pluginHubDiscoveryItems?.[
    Math.min(pluginHubSelection, Math.max(0, pluginHubDiscoveryItems.length - 1))
  ]
  const installedPlugins = pluginHubDialog?.installed?.plugins
  const pluginHubInstalled = installedPlugins?.[
    Math.min(pluginHubSelection, Math.max(0, installedPlugins.length - 1))
  ]
  const pluginHubVisibleEnd = Math.min(
    pluginHubVisibleStart + pluginHubVisibleCount,
    pluginHubRows.length,
  )
  const pluginHubNextCursor = pluginHubDialog?.view === 'discovery'
    ? pluginHubDialog.discoveryPage?.nextCursor
    : pluginHubDialog?.page?.nextCursor
  const pluginHubFooterLine = pluginHubDialog === undefined
    ? ''
    : pluginHubDialog.phase === 'handoff'
      ? tuiMessage(locale, 'plugin.footer.handoff')
      : pluginHubDialog.discoveryDetail !== undefined
        ? tuiMessage(locale, 'plugin.footer.discoveryDetail')
        : pluginHubDialog.profileMutations === false && pluginHubDetailOpen && pluginHubDialog.detail !== undefined
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
            : pluginHubPlanOpen
              ? tuiMessage(locale, 'plugin.footer.confirm')
              : pluginHubDetailOpen && pluginHubDialog.detail !== undefined
                ? pluginHubDialog.detail.latestVersion?.installable === true
                  ? tuiMessage(locale, 'plugin.footer.detail.install')
                  : tuiMessage(locale, 'plugin.footer.detail.unavailable')
                : pluginHubDialog.view === 'installed'
                  ? tuiMessage(locale, 'plugin.footer.installed')
                  : pluginHubDialog.view === 'discovery'
                    ? tuiMessage(locale, 'plugin.footer.discovery')
                    : tuiMessage(locale, pluginHubHasCategories
                      ? 'plugin.footer.discover'
                      : 'plugin.footer.discover.noCategories')
  const pluginHubFooterActions: readonly TuiPointerFooterAction[] = (() => {
    if (pluginHubDialog === undefined || pluginHubDialog.phase === 'handoff') return Object.freeze([])
    const labels = pluginHubFooterLine.split(' · ')
    if (pluginHubDialog.phase === 'error') return Object.freeze([
      { action: { id: 'pluginHub.refresh' as const }, label: labels.at(-2) ?? '' },
      { action: { id: 'pluginHub.close' as const }, label: labels.at(-1) ?? '' },
    ])
    if (pluginHubDialog.phase !== 'browse' && pluginHubDialog.phase !== 'detail'
      && pluginHubDialog.phase !== 'confirm') return Object.freeze([
      { action: { id: 'pluginHub.close' as const }, label: labels.at(-1) ?? '' },
    ])
    if (pluginHubDialog.discoveryDetail !== undefined) return Object.freeze([
      { action: { id: 'pluginHub.openRepository' as const }, label: labels[0] ?? '' },
      { action: { id: 'pluginHub.close' as const }, label: labels.at(-1) ?? '' },
    ])
    if (pluginHubDialog.profileMutations === false && pluginHubDetailOpen) return Object.freeze([
      { action: { id: 'pluginHub.close' as const }, label: labels.at(-1) ?? '' },
    ])
    if (pluginHubDialog.profileMutations === false && pluginHubDialog.view === 'installed') {
      return Object.freeze([
        { action: { id: 'pluginHub.toggleView' as const, targetView: 'discover' as const }, label: labels[pluginHubInstalled === undefined ? 0 : 1] ?? '' },
        ...(pluginHubInstalled === undefined
          ? [{ action: { id: 'pluginHub.refresh' as const }, label: labels[2] ?? '' }] : []),
        { action: { id: 'pluginHub.close' as const }, label: labels.at(-1) ?? '' },
      ])
    }
    if (pluginHubPlanOpen) return Object.freeze([
      { action: { id: 'pluginHub.accept' as const }, label: labels[0] ?? '' },
      { action: { id: 'pluginHub.close' as const }, label: labels.at(-1) ?? '' },
    ])
    if (pluginHubDetailOpen) return Object.freeze([
      ...(pluginHubDialog.detail?.latestVersion?.installable === true
        ? [{ action: { id: 'pluginHub.accept' as const }, label: labels[0] ?? '' }] : []),
      { action: { id: 'pluginHub.toggleView' as const, targetView: 'installed' as const }, label: labels[2] ?? '' },
      { action: { id: 'pluginHub.close' as const }, label: labels.at(-1) ?? '' },
    ])
    if (pluginHubDialog.view === 'installed') return Object.freeze([
      { action: { id: 'pluginHub.toggleView' as const, targetView: 'discover' as const }, label: labels[0] ?? '' },
      ...(pluginHubInstalled === undefined
        ? [] : [{ action: { id: 'pluginHub.accept' as const }, label: labels[2] ?? '' }]),
      { action: { id: 'pluginHub.refresh' as const }, label: labels[3] ?? '' },
      { action: { id: 'pluginHub.close' as const }, label: labels[4] ?? '' },
    ])
    if (pluginHubDialog.view === 'discovery') return Object.freeze([
      { action: { id: 'pluginHub.toggleView' as const, targetView: 'installed' as const }, label: labels[0] ?? '' },
      { action: { id: 'pluginHub.sort' as const }, label: labels[1] ?? '' },
      ...(pluginHubSelectedDiscovery === undefined ? [] : [
        { action: { id: 'pluginHub.accept' as const }, label: labels[3] ?? '' },
        { action: { id: 'pluginHub.openRepository' as const }, label: labels[4] ?? '' },
      ]),
      { action: { id: 'pluginHub.refresh' as const }, label: labels[5] ?? '' },
      { action: { id: 'pluginHub.close' as const }, label: labels[6] ?? '' },
    ])
    const categoryOffset = pluginHubHasCategories ? 1 : 0
    return Object.freeze([
      { action: { id: 'pluginHub.toggleView' as const, targetView: 'discovery' as const }, label: labels[0] ?? '' },
      { action: { id: 'pluginHub.installable' as const }, label: labels[1] ?? '' },
      { action: { id: 'pluginHub.sort' as const }, label: labels[2] ?? '' },
      ...(pluginHubHasCategories
        ? [{ action: { id: 'pluginHub.category' as const }, label: labels[3] ?? '' }] : []),
      ...(pluginHubSelected === undefined
        ? [] : [{ action: { id: 'pluginHub.accept' as const }, label: labels[4 + categoryOffset] ?? '' }]),
      { action: { id: 'pluginHub.refresh' as const }, label: labels[5 + categoryOffset] ?? '' },
      { action: { id: 'pluginHub.close' as const }, label: labels[6 + categoryOffset] ?? '' },
    ])
  })()
  const pluginHubDetailPageSize = pluginHubBodyRows
  const scrollingDialogFooterLine = `${tuiMessage(locale, 'common.updown')} · ${tuiMessage(locale, 'common.page')} · ${tuiMessage(locale, 'common.esc.close')}`
  const helpFooterLine = tuiMessage(locale, 'footer.help')
  const transcriptDetailFooterLine = focusedAssistantOutput !== undefined && focusedAssistantParts.length > 1
    ? [
      tuiMessage(locale, 'detail.action.copyOutput'),
      tuiMessage(locale, 'detail.action.exportMarkdown'),
      tuiMessage(locale, outputReaderScope === 'segment'
        ? 'detail.action.completeResponse' : 'detail.action.currentSegment'),
      tuiMessage(locale, 'common.page'),
      tuiMessage(locale, 'common.esc.close'),
    ].join(' · ')
    : tuiMessage(locale, footerDetail !== undefined
      ? 'footer.detail'
      : focusedActivity !== undefined
        ? inspectedActivityTool === undefined ? 'footer.detail.activity' : 'footer.detail.activityTool'
        : focusedAssistantOutput === undefined ? 'footer.detail.close' : 'footer.detail.output')
  const workFooterLine = [
    tuiMessage(locale, 'footer.work.title', {
      position: work.items.length === 0 ? '0/0' : `${effectiveWorkSelection + 1}/${work.items.length}`,
    }),
    tuiMessage(locale, 'footer.work.select'),
    ...(selectedWorkItem?.inspectable === true ? [tuiMessage(locale, 'footer.work.open')] : []),
    ...(selectedWorkItem?.action === undefined || selectedWorkItem.action === 'none'
      ? [] : [tuiMessage(locale, 'footer.work.stop')]),
    tuiMessage(locale, 'common.esc.close'),
  ].join(' · ')
  const helpHeight = helpVisible ? Math.min(Math.max(7, terminalRows - 6), 18) : 0
  const helpBodyRows = Math.max(1, helpHeight - 4)
  const visibleHelpOffset = Math.min(helpOffset, Math.max(0, helpLines.length - helpBodyRows))
  const visibleDetailHeight = helpVisible ? 0 : detailHeight
  const visibleTasksHeight = helpVisible || workOpen ? 0 : tasksHeight
  const suggestionRows = helpVisible || suggestion === undefined ? 0
    : suggestion.status === 'loading' || suggestion.status === 'empty' || suggestion.status === 'error' ? 1
      : visibleSuggestions.length
        + (suggestion.items.length > visibleSuggestions.length ? 1 : 0)
        + (suggestion.status === 'truncated' ? 1 : 0)
        + (suggestion.error === undefined ? 0 : 1)
  const historySearchRows = helpVisible || historySearch === undefined ? 0 : 1
  const transcriptSearchRows = helpVisible || interaction !== undefined || transcriptSearch === undefined ? 0 : 1
  const stashRows = helpVisible || stashedDraft === undefined ? 0 : 1
  const queueCardVisible = agentStatus === 'running' && queue.items.length > 0
    && !queueOpen && !helpVisible && !workOpen && interaction === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined
    && pluginHubDialog === undefined && providerCenter === undefined && !goalPlanOpen
  const queueCardRows = queueCardVisible ? 1 : 0
  const goalPlanRowVisible = goalPlanSurface !== undefined && !compactGoalPlan && !goalPlanOpen
    && !helpVisible && !workOpen && interaction === undefined && !queueOpen
    && resumeDialog === undefined && sessionManager === undefined && presetManager === undefined
    && scheduleDialog === undefined
    && hostPluginCenter === undefined && trajectory === undefined && freshSessionDialog === undefined
    && rewindDialog === undefined && sessionExportDialog === undefined
    && pluginHubDialog === undefined && providerCenter === undefined
  const visibleGoalPlanSurface = goalPlanRowVisible ? goalPlanSurface : undefined
  const goalPlanRows = visibleGoalPlanSurface === undefined ? 0 : 1
  const transcriptRows = viewportRows(
    stdout,
    visibleDetailHeight + helpHeight + visibleTasksHeight + approvalHeight + (helpVisible ? -1 : composerRows - 1)
      + suggestionRows + historySearchRows + transcriptSearchRows + stashRows
      + queueCardRows + goalPlanRows,
  )
  const transcriptColumns = Math.max(1, (stdout.columns || 80) - (focus === undefined ? 2 : 4))
  transcriptViewport.update(rows, transcriptColumns)
  const transcriptPage = transcriptViewport.page(transcriptRows, transcriptAnchor)
  const navigateCompletedTurn = (direction: 'previous' | 'next'): void => {
    const target = navigateTuiTranscriptTurn(
      turnAnchors,
      transcriptPage.startIndex,
      direction,
      transcriptAnchor === undefined,
    )
    setTranscriptAnchor(target === undefined ? undefined : {
      key: target.key, index: target.index,
    })
  }
  const visible = transcriptPage.entries
  const pointerContext: TuiInteractionContext | undefined = inputContext
  const transcriptContentRows = visible.length === 0
    ? 1
    : visible.reduce((total, entry) => total + tuiTranscriptWindowEntryRows(entry, transcriptColumns), 0)
  const transcriptScreenMapLines = tuiTranscriptScreenMapLines(visible, transcriptColumns, workspace, locale)
  const visibleTranscriptFingerprint = transcriptScreenMapLines.map(line => `${line.semanticBlockKey}\u0000${line.text}\u0000${line.gutter ?? ''}\u0000${line.selectable === false ? '0' : '1'}`).join('\u0001')
  const transcriptScreenMap = useMemo(() => {
    if (visible.length === 0) return undefined
    return projectTuiScreenMap(
      transcriptScreenMapLines,
      { columns: transcriptColumns + 3, maxRows: transcriptRows, bidi: 'visual' },
    )
  }, [columns, transcriptColumns, transcriptRows, visibleTranscriptFingerprint])
  const inlineDeliverableReferences = visible.flatMap((entry) => {
    if (entry.node.kind !== 'text' || entry.node.tone !== 'assistant' || entry.node.closing !== true) return []
    const turn = entry.node.turn
    const deliverables = rows.find(node => node.kind === 'deliverables' && node.turn === turn)
    if (deliverables?.kind !== 'deliverables') return []
    return tuiDeliverableInlineReferences(entry.node, deliverables).map(reference => Object.freeze({
      ...reference,
      semanticBlockKey: entry.node.key,
    }))
  })
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
    agentPreset: props.view.kind === 'root' ? agentMode : undefined,
    permissions: props.view.kind === 'root' ? permissions : undefined,
    context: props.view.kind === 'root' ? contextPressure : undefined,
    tokenUsage: props.view.kind === 'root' ? tokenUsage : undefined,
    contextBreakdown: props.view.kind === 'root' ? contextBreakdown : undefined,
    sessionStats: props.view.kind === 'root' ? sessionStats : undefined,
    speed: props.view.kind === 'root'
      ? projectTuiLatestSpeed(eventSnapshot, Date.now(), liveStream) ?? projectTuiSettledSpeed(sessionStats)
      : undefined,
    work: work.summary,
    schedules: props.view.kind === 'root' ? schedules : undefined,
    goalPlan: compactGoalPlan ? goalPlanSurface : undefined,
    workspace,
    transcript: {
      startIndex: transcriptPage.startIndex,
      endIndex: transcriptPage.endIndex,
      total: rows.length,
      hasOlder: transcriptPage.hasOlder,
      hasNewer: transcriptPage.hasNewer,
      ...(turnAnchors.length === 0 ? {} : {
        currentTurn: transcriptAnchor === undefined
          ? turnAnchors.length
          : Math.max(1, turnAnchors.findLastIndex(anchor => anchor.index <= transcriptPage.startIndex) + 1),
        totalTurns: turnAnchors.length,
      }),
    },
  }, locale)
  const mountedFooterItems = visibleTuiFooterItems(completeFooterItems, Math.max(1, columns - 2))
  const queueCardRow = queueCardVisible ? Math.max(1, terminalRows - composerRows - 4) : undefined
  const goalPlanRow = goalPlanRowVisible
    ? Math.max(1, terminalRows - composerRows - 4 - queueCardRows)
    : undefined
  const goalPlanDialogActions = goalEditDraft !== undefined
    ? [
      { action: { id: 'goalPlan.accept' as const }, label: tuiMessage(locale, 'goalPlan.action.save') },
      { action: { id: 'goalPlan.close' as const }, label: tuiMessage(locale, 'goalPlan.action.cancel') },
    ]
    : goalClearConfirmation
      ? [
        { action: { id: 'goalPlan.accept' as const }, label: tuiMessage(locale, 'goalPlan.action.confirm') },
        { action: { id: 'goalPlan.close' as const }, label: tuiMessage(locale, 'goalPlan.action.cancel') },
      ]
      : [
        ...goalPlanSurface?.goal === undefined ? [] : [{
          action: { id: 'goalPlan.edit' as const }, label: tuiMessage(locale, 'goalPlan.action.edit'),
        }],
        ...goalPlanSurface?.goal?.phase === 'active' ? [{
          action: { id: 'goalPlan.pause' as const }, label: tuiMessage(locale, 'goalPlan.action.pause'),
        }] : [],
        ...goalPlanSurface?.goal?.phase === 'paused' || goalPlanSurface?.goal?.phase === 'blocked' ? [{
          action: { id: 'goalPlan.resume' as const }, label: tuiMessage(locale, 'goalPlan.action.resume'),
        }] : [],
        ...goalPlanSurface?.goal === undefined ? [] : [{
          action: { id: 'goalPlan.clear' as const }, label: tuiMessage(locale, 'goalPlan.action.clear'),
        }],
        ...goalPlanSurface?.plan?.effective === true ? [{
          action: { id: 'goalPlan.exitPlan' as const }, label: tuiMessage(locale, 'goalPlan.action.exitPlan'),
        }] : [],
        { action: { id: 'goalPlan.close' as const }, label: tuiMessage(locale, 'goalPlan.action.close') },
      ]
  const runningDeliveryHint = props.view.kind === 'root'
    && agentStatus === 'running'
    && hasComposerDraft
    && interaction === undefined
    && focus === undefined
    && suggestion === undefined
    ? tuiMessage(locale, 'status.running.delivery')
    : undefined
  // The global footer item row is pointer-owned only while those items are the
  // text actually rendered on the last physical row. Notices and browse/search
  // hints must never retain invisible model/permission hit targets.
  const footerItemsPointerVisible = tuiFooterItemsOwnPointerRow({
    workOpen,
    footerDetail: footerDetail !== undefined,
    footerSelection: footerSelection !== undefined,
    notice: notice !== '',
    externalNotice: externalNotice !== '',
    runningDeliveryHint: runningDeliveryHint !== undefined,
    rewindBrowsing: rewindDialog?.phase === 'browsing',
    helpVisible,
    transcriptSearch: transcriptSearch !== undefined,
    historySearch: historySearch !== undefined,
    focus: focus !== undefined,
  })
  const pointerRegions: readonly TuiPointerRegion[] = (() => {
    if (extensionSnapshot.fullscreenScene !== undefined) {
      return Object.freeze([])
    }
    if (startupSurface) {
      const pointerStartupFrame = tuiStartupComposerFrame(
        stdout, composerRows, suggestionRows, Math.max(0, startupGuidanceLines.length - 1),
      )
      return Object.freeze([
        ...tuiAttachmentRailPointerRegions({
          columns,
          startRow: pointerStartupFrame.firstInputRow + composerLayout.lines.length,
          count: attachmentRail.count,
          left: pointerStartupFrame.leftColumn + 2,
          right: pointerStartupFrame.leftColumn + pointerStartupFrame.width - 1,
          context: 'Composer',
        }),
        ...(footerItemsPointerVisible
          ? tuiFooterPointerRegions(mountedFooterItems, columns, terminalRows, 'Composer') : []),
      ])
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
        + composerRows
      const questionTop = terminalRows - 2 - questionBodyRows + 1
      return Object.freeze([
        ...tuiQuestionPointerRegions({
          columns,
          optionTop: questionTop + 2 + questionTextRows + questionDetailRows,
          optionStart,
          visibleCount: visibleOptions.length,
          rowHeight: 1,
          context: 'Dialog',
        }),
        ...tuiAttachmentRailPointerRegions({
          columns,
          startRow: questionTop + 2 + questionTextRows + questionDetailRows
            + visibleOptions.length + (questionOptions.length > optionLimit ? 1 : 0)
            + composerLayout.lines.length,
          count: attachmentRail.count,
          context: 'Dialog',
        }),
      ])
    }
    if (goalPlanOpen) {
      return tuiGoalPlanDialogPointerRegions(columns, terminalRows, goalPlanDialogActions)
    }
    if (trajectory !== undefined) {
      const trajectoryHeaderRows = trajectoryQuery !== '' || trajectorySearchEditing ? 4 : 3
      const trajectoryFooterLabels = tuiMessage(locale, trajectoryDetail === undefined
        ? 'trajectory.footer.list' : 'trajectory.footer.detail').split(' · ')
      const footerActions: TuiPointerFooterAction[] = trajectoryDetail
        ? [
          { action: { id: 'trajectory.cycleTab' as const }, label: trajectoryFooterLabels[0] ?? '' },
          { action: { id: 'trajectory.close' as const }, label: trajectoryFooterLabels[1] ?? '' },
        ]
        : [
          { action: { id: 'trajectory.accept' as const }, label: trajectoryFooterLabels[0] ?? '' },
          { action: { id: 'trajectory.fold' as const }, label: trajectoryFooterLabels[1] ?? '' },
          { action: { id: 'trajectory.search' as const }, label: trajectoryFooterLabels[2] ?? '' },
          { action: { id: 'trajectory.older' as const }, label: trajectoryFooterLabels[3] ?? '' },
          { action: { id: 'trajectory.tail' as const }, label: trajectoryFooterLabels[4] ?? '' },
          { action: { id: 'trajectory.close' as const }, label: trajectoryFooterLabels[5] ?? '' },
        ]
      return tuiTrajectoryPointerRegions({
        columns,
        rows: terminalRows,
        listVisible: trajectoryDetail === undefined,
        visibleStart: trajectoryVisibleStart,
        visibleCount: visibleTrajectoryItems.length,
        rowHeight: trajectoryRowHeight,
        listTop: 3 + trajectoryHeaderRows,
        ...(trajectoryDetail === undefined ? {} : {
          inspectorTabs: {
            row: 5 + trajectoryHeaderRows,
            left: 5,
            labels: {
              summary: tuiMessage(locale, 'trajectory.tab.summary'),
              input: tuiMessage(locale, 'trajectory.tab.input'),
              output: tuiMessage(locale, 'trajectory.tab.output'),
              timing: tuiMessage(locale, 'trajectory.tab.timing'),
            },
          },
        }),
        footerActions,
        footerLine: tuiMessage(locale, trajectoryDetail === undefined
          ? 'trajectory.footer.list' : 'trajectory.footer.detail'),
        context: 'Dialog',
      })
    }
    if (hostPluginCenter !== undefined) {
      const hostPluginQueryRows = hostPluginTab === 'plugins' && hostPluginQuery.length > 0 ? 3 : 0
      const hostPluginSourceWarningRows = (((hostPluginTab === 'plugins' || hostPluginTab === 'presets')
        && hostPluginCenter.inventoryState !== 'ready') || (hostPluginTab === 'settings'
        && hostPluginCenter.settingsState !== 'ready'))
        && hostPluginDetail === undefined && hostPresetDetail === undefined
        && hostSettingsDetail === undefined ? 1 : 0
      const hostFooterKey = hostSettingsDetail !== undefined
        ? hostSettingsCanEdit ? 'hostPlugins.footer.settingsDetail' : 'hostPlugins.footer.settingsReadOnly'
        : hostPluginDetail !== undefined || hostPresetDetail !== undefined ? 'hostPlugins.footer.detail'
          : hostPluginTab === 'plugins' ? 'hostPlugins.footer.plugins'
            : hostPluginTab === 'presets' ? 'hostPlugins.footer.presets' : 'hostPlugins.footer.settings'
      const hostFooterLabels = tuiMessage(locale, hostFooterKey).split(' · ')
      const footerActions: TuiPointerFooterAction[] = hostSettingsDetail !== undefined
        ? hostSettingsCanEdit ? [
          { action: { id: 'hostPlugins.edit' as const }, label: hostFooterLabels[0] ?? '' },
          ...(selectedHostSettingsField?.kind === 'enum'
            ? [{ action: { id: 'hostPlugins.cycle' as const }, label: hostFooterLabels[1] ?? '' }] : []),
          { action: { id: 'hostPlugins.reset' as const }, label: hostFooterLabels[2] ?? '' },
          { action: { id: 'hostPlugins.save' as const }, label: hostFooterLabels[3] ?? '' },
          { action: { id: 'hostPlugins.discard' as const }, label: hostFooterLabels[4] ?? '' },
          { action: { id: 'hostPlugins.close' as const }, label: hostFooterLabels[5] ?? '' },
        ] : [{ action: { id: 'hostPlugins.close' as const }, label: hostFooterLabels.at(-1) ?? '' }]
        : hostPluginDetail || hostPresetDetail
          ? [{ action: { id: 'hostPlugins.close' as const }, label: hostFooterLabels[0] ?? '' }]
          : hostPluginTab === 'plugins' ? [
            { action: { id: 'hostPlugins.accept' as const }, label: hostFooterLabels[0] ?? '' },
            { action: { id: 'hostPlugins.filter' as const }, label: hostFooterLabels[1] ?? '' },
            { action: { id: 'hostPlugins.refresh' as const }, label: hostFooterLabels[2] ?? '' },
            { action: { id: 'hostPlugins.close' as const }, label: hostFooterLabels[3] ?? '' },
          ] : [
            { action: { id: 'hostPlugins.accept' as const }, label: hostFooterLabels[0] ?? '' },
            { action: { id: 'hostPlugins.refresh' as const }, label: hostFooterLabels[1] ?? '' },
            { action: { id: 'hostPlugins.close' as const }, label: hostFooterLabels[2] ?? '' },
          ]
      return tuiHostPluginCenterPointerRegions({
        columns,
        rows: terminalRows,
        listVisible: hostPluginDetail === undefined && hostPresetDetail === undefined
          && hostSettingsDetail === undefined,
        visibleStart: hostPluginVisibleStart,
        visibleCount: visibleHostPluginItems.length,
        rowHeight: hostPluginRowHeight,
        listTop: 6 + hostPluginQueryRows + hostPluginSourceWarningRows,
        tabs: {
          row: 4,
          left: 3,
          labels: {
            plugins: tuiMessage(locale, 'hostPlugins.tab.plugins'),
            presets: tuiMessage(locale, 'hostPlugins.tab.presets'),
            settings: tuiMessage(locale, 'hostPlugins.tab.settings'),
          },
        },
        ...(hostSettingsDetail === undefined || hostSettingsFields.length === 0 ? {} : {
          settingsFields: { rowTop: 10, count: hostSettingsFields.length, rowHeight: 2 },
        }),
        footerActions,
        footerLine: tuiMessage(locale, hostFooterKey),
        context: 'Dialog',
      })
    }
    if (scheduleDialog !== undefined) {
      const footerLine = tuiMessage(locale, currentScheduleDetail === undefined
        ? 'schedules.footer.list' : 'schedules.footer.detail')
      const labels = footerLine.split(' · ')
      return tuiSchedulePointerRegions({
        columns,
        rows: terminalRows,
        listVisible: currentScheduleDetail === undefined && scheduleDialog.sourceState === 'ready',
        visibleStart: scheduleVisibleStart,
        visibleCount: visibleScheduleRows.length,
        rowHeight: scheduleRowHeight,
        listTop: 4,
        footerActions: currentScheduleDetail === undefined ? [
          { action: { id: 'schedules.accept' as const }, label: labels[0] ?? '' },
          { action: { id: 'schedules.refresh' as const }, label: labels[1] ?? '' },
          { action: { id: 'schedules.close' as const }, label: labels[2] ?? '' },
        ] : [{ action: { id: 'schedules.close' as const }, label: labels[0] ?? '' }],
        footerLine,
        context: 'Dialog',
      })
    }
    if (presetManager !== undefined) {
      const presetLayerLabels = tuiMessage(locale, presetManagerCopyDraft !== undefined
        ? 'sessions.footer.edit' : 'sessions.footer.confirm').split(' · ')
      const footerActions: TuiPointerFooterAction[] = presetManagerCopyDraft !== undefined
        || presetManagerDeleteConfirm !== undefined
        ? [
          { action: { id: 'presetManager.accept' as const }, label: presetLayerLabels[0] ?? '' },
          { action: { id: 'presetManager.close' as const }, label: presetLayerLabels[1] ?? '' },
        ]
        : presetManagerDetail
          ? [
            ...(presetManagerDetail.canSetDefault ? [{ action: { id: 'presetManager.setDefault' as const }, label: tuiMessage(locale, 'presets.action.setDefault') }] : []),
            ...(presetManagerDetail.canCopy ? [{ action: { id: 'presetManager.copy' as const }, label: tuiMessage(locale, 'presets.action.copy') }] : []),
            ...(presetManagerDetail.canDelete ? [{ action: { id: 'presetManager.delete' as const }, label: tuiMessage(locale, 'presets.action.delete') }] : []),
            { action: { id: 'presetManager.view' as const }, label: tuiMessage(locale, 'presets.action.view') },
            ...(props.pathOpenerAvailable ? [
              { action: { id: 'presetManager.openFile' as const }, label: tuiMessage(locale, 'presets.action.openFile') },
              { action: { id: 'presetManager.open' as const }, label: tuiMessage(locale, 'presets.action.open') },
            ] : []),
            { action: { id: 'presetManager.close' as const }, label: tuiMessage(locale, 'presets.action.close') },
          ]
          : [{ action: { id: 'presetManager.close' as const }, label: tuiMessage(locale, 'presets.action.close') }]
      return tuiPresetManagerPointerRegions({
        columns,
        rows: terminalRows,
        listVisible: !presetManagerDetail && presetManagerCopyDraft === undefined
          && presetManagerDeleteConfirm === undefined,
        visibleStart: presetManagerVisibleStart,
        visibleCount: visiblePresetManagerItems.length,
        rowHeight: presetManagerRowHeight,
        listTop: 6,
        footerActions,
        footerLine: presetManagerCopyDraft !== undefined
          ? tuiMessage(locale, 'sessions.footer.edit')
          : presetManagerDeleteConfirm !== undefined
            ? tuiMessage(locale, 'sessions.footer.confirm')
            : presetManagerDetail !== undefined
              ? [
                presetManagerDetail.canSetDefault ? tuiMessage(locale, 'presets.action.setDefault') : undefined,
                presetManagerDetail.canCopy ? tuiMessage(locale, 'presets.action.copy') : undefined,
                presetManagerDetail.canDelete ? tuiMessage(locale, 'presets.action.delete') : undefined,
                tuiMessage(locale, 'presets.action.view'),
                props.pathOpenerAvailable ? tuiMessage(locale, 'presets.action.openFile') : undefined,
                props.pathOpenerAvailable ? tuiMessage(locale, 'presets.action.open') : undefined,
                tuiMessage(locale, 'presets.action.close'),
              ].filter((label): label is string => label !== undefined).join(' · ')
              : tuiMessage(locale, 'presets.action.close'),
        context: 'Dialog',
      })
    }
    if (sessionManager !== undefined) {
      const sessionFooterKey = directoryBrowser !== undefined ? 'sessions.directory.footer'
        : sessionManagerEdit !== undefined ? 'sessions.footer.edit'
          : sessionManagerConfirm !== undefined ? 'sessions.footer.confirm'
            : sessionManagerDetail ? sessionManagerTab === 'sessions'
              ? sessionDetailFooterKey : 'sessions.footer.workspaceDetail'
              : sessionManagerTab === 'sessions' ? 'sessions.footer.sessions' : 'sessions.footer.workspaces'
      const sessionFooterLabels = tuiMessage(locale, sessionFooterKey).split(' · ')
      const footerActions: TuiPointerFooterAction[] = directoryBrowser !== undefined
        ? [
          { action: { id: 'sessionManager.accept' as const }, label: sessionFooterLabels[1] ?? '' },
          ...(directoryBrowserPage?.parent === undefined ? [] : [{
            action: { id: 'sessionManager.directoryParent' as const }, label: sessionFooterLabels[2] ?? '',
          }]),
          { action: { id: 'sessionManager.directoryHome' as const }, label: sessionFooterLabels[3] ?? '' },
          { action: { id: 'sessionManager.directoryHidden' as const }, label: sessionFooterLabels[4] ?? '' },
          { action: { id: 'sessionManager.directoryRefresh' as const }, label: sessionFooterLabels[5] ?? '' },
          { action: { id: 'sessionManager.close' as const }, label: sessionFooterLabels[6] ?? '' },
        ]
        : sessionManagerEdit !== undefined || sessionManagerConfirm !== undefined
          ? [
            { action: { id: 'sessionManager.accept' as const }, label: sessionFooterLabels[0] ?? '' },
            { action: { id: 'sessionManager.close' as const }, label: sessionFooterLabels[1] ?? '' },
          ]
          : sessionManagerDetail && sessionManagerTab === 'sessions'
            ? [
              { action: { id: 'sessionManager.resume' as const }, label: sessionFooterLabels[0] ?? '' },
              { action: { id: 'sessionManager.fork' as const }, label: sessionFooterLabels[1] ?? '' },
              { action: { id: 'sessionManager.rename' as const }, label: sessionFooterLabels[2] ?? '' },
              ...(canToggleManagedSessionArchive ? [{
                action: { id: 'sessionManager.archive' as const }, label: sessionFooterLabels[3] ?? '',
              }] : []),
              { action: { id: 'sessionManager.close' as const }, label: sessionFooterLabels.at(-1) ?? '' },
            ]
            : sessionManagerDetail
              ? [
                { action: { id: 'sessionManager.rename' as const }, label: sessionFooterLabels[0] ?? '' },
                { action: { id: 'sessionManager.moveUp' as const }, label: '[' },
                { action: { id: 'sessionManager.moveDown' as const }, label: ']' },
                { action: { id: 'sessionManager.delete' as const }, label: sessionFooterLabels[2] ?? '' },
                { action: { id: 'sessionManager.close' as const }, label: sessionFooterLabels[3] ?? '' },
              ]
              : sessionManagerTab === 'workspaces'
                ? [
                  { action: { id: 'sessionManager.accept' as const }, label: sessionFooterLabels[1] ?? '' },
                  { action: { id: 'sessionManager.add' as const }, label: sessionFooterLabels[2] ?? '' },
                  { action: { id: 'sessionManager.tab' as const, tab: 'sessions' }, label: sessionFooterLabels[3] ?? '' },
                  { action: { id: 'sessionManager.refresh' as const }, label: sessionFooterLabels[4] ?? '' },
                  { action: { id: 'sessionManager.close' as const }, label: sessionFooterLabels[5] ?? '' },
                ]
                : [
                  { action: { id: 'sessionManager.accept' as const }, label: sessionFooterLabels[0] ?? '' },
                  { action: { id: 'sessionManager.scope' as const }, label: sessionFooterLabels[1] ?? '' },
                  { action: { id: 'sessionManager.archiveFilter' as const }, label: sessionFooterLabels[2] ?? '' },
                  { action: { id: 'sessionManager.sort' as const }, label: sessionFooterLabels[3] ?? '' },
                  { action: { id: 'sessionManager.group' as const }, label: sessionFooterLabels[4] ?? '' },
                  { action: { id: 'sessionManager.tab' as const, tab: 'workspaces' }, label: sessionFooterLabels[5] ?? '' },
                  { action: { id: 'sessionManager.close' as const }, label: sessionFooterLabels[6] ?? '' },
                ]
      return tuiSessionManagerPointerRegions({
        columns,
        rows: terminalRows,
        listVisible: directoryBrowser !== undefined
          ? directoryBrowser.phase === 'ready' && directoryBrowserPage !== undefined
          : sessionManager.phase === 'ready' && !sessionManagerDetail
          && sessionManagerEdit === undefined && sessionManagerConfirm === undefined,
        visibleStart: directoryBrowser === undefined ? sessionManagerVisibleStart : directoryVisibleStart,
        visibleCount: directoryBrowser === undefined ? visibleSessionManagerItems.length : visibleDirectoryRows.length,
        rowHeight: directoryBrowser === undefined ? sessionManagerRowHeight : 1,
        ...(directoryBrowser === undefined ? {} : { showTabs: false }),
        ...(directoryBrowser !== undefined ? {} : {
          tabs: {
            row: 4,
            left: 3,
            labels: {
              sessions: tuiMessage(locale, 'sessions.tab.sessions'),
              workspaces: tuiMessage(locale, 'sessions.tab.workspaces'),
            },
          },
        }),
        footerActions,
        footerLine: tuiMessage(locale, sessionFooterKey),
        context: 'Dialog',
      })
    }
    if (queueOpen) {
      const queueFooterKey = queueEditDraft !== undefined ? 'queue.hint.edit'
        : queueDeleteConfirmation ? 'queue.hint.delete'
          : queueDetail ? selectedQueueItem?.canEdit === true || selectedQueueItem?.canDelete === true
            ? 'queue.hint.detailActions' : 'queue.hint.detail'
            : 'queue.hint.list'
      const queueFooterLine = tuiMessage(locale, queueFooterKey)
      const queueFooterLabels = queueFooterLine.split(' · ')
      const queueFooterActions: TuiPointerFooterAction[] = queueEditDraft !== undefined || queueDeleteConfirmation
        ? [
          { action: { id: 'queue.accept' as const }, label: queueFooterLabels[0] ?? '' },
          { action: { id: 'queue.close' as const }, label: queueFooterLabels[1] ?? '' },
        ]
        : queueDetail ? [
          ...(selectedQueueItem?.canEdit === true
            ? [{ action: { id: 'queue.edit' as const }, label: queueFooterLabels[1] ?? '' }] : []),
          ...(selectedQueueItem?.canDelete === true
            ? [{ action: { id: 'queue.delete' as const }, label: queueFooterLabels[2] ?? '' }] : []),
          { action: { id: 'queue.close' as const }, label: queueFooterLabels.at(-1) ?? '' },
        ] : [
          { action: { id: 'queue.accept' as const }, label: queueFooterLabels[1] ?? '' },
          ...(selectedQueueItem?.canEdit === true
            ? [{ action: { id: 'queue.edit' as const }, label: queueFooterLabels[2] ?? '' }] : []),
          ...(selectedQueueItem?.canDelete === true
            ? [{ action: { id: 'queue.delete' as const }, label: queueFooterLabels[3] ?? '' }] : []),
          { action: { id: 'queue.close' as const }, label: queueFooterLabels[4] ?? '' },
        ]
      return tuiQueuePointerRegions({
        columns,
        rows: terminalRows,
        open: true,
        detail: queueDetail,
        editing: queueEditDraft !== undefined,
        confirmingDelete: queueDeleteConfirmation,
        canEdit: selectedQueueItem?.canEdit === true,
        canDelete: selectedQueueItem?.canDelete === true,
        visibleStart: queueVisibleStart,
        visibleCount: visibleQueueItems.length,
        rowHeight: 2,
        footerActions: queueFooterActions,
        footerLine: queueFooterLine,
        context: 'Dialog',
      })
    }
    if (providerCenterVisible) {
      const providerWizardFooterKey = providerWizard?.step === 'models'
        ? 'provider.custom.hint.models'
        : providerWizard?.step === 'picker'
          ? 'provider.custom.hint.picker'
          : providerWizard?.step === 'confirm'
            ? 'provider.custom.hint.confirm'
            : providerWizard?.step === 'protocol'
              ? 'provider.custom.hint.protocol'
              : 'provider.custom.hint.input'
      const providerListFooterKey = providerCenter.onboarding !== undefined
        ? providerCreationTarget === undefined ? 'provider.onboarding.hintNoAdd' : 'provider.onboarding.hint'
        : providerCreationTarget === undefined ? 'provider.hint.list' : 'provider.hint.listAdd'
      const providerFooterLine = providerWizard !== undefined
        ? tuiMessage(locale, providerWizardFooterKey)
        : tuiMessage(locale, providerListFooterKey)
      const providerFooterLabels = providerFooterLine.split(' · ')
      const providerFooterActions: TuiPointerFooterAction[] | undefined = providerWizard !== undefined
        ? providerWizard.step === 'models'
          ? [
            { action: { id: 'provider.wizardAccept' as const }, label: providerFooterLabels[0] ?? '' },
            { action: { id: 'provider.wizardDiscover' as const }, label: providerFooterLabels[1] ?? '' },
            { action: { id: 'provider.wizardBack' as const }, label: providerFooterLabels[2] ?? '' },
          ]
          : providerWizard.step === 'picker'
            ? [
              { action: { id: 'provider.wizardToggle' as const }, label: providerFooterLabels[1] ?? '' },
              { action: { id: 'provider.wizardAccept' as const }, label: providerFooterLabels[2] ?? '' },
              { action: { id: 'provider.wizardBack' as const }, label: providerFooterLabels[3] ?? '' },
            ]
            : providerWizard.step === 'protocol'
              ? [
                { action: { id: 'provider.wizardAccept' as const }, label: providerFooterLabels[1] ?? '' },
                { action: { id: 'provider.wizardBack' as const }, label: providerFooterLabels[2] ?? '' },
              ]
              : [
                { action: { id: 'provider.wizardAccept' as const }, label: providerFooterLabels[0] ?? '' },
                { action: { id: 'provider.wizardBack' as const }, label: providerFooterLabels[1] ?? '' },
              ]
        : providerDetail ? undefined
          : providerCenter.onboarding !== undefined
            ? [
              { action: { id: 'provider.accept' as const }, label: providerFooterLabels[0] ?? '' },
              ...(providerCreationTarget === undefined ? [] : [{
                action: { id: 'provider.add' as const }, label: providerFooterLabels[1] ?? '',
              }]),
              { action: { id: 'provider.close' as const }, label: providerFooterLabels[
                providerCreationTarget === undefined ? 1 : 2
              ] ?? '' },
            ]
            : [
              { action: { id: 'provider.accept' as const }, label: providerFooterLabels[1] ?? '' },
              ...(providerCreationTarget === undefined ? [] : [{
                action: { id: 'provider.add' as const }, label: providerFooterLabels[2] ?? '',
              }]),
              { action: { id: 'provider.refresh' as const }, label: providerFooterLabels[
                providerCreationTarget === undefined ? 2 : 3
              ] ?? '' },
              { action: { id: 'provider.close' as const }, label: providerFooterLabels[
                providerCreationTarget === undefined ? 3 : 4
              ] ?? '' },
            ]
      return tuiProviderPointerRegions({
        columns,
        rows: terminalRows,
        detail: providerDetail,
        wizard: providerWizard !== undefined,
        picker: providerWizard?.step === 'picker',
        ...(providerWizard?.step === 'picker' || providerWizard?.step === 'protocol'
          ? { wizardListKind: providerWizard.step }
          : {}),
        canAdd: providerCreationTarget !== undefined,
        canAuthenticate: providerWizard === undefined
          && providerSecretDraft === undefined && providerEndpointDraft === undefined
          && providerCanAuthenticate,
        ...(providerDetail ? { detailActions: providerDetailPointerActions } : {}),
        visibleStart: providerVisibleStart,
        visibleCount: visibleProviderRows.length,
        rowHeight: providerRowHeight,
        candidateStart: providerWizard?.step === 'protocol' ? 0 : providerCandidateStart,
        candidateCount: providerWizard?.step === 'protocol'
          ? providerWizard.target.protocols.length : visibleProviderCandidates.length,
        candidateTop: 5,
        ...(providerProfilePointerFields.length === 0 ? {} : { profileFields: providerProfilePointerFields }),
        ...(providerFooterActions === undefined ? {} : {
          footerActions: providerFooterActions,
          footerLine: providerFooterLine,
        }),
        context: 'Dialog',
      })
    }
    if (helpVisible || doctorVisible || loadedContextVisible) {
      const line = helpVisible ? helpFooterLine : scrollingDialogFooterLine
      return tuiDialogFooterPointerRegions({
        id: 'dialog', columns, row: terminalRows, lineLeft: helpVisible ? 2 : 3, line,
        actions: [{ action: { id: 'dialog.close' }, label: tuiMessage(locale, 'common.esc.close') }],
      })
    }
    if (footerDetail !== undefined || focus?.mode === 'detail') {
      const detailFooterActions = focusedAssistantOutput === undefined
        ? []
        : [
          { action: { id: 'detail.copy' as const }, label: tuiMessage(locale, 'detail.action.copyOutput') },
          {
            action: { id: 'detail.exportMarkdown' as const },
            label: tuiMessage(locale, 'detail.action.exportMarkdown'),
          },
          ...focusedAssistantParts.length > 1 ? [{
            action: { id: 'detail.toggleScope' as const },
            label: tuiMessage(locale, outputReaderScope === 'segment'
              ? 'detail.action.completeResponse' : 'detail.action.currentSegment'),
          }] : [],
        ]
      const close = tuiDialogFooterPointerRegions({
        id: 'detail', columns, row: terminalRows, lineLeft: 2, line: transcriptDetailFooterLine,
        actions: [
          ...detailFooterActions,
          {
            action: { id: 'detail.close' },
            label: transcriptDetailFooterLine.split(' · ').at(-1) ?? '',
          },
        ],
        context: 'Detail',
      })
      const visibleStart = Math.min(
        focus?.mode === 'detail' ? focus.detailOffset : 0,
        Math.max(0, transcriptDetailLines.length - detailRows),
      )
      const visibleCount = Math.min(detailRows, Math.max(0, transcriptDetailLines.length - visibleStart))
      return Object.freeze([
        ...(feedbackNoteDraft === undefined && focusedFeedbackMessageId !== undefined
          ? tuiFeedbackPointerRegions({
            columns,
            row: transcriptRows + 3 + visibleCount,
            hasFeedback: focusedFeedback !== undefined,
            messageId: focusedFeedbackMessageId,
            labels: feedbackActionLabels,
            context: 'Detail',
          })
          : []),
        ...(focusedActivity === undefined || inspectedActivityTool !== undefined
          ? []
          : tuiActivityPointerRegions({
            columns,
            startRow: transcriptRows + 3,
            visibleStart,
            visibleCount,
            total: focusedActivity.tools.length,
            context: 'Detail',
          })),
        ...(focusedDeliverables === undefined || !props.pathOpenerAvailable
          ? []
          : tuiDeliverablesPointerRegions({
            columns,
            startRow: transcriptRows + 3,
            visibleStart,
            visibleCount,
            total: focusedDeliverables.items.length,
            context: 'Detail',
          })),
        ...(focusedDeliverables === undefined || selectedDeliverable === undefined
          ? []
          : tuiDeliverableActionPointerRegions({
            columns,
            row: transcriptRows + 3 + visibleCount,
            line: deliverableActionLine,
            copyLabel: deliverableActionLine.split(' · ')[1] ?? '',
            ...(props.pathOpenerAvailable
              ? { openLabel: deliverableActionLine.split(' · ')[2] ?? '' }
              : {}),
            context: 'Detail',
          })),
        ...close,
      ])
    }
    if (sessionExportDialog !== undefined) {
      const line = tuiMessage(locale, sessionExportDialog.phase === 'selecting'
        ? 'export.footer.selecting'
        : sessionExportDialog.phase === 'exporting' ? 'export.footer.exporting' : 'common.esc.close')
      const labels = line.split(' · ')
      return tuiDialogFooterPointerRegions({
        id: 'sessionExport',
        columns,
        row: terminalRows,
        lineLeft: 2,
        line,
        actions: sessionExportDialog.phase === 'selecting'
          ? [
            { action: { id: 'sessionExport.accept' }, label: labels[0] ?? '' },
            { action: { id: 'sessionExport.scope' }, label: labels[1] ?? '' },
            { action: { id: 'sessionExport.close' }, label: labels[2] ?? '' },
          ]
          : [{ action: { id: 'sessionExport.close' }, label: labels[0] ?? '' }],
      })
    }
    if (freshSessionDialog !== undefined) {
      const line = tuiMessage(locale, freshSessionDialog.phase === 'creating'
        ? 'common.esc.close' : 'fresh.confirm')
      const labels = line.split(' · ')
      return tuiDialogFooterPointerRegions({
        id: 'fresh',
        columns,
        row: terminalRows,
        lineLeft: 3,
        line,
        actions: freshSessionDialog.phase === 'creating'
          ? [{ action: { id: 'fresh.close' }, label: labels[0] ?? '' }]
          : [
            { action: { id: 'fresh.accept' }, label: labels[0] ?? '' },
            { action: { id: 'fresh.close' }, label: labels[1] ?? '' },
          ],
      })
    }
    if (rewindDialog !== undefined) {
      if (rewindDialog.phase === 'browsing' && rewindConfirmation === undefined) {
        const actionLine = tuiMessage(locale, rewindSelectedCandidate === undefined
          ? 'footer.rewind.empty' : 'footer.rewind.actions')
        const line = `${tuiMessage(locale, 'footer.rewind.title', {
          position: rewindSelectedCandidate === undefined
            ? '0/0' : `${effectiveRewindSelection + 1}/${rewindCandidates.length}`,
        })} · ${actionLine}`
        const labels = actionLine.split(' · ')
        const candidateRegions = tuiRewindCandidatePointerRegions(
          transcriptPointerRegions(
            visible,
            focusTargets,
            Math.max(1, 1 + transcriptRows - transcriptContentRows),
            columns,
            transcriptColumns,
            workspace,
            'Dialog',
            locale,
          ),
          rewindCandidates.map(candidate => `event:${candidate.eventSeq}`),
        )
        const footer = tuiDialogFooterPointerRegions({
          id: 'rewind',
          columns,
          row: terminalRows,
          lineLeft: 2,
          line,
          actions: rewindSelectedCandidate === undefined
            ? [{ action: { id: 'rewind.close' }, label: labels[1] ?? '' }]
            : [
              { action: { id: 'rewind.accept' }, label: labels[1] ?? '' },
              { action: { id: 'rewind.close' }, label: labels[2] ?? '' },
            ],
        })
        return Object.freeze([...candidateRegions, ...footer])
      }
      const activeDraft = hasComposerDraft && composer.text.trim() !== '/rewind'
      const line = rewindConfirmation !== undefined
        ? activeDraft
          ? [
            tuiMessage(locale, 'rewind.stash'),
            tuiMessage(locale, 'rewind.discard'),
            tuiMessage(locale, 'rewind.cancel'),
          ].join(' · ')
          : tuiMessage(locale, 'rewind.confirm')
        : tuiMessage(locale, rewindDialog.phase === 'rewinding' ? 'rewind.footer.cancel' : 'common.esc.close')
      const labels = line.split(' · ')
      return tuiDialogFooterPointerRegions({
        id: 'rewind',
        columns,
        row: terminalRows,
        lineLeft: 3,
        line,
        actions: rewindConfirmation !== undefined
          ? activeDraft
            ? [
              { action: { id: 'rewind.stash' }, label: labels[0] ?? '' },
              { action: { id: 'rewind.discard' }, label: labels[1] ?? '' },
              { action: { id: 'rewind.close' }, label: labels[2] ?? '' },
            ]
            : [
              { action: { id: 'rewind.accept' }, label: labels[0] ?? '' },
              { action: { id: 'rewind.close' }, label: labels[1] ?? '' },
            ]
          : [{ action: { id: 'rewind.close' }, label: labels[0] ?? '' }],
      })
    }
    if (footerSelection !== undefined) return Object.freeze([])
    if (pointerContext === 'PluginHub' && pluginHubDialog !== undefined) {
      return tuiPluginHubPointerRegions({
        columns,
        rows: terminalRows,
        searchVisible: pluginHubSearchVisible,
        detail: pluginHubDetailOpen,
        confirmation: pluginHubPlanOpen,
        view: pluginHubDialog.view,
        phase: pluginHubDialog.phase,
        tabs: {
          line: pluginHubTabsLine,
          installedLabel: pluginHubInstalledTabLabel,
          registryLabel: pluginHubRegistryTabLabel,
          repositoriesLabel: pluginHubRepositoriesTabLabel,
        },
        catalog: pluginHubCatalogLine === undefined ? undefined : {
          line: pluginHubCatalogLine,
          installableLabel: tuiPluginHubInstallableLabel(pluginHubDialog.installableOnly, locale),
          ...(pluginHubHasCategories
            ? { categoryLabel: tuiPluginHubCategoryLabel(pluginHubDialog.category, locale) }
            : {}),
          sortLabel: tuiPluginHubSortLabel(pluginHubDialog.sort, locale),
        },
        detailLinks: pluginHubDiscoveryDetailLinks,
        visibleStart: pluginHubVisibleStart,
        rowHeights: pluginHubRows.slice(
          pluginHubVisibleStart, pluginHubVisibleStart + pluginHubVisibleCount,
        ).map(row => tuiPluginHubCardLayout(row, columns, Date.now(), locale).height),
        footerActions: pluginHubFooterActions,
        footerLine: pluginHubFooterLine,
        context: 'PluginHub',
      })
    }
    if (pointerContext === 'Dialog' && resumeDialog !== undefined) {
      const previewVisible = resumeDialog.phase === 'ready'
        && resumePreviewVisible && selectedResumeCandidate !== undefined
      const resumeFooterLine = resumeConfirmation !== undefined
        ? [
          tuiMessage(locale, 'resume.stash'),
          tuiMessage(locale, 'resume.discard'),
          tuiMessage(locale, 'resume.cancel'),
        ].join(' · ')
        : resumeDialog.phase === 'resuming'
          ? tuiMessage(locale, 'resume.footer.cancel')
          : narrowResume
            ? tuiMessage(locale, 'resume.footer.narrow', {
              direction: tuiMessage(locale, resumeView === 'list'
                ? 'resume.direction.preview' : 'resume.direction.list'),
            })
            : tuiMessage(locale, 'resume.footer.wide')
      const resumeFooterLabels = resumeFooterLine.split(' · ')
      const resumeFooterActions: TuiPointerFooterAction[] = resumeConfirmation !== undefined
        ? [
          { action: { id: 'resume.stash' as const }, label: resumeFooterLabels[0] ?? '' },
          { action: { id: 'resume.discard' as const }, label: resumeFooterLabels[1] ?? '' },
          { action: { id: 'resume.close' as const }, label: resumeFooterLabels[2] ?? '' },
        ]
        : resumeDialog.phase === 'resuming'
          ? [{ action: { id: 'resume.close' as const }, label: resumeFooterLabels[0] ?? '' }]
          : resumeDialog.phase !== 'ready'
            ? [{
              action: { id: 'resume.close' as const },
              label: resumeFooterLabels.at(-1) ?? '',
            }]
            : narrowResume
              ? [
                { action: { id: 'resume.toggleView' as const, view: resumeView === 'list' ? 'preview' : 'list' }, label: resumeFooterLabels[0] ?? '' },
                { action: { id: 'resume.accept' as const }, label: resumeFooterLabels[3] ?? '' },
                { action: { id: 'resume.rename' as const }, label: resumeFooterLabels[4] ?? '' },
                { action: { id: 'resume.close' as const }, label: resumeFooterLabels[5] ?? '' },
              ]
              : [
                { action: { id: 'resume.scope' as const, scope: resumeScope === 'workspace' ? 'all' : 'workspace' }, label: resumeFooterLabels[2] ?? '' },
                { action: { id: 'resume.accept' as const }, label: resumeFooterLabels[3] ?? '' },
                { action: { id: 'resume.rename' as const }, label: resumeFooterLabels[4] ?? '' },
                { action: { id: 'resume.close' as const }, label: resumeFooterLabels[5] ?? '' },
              ]
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
        scopeTabs: {
          row: 4,
          left: 2,
          workspaceLabel: tuiMessage(locale, resumeScope === 'workspace'
            ? 'resume.scope.workspace.active' : 'resume.scope.workspace'),
          allLabel: tuiMessage(locale, resumeScope === 'all'
            ? 'resume.scope.all.active' : 'resume.scope.all'),
          gap: ' ',
        },
        footerActions: resumeFooterActions,
        footerLine: resumeFooterLine,
        context: 'Dialog',
      })
    }
    if (workOpen) return tuiWorkPointerRegions(
      work.items.length, effectiveWorkSelection, transcriptRows, columns, 'Work', {
        row: terminalRows,
        line: workFooterLine,
        lineLeft: 2,
        actions: [
          ...(selectedWorkItem?.inspectable === true
            ? [{ action: { id: 'work.open' as const }, label: tuiMessage(locale, 'footer.work.open') }] : []),
          ...(selectedWorkItem?.action === undefined || selectedWorkItem.action === 'none'
            ? [] : [{ action: { id: 'work.stop' as const }, label: tuiMessage(locale, 'footer.work.stop') }]),
          { action: { id: 'work.close' as const }, label: tuiMessage(locale, 'common.esc.close') },
        ],
      },
    )
    if (pointerContext === 'Composer' || pointerContext === 'Transcript') {
      const suggestionTop = Math.max(1, terminalRows - 2 - (composerRows + 2) - suggestionRows + 1)
      const footerRows = props.extensions.renderStatus(Math.max(1, columns - 2), locale).length > 0 ? 2 : 1
      const browseFooterLine = tuiMessage(locale, 'footer.browse')
      const browseFooterLabels = browseFooterLine.split(' · ')
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
        ...(transcriptScreenMap === undefined || inlineDeliverableReferences.length === 0
          ? []
          : tuiDeliverableInlinePointerRegions({
            map: transcriptScreenMap,
            topRow: transcriptScreenTopRow,
            references: inlineDeliverableReferences,
            openerAvailable: props.pathOpenerAvailable,
            context: pointerContext,
          })),
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
        ...(footerItemsPointerVisible
          ? tuiFooterPointerRegions(mountedFooterItems, columns, terminalRows, pointerContext) : []),
        ...(focus?.mode === 'browse' && pointerContext === 'Transcript'
          ? tuiDialogFooterPointerRegions({
            id: 'transcript:browse', columns, row: terminalRows, lineLeft: 2,
            line: browseFooterLine,
            actions: [
              { action: { id: 'transcript.openFocused' }, label: browseFooterLabels[1] ?? '' },
              { action: { id: 'transcript.closeBrowse' }, label: browseFooterLabels[2] ?? '' },
            ],
            context: 'Transcript',
          }) : []),
        ...goalPlanRow === undefined ? [] : tuiGoalPlanPointerRegions(columns, goalPlanRow, pointerContext),
        ...tuiQueuePointerRegions({
          columns,
          rows: terminalRows,
          open: false,
          detail: false,
          editing: false,
          confirmingDelete: false,
          canEdit: false,
          canDelete: false,
          collapsedRow: queueCardRow,
          visibleStart: 0,
          visibleCount: 0,
          rowHeight: 1,
          context: pointerContext,
        }),
        ...(pointerContext === 'Composer' && attachmentRail.count > 0
          ? tuiAttachmentRailPointerRegions({
            columns,
            startRow: terminalRows - footerRows - attachmentRail.count - 1,
            count: attachmentRail.count,
            context: 'Composer',
          })
          : []),
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
  const fullscreenCloseLabel = tuiMessage(locale, 'common.esc.close')
  const fullscreenFooterLine = tuiFullscreenFooterLine(fullscreenFrame?.footer, fullscreenCloseLabel)
  const fullscreenCloseRegions = useMemo(() => tuiDialogFooterPointerRegions({
    id: 'fullscreen', columns, row: terminalRows, lineLeft: 3, line: fullscreenFooterLine,
    actions: [{ action: { id: 'dialog.close' }, label: fullscreenCloseLabel }],
  }), [columns, fullscreenCloseLabel, fullscreenFooterLine, terminalRows])
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
    if (goalPlanSurface !== undefined) return
    setGoalPlanOpen(false)
    setGoalEditDraft(undefined)
    setGoalClearConfirmation(false)
    setGoalPlanError('')
  }, [goalPlanSurface])

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

  const commitQuestionAnswer = (answer: AskUserQuestionAnswerItem): void => {
    if (interaction?.kind !== 'question') return
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

  const submitQuestion = (): void => {
    if (interaction?.kind !== 'question') return
    const question = interaction.request.questions[questionIndex]
    if (question === undefined) return
    commitQuestionAnswer(answerFor(question, composer.text))
  }

  const selectQuestionOption = (index: number): void => {
    if (interaction?.kind !== 'question') return
    const question = interaction.request.questions[questionIndex]
    const options = question?.options ?? []
    if (index < 0 || index >= options.length) return
    const option = options[index]
    if (question !== undefined && option !== undefined && question.multiSelect !== true) {
      commitQuestionAnswer({ id: question.id, selected: [option.label] })
      return
    }
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
    const selectedPath = (selectedItem?.source === 'file' && selectedItem.referenceKind === 'file')
      ? selectedItem.referencePath
      : selectedItem?.source === 'path' && selectedItem.description === 'file'
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
    if (item.action === 'goalPlan') {
      setFooterSelection(undefined)
      openGoalPlan()
      return
    }
    if (item.action === 'detail') {
      setFooterDetail({ itemId: item.id, offset: 0 })
      return
    }
    if (item.action === 'bottom') {
      setTranscriptAnchor(undefined)
      setFocus(undefined)
      setTranscriptSearch(undefined)
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
    if (pluginHubDialog.phase === 'detail') {
      if (pluginHubDialog.discoveryDetail !== undefined) {
        void props.onOpenUrl(pluginHubDialog.discoveryDetail.repository.url)
      } else if (pluginHubDialog.detail?.latestVersion?.installable === true
        && pluginHubDialog.profileMutations !== false) {
        void props.onPluginHubInstall()
      }
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
    if (pluginHubDialog.view === 'discovery') {
      props.onPluginHubDiscoveryDetail(selected.id)
      return
    }
    const catalogItem = pluginHubItems?.find(item => String(item.id) === selected.id)
    if (catalogItem !== undefined) void props.onPluginHubDetail(catalogItem.id)
  }

  const openQueue = (): void => {
    if (queue.items.length === 0 || busy) return
    setQueueOpen(true)
    setQueueSelection(previous => Math.min(previous, queue.items.length - 1))
    setQueueDetail(false)
    setQueueDetailOffset(0)
    setQueueEditDraft(undefined)
    setQueueDeleteConfirmation(false)
    setQueueError('')
  }

  const closeQueueLayer = (): void => {
    if (queueEditDraft !== undefined) {
      setQueueEditDraft(undefined)
      setQueueError('')
    } else if (queueDeleteConfirmation) {
      setQueueDeleteConfirmation(false)
      setQueueError('')
    } else if (queueDetail) {
      setQueueDetail(false)
      setQueueDetailOffset(0)
      setQueueError('')
    } else {
      setQueueOpen(false)
      setQueueError('')
    }
  }

  const openSelectedQueueDetail = (): void => {
    if (selectedQueueItem === undefined) return
    setQueueDetail(true)
    setQueueDetailOffset(0)
    setQueueError('')
  }

  const editSelectedQueueItem = (): void => {
    if (selectedQueueItem?.canEdit !== true) {
      setQueueError(tuiMessage(locale, 'queue.error.notEditable'))
      return
    }
    setQueueEditDraft(selectedQueueItem.text)
    setQueueDeleteConfirmation(false)
    setQueueError('')
  }

  const saveQueueEdit = (): void => {
    if (selectedQueueItem === undefined || queueEditDraft === undefined) return
    const result = editTuiQueueItem(props.agent, selectedQueueItem.id, queueEditDraft, queue.revision)
    if (!result.ok) {
      setQueueError(tuiMessage(locale, result.reason === 'revision-conflict' || result.reason === 'not-pending'
        ? 'queue.error.consumed' : 'queue.error.notEditable'))
      return
    }
    setQueueEditDraft(undefined)
    setQueueError('')
  }

  const askDeleteSelectedQueueItem = (): void => {
    if (selectedQueueItem?.canDelete !== true) {
      setQueueError(tuiMessage(locale, 'queue.error.notDeletable'))
      return
    }
    setQueueDeleteConfirmation(true)
    setQueueEditDraft(undefined)
    setQueueError('')
  }

  const deleteSelectedQueueItem = (): void => {
    if (selectedQueueItem === undefined) return
    const result = deleteTuiQueueItem(props.agent, selectedQueueItem.id, queue.revision)
    if (!result.ok) {
      setQueueError(tuiMessage(locale, result.reason === 'revision-conflict' || result.reason === 'not-pending'
        ? 'queue.error.consumed' : 'queue.error.notDeletable'))
      setQueueDeleteConfirmation(false)
      return
    }
    setQueueDeleteConfirmation(false)
    setQueueDetail(false)
    setQueueDetailOffset(0)
    setQueueError('')
  }

  const openGoalPlan = (): void => {
    if (goalPlanSurface === undefined) {
      setNotice(tuiMessage(locale, 'goalPlan.none'))
      return
    }
    setGoalPlanOpen(true)
    setGoalEditDraft(undefined)
    setGoalClearConfirmation(false)
    setGoalPlanError('')
  }

  const closeGoalPlanLayer = (): void => {
    if (goalEditDraft !== undefined) setGoalEditDraft(undefined)
    else if (goalClearConfirmation) setGoalClearConfirmation(false)
    else setGoalPlanOpen(false)
    setGoalPlanError('')
  }

  const runGoalPlanMutation = (operation: () => Promise<void>): void => {
    if (busy) return
    setBusy(true)
    setGoalPlanError('')
    void operation().then(() => {
      setGoalEditDraft(undefined)
      setGoalClearConfirmation(false)
    }, (error: unknown) => {
      setGoalPlanError(tuiGoalPlanMutationErrorMessage(error, locale))
    }).finally(() => { setBusy(false) })
  }

  const saveGoalEdit = (): void => {
    const objective = goalEditDraft?.trim()
    if (objective === undefined || objective === '') {
      setGoalPlanError(tuiMessage(locale, 'goalPlan.edit.blank'))
      return
    }
    runGoalPlanMutation(() => props.onEditGoal(objective))
  }

  const closeSessionManagerLayer = (): void => {
    if (directoryBrowser !== undefined) {
      directoryBrowserAbort.current?.abort(new Error('TUI directory browser closed'))
      directoryBrowserAbort.current = undefined
      setDirectoryBrowser(undefined)
      setSessionManagerError('')
    } else if (sessionManagerEdit !== undefined) {
      setSessionManagerEdit(undefined)
      setSessionManagerError('')
    } else if (sessionManagerConfirm !== undefined) {
      setSessionManagerConfirm(undefined)
      setSessionManagerError('')
    } else if (sessionManagerDetail) {
      setSessionManagerDetail(false)
      setSessionManagerError('')
    } else if (sessionManagerQuery !== '') {
      setSessionManagerQuery('')
      setSessionManagerSelection(0)
      setSessionManagerError('')
    } else props.onCloseSessionManager()
  }

  const runSessionManagerMutation = (operation: () => Promise<void>): void => {
    setSessionManagerError('')
    void operation().then(() => {
      setSessionManagerEdit(undefined)
      setSessionManagerConfirm(undefined)
      setSessionManagerDetail(false)
      setSessionManagerError('')
    }, (error: unknown) => {
      setSessionManagerError(error instanceof Error ? error.message : String(error))
    })
  }

  const persistSessionManagerPreferences = (patch: Partial<TuiSessionManagerPreferences>): void => {
    void props.onUpdateSessionManagerPreferences(patch).catch((error: unknown) => {
      setSessionManagerError(error instanceof Error ? error.message : String(error))
    })
  }

  const loadWorkspaceDirectory = (path?: string): void => {
    const capability = props.directoryPicker
    if (capability?.kind !== 'browse') return
    directoryBrowserAbort.current?.abort(new Error('TUI directory listing superseded'))
    const controller = new AbortController()
    directoryBrowserAbort.current = controller
    setDirectoryBrowser(previous => ({
      phase: 'loading',
      ...(previous?.listing === undefined ? {} : { listing: previous.listing }),
      ...(path === undefined ? {} : { requestedPath: path }),
      selection: 0,
      showHidden: previous?.showHidden ?? false,
      error: '',
    }))
    void capability.list(path, controller.signal).then((listing) => {
      if (controller.signal.aborted || directoryBrowserAbort.current !== controller) return
      setDirectoryBrowser(previous => ({
        phase: 'ready',
        listing,
        selection: 0,
        showHidden: previous?.showHidden ?? false,
        error: '',
      }))
    }).catch((error: unknown) => {
      if (controller.signal.aborted || directoryBrowserAbort.current !== controller) return
      setDirectoryBrowser(previous => ({
        phase: 'error',
        ...(previous?.listing === undefined ? {} : { listing: previous.listing }),
        ...(path === undefined ? {} : { requestedPath: path }),
        selection: previous?.selection ?? 0,
        showHidden: previous?.showHidden ?? false,
        error: terminalSafe(error instanceof Error ? error.message : String(error)),
      }))
    }).finally(() => {
      if (directoryBrowserAbort.current === controller) directoryBrowserAbort.current = undefined
    })
  }

  const beginWorkspaceAdd = (): void => {
    const capability = props.directoryPicker
    if (sessionManager === undefined || busy) return
    if (capability === undefined) {
      setSessionManagerEdit({ kind: 'workspace-add', draft: sessionManager.currentWorkspaceLabel })
      setSessionManagerError(tuiMessage(locale, 'sessions.directory.unavailable'))
      return
    }
    if (capability.kind === 'browse') {
      setSessionManagerEdit(undefined)
      setSessionManagerError('')
      setDirectoryBrowser({ phase: 'loading', selection: 0, showHidden: false, error: '' })
      loadWorkspaceDirectory()
      return
    }
    setBusy(true)
    setSessionManagerError('')
    const controller = new AbortController()
    directoryBrowserAbort.current = controller
    void capability.pick(controller.signal).then((path) => {
      if (path !== null) setSessionManagerEdit({ kind: 'workspace-add', draft: path })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setSessionManagerError(terminalSafe(error instanceof Error ? error.message : String(error)))
      }
    }).finally(() => {
      if (directoryBrowserAbort.current === controller) directoryBrowserAbort.current = undefined
      setBusy(false)
    })
  }

  const acceptWorkspaceDirectory = (index = effectiveDirectorySelection): void => {
    const row = directoryBrowserPage?.rows[index]
    if (row === undefined) return
    if (row.kind === 'directory') {
      loadWorkspaceDirectory(row.path)
      return
    }
    directoryBrowserAbort.current?.abort(new Error('TUI directory selected'))
    directoryBrowserAbort.current = undefined
    setDirectoryBrowser(undefined)
    setSessionManagerEdit({ kind: 'workspace-add', draft: row.path })
    setSessionManagerError('')
  }

  const saveSessionManagerEdit = (): void => {
    const edit = sessionManagerEdit
    if (edit === undefined || edit.draft.trim() === '') {
      setSessionManagerError(tuiMessage(locale, 'sessions.error.blank'))
      return
    }
    if (edit.kind === 'workspace-add') {
      runSessionManagerMutation(() => props.onCreateManagedWorkspace(edit.draft.trim()))
    } else if (edit.kind === 'workspace-rename' && selectedManagedWorkspace !== undefined) {
      runSessionManagerMutation(() => props.onRenameManagedWorkspace(selectedManagedWorkspace, edit.draft))
    } else if (edit.kind === 'session-rename' && selectedManagedSession !== undefined) {
      runSessionManagerMutation(() => props.onRenameManagedSession(selectedManagedSession.candidate, edit.draft))
    }
  }

  const confirmSessionManagerMutation = (): void => {
    if (sessionManagerConfirm === 'workspace-delete' && selectedManagedWorkspace !== undefined) {
      runSessionManagerMutation(() => props.onDeleteManagedWorkspace(selectedManagedWorkspace))
    } else if ((sessionManagerConfirm === 'session-archive' || sessionManagerConfirm === 'session-unarchive')
      && selectedManagedSession !== undefined) {
      runSessionManagerMutation(() => props.onArchiveManagedSession(
        selectedManagedSession.candidate, sessionManagerConfirm === 'session-archive',
      ))
    }
  }

  const patchProviderWizard = (patch: Partial<TuiProviderWizardState>): void => {
    setProviderWizard(previous => previous === undefined ? undefined : Object.freeze({
      ...previous, ...patch,
    }))
  }

  const openProviderWizard = (): void => {
    if (providerCreationTarget === undefined || busy) return
    setProviderDetail(false)
    setProviderWizardSecret('')
    setProviderWizard(createProviderWizard(providerCreationTarget))
  }

  const backProviderWizard = (): void => {
    if (providerWizard === undefined || busy) return
    const previous: Partial<Record<TuiProviderWizardStep, TuiProviderWizardStep | undefined>> = {
      id: undefined,
      name: 'id',
      endpoint: 'name',
      protocol: 'endpoint',
      key: 'protocol',
      models: 'key',
      picker: 'models',
      confirm: 'models',
    }
    const step = previous[providerWizard.step]
    if (step === undefined) {
      setProviderWizard(undefined)
      setProviderWizardSecret('')
    } else {
      patchProviderWizard({ step, error: '' })
    }
  }

  const acceptProviderWizard = (): void => {
    const wizard = providerWizard
    if (wizard === undefined || busy) return
    if (wizard.step === 'id') {
      const id = wizard.id.trim()
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(id)) {
        patchProviderWizard({ error: tuiMessage(locale, 'provider.custom.error.id') })
      } else if (wizard.target.existingProviderIds.includes(id)) {
        patchProviderWizard({ error: tuiMessage(locale, 'provider.custom.error.taken') })
      } else patchProviderWizard({ id, displayName: wizard.displayName || id, step: 'name', error: '' })
      return
    }
    if (wizard.step === 'name') {
      const displayName = wizard.displayName.trim()
      if (displayName === '') patchProviderWizard({ error: tuiMessage(locale, 'provider.custom.error.name') })
      else patchProviderWizard({ displayName, step: 'endpoint', error: '' })
      return
    }
    if (wizard.step === 'endpoint') {
      try {
        const endpoint = validateTuiProviderEndpoint(wizard.endpoint)
        patchProviderWizard({ endpoint, step: 'protocol', error: '' })
      } catch {
        patchProviderWizard({ error: tuiMessage(locale, 'provider.custom.error.endpoint') })
      }
      return
    }
    if (wizard.step === 'protocol') {
      patchProviderWizard({ step: 'key', error: '' })
      return
    }
    if (wizard.step === 'key') {
      try {
        if (providerWizardSecret.trim() !== '') validateTuiProviderApiKey(providerWizardSecret)
        patchProviderWizard({ step: 'models', error: '' })
      } catch {
        patchProviderWizard({ error: tuiMessage(locale, 'provider.custom.error.key') })
      }
      return
    }
    if (wizard.step === 'models') {
      const models = providerWizardModels(wizard.modelText, wizard.models)
      if (models.length === 0) {
        patchProviderWizard({ error: tuiMessage(locale, 'provider.custom.error.models') })
      } else patchProviderWizard({ models, step: 'confirm', error: '' })
      return
    }
    if (wizard.step === 'picker') {
      const selected = wizard.candidates.filter(candidate => wizard.picked.has(candidate.id))
      const byId = new Map(wizard.models.map(model => [model.id, model]))
      for (const candidate of selected) byId.set(candidate.id, byId.get(candidate.id) ?? candidate)
      const models = Object.freeze([...byId.values()])
      patchProviderWizard({
        models,
        modelText: models.map(model => model.id).join(', '),
        step: 'models',
        candidates: Object.freeze([]),
        picked: new Set<string>(),
        error: '',
      })
      return
    }
    const draft = providerWizardDraft(wizard, providerWizardSecret)
    setBusy(true)
    patchProviderWizard({ error: '' })
    void props.onCreateCustomProvider(wizard.target, draft).then(() => {
      setProviderWizard(undefined)
      setProviderWizardSecret('')
    }).catch((error: unknown) => {
      if (error instanceof TuiCustomProviderError
        && (error.code === 'credential-write-failed' || error.code === 'credentials-unavailable')) {
        setProviderWizard(undefined)
        setProviderWizardSecret('')
        setNotice(tuiMessage(locale, 'provider.custom.error.credentialPartial'))
        return
      }
      patchProviderWizard({ error: providerWizardFailure(error, locale) })
    }).finally(() => { setBusy(false) })
  }

  const discoverProviderWizardModels = (): void => {
    const wizard = providerWizard
    if (wizard === undefined || wizard.step !== 'models' || busy) return
    setBusy(true)
    patchProviderWizard({ error: '' })
    void props.onDiscoverCustomProviderModels(
      wizard.target,
      providerWizardDraft({ ...wizard, models: providerWizardModels(wizard.modelText, wizard.models) }, providerWizardSecret),
    ).then((candidates) => {
      if (candidates.length === 0) {
        patchProviderWizard({ error: tuiMessage(locale, 'provider.custom.discovery.empty') })
        return
      }
      const known = new Set(wizard.models.map(model => model.id))
      patchProviderWizard({
        step: 'picker',
        candidates,
        picked: new Set(candidates.filter(candidate => !known.has(candidate.id)).map(candidate => candidate.id)),
        candidateIndex: 0,
        error: '',
      })
    }).catch((error: unknown) => {
      patchProviderWizard({ error: providerWizardFailure(error, locale) })
    }).finally(() => { setBusy(false) })
  }

  const authenticateSelectedProvider = (): void => {
    if (selectedProvider === undefined || !providerCanAuthenticate || busy) return
    setBusy(true)
    setNotice('')
    void props.onAuthenticateProvider(selectedProvider.id).catch(() => {
      setNotice(tuiMessage(locale, 'provider.signInFailed'))
    }).finally(() => { setBusy(false) })
  }

  const saveSelectedProviderApiKey = (): void => {
    if (selectedProvider === undefined || providerSecretDraft === undefined || !providerCanStoreKey || busy) return
    try {
      validateTuiProviderApiKey(providerSecretDraft)
    } catch {
      setProviderSecretError(tuiMessage(locale, 'provider.key.invalid'))
      return
    }
    const provider = selectedProvider.id
    const key = providerSecretDraft
    setBusy(true)
    setProviderSecretError('')
    void props.onSaveProviderApiKey(provider, key).then(() => {
      setProviderSecretDraft(undefined)
      setProviderSecretError('')
    }).catch((error: unknown) => {
      setProviderSecretError(error instanceof TuiProviderApiKeyError && error.code === 'invalid-key'
        ? tuiMessage(locale, 'provider.key.invalid')
        : tuiMessage(locale, 'provider.key.failed'))
    }).finally(() => { setBusy(false) })
  }

  const saveSelectedProviderEndpoint = (reset = false): void => {
    const draft = providerEndpointDraft
    if (selectedProvider === undefined || (!reset && draft === undefined)
      || selectedProvider.settings?.writable !== true || busy) return
    if (!reset) {
      if (draft === undefined) return
      try {
        validateTuiProviderEndpoint(draft)
      } catch {
        setProviderEndpointError(tuiMessage(locale, 'provider.endpoint.invalid'))
        return
      }
    }
    const provider = selectedProvider.id
    const endpoint = reset ? undefined : draft
    setBusy(true)
    setProviderEndpointError('')
    void props.onSaveProviderEndpoint(provider, endpoint).then(() => {
      setProviderEndpointDraft(undefined)
      setProviderEndpointError('')
    }).catch((error: unknown) => {
      setProviderEndpointError(error instanceof TuiProviderEndpointError && error.code === 'invalid-endpoint'
        ? tuiMessage(locale, 'provider.endpoint.invalid')
        : tuiMessage(locale, 'provider.endpoint.failed'))
    }).finally(() => { setBusy(false) })
  }

  const openSelectedProviderProfile = (): void => {
    if (selectedProvider === undefined || !providerCanEditProfile || busy) return
    const editor = createProviderProfileEditor(selectedProvider)
    if (editor !== undefined) setProviderProfileEditor(editor)
  }

  const patchProviderProfileEditor = (patch: Partial<TuiProviderProfileEditorState>): void => {
    setProviderProfileEditor(previous => previous === undefined ? undefined : Object.freeze({ ...previous, ...patch }))
  }

  const cycleProviderProfileField = (direction: -1 | 1): void => {
    const editor = providerProfileEditor
    const row = providerRows.find(candidate => candidate.id === editor?.providerId)
    if (editor === undefined || row === undefined) return
    const fields = providerProfileFields(row)
    const index = fields.indexOf(editor.field)
    if (index < 0 || fields.length === 0) return
    const field = fields[(index + direction + fields.length) % fields.length]
    if (field !== undefined) patchProviderProfileEditor({ field, error: '' })
  }

  const saveSelectedProviderProfile = (): void => {
    const editor = providerProfileEditor
    if (editor === undefined || busy) return
    let draft: TuiProviderProfileDraft
    try {
      draft = providerProfileDraft(editor)
    } catch {
      patchProviderProfileEditor({ error: tuiMessage(locale, 'provider.profile.error.models') })
      return
    }
    setBusy(true)
    patchProviderProfileEditor({ error: '' })
    void props.onSaveProviderProfile(editor.providerId, draft).then(() => {
      setProviderProfileEditor(undefined)
    }).catch((error: unknown) => {
      const key = error instanceof TuiProviderProfileError
        ? error.code === 'settings-conflict' ? 'provider.profile.error.conflict'
          : error.code === 'invalid-display-name' ? 'provider.profile.error.name'
            : error.code === 'invalid-protocol' ? 'provider.profile.error.protocol'
              : error.code === 'models-required' || error.code === 'invalid-model'
                ? 'provider.profile.error.models'
                : 'provider.profile.error.failed'
        : 'provider.profile.error.failed'
      patchProviderProfileEditor({ error: tuiMessage(locale, key) })
    }).finally(() => { setBusy(false) })
  }

  const removeSelectedProvider = (): void => {
    const provider = providerDeleteConfirmation
    if (provider === undefined || busy) return
    setBusy(true)
    setProviderSecretError('')
    void props.onRemoveProvider(provider).then(() => {
      setProviderDeleteConfirmation(undefined)
      setProviderDetail(false)
      setProviderDetailOffset(0)
    }).catch((error: unknown) => {
      setProviderSecretError(tuiMessage(locale,
        error instanceof TuiProviderRemoveError && error.code === 'settings-conflict'
          ? 'provider.remove.error.conflict' : 'provider.remove.error.failed'))
    }).finally(() => { setBusy(false) })
  }

  const logoutSelectedProvider = (): void => {
    const provider = providerLogoutConfirmation
    if (provider === undefined || busy) return
    setBusy(true)
    setProviderSecretError('')
    void props.onLogoutProvider(provider).then(() => {
      setProviderLogoutConfirmation(undefined)
    }).catch(() => {
      setProviderSecretError(tuiMessage(locale, 'provider.logout.error'))
    }).finally(() => { setBusy(false) })
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

  const toggleTranscriptTargetDetail = (target: FocusTarget, index: number): void => {
    setFocus(previous => toggleTuiTranscriptFocus(previous, target.key, index))
    if (target.node.kind !== 'todo') {
      const parentIndex = transcriptViewport.indexOfNode(target.node)
      setTranscriptAnchor(previous => transcriptScroll.ensureVisible(
        previous, transcriptPage, target.node.key, parentIndex,
      ))
    }
  }

  const selectActivityTool = (index: number): void => {
    if (focusedActivity === undefined || focusedActivity.tools.length === 0) return
    const next = Math.max(0, Math.min(focusedActivity.tools.length - 1, index))
    setActivityInspector({ key: focusedActivity.key, selection: next })
    setFocus((previous) => {
      if (previous?.mode !== 'detail') return previous
      const offset = next < previous.detailOffset
        ? next
        : next >= previous.detailOffset + detailRows
          ? Math.max(0, next - detailRows + 1)
          : previous.detailOffset
      return { ...previous, detailOffset: offset }
    })
  }

  const inspectActivityTool = (index = activitySelection): void => {
    const tool = focusedActivity?.tools[index]
    if (focusedActivity === undefined || tool === undefined) return
    setActivityInspector({ key: focusedActivity.key, selection: index, callId: tool.callId })
    setFocus(previous => previous?.mode !== 'detail' ? previous : { ...previous, detailOffset: 0 })
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
    if (result.ok) {
      setNotice('')
      setConfirmationNotice(previous => ({
        text: tuiMessage(locale, 'clipboard.selection.copied'),
        generation: (previous?.generation ?? 0) + 1,
      }))
    } else {
      setConfirmationNotice(undefined)
      setNotice(result.message ?? tuiMessage(locale, 'clipboard.selection.retained'))
    }
  }

  const copyFocusedDetail = (): void => {
    const copyText = screenSelection?.surface === 'detail'
      ? tuiScreenSelectionText(screenSelection.map, screenSelection.range)
      : focusedAssistantOutput !== undefined
        ? focusedAssistantReaderText
        : (footerDetailItem === undefined && focusedTarget !== undefined
          ? tuiTranscriptDetailText(focusedTarget.node, inspectedActivityTool ?? focusedTarget.child, locale)
          : footerDetailItem?.detailLines.join('\n') ?? '')
    const result = props.onCopy(copyText)
    if (result.ok) {
      setNotice('')
      setConfirmationNotice(previous => ({
        text: tuiMessage(locale, 'clipboard.detail.copied'),
        generation: (previous?.generation ?? 0) + 1,
      }))
    } else {
      setConfirmationNotice(undefined)
      setNotice(result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
    }
  }

  const copyAssistantOutput = (text: string): void => {
    const result = props.onCopy(text)
    if (result.ok) {
      setNotice('')
      setConfirmationNotice(previous => ({
        text: tuiMessage(locale, 'clipboard.output.copied'),
        generation: (previous?.generation ?? 0) + 1,
      }))
    } else {
      setConfirmationNotice(undefined)
      setNotice(result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
    }
  }

  const exportAssistantOutput = (text: string, kind: TuiOutputExportKind): void => {
    void props.onExportOutput(text, kind).then((result) => {
      if (result.ok) {
        setNotice('')
        setConfirmationNotice(previous => ({
          text: tuiMessage(locale, 'output.export.complete', { path: result.path }),
          generation: (previous?.generation ?? 0) + 1,
        }))
      } else {
        setConfirmationNotice(undefined)
        setNotice(result.message ?? tuiMessage(locale, 'output.export.failed'))
      }
    })
  }

  const exportFocusedOutput = (): void => {
    if (focusedAssistantOutput === undefined) return
    exportAssistantOutput(
      focusedAssistantReaderText,
      outputReaderScope === 'response' ? 'response' : 'output',
    )
  }

  const cancelInteraction = (): void => {
    if (interaction === undefined) return
    setComposer(createComposerState())
    setNotice('')
    props.interactions.cancelCurrent()
  }

  const openHostSettingsRow = (row: TuiHostSettingsRow): void => {
    setHostSettingsDetailNs(String(row.ns))
    setHostSettingsFieldSelection(0)
    setHostSettingsDrafts({})
    setHostSettingsEditing(false)
    setHostSettingsError('')
    setHostPluginDetail(undefined)
    setHostPresetDetail(undefined)
  }

  const discardHostSettingsDrafts = (): void => {
    setHostSettingsDrafts({})
    setHostSettingsEditing(false)
    setHostSettingsError('')
  }

  const selectHostPluginTab = (tab: 'plugins' | 'presets' | 'settings'): void => {
    setHostPluginTab(tab)
    setHostPluginSelection(0)
    setHostPluginDetail(undefined)
    setHostPresetDetail(undefined)
    setHostSettingsDetailNs(undefined)
    discardHostSettingsDrafts()
  }

  const selectHostSettingsField = (index: number): void => {
    if (hostSettingsFields[index] === undefined) return
    setHostSettingsFieldSelection(index)
    setHostSettingsEditing(false)
    setHostSettingsError('')
  }

  const editSelectedHostSetting = (): void => {
    if (selectedHostSettingsField === undefined || !hostSettingsCanEdit) return
    setHostSettingsDrafts(previous => ({
      ...previous,
      [selectedHostSettingsField.id]: previous[selectedHostSettingsField.id]
        ?? { text: selectedHostSettingsField.value },
    }))
    setHostSettingsEditing(true)
    setHostSettingsError('')
  }

  const cycleSelectedHostSetting = (): void => {
    if (selectedHostSettingsField?.kind !== 'enum' || !hostSettingsCanEdit) return
    const options = selectedHostSettingsField.options ?? []
    const current = hostSettingsDrafts[selectedHostSettingsField.id]?.text ?? selectedHostSettingsField.value
    const next = options[(Math.max(0, options.indexOf(current)) + 1) % Math.max(1, options.length)]
    if (next !== undefined) {
      setHostSettingsDrafts(previous => ({
        ...previous,
        [selectedHostSettingsField.id]: { text: next },
      }))
    }
  }

  const selectTrajectoryInspectorTab = (tab: 'summary' | 'input' | 'output' | 'timing'): void => {
    setTrajectoryInspectorTab(tab)
  }

  const cycleTrajectoryInspectorTab = (): void => {
    const tabs = ['summary', 'input', 'output', 'timing'] as const
    const tab = tabs[(tabs.indexOf(trajectoryInspectorTab) + 1) % tabs.length]
    if (tab !== undefined) selectTrajectoryInspectorTab(tab)
  }

  const acceptPresetManagerLayer = (): void => {
    const copyDraft = presetManagerCopyDraft
    if (copyDraft !== undefined) {
      if (copyDraft.step === 'id') {
        try {
          validateTuiPresetId(copyDraft.idDraft, presetManagerRows.map(row => row.preset.id))
          setPresetManagerCopyDraft(current => current === undefined ? undefined : { ...current, step: 'name' })
          setPresetManagerError('')
        } catch (error) {
          setPresetManagerError(error instanceof TuiPresetIdError
            ? tuiMessage(locale, `presets.id.${error.code === 'empty' ? 'empty' : error.code === 'id-taken' ? 'taken' : 'invalid'}`,
              error.code === 'id-taken' ? { id: copyDraft.idDraft.trim() } : {})
            : String(error))
        }
        return
      }
      const id = copyDraft.idDraft.trim()
      const name = copyDraft.nameDraft.trim() || undefined
      void (async () => {
        try {
          await props.onCopyPreset(copyDraft.sourceId, id, name)
          setPresetManagerCopyDraft(undefined)
          setPresetManagerError('')
          await props.onRefreshPresetManager()
        } catch (error) {
          setPresetManagerError(tuiPresetMutationErrorMessage(error, 'copy', locale))
        }
      })()
      return
    }
    const deleteTarget = presetManagerDeleteConfirm
    if (deleteTarget !== undefined) {
      void (async () => {
        try {
          await props.onDeletePreset(deleteTarget.preset.id)
          setPresetManagerDeleteConfirm(undefined)
          setPresetManagerDetail(undefined)
          setPresetManagerError('')
          await props.onRefreshPresetManager()
        } catch (error) {
          setPresetManagerError(tuiPresetMutationErrorMessage(error, 'delete', locale))
        }
      })()
    }
  }

  const resetSelectedHostSetting = (): void => {
    if (selectedHostSettingsField === undefined) return
    setHostSettingsDrafts(previous => ({
      ...previous,
      [selectedHostSettingsField.id]: { text: selectedHostSettingsField.value, reset: true },
    }))
    setHostSettingsEditing(false)
    setHostSettingsError('')
  }

  const saveHostSettingsDrafts = (): void => {
    if (hostSettingsDetail === undefined || hostSettingsSaving || !hostSettingsCanEdit) return
    let mutation: TuiHostSettingsMutation
    try {
      mutation = planTuiHostSettingsMutation(hostSettingsDetail, hostSettingsDrafts)
    } catch (error) {
      setHostSettingsError(tuiHostSettingsErrorMessage(error, locale))
      return
    }
    setHostSettingsSaving(true)
    setHostSettingsEditing(false)
    setHostSettingsError('')
    void props.onMutateHostSettings(mutation).then(() => {
      setHostSettingsDrafts({})
    }).catch((error: unknown) => {
      // The controller refreshes even on a revision conflict; retain drafts for an explicit retry.
      setHostSettingsError(tuiHostSettingsErrorMessage(error, locale))
    }).finally(() => {
      setHostSettingsSaving(false)
    })
  }

  const toggleSelectedTrajectoryFold = (): void => {
    const selected = trajectoryEntries[effectiveTrajectorySelection]
    const selectedTurn = selected?.turn
    if (selected?.kind === 'turn' && selectedTurn !== undefined) {
      setTrajectoryCollapsedTurns((previous) => {
        const next = new Set(previous)
        if (next.has(selectedTurn)) next.delete(selectedTurn)
        else next.add(selectedTurn)
        return next
      })
    } else if (selected?.kind === 'step' && selected.turn !== undefined && selected.step !== undefined) {
      const id = `${selected.turn}:${selected.step}`
      setTrajectoryCollapsedSteps((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
  }

  const cancelSelectedWorkItem = (): void => {
    if (selectedWorkItem === undefined || selectedWorkItem.action === 'none' || busy) return
    setBusy(true)
    setNotice('')
    void props.onCancelWork(selectedWorkItem).catch((error: unknown) => {
      setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
    }).finally(() => { setBusy(false) })
  }

  const openSelectedWorkItem = (): void => {
    if (selectedWorkItem === undefined || !selectedWorkItem.inspectable || busy) return
    setBusy(true)
    setNotice('')
    void props.onOpenWork(selectedWorkItem).catch((error: unknown) => {
      setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
    }).finally(() => { setBusy(false) })
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
      if (target?.key === action.key) toggleTranscriptTargetDetail(target, action.index)
    } else if (action.id === 'transcript.output') {
      const target = focusTargets[action.index]
      if (target?.key === action.key && target.child === undefined
        && target.node.kind === 'text' && target.node.tone === 'assistant') {
        if (action.operation === 'open') toggleTranscriptTargetDetail(target, action.index)
        else if (action.operation === 'copy') copyAssistantOutput(target.node.text)
        else exportAssistantOutput(target.node.text, 'output')
      }
    } else if (action.id === 'transcript.openFocused') {
      if (focus?.mode === 'browse' && focusedTarget !== undefined) {
        toggleTranscriptTargetDetail(focusedTarget, focus.focusedIndex)
      }
    } else if (action.id === 'transcript.closeBrowse') {
      if (focus?.mode === 'browse') setFocus(undefined)
    } else if (action.id === 'rewind.select') {
      if (rewindDialog?.phase === 'browsing' && rewindCandidates[action.index] !== undefined) {
        setRewindSelection(action.index)
        setRewindError('')
      }
    } else if (action.id === 'rewind.accept') {
      if (rewindDialog?.phase === 'browsing') {
        if (rewindConfirmation === undefined) {
          const candidate = rewindCandidates[effectiveRewindSelection]
          if (candidate === undefined) setRewindError(tuiMessage(locale, 'rewind.turn.none'))
          else {
            setRewindConfirmation(candidate)
            setRewindError('')
          }
        } else if (!(hasComposerDraft && composer.text.trim() !== '/rewind')) confirmRewind('none')
      }
    } else if (action.id === 'rewind.stash') {
      if (rewindConfirmation !== undefined) confirmRewind('stash')
    } else if (action.id === 'rewind.discard') {
      if (rewindConfirmation !== undefined) confirmRewind('discard')
    } else if (action.id === 'rewind.close') {
      if (rewindConfirmation !== undefined) {
        setRewindConfirmation(undefined)
        setRewindError('')
      } else props.onCloseRewind()
    } else if (action.id === 'fresh.accept') {
      if (freshSessionDialog?.phase !== 'creating') void props.onConfirmFreshSession()
    } else if (action.id === 'fresh.close') {
      props.onCloseFreshSession()
    } else if (action.id === 'sessionExport.accept') {
      if (sessionExportDialog?.phase === 'selecting') {
        void props.onExportSession(exportDirectory.text, exportDescendants, sessionExportDialog.format)
      }
    } else if (action.id === 'sessionExport.scope') {
      if (sessionExportDialog?.phase === 'selecting') setExportDescendants(previous => !previous)
    } else if (action.id === 'sessionExport.close') {
      props.onCloseSessionExport()
    } else if (action.id === 'footer.activate') {
      activateFooterItem(mountedFooterItems.find(item => item.id === action.itemId))
    } else if (action.id === 'work.select') {
      setWorkSelection(Math.max(0, Math.min(work.items.length - 1, action.index)))
      setWorkClock(Date.now())
    } else if (action.id === 'work.open') {
      openSelectedWorkItem()
    } else if (action.id === 'work.stop') {
      cancelSelectedWorkItem()
    } else if (action.id === 'work.close') {
      setWorkOpen(false)
    } else if (action.id === 'pluginHub.toggleView') {
      if (pluginHubDialog !== undefined && pluginHubDialog.view !== action.targetView) {
        setPluginHubSelection(0)
        setPluginHubDetailOffset(0)
        void props.onPluginHubToggleView(action.targetView)
      }
    } else if (action.id === 'pluginHub.accept') {
      activatePluginHubPointer(action.index)
    } else if (action.id === 'pluginHub.close') {
      props.onClosePluginHub()
    } else if (action.id === 'pluginHub.refresh') {
      if (pluginHubDialog?.phase === 'browse' || pluginHubDialog?.phase === 'error') {
        void props.onPluginHubRefresh()
      }
    } else if (action.id === 'pluginHub.sort') {
      setPluginHubSelection(0)
      void props.onPluginHubSort()
    } else if (action.id === 'pluginHub.category') {
      setPluginHubSelection(0)
      void props.onPluginHubCategory()
    } else if (action.id === 'pluginHub.installable') {
      setPluginHubSelection(0)
      void props.onPluginHubInstallable()
    } else if (action.id === 'pluginHub.openRepository') {
      const url = pluginHubDialog?.discoveryDetail?.repository.url
        ?? tuiPluginHubDiscoveryUrl(pluginHubRows, pluginHubSelection)
      if (url !== undefined) void props.onOpenUrl(url)
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
    } else if (action.id === 'resume.rename') {
      const candidate = resumeCandidates[effectiveResumeSelection]
      if (candidate === undefined) setResumeError(tuiMessage(locale, 'resume.search.none.current'))
      else if (candidate.disabledReason !== undefined) setResumeError(candidate.disabledReason)
      else if (hasComposerDraft && composer.text.trim() !== '/resume') {
        setResumeError(tuiMessage(locale, 'resume.rename.draft'))
      } else {
        setResumeError('')
        void props.onResumeForRename(candidate)
      }
    } else if (action.id === 'resume.stash') {
      if (resumeConfirmation !== undefined) confirmResumeWithDraft('stash')
    } else if (action.id === 'resume.discard') {
      if (resumeConfirmation !== undefined) confirmResumeWithDraft('discard')
    } else if (action.id === 'resume.close') {
      if (resumeConfirmation !== undefined) {
        setResumeConfirmation(undefined)
        setResumeError('')
      } else if (resumeQuery !== '') {
        setResumeQuery('')
        setResumeSelection(0)
        setResumeError('')
      } else props.onCloseResume()
    } else if (action.id === 'provider.accept') {
      if (providerRows.length > 0) {
        setProviderSelection(Math.max(0, Math.min(providerRows.length - 1, action.index ?? effectiveProviderSelection)))
        setProviderDetail(true)
        setProviderDetailOffset(0)
      }
    } else if (action.id === 'provider.authenticate') {
      authenticateSelectedProvider()
    } else if (action.id === 'provider.editProfile') {
      openSelectedProviderProfile()
    } else if (action.id === 'provider.editEndpoint') {
      if (selectedProvider?.settings?.writable === true) {
        setProviderEndpointDraft('')
        setProviderEndpointError('')
      }
    } else if (action.id === 'provider.editApiKey') {
      if (providerCanStoreKey) {
        setProviderSecretDraft('')
        setProviderSecretError('')
      }
    } else if (action.id === 'provider.logout') {
      if (providerCanLogout) setProviderLogoutConfirmation(selectedProvider.id)
    } else if (action.id === 'provider.remove') {
      if (providerCanRemove) setProviderDeleteConfirmation(selectedProvider.id)
    } else if (action.id === 'provider.profileSave') {
      saveSelectedProviderProfile()
    } else if (action.id === 'provider.confirm') {
      if (providerDeleteConfirmation !== undefined) removeSelectedProvider()
      else if (providerLogoutConfirmation !== undefined) logoutSelectedProvider()
      else if (providerSecretDraft !== undefined) saveSelectedProviderApiKey()
      else if (providerEndpointDraft !== undefined) saveSelectedProviderEndpoint()
    } else if (action.id === 'provider.endpointReset') {
      if (providerEndpointDraft !== undefined) saveSelectedProviderEndpoint(true)
    } else if (action.id === 'provider.refresh') {
      void props.onRefreshProviderCenter()
    } else if (action.id === 'provider.add') {
      openProviderWizard()
    } else if (action.id === 'provider.wizardAccept') {
      acceptProviderWizard()
    } else if (action.id === 'provider.wizardDiscover') {
      discoverProviderWizardModels()
    } else if (action.id === 'provider.wizardBack') {
      backProviderWizard()
    } else if (action.id === 'provider.wizardToggle') {
      if (providerWizard?.step === 'picker') {
        const index = action.index ?? providerWizard.candidateIndex
        const candidate = providerWizard.candidates[index]
        if (candidate !== undefined) {
          const picked = new Set(providerWizard.picked)
          if (!picked.delete(candidate.id)) picked.add(candidate.id)
          patchProviderWizard({ candidateIndex: index, picked, error: '' })
        }
      }
    } else if (action.id === 'provider.wizardSelect') {
      if (providerWizard?.step === 'protocol' && providerWizard.target.protocols[action.index] !== undefined) {
        patchProviderWizard({ protocolIndex: action.index, error: '' })
      }
    } else if (action.id === 'provider.profileField') {
      const row = providerProfileEditor === undefined ? undefined
        : providerRows.find(candidate => candidate.id === providerProfileEditor.providerId)
      if (row !== undefined && providerProfileFields(row).includes(action.field)) {
        patchProviderProfileEditor({ field: action.field, error: '' })
      }
    } else if (action.id === 'provider.close') {
      if (providerWizard !== undefined) {
        backProviderWizard()
      } else if (providerProfileEditor !== undefined || providerDeleteConfirmation !== undefined
        || providerLogoutConfirmation !== undefined
        || providerSecretDraft !== undefined || providerEndpointDraft !== undefined) {
        setProviderProfileEditor(undefined)
        setProviderDeleteConfirmation(undefined)
        setProviderLogoutConfirmation(undefined)
        setProviderSecretDraft(undefined)
        setProviderSecretError('')
        setProviderEndpointDraft(undefined)
        setProviderEndpointError('')
      } else if (providerDetail) {
        setProviderDetail(false)
        setProviderDetailOffset(0)
      } else props.onCloseProviderCenter()
    } else if (action.id === 'queue.open') {
      openQueue()
    } else if (action.id === 'queue.accept') {
      if (action.index !== undefined) {
        setQueueSelection(Math.max(0, Math.min(queue.items.length - 1, action.index)))
        setQueueDetail(true)
        setQueueDetailOffset(0)
        setQueueError('')
      } else if (queueEditDraft !== undefined) saveQueueEdit()
      else if (queueDeleteConfirmation) deleteSelectedQueueItem()
      else openSelectedQueueDetail()
    } else if (action.id === 'queue.edit') {
      editSelectedQueueItem()
    } else if (action.id === 'queue.delete') {
      askDeleteSelectedQueueItem()
    } else if (action.id === 'queue.close') {
      closeQueueLayer()
    } else if (action.id === 'goalPlan.open') {
      openGoalPlan()
    } else if (action.id === 'goalPlan.edit') {
      if (goalPlanSurface?.goal !== undefined) setGoalEditDraft(goalPlanSurface.goal.objective)
    } else if (action.id === 'goalPlan.pause') {
      runGoalPlanMutation(() => props.onPauseGoal())
    } else if (action.id === 'goalPlan.resume') {
      runGoalPlanMutation(() => props.onResumeGoal())
    } else if (action.id === 'goalPlan.clear') {
      setGoalClearConfirmation(true)
      setGoalPlanError('')
    } else if (action.id === 'goalPlan.exitPlan') {
      runGoalPlanMutation(() => props.onExitPlan())
    } else if (action.id === 'goalPlan.accept') {
      if (goalEditDraft !== undefined) saveGoalEdit()
      else if (goalClearConfirmation) runGoalPlanMutation(() => props.onClearGoal())
    } else if (action.id === 'goalPlan.close') {
      closeGoalPlanLayer()
    } else if (action.id === 'sessionManager.tab') {
      setSessionManagerTab(action.tab)
      setSessionManagerQuery('')
      setSessionManagerSelection(0)
      setSessionManagerDetail(false)
      setSessionManagerError('')
    } else if (action.id === 'trajectory.accept') {
      const index = action.index ?? effectiveTrajectorySelection
      if (trajectoryEntries[index] !== undefined) {
        setTrajectorySelection(index)
        setTrajectoryDetailKey(trajectoryEntries[index].key)
      }
    } else if (action.id === 'trajectory.close') {
      if (trajectoryDetail !== undefined) setTrajectoryDetailKey(undefined)
      else props.onCloseTrajectory()
    } else if (action.id === 'trajectory.tab') {
      selectTrajectoryInspectorTab(action.tab)
    } else if (action.id === 'trajectory.cycleTab') {
      cycleTrajectoryInspectorTab()
    } else if (action.id === 'trajectory.fold') {
      toggleSelectedTrajectoryFold()
    } else if (action.id === 'trajectory.search') {
      setTrajectorySearchEditing(true)
    } else if (action.id === 'trajectory.older') {
      props.onLoadOlderTrajectory()
    } else if (action.id === 'trajectory.tail') {
      setTrajectoryTailFollow(previous => !previous)
    } else if (action.id === 'deliverables.inline') {
      if (action.mode === 'open' && props.pathOpenerAvailable) {
        void props.onOpenPath(action.path)
      } else {
        const result = props.onCopy(action.path)
        setNotice(result.ok
          ? tuiMessage(locale, 'clipboard.detail.copied')
          : result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
      }
    } else if (action.id === 'deliverables.open') {
      const node = focus?.mode === 'detail' && focusedTarget?.node.kind === 'deliverables'
        ? focusedTarget.node
        : undefined
      const index = action.index ?? deliverableSelection
      const item = node?.items[index]
      if (item !== undefined) {
        setDeliverableSelection(index)
        if (props.pathOpenerAvailable) void props.onOpenPath(item.path)
        else setNotice(tuiMessage(locale, 'deliverables.open.unavailable'))
      }
    } else if (action.id === 'deliverables.copy') {
      if (selectedDeliverable !== undefined) {
        const result = props.onCopy(selectedDeliverable.path)
        setNotice(result.ok
          ? tuiMessage(locale, 'clipboard.detail.copied')
          : result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
      }
    } else if (action.id === 'feedback.like' || action.id === 'feedback.dislike') {
      const rating = action.id === 'feedback.like' ? 'positive' as const : 'negative' as const
      const current = activeMessageFeedback?.items.find(item => item.messageId === action.messageId)
      void props.onSubmitFeedback(action.messageId, rating, current?.note)
    } else if (action.id === 'feedback.clear') {
      void props.onClearFeedback(action.messageId)
    } else if (action.id === 'feedback.note') {
      const current = activeMessageFeedback?.items.find(item => item.messageId === action.messageId)
      if (current !== undefined) {
        setFeedbackNoteDraft({ messageId: action.messageId, rating: current.rating, text: current.note ?? '' })
      }
    } else if (action.id === 'attachment.remove') {
      setComposer((current) => {
        const target = current.attachments?.[action.index]
        return target === undefined ? current : removeComposerImageAttachment(current, target.ref.attachmentId)
      })
    } else if (action.id === 'hostPlugins.accept') {
      const index = action.index ?? effectiveHostPluginSelection
      setHostPluginSelection(index)
      if (hostPluginTab === 'plugins' && hostPluginRows[index] !== undefined) {
        setHostPluginDetail(hostPluginRows[index])
        setHostPresetDetail(undefined)
        setHostSettingsDetailNs(undefined)
      } else if (hostPluginTab === 'presets' && hostPresetRows[index] !== undefined) {
        setHostPresetDetail(hostPresetRows[index])
        setHostPluginDetail(undefined)
        setHostSettingsDetailNs(undefined)
      } else if (hostPluginTab === 'settings' && hostSettingsRows[index] !== undefined) {
        openHostSettingsRow(hostSettingsRows[index])
      }
    } else if (action.id === 'hostPlugins.field') {
      selectHostSettingsField(action.index)
    } else if (action.id === 'hostPlugins.filter') {
      setHostPluginFilter(f => f === 'all' ? 'enabled' : f === 'enabled' ? 'disabled' : f === 'disabled' ? 'failed' : 'all')
      setHostPluginSelection(0)
    } else if (action.id === 'hostPlugins.tab') {
      selectHostPluginTab(action.tab ?? (hostPluginTab === 'plugins'
        ? 'presets' : hostPluginTab === 'presets' ? 'settings' : 'plugins'))
    } else if (action.id === 'hostPlugins.refresh') {
      void props.onRefreshHostPluginCenter()
    } else if (action.id === 'hostPlugins.edit') {
      editSelectedHostSetting()
    } else if (action.id === 'hostPlugins.cycle') {
      cycleSelectedHostSetting()
    } else if (action.id === 'hostPlugins.save') {
      saveHostSettingsDrafts()
    } else if (action.id === 'hostPlugins.discard') {
      discardHostSettingsDrafts()
    } else if (action.id === 'hostPlugins.reset') {
      resetSelectedHostSetting()
    } else if (action.id === 'hostPlugins.close') {
      if (hostPluginDetail !== undefined) setHostPluginDetail(undefined)
      else if (hostPresetDetail !== undefined) setHostPresetDetail(undefined)
      else if (hostSettingsDetailNs !== undefined) {
        setHostSettingsDetailNs(undefined)
        discardHostSettingsDrafts()
      }
      else props.onCloseHostPluginCenter()
    } else if (action.id === 'schedules.accept') {
      const index = action.index ?? effectiveScheduleSelection
      const row = scheduleRows[index]
      if (row !== undefined) {
        setScheduleSelection(index)
        setScheduleDetail(row)
      }
    } else if (action.id === 'schedules.refresh') {
      void props.onActivateFooter('schedules')
    } else if (action.id === 'schedules.close') {
      if (currentScheduleDetail !== undefined) setScheduleDetail(undefined)
      else props.onCloseScheduleDialog()
    } else if (action.id === 'presetManager.accept') {
      if (action.index === undefined && (presetManagerCopyDraft !== undefined
        || presetManagerDeleteConfirm !== undefined)) {
        acceptPresetManagerLayer()
      } else if (action.index !== undefined && presetManagerRows[action.index] !== undefined) {
        setPresetManagerSelection(action.index)
        setPresetManagerDetail(presetManagerRows[action.index])
        setPresetManagerError('')
      } else if (selectedPresetManagerRow !== undefined) {
        setPresetManagerDetail(selectedPresetManagerRow)
      }
    } else if (action.id === 'presetManager.setDefault') {
      if (presetManagerDetail !== undefined && presetManagerDetail.canSetDefault) {
        void (async () => {
          try {
            await props.onSetDefaultPreset(presetManagerDetail.preset.id, presetManager?.defaultRevision)
            setPresetManagerError('')
            await props.onRefreshPresetManager()
            setPresetManagerDetail(undefined)
          } catch (error) {
            setPresetManagerError(tuiPresetMutationErrorMessage(error, 'setDefault', locale))
          }
        })()
      }
    } else if (action.id === 'presetManager.copy') {
      if (presetManagerDetail !== undefined && presetManagerDetail.canCopy) {
        setPresetManagerCopyDraft({
          sourceId: presetManagerDetail.preset.id,
          idDraft: '',
          nameDraft: '',
          step: 'id',
        })
        setPresetManagerError('')
      }
    } else if (action.id === 'presetManager.delete') {
      if (presetManagerDetail !== undefined && presetManagerDetail.canDelete) {
        setPresetManagerDeleteConfirm(presetManagerDetail)
      }
    } else if (action.id === 'presetManager.view') {
      if (presetManagerDetail !== undefined) {
        const id = presetManagerDetail.preset.id
        setPresetManagerComposition({ id, phase: 'loading' })
        void props.onReadPresetComposition(id).then((preview) => {
          setPresetManagerComposition(current => current?.id === id
            ? { id, phase: 'ready', text: preview.text, truncated: preview.truncated }
            : current)
        }).catch((error: unknown) => {
          setPresetManagerComposition(undefined)
          setPresetManagerError(terminalSafe(error instanceof Error ? error.message : String(error)))
        })
      }
    } else if (action.id === 'presetManager.openFile') {
      if (presetManagerDetail !== undefined) void props.onOpenPresetFile(presetManagerDetail.preset.id)
    } else if (action.id === 'presetManager.open') {
      if (presetManagerDetail !== undefined) void props.onOpenPresetLocation(presetManagerDetail.preset.id)
    } else if (action.id === 'presetManager.close') {
      if (presetManagerCopyDraft !== undefined) {
        setPresetManagerCopyDraft(undefined)
        setPresetManagerError('')
      } else if (presetManagerDeleteConfirm !== undefined) {
        setPresetManagerDeleteConfirm(undefined)
        setPresetManagerError('')
      } else if (presetManagerDetail !== undefined) {
        setPresetManagerDetail(undefined)
        setPresetManagerError('')
      } else {
        props.onClosePresetManager()
      }
    } else if (action.id === 'sessionManager.accept') {
      if (directoryBrowser !== undefined) {
        if (action.index !== undefined) {
          const index = action.index
          setDirectoryBrowser(previous => previous === undefined ? undefined : { ...previous, selection: index })
          acceptWorkspaceDirectory(index)
        } else acceptWorkspaceDirectory()
      } else if (action.index !== undefined) {
        setSessionManagerSelection(Math.max(0, Math.min(sessionManagerItems.length - 1, action.index)))
        setSessionManagerDetail(true)
        setSessionManagerError('')
      } else if (sessionManagerEdit !== undefined) saveSessionManagerEdit()
      else if (sessionManagerConfirm !== undefined) confirmSessionManagerMutation()
      else if (sessionManagerItems.length > 0) setSessionManagerDetail(true)
    } else if (action.id === 'sessionManager.resume') {
      if (selectedManagedSession !== undefined) {
        runSessionManagerMutation(() => props.onResumeManagedSession(selectedManagedSession.candidate))
      }
    } else if (action.id === 'sessionManager.fork') {
      if (selectedManagedSession !== undefined) {
        runSessionManagerMutation(() => props.onForkManagedSession(selectedManagedSession.candidate))
      }
    } else if (action.id === 'sessionManager.rename') {
      if (selectedManagedSession !== undefined) {
        setSessionManagerEdit({ kind: 'session-rename', draft: selectedManagedSession.candidate.title })
      } else if (selectedManagedWorkspace !== undefined) {
        setSessionManagerEdit({ kind: 'workspace-rename', draft: selectedManagedWorkspace.title })
      }
    } else if (action.id === 'sessionManager.archive') {
      if (canToggleManagedSessionArchive) {
        setSessionManagerConfirm(selectedManagedSession.archived ? 'session-unarchive' : 'session-archive')
      }
    } else if (action.id === 'sessionManager.add') {
      beginWorkspaceAdd()
    } else if (action.id === 'sessionManager.moveUp' && selectedManagedWorkspace !== undefined) {
      runSessionManagerMutation(() => props.onMoveManagedWorkspace(selectedManagedWorkspace, -1))
    } else if (action.id === 'sessionManager.moveDown' && selectedManagedWorkspace !== undefined) {
      runSessionManagerMutation(() => props.onMoveManagedWorkspace(selectedManagedWorkspace, 1))
    } else if (action.id === 'sessionManager.delete') {
      if (selectedManagedWorkspace !== undefined) setSessionManagerConfirm('workspace-delete')
    } else if (action.id === 'sessionManager.scope') {
      setSessionManagerScope((previous) => {
        const next = previous === 'workspace' ? 'all' : 'workspace'
        persistSessionManagerPreferences({ scope: next })
        return next
      })
      setSessionManagerSelection(0)
    } else if (action.id === 'sessionManager.archiveFilter') {
      setSessionManagerArchive((previous) => {
        const next = previous === 'active' ? 'archived' : previous === 'archived' ? 'all' : 'active'
        persistSessionManagerPreferences({ archive: next })
        return next
      })
      setSessionManagerSelection(0)
    } else if (action.id === 'sessionManager.sort') {
      setSessionManagerSort((previous) => {
        const next: TuiSessionSort = previous === 'updated-desc' ? 'updated-asc'
          : previous === 'updated-asc' ? 'title' : previous === 'title' ? 'workspace' : 'updated-desc'
        persistSessionManagerPreferences({ sort: next })
        return next
      })
      setSessionManagerSelection(0)
    } else if (action.id === 'sessionManager.group') {
      setSessionManagerGroup((previous) => {
        persistSessionManagerPreferences({ groupByWorkspace: !previous })
        return !previous
      })
    } else if (action.id === 'sessionManager.directoryParent') {
      if (directoryBrowserPage?.parent !== undefined) loadWorkspaceDirectory(directoryBrowserPage.parent)
    } else if (action.id === 'sessionManager.directoryHome') {
      loadWorkspaceDirectory()
    } else if (action.id === 'sessionManager.directoryHidden') {
      setDirectoryBrowser(previous => previous === undefined ? undefined : {
        ...previous, showHidden: !previous.showHidden, selection: 0,
      })
    } else if (action.id === 'sessionManager.directoryRefresh') {
      loadWorkspaceDirectory(directoryBrowserPage?.path ?? directoryBrowser?.requestedPath)
    } else if (action.id === 'sessionManager.refresh') {
      runSessionManagerMutation(() => props.onRefreshSessionManager())
    } else if (action.id === 'sessionManager.close') {
      closeSessionManagerLayer()
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
    } else if (action.id === 'activity.open') {
      inspectActivityTool(action.index)
    } else if (action.id === 'detail.copy') {
      copyFocusedDetail()
    } else if (action.id === 'detail.exportMarkdown') {
      exportFocusedOutput()
    } else if (action.id === 'detail.toggleScope') {
      if (focusedAssistantParts.length > 1) {
        setOutputReaderScope(previous => previous === 'segment' ? 'response' : 'segment')
        setFocus(previous => previous?.mode !== 'detail' ? previous : { ...previous, detailOffset: 0 })
      }
    } else if (action.id === 'detail.close') {
      if (footerDetail !== undefined) setFooterDetail(undefined)
      else if (focusedActivity !== undefined && inspectedActivityTool !== undefined) {
        setActivityInspector({ key: focusedActivity.key, selection: activitySelection })
        setFocus(previous => previous?.mode !== 'detail' ? previous : { ...previous, detailOffset: 0 })
      }
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

  const insertBracketedPasteText = (state: ComposerState, input: string): ComposerState => (
    isLargeComposerPaste(input) ? insertComposerPasteReference(state, input) : insertComposerText(state, input)
  )

  const pasteTerminalPaths = (input: string, paths: readonly string[]): void => {
    const viewId = props.view.id
    setBusy(true)
    setNotice('')
    void props.onTerminalPathPaste(paths).then((result) => {
      if (currentAgentViewId.current !== viewId) return
      updateComposer(previous => result === undefined
        ? insertBracketedPasteText(previous, input)
        : insertComposerClipboard(previous, result.text, result.attachments))
    }).catch((error: unknown) => {
      if (currentAgentViewId.current === viewId) {
        updateComposer(previous => insertBracketedPasteText(previous, input))
        setNotice(terminalSafe(error instanceof Error ? error.message : String(error)))
      }
    }).finally(() => { setBusy(false) })
  }

  useTuiTerminalInput((terminalInput) => {
    if (externalEditorActive) return
    if (extensionSnapshot.fullscreenScene !== undefined) {
      if (terminalInput.kind === 'mouse') {
        const mouseKind = tuiTerminalMouseReportKind(terminalInput.button, terminalInput.release)
        const primaryButton = (terminalInput.button & 0b11) === 0
          && (terminalInput.button & 0b11100) === 0
        if (mouseKind === 'press' && primaryButton && fullscreenCloseRegions.some(region =>
          terminalInput.column >= region.rect.left && terminalInput.column <= region.rect.right
          && terminalInput.row >= region.rect.top && terminalInput.row <= region.rect.bottom)) {
          props.extensions.closeFullscreenScene()
        }
        return
      }
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
        if (queueOpen) {
          if (queueDetail) {
            setQueueDetailOffset(previous => Math.max(
              0,
              Math.min(
                Math.max(0, selectedQueueDetailLines.length - queueDetailBodyRows),
                previous + wheelDirection,
              ),
            ))
          } else if (queueEditDraft === undefined && !queueDeleteConfirmation && queue.items.length > 0) {
            setQueueSelection(previous => Math.max(
              0, Math.min(queue.items.length - 1, previous + wheelDirection),
            ))
          }
          return
        }
        if (trajectory !== undefined) {
          if (trajectoryDetail === undefined && trajectoryEntries.length > 0) {
            setTrajectorySelection(previous => Math.max(
              0, Math.min(trajectoryEntries.length - 1, previous + wheelDirection),
            ))
          }
          return
        }
        if (hostPluginCenter !== undefined) {
          if (hostPluginDetail === undefined && hostPresetDetail === undefined
            && hostSettingsDetail === undefined && hostPluginItems.length > 0) {
            setHostPluginSelection(previous => Math.max(
              0, Math.min(hostPluginItems.length - 1, previous + wheelDirection),
            ))
          }
          return
        }
        if (scheduleDialog !== undefined) {
          if (currentScheduleDetail === undefined && scheduleRows.length > 0) {
            setScheduleSelection(previous => Math.max(
              0, Math.min(scheduleRows.length - 1, previous + wheelDirection),
            ))
          }
          return
        }
        if (presetManager !== undefined) {
          if (presetManagerDetail === undefined && presetManagerCopyDraft === undefined
            && presetManagerDeleteConfirm === undefined && presetManagerRows.length > 0) {
            setPresetManagerSelection(previous => Math.max(
              0, Math.min(presetManagerRows.length - 1, previous + wheelDirection),
            ))
          }
          return
        }
        if (sessionManager !== undefined) {
          if (!sessionManagerDetail && sessionManagerEdit === undefined
            && sessionManagerConfirm === undefined && sessionManagerItems.length > 0) {
            setSessionManagerSelection(previous => Math.max(
              0, Math.min(sessionManagerItems.length - 1, previous + wheelDirection),
            ))
          }
          return
        }
        if (providerCenterVisible) {
          if (providerWizard?.step === 'picker' && providerWizard.candidates.length > 0) {
            patchProviderWizard({
              candidateIndex: Math.max(0, Math.min(
                providerWizard.candidates.length - 1, providerWizard.candidateIndex + wheelDirection,
              )),
            })
          } else if (providerDetail) {
            setProviderDetailOffset(previous => Math.max(
              0,
              Math.min(Math.max(0, selectedProviderDetailLines.length - providerDetailBodyRows), previous + wheelDirection),
            ))
          } else if (providerRows.length > 0) {
            setProviderSelection(previous => Math.max(
              0, Math.min(providerRows.length - 1, previous + wheelDirection),
            ))
          }
          return
        }
        if (pluginHubDialog !== undefined && interaction === undefined) {
          if (pluginHubDialog.phase === 'detail'
            && (pluginHubDialog.detail !== undefined || pluginHubDialog.discoveryDetail !== undefined)) {
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
          if (footerDetail === undefined && focusedActivity !== undefined && inspectedActivityTool === undefined) {
            selectActivityTool(activitySelection + wheelDirection)
            return
          }
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
        const wheelAt = Date.now()
        if (transcriptWheelBoundaryGuard.current.consume(wheelDirection, wheelAt)) return
        const nextAnchor = transcriptScroll.byRows(transcriptPage, wheelDirection * 3, transcriptRows)
        const nextNode = nextAnchor === undefined ? undefined : rows[nextAnchor.index]
        if (wheelDirection > 0 && nextAnchor !== undefined
          && nextAnchor.index > transcriptPage.startIndex
          && nextAnchor.rowOffset === undefined
          && nextNode?.kind === 'text'
          && nextNode.tone === 'assistant') {
          transcriptWheelBoundaryGuard.current.start(wheelDirection, wheelAt)
        }
        setTranscriptAnchor(nextAnchor)
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
      else if (goalPlanOpen) closeGoalPlanLayer()
      else if (queueOpen) closeQueueLayer()
      else if (trajectory !== undefined) props.onCloseTrajectory()
      else if (hostPluginCenter !== undefined) props.onCloseHostPluginCenter()
      else if (scheduleDialog !== undefined) props.onCloseScheduleDialog()
      else if (presetManager !== undefined) props.onClosePresetManager()
      else if (sessionManager !== undefined) closeSessionManagerLayer()
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
      else if (providerCenterVisible) {
        if (providerWizard !== undefined) {
          backProviderWizard()
        } else if (providerSecretDraft !== undefined || providerEndpointDraft !== undefined) {
          setProviderSecretDraft(undefined)
          setProviderSecretError('')
          setProviderEndpointDraft(undefined)
          setProviderEndpointError('')
        } else if (providerDetail) {
          setProviderDetail(false)
          setProviderDetailOffset(0)
        } else props.onCloseProviderCenter()
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
    if (key.shift === true && screenSelection !== undefined
      && (inputContext === 'Composer' || inputContext === 'Transcript' || inputContext === 'Detail')) {
      const direction = key.leftArrow ? 'left'
        : key.rightArrow ? 'right'
          : key.upArrow ? 'up'
            : key.downArrow ? 'down'
              : key.home ? 'home'
                : key.end ? 'end'
                  : undefined
      if (direction !== undefined) {
        const range = extendTuiScreenSelection(screenSelection.map, screenSelection.range, direction)
        copyScreenSelection(screenSelection.surface, screenSelection.map, range)
        return
      }
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
    if (queueOpen) {
      const action = matchAction('Dialog', input, key)
      const lower = input.toLocaleLowerCase()
      if (queueEditDraft !== undefined) {
        if (action === 'dialog.cancel') closeQueueLayer()
        else if (action === 'dialog.accept') saveQueueEdit()
        else if (key.backspace) {
          setQueueEditDraft(previous => previous?.slice(0, -1))
          setQueueError('')
        } else if (key.delete) {
          setQueueEditDraft('')
          setQueueError('')
        } else if (input !== '' && acceptsCommittedText(key)) {
          setQueueEditDraft(previous => `${previous ?? ''}${input}`.slice(0, 65_536))
          setQueueError('')
        }
        return
      }
      if (queueDeleteConfirmation) {
        if (action === 'dialog.cancel' || lower === 'n') closeQueueLayer()
        else if (action === 'dialog.accept' || lower === 'y') deleteSelectedQueueItem()
        return
      }
      if (queueDetail) {
        if (lower === 'e') editSelectedQueueItem()
        else if (lower === 'd' || key.delete || key.backspace) askDeleteSelectedQueueItem()
        else if (action === 'dialog.previous') {
          setQueueDetailOffset(previous => Math.max(0, previous - 1))
        } else if (action === 'dialog.next') {
          setQueueDetailOffset(previous => Math.min(
            Math.max(0, selectedQueueDetailLines.length - queueDetailBodyRows), previous + 1,
          ))
        } else if (action === 'dialog.previousPage') {
          setQueueDetailOffset(previous => Math.max(0, previous - queueDetailBodyRows))
        } else if (action === 'dialog.nextPage') {
          setQueueDetailOffset(previous => Math.min(
            Math.max(0, selectedQueueDetailLines.length - queueDetailBodyRows),
            previous + queueDetailBodyRows,
          ))
        } else if (action === 'dialog.cancel') closeQueueLayer()
        return
      }
      if (lower === 'e') editSelectedQueueItem()
      else if (lower === 'd' || key.delete || key.backspace) askDeleteSelectedQueueItem()
      else if (action === 'dialog.previous') setQueueSelection(previous => Math.max(0, previous - 1))
      else if (action === 'dialog.next') {
        setQueueSelection(previous => Math.min(Math.max(0, queue.items.length - 1), previous + 1))
      } else if (action === 'dialog.previousPage') {
        setQueueSelection(previous => Math.max(0, previous - queueVisibleCount))
      } else if (action === 'dialog.nextPage') {
        setQueueSelection(previous => Math.min(
          Math.max(0, queue.items.length - 1), previous + queueVisibleCount,
        ))
      } else if (action === 'dialog.accept') openSelectedQueueDetail()
      else if (action === 'dialog.cancel') closeQueueLayer()
      return
    }
    if (providerCenterVisible) {
      const action = matchAction('Dialog', input, key)
      const lower = input.toLocaleLowerCase()
      if (providerWizard !== undefined) {
        const wizard = providerWizard
        if (action === 'dialog.cancel') {
          backProviderWizard()
          return
        }
        if (wizard.step === 'picker') {
          if (action === 'dialog.previous') {
            patchProviderWizard({ candidateIndex: Math.max(0, wizard.candidateIndex - 1), error: '' })
          } else if (action === 'dialog.next') {
            patchProviderWizard({
              candidateIndex: Math.min(Math.max(0, wizard.candidates.length - 1), wizard.candidateIndex + 1),
              error: '',
            })
          } else if (input === ' ') {
            const candidate = wizard.candidates[wizard.candidateIndex]
            if (candidate !== undefined) {
              const picked = new Set(wizard.picked)
              if (!picked.delete(candidate.id)) picked.add(candidate.id)
              patchProviderWizard({ picked, error: '' })
            }
          } else if (action === 'dialog.accept') acceptProviderWizard()
          return
        }
        if (wizard.step === 'protocol') {
          if (action === 'dialog.previous' || action === 'dialog.next') {
            const direction = action === 'dialog.previous' ? -1 : 1
            const count = wizard.target.protocols.length
            patchProviderWizard({
              protocolIndex: count === 0 ? 0 : (wizard.protocolIndex + direction + count) % count,
              error: '',
            })
          } else if (action === 'dialog.accept') acceptProviderWizard()
          return
        }
        if (wizard.step === 'confirm') {
          if (action === 'dialog.accept') acceptProviderWizard()
          return
        }
        if (wizard.step === 'models' && key.ctrl === true && lower === 'f') {
          discoverProviderWizardModels()
          return
        }
        if (action === 'dialog.accept') {
          acceptProviderWizard()
          return
        }
        if (wizard.step === 'key') {
          if (key.backspace) setProviderWizardSecret(previous => previous.slice(0, -1))
          else if (key.delete) setProviderWizardSecret('')
          else if (input !== '' && acceptsCommittedText(key)) {
            setProviderWizardSecret(previous => `${previous}${input}`.slice(0, 4_096))
          }
          patchProviderWizard({ error: '' })
          return
        }
        const field = wizard.step === 'id' ? 'id'
          : wizard.step === 'name' ? 'displayName'
            : wizard.step === 'endpoint' ? 'endpoint'
              : 'modelText'
        const limit = field === 'id' ? 128 : field === 'displayName' ? 128 : 4_096
        if (key.backspace) patchProviderWizard({ [field]: wizard[field].slice(0, -1), error: '' })
        else if (key.delete) patchProviderWizard({ [field]: '', error: '' })
        else if (input !== '' && acceptsCommittedText(key)) {
          patchProviderWizard({ [field]: `${wizard[field]}${input}`.slice(0, limit), error: '' })
        }
        return
      }
      if (providerDeleteConfirmation !== undefined) {
        if (action === 'dialog.cancel') {
          setProviderDeleteConfirmation(undefined)
          setProviderSecretError('')
        } else if (action === 'dialog.accept') removeSelectedProvider()
        return
      }
      if (providerLogoutConfirmation !== undefined) {
        if (action === 'dialog.cancel') {
          setProviderLogoutConfirmation(undefined)
          setProviderSecretError('')
        } else if (action === 'dialog.accept') logoutSelectedProvider()
        return
      }
      if (providerProfileEditor !== undefined) {
        const editor = providerProfileEditor
        if (action === 'dialog.cancel') {
          setProviderProfileEditor(undefined)
        } else if (key.ctrl === true && lower === 's') {
          saveSelectedProviderProfile()
        } else if (key.tab) {
          cycleProviderProfileField(key.shift === true ? -1 : 1)
        } else if (editor.field === 'protocol' && (key.leftArrow || key.rightArrow
          || action === 'dialog.previous' || action === 'dialog.next')) {
          const direction = key.leftArrow || action === 'dialog.previous' ? -1 : 1
          const count = editor.protocols.length
          patchProviderProfileEditor({
            protocolIndex: count === 0 ? 0 : (editor.protocolIndex + direction + count) % count,
            error: '',
          })
        } else if (editor.field !== 'protocol') {
          const field = editor.field === 'displayName' ? 'displayName' : 'modelsText'
          const limit = field === 'displayName' ? 128 : 16_384
          if (key.backspace) patchProviderProfileEditor({ [field]: editor[field].slice(0, -1), error: '' })
          else if (key.delete) patchProviderProfileEditor({ [field]: '', error: '' })
          else if (input !== '' && acceptsCommittedText(key)) {
            patchProviderProfileEditor({ [field]: `${editor[field]}${input}`.slice(0, limit), error: '' })
          }
        }
        return
      }
      if (providerSecretDraft !== undefined) {
        if (action === 'dialog.cancel') {
          setProviderSecretDraft(undefined)
          setProviderSecretError('')
        } else if (action === 'dialog.accept') {
          saveSelectedProviderApiKey()
        } else if (key.backspace) {
          setProviderSecretDraft(previous => previous?.slice(0, -1))
          setProviderSecretError('')
        } else if (key.delete) {
          setProviderSecretDraft('')
          setProviderSecretError('')
        } else if (input !== '' && acceptsCommittedText(key)) {
          setProviderSecretDraft(previous => `${previous ?? ''}${input}`.slice(0, 4_096))
          setProviderSecretError('')
        }
        return
      }
      if (providerEndpointDraft !== undefined) {
        if (action === 'dialog.cancel') {
          setProviderEndpointDraft(undefined)
          setProviderEndpointError('')
        } else if (action === 'dialog.accept') {
          saveSelectedProviderEndpoint()
        } else if (lower === 'u') {
          saveSelectedProviderEndpoint(true)
        } else if (key.backspace) {
          setProviderEndpointDraft(previous => previous?.slice(0, -1))
          setProviderEndpointError('')
        } else if (key.delete) {
          setProviderEndpointDraft('')
          setProviderEndpointError('')
        } else if (input !== '' && acceptsCommittedText(key)) {
          setProviderEndpointDraft(previous => `${previous ?? ''}${input}`.slice(0, 4_096))
          setProviderEndpointError('')
        }
        return
      }
      if (lower === 'r') {
        void props.onRefreshProviderCenter()
        return
      }
      if (providerDetail) {
        if (lower === 'p' && providerCanEditProfile) {
          openSelectedProviderProfile()
        } else if (lower === 'd' && providerCanRemove) {
          setProviderDeleteConfirmation(selectedProvider.id)
          setProviderSecretError('')
        } else if (lower === 'x' && providerCanLogout) {
          setProviderLogoutConfirmation(selectedProvider.id)
          setProviderSecretError('')
        } else if (lower === 'e' && selectedProvider?.settings?.writable === true) {
          setProviderEndpointDraft('')
          setProviderEndpointError('')
        } else if (lower === 'k' && providerCanStoreKey) {
          setProviderSecretDraft('')
          setProviderSecretError('')
        } else if ((action === 'dialog.accept' || lower === 'l') && providerCanAuthenticate) {
          authenticateSelectedProvider()
        } else if (action === 'dialog.previous') {
          setProviderDetailOffset(previous => Math.max(0, previous - 1))
        } else if (action === 'dialog.next') {
          setProviderDetailOffset(previous => Math.min(
            Math.max(0, selectedProviderDetailLines.length - providerDetailBodyRows), previous + 1,
          ))
        } else if (action === 'dialog.previousPage') {
          setProviderDetailOffset(previous => Math.max(0, previous - providerDetailBodyRows))
        } else if (action === 'dialog.nextPage') {
          setProviderDetailOffset(previous => Math.min(
            Math.max(0, selectedProviderDetailLines.length - providerDetailBodyRows),
            previous + providerDetailBodyRows,
          ))
        } else if (action === 'dialog.cancel') {
          setProviderDetail(false)
          setProviderDetailOffset(0)
        }
        return
      }
      if (lower === 'a' && providerCreationTarget !== undefined) {
        openProviderWizard()
        return
      }
      if (action === 'dialog.previous') {
        setProviderSelection(previous => Math.max(0, previous - 1))
      } else if (action === 'dialog.next') {
        setProviderSelection(previous => Math.min(Math.max(0, providerRows.length - 1), previous + 1))
      } else if (action === 'dialog.previousPage') {
        setProviderSelection(previous => Math.max(0, previous - providerVisibleCount))
      } else if (action === 'dialog.nextPage') {
        setProviderSelection(previous => Math.min(
          Math.max(0, providerRows.length - 1), previous + providerVisibleCount,
        ))
      } else if (action === 'dialog.accept' && selectedProvider !== undefined) {
        setProviderDetail(true)
        setProviderDetailOffset(0)
      } else if (action === 'dialog.cancel') {
        props.onCloseProviderCenter()
      }
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
      if (pluginHubDialog.phase === 'detail'
        && (pluginHubDialog.detail !== undefined || pluginHubDialog.discoveryDetail !== undefined)) {
        if (action === 'pluginHub.close') props.onClosePluginHub()
        else if ((action === 'pluginHub.accept' || action === 'pluginHub.openRepository')
          && pluginHubDialog.discoveryDetail !== undefined) {
          void props.onOpenUrl(pluginHubDialog.discoveryDetail.repository.url)
        }
        else if (action === 'pluginHub.accept' && pluginHubDialog.detail !== undefined
          && pluginHubDialog.profileMutations !== false
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
      if (action === 'pluginHub.installable') { setPluginHubSelection(0); void props.onPluginHubInstallable(); return }
      if (action === 'pluginHub.openRepository' && pluginHubDialog.view === 'discovery') {
        const url = pluginHubSelectedDiscovery?.repository.url
        if (url !== undefined) void props.onOpenUrl(url)
        return
      }
      if (action === 'pluginHub.previous') { setPluginHubSelection(previous => Math.max(0, previous - 1)); return }
      if (action === 'pluginHub.next') {
        if (pluginHubDialog.view !== 'installed' && pluginHubDialog.phase === 'browse'
          && pluginHubNextCursor !== undefined
          && pluginHubSelection >= pluginHubRows.length - 1) {
          void props.onPluginHubLoadMore()
          return
        }
        setPluginHubSelection(previous => Math.min(Math.max(0, pluginHubRows.length - 1), previous + 1)); return
      }
      if (action === 'pluginHub.previousPage') { setPluginHubSelection(previous => Math.max(0, previous - pluginHubVisibleCount)); return }
      if (action === 'pluginHub.nextPage') {
        if (pluginHubDialog.view !== 'installed' && pluginHubDialog.phase === 'browse'
          && pluginHubNextCursor !== undefined
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
        } else if (pluginHubDialog.view === 'discovery') {
          const selected = pluginHubDiscoveryRows[pluginHubSelection]
          if (selected !== undefined) props.onPluginHubDiscoveryDetail(selected.id)
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
    if (goalPlanOpen && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      const lower = input.toLocaleLowerCase()
      if (goalEditDraft !== undefined) {
        if (action === 'dialog.cancel') closeGoalPlanLayer()
        else if (action === 'dialog.accept') saveGoalEdit()
        else if (key.backspace) {
          setGoalEditDraft(previous => previous?.slice(0, -1))
          setGoalPlanError('')
        } else if (key.delete) {
          setGoalEditDraft('')
          setGoalPlanError('')
        } else if (input !== '' && acceptsCommittedText(key)) {
          setGoalEditDraft(previous => `${previous ?? ''}${input}`.slice(0, 4_096))
          setGoalPlanError('')
        }
        return
      }
      if (goalClearConfirmation) {
        if (action === 'dialog.cancel' || lower === 'n') closeGoalPlanLayer()
        else if (action === 'dialog.accept' || lower === 'y') runGoalPlanMutation(() => props.onClearGoal())
        return
      }
      if (action === 'dialog.cancel') closeGoalPlanLayer()
      else if (lower === 'e' && goalPlanSurface?.goal !== undefined) {
        setGoalEditDraft(goalPlanSurface.goal.objective)
        setGoalPlanError('')
      } else if (lower === 'p' && goalPlanSurface?.goal?.phase === 'active') {
        runGoalPlanMutation(() => props.onPauseGoal())
      } else if (lower === 'r' && (goalPlanSurface?.goal?.phase === 'paused'
        || goalPlanSurface?.goal?.phase === 'blocked')) {
        runGoalPlanMutation(() => props.onResumeGoal())
      } else if (lower === 'c' && goalPlanSurface?.goal !== undefined) {
        setGoalClearConfirmation(true)
        setGoalPlanError('')
      } else if (lower === 'x' && goalPlanSurface?.plan?.effective === true) {
        runGoalPlanMutation(() => props.onExitPlan())
      }
      return
    }
    if (trajectory !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      const lower = input.toLocaleLowerCase()
      if (trajectorySearchEditing) {
        if (action === 'dialog.cancel' || action === 'dialog.accept') {
          setTrajectorySearchEditing(false)
        } else if (key.backspace) {
          setTrajectoryQuery(previous => previous.slice(0, -1))
          setTrajectorySelection(0)
        } else if (input !== '' && acceptsCommittedText(key)) {
          setTrajectoryQuery(previous => `${previous}${input}`.slice(0, 256))
          setTrajectorySelection(0)
        }
        return
      }
      if (trajectoryDetail !== undefined) {
        if (action === 'dialog.cancel') setTrajectoryDetailKey(undefined)
        else if (key.tab || key.rightArrow) {
          cycleTrajectoryInspectorTab()
        } else if (key.leftArrow) {
          const tabs = ['summary', 'input', 'output', 'timing'] as const
          const tab = tabs[(tabs.indexOf(trajectoryInspectorTab) + tabs.length - 1) % tabs.length]
          if (tab !== undefined) selectTrajectoryInspectorTab(tab)
        }
        return
      }
      if (input === '/') {
        setTrajectorySearchEditing(true)
      } else if (input === 'R') {
        props.onRefreshTrajectory()
      } else if (lower === 'l' && trajectory.omitted > 0) {
        props.onLoadOlderTrajectory()
      } else if (lower === 't') {
        setTrajectoryTailFollow(previous => !previous)
      } else if (lower === 'f') {
        toggleSelectedTrajectoryFold()
      } else if (action === 'dialog.previous' || action === 'dialog.next') {
        if (trajectoryEntries.length === 0) return
        setTrajectoryTailFollow(false)
        setTrajectorySelection(previous => action === 'dialog.previous'
          ? (Math.min(previous, trajectoryEntries.length - 1) + trajectoryEntries.length - 1)
            % trajectoryEntries.length
          : (Math.min(previous, trajectoryEntries.length - 1) + 1) % trajectoryEntries.length)
      } else if (action === 'dialog.previousPage' || action === 'dialog.nextPage') {
        setTrajectoryTailFollow(false)
        setTrajectorySelection(previous => action === 'dialog.previousPage'
          ? Math.max(0, previous - trajectoryVisibleCount)
          : Math.min(Math.max(0, trajectoryEntries.length - 1), previous + trajectoryVisibleCount))
      } else if (action === 'dialog.accept') {
        if (trajectoryEntries[effectiveTrajectorySelection] !== undefined) {
          setTrajectoryDetailKey(trajectoryEntries[effectiveTrajectorySelection].key)
          setTrajectoryInspectorTab('summary')
        }
      } else if (action === 'dialog.cancel') {
        props.onCloseTrajectory()
      }
      return
    }
    if (hostPluginCenter !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      const lower = input.toLocaleLowerCase()
      if (hostPluginDetail !== undefined) {
        if (action === 'dialog.cancel') setHostPluginDetail(undefined)
        return
      }
      if (hostPresetDetail !== undefined) {
        if (action === 'dialog.cancel') setHostPresetDetail(undefined)
        return
      }
      if (hostSettingsDetailNs !== undefined) {
        if (hostSettingsEditing) {
          if (action === 'dialog.cancel' || action === 'dialog.accept') {
            setHostSettingsEditing(false)
          } else if (key.backspace && selectedHostSettingsField !== undefined) {
            setHostSettingsDrafts((previous) => {
              const current = previous[selectedHostSettingsField.id]?.text ?? selectedHostSettingsField.value
              return { ...previous, [selectedHostSettingsField.id]: { text: current.slice(0, -1) } }
            })
          } else if (input !== '' && acceptsCommittedText(key) && selectedHostSettingsField !== undefined) {
            setHostSettingsDrafts((previous) => {
              const current = previous[selectedHostSettingsField.id]?.text ?? ''
              return { ...previous, [selectedHostSettingsField.id]: { text: `${current}${input}`.slice(0, 128) } }
            })
            setHostSettingsError('')
          }
          return
        }
        if (action === 'dialog.cancel') {
          setHostSettingsDetailNs(undefined)
          discardHostSettingsDrafts()
        } else if (lower === 's' && hostSettingsCanEdit) {
          saveHostSettingsDrafts()
        } else if (lower === 'd' && hostSettingsCanEdit) {
          discardHostSettingsDrafts()
        } else if (lower === 'x' && hostSettingsCanEdit) {
          resetSelectedHostSetting()
        } else if (lower === 'e' && selectedHostSettingsField !== undefined && hostSettingsCanEdit) {
          editSelectedHostSetting()
        } else if (input === ' ' && selectedHostSettingsField?.kind === 'enum' && hostSettingsCanEdit) {
          cycleSelectedHostSetting()
        } else if (action === 'dialog.previous' || action === 'dialog.next') {
          if (hostSettingsFields.length === 0) return
          setHostSettingsFieldSelection(previous => action === 'dialog.previous'
            ? (Math.min(previous, hostSettingsFields.length - 1) + hostSettingsFields.length - 1)
              % hostSettingsFields.length
            : (Math.min(previous, hostSettingsFields.length - 1) + 1) % hostSettingsFields.length)
        }
        return
      }
      if (key.tab) {
        selectHostPluginTab(hostPluginTab === 'plugins'
          ? 'presets' : hostPluginTab === 'presets' ? 'settings' : 'plugins')
      } else if (lower === 'f' && hostPluginTab === 'plugins') {
        setHostPluginFilter(f => f === 'all' ? 'enabled' : f === 'enabled' ? 'disabled' : f === 'disabled' ? 'failed' : 'all')
        setHostPluginSelection(0)
      } else if (input === 'R') {
        void props.onRefreshHostPluginCenter()
      } else if (action === 'dialog.previous' || action === 'dialog.next') {
        if (hostPluginItems.length === 0) return
        setHostPluginSelection(previous => action === 'dialog.previous'
          ? (Math.min(previous, hostPluginItems.length - 1) + hostPluginItems.length - 1)
            % hostPluginItems.length
          : (Math.min(previous, hostPluginItems.length - 1) + 1) % hostPluginItems.length)
      } else if (action === 'dialog.previousPage' || action === 'dialog.nextPage') {
        setHostPluginSelection(previous => action === 'dialog.previousPage'
          ? Math.max(0, previous - hostPluginVisibleCount)
          : Math.min(Math.max(0, hostPluginItems.length - 1), previous + hostPluginVisibleCount))
      } else if (action === 'dialog.accept') {
        if (hostPluginTab === 'plugins' && hostPluginRows[effectiveHostPluginSelection] !== undefined) {
          setHostPluginDetail(hostPluginRows[effectiveHostPluginSelection])
        } else if (hostPluginTab === 'presets' && hostPresetRows[effectiveHostPluginSelection] !== undefined) {
          setHostPresetDetail(hostPresetRows[effectiveHostPluginSelection])
        } else if (hostPluginTab === 'settings' && hostSettingsRows[effectiveHostPluginSelection] !== undefined) {
          openHostSettingsRow(hostSettingsRows[effectiveHostPluginSelection])
        }
      } else if (action === 'dialog.cancel') {
        props.onCloseHostPluginCenter()
      } else if (key.backspace && hostPluginTab === 'plugins') {
        setHostPluginQuery(previous => previous.slice(0, -1))
        setHostPluginSelection(0)
      } else if (input !== '' && acceptsCommittedText(key) && hostPluginTab === 'plugins') {
        setHostPluginQuery(previous => `${previous}${input}`.slice(0, 256))
        setHostPluginSelection(0)
      }
      return
    }
    if (scheduleDialog !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      if (currentScheduleDetail !== undefined) {
        if (action === 'dialog.cancel') setScheduleDetail(undefined)
        return
      }
      if (action === 'dialog.previous' || action === 'dialog.next') {
        if (scheduleRows.length === 0) return
        setScheduleSelection(previous => action === 'dialog.previous'
          ? (Math.min(previous, scheduleRows.length - 1) + scheduleRows.length - 1) % scheduleRows.length
          : (Math.min(previous, scheduleRows.length - 1) + 1) % scheduleRows.length)
      } else if (action === 'dialog.previousPage' || action === 'dialog.nextPage') {
        setScheduleSelection(previous => action === 'dialog.previousPage'
          ? Math.max(0, previous - scheduleVisibleCount)
          : Math.min(Math.max(0, scheduleRows.length - 1), previous + scheduleVisibleCount))
      } else if (action === 'dialog.accept' && selectedScheduleRow !== undefined) {
        setScheduleDetail(selectedScheduleRow)
      } else if (action === 'dialog.cancel') {
        props.onCloseScheduleDialog()
      } else if (input === 'R') {
        void props.onActivateFooter('schedules')
      }
      return
    }
    if (presetManager !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      const lower = input.toLocaleLowerCase()
      if (presetManagerCopyDraft !== undefined) {
        if (action === 'dialog.cancel') {
          setPresetManagerCopyDraft(undefined)
          setPresetManagerError('')
        } else if (action === 'dialog.accept') {
          acceptPresetManagerLayer()
        } else if (key.backspace) {
          setPresetManagerCopyDraft((d) => {
            if (d === undefined) return undefined
            const field = d.step === 'id' ? 'idDraft' : 'nameDraft'
            return { ...d, [field]: d[field].slice(0, -1) }
          })
          setPresetManagerError('')
        } else if (key.delete) {
          setPresetManagerCopyDraft((d) => {
            if (d === undefined) return undefined
            return { ...d, [d.step === 'id' ? 'idDraft' : 'nameDraft']: '' }
          })
          setPresetManagerError('')
        } else if (input !== '' && acceptsCommittedText(key)) {
          setPresetManagerCopyDraft((d) => {
            if (d === undefined) return undefined
            const field = d.step === 'id' ? 'idDraft' : 'nameDraft'
            return { ...d, [field]: `${d[field]}${input}`.slice(0, 256) }
          })
          setPresetManagerError('')
        }
        return
      }
      if (presetManagerDeleteConfirm !== undefined) {
        if (action === 'dialog.cancel' || lower === 'n') {
          setPresetManagerDeleteConfirm(undefined)
          setPresetManagerError('')
        } else if (action === 'dialog.accept' || lower === 'y') {
          acceptPresetManagerLayer()
        }
        return
      }
      if (presetManagerDetail !== undefined) {
        if (action === 'dialog.cancel') {
          setPresetManagerDetail(undefined)
          setPresetManagerError('')
        } else if (lower === 'd' && presetManagerDetail.canSetDefault) {
          void (async () => {
            try {
              await props.onSetDefaultPreset(presetManagerDetail.preset.id, presetManager.defaultRevision)
              setPresetManagerError('')
              await props.onRefreshPresetManager()
              setPresetManagerDetail(undefined)
            } catch (error) {
              setPresetManagerError(tuiPresetMutationErrorMessage(error, 'setDefault', locale))
            }
          })()
        } else if (lower === 'c' && presetManagerDetail.canCopy) {
          setPresetManagerCopyDraft({
            sourceId: presetManagerDetail.preset.id,
            idDraft: '',
            nameDraft: '',
            step: 'id',
          })
          setPresetManagerError('')
        } else if ((lower === 'x' || key.delete || key.backspace) && presetManagerDetail.canDelete) {
          setPresetManagerDeleteConfirm(presetManagerDetail)
        } else if (lower === 'v') {
          const id = presetManagerDetail.preset.id
          setPresetManagerComposition({ id, phase: 'loading' })
          void props.onReadPresetComposition(id).then((preview) => {
            setPresetManagerComposition(current => current?.id === id
              ? { id, phase: 'ready', text: preview.text, truncated: preview.truncated }
              : current)
          }).catch((error: unknown) => {
            setPresetManagerComposition(undefined)
            setPresetManagerError(terminalSafe(error instanceof Error ? error.message : String(error)))
          })
        } else if (lower === 'f' && props.pathOpenerAvailable) {
          void props.onOpenPresetFile(presetManagerDetail.preset.id)
        } else if (lower === 'o' && props.pathOpenerAvailable) {
          void props.onOpenPresetLocation(presetManagerDetail.preset.id)
        }
        return
      }
      if (action === 'dialog.previous' || action === 'dialog.next') {
        if (presetManagerRows.length === 0) return
        setPresetManagerSelection(previous => action === 'dialog.previous'
          ? (Math.min(previous, presetManagerRows.length - 1) + presetManagerRows.length - 1)
            % presetManagerRows.length
          : (Math.min(previous, presetManagerRows.length - 1) + 1) % presetManagerRows.length)
        setPresetManagerError('')
      } else if (action === 'dialog.previousPage' || action === 'dialog.nextPage') {
        setPresetManagerSelection(previous => action === 'dialog.previousPage'
          ? Math.max(0, previous - presetManagerVisibleCount)
          : Math.min(Math.max(0, presetManagerRows.length - 1), previous + presetManagerVisibleCount))
      } else if (action === 'dialog.accept') {
        if (presetManagerRows.length > 0 && selectedPresetManagerRow !== undefined) {
          setPresetManagerDetail(selectedPresetManagerRow)
        }
      } else if (action === 'dialog.cancel') {
        props.onClosePresetManager()
      } else if (input === 'R') {
        void props.onRefreshPresetManager()
      }
      return
    }
    if (sessionManager !== undefined && interaction === undefined) {
      const action = matchAction('Dialog', input, key)
      const lower = input.toLocaleLowerCase()
      if (sessionManager.phase !== 'ready') {
        if (action === 'dialog.cancel') props.onCloseSessionManager()
        return
      }
      if (directoryBrowser !== undefined) {
        if (action === 'dialog.cancel') {
          closeSessionManagerLayer()
        } else if (input === 'R') {
          loadWorkspaceDirectory(directoryBrowserPage?.path ?? directoryBrowser.requestedPath)
        } else if (input === '.') {
          setDirectoryBrowser(previous => previous === undefined ? undefined : {
            ...previous, showHidden: !previous.showHidden, selection: 0,
          })
        } else if (input === '~') {
          loadWorkspaceDirectory()
        } else if ((key.leftArrow || key.backspace) && directoryBrowserPage?.parent !== undefined) {
          loadWorkspaceDirectory(directoryBrowserPage.parent)
        } else if (action === 'dialog.previous' || action === 'dialog.next') {
          const count = directoryBrowserPage?.rows.length ?? 0
          if (count > 0) setDirectoryBrowser(previous => previous === undefined ? undefined : {
            ...previous,
            selection: action === 'dialog.previous'
              ? (Math.min(previous.selection, count - 1) + count - 1) % count
              : (Math.min(previous.selection, count - 1) + 1) % count,
          })
        } else if (action === 'dialog.previousPage' || action === 'dialog.nextPage') {
          const count = directoryBrowserPage?.rows.length ?? 0
          setDirectoryBrowser(previous => previous === undefined ? undefined : {
            ...previous,
            selection: action === 'dialog.previousPage'
              ? Math.max(0, previous.selection - directoryVisibleCount)
              : Math.min(Math.max(0, count - 1), previous.selection + directoryVisibleCount),
          })
        } else if (action === 'dialog.accept' && directoryBrowser.phase === 'ready') {
          acceptWorkspaceDirectory()
        }
        return
      }
      if (sessionManagerEdit !== undefined) {
        if (action === 'dialog.cancel') closeSessionManagerLayer()
        else if (action === 'dialog.accept') saveSessionManagerEdit()
        else if (key.backspace) {
          setSessionManagerEdit(previous => previous === undefined ? undefined : {
            ...previous, draft: previous.draft.slice(0, -1),
          })
          setSessionManagerError('')
        } else if (key.delete) {
          setSessionManagerEdit(previous => previous === undefined ? undefined : { ...previous, draft: '' })
          setSessionManagerError('')
        } else if (input !== '' && acceptsCommittedText(key)) {
          setSessionManagerEdit(previous => previous === undefined ? undefined : {
            ...previous, draft: `${previous.draft}${input}`.slice(0, 4_096),
          })
          setSessionManagerError('')
        }
        return
      }
      if (sessionManagerConfirm !== undefined) {
        if (action === 'dialog.cancel' || lower === 'n') closeSessionManagerLayer()
        else if (action === 'dialog.accept' || lower === 'y') confirmSessionManagerMutation()
        return
      }
      if (sessionManagerDetail) {
        if (action === 'dialog.cancel') closeSessionManagerLayer()
        else if (sessionManagerTab === 'sessions' && selectedManagedSession !== undefined) {
          if (lower === 'o' || action === 'dialog.accept') {
            runSessionManagerMutation(() => props.onResumeManagedSession(selectedManagedSession.candidate))
          } else if (lower === 'f') {
            runSessionManagerMutation(() => props.onForkManagedSession(selectedManagedSession.candidate))
          } else if (lower === 'r') {
            setSessionManagerEdit({ kind: 'session-rename', draft: selectedManagedSession.candidate.title })
          } else if (selectedManagedSession.archived && props.canUnarchiveManagedSessions === true && lower === 'u') {
            setSessionManagerConfirm('session-unarchive')
          } else if (!selectedManagedSession.archived && lower === 'a' && !selectedManagedSession.current) {
            setSessionManagerConfirm('session-archive')
          }
        } else if (sessionManagerTab === 'workspaces' && selectedManagedWorkspace !== undefined) {
          if (lower === 'r') {
            setSessionManagerEdit({ kind: 'workspace-rename', draft: selectedManagedWorkspace.title })
          } else if (lower === '[') {
            runSessionManagerMutation(() => props.onMoveManagedWorkspace(selectedManagedWorkspace, -1))
          } else if (lower === ']') {
            runSessionManagerMutation(() => props.onMoveManagedWorkspace(selectedManagedWorkspace, 1))
          } else if (lower === 'd' || key.delete || key.backspace) {
            setSessionManagerConfirm('workspace-delete')
          }
        }
        return
      }
      if (key.tab) {
        setSessionManagerTab(previous => previous === 'sessions' ? 'workspaces' : 'sessions')
        setSessionManagerQuery('')
        setSessionManagerSelection(0)
        setSessionManagerError('')
      } else if (sessionManagerTab === 'sessions' && lower === 'v') {
        setSessionManagerArchive((previous) => {
          const next = previous === 'active' ? 'archived' : previous === 'archived' ? 'all' : 'active'
          persistSessionManagerPreferences({ archive: next })
          return next
        })
        setSessionManagerSelection(0)
      } else if (sessionManagerTab === 'sessions' && lower === 's') {
        setSessionManagerScope((previous) => {
          const next = previous === 'workspace' ? 'all' : 'workspace'
          persistSessionManagerPreferences({ scope: next })
          return next
        })
        setSessionManagerSelection(0)
      } else if (sessionManagerTab === 'sessions' && lower === 'o') {
        setSessionManagerSort((previous) => {
          const next: TuiSessionSort = previous === 'updated-desc' ? 'updated-asc'
            : previous === 'updated-asc' ? 'title' : previous === 'title' ? 'workspace' : 'updated-desc'
          persistSessionManagerPreferences({ sort: next })
          return next
        })
        setSessionManagerSelection(0)
      } else if (sessionManagerTab === 'sessions' && lower === 'g') {
        setSessionManagerGroup((previous) => {
          persistSessionManagerPreferences({ groupByWorkspace: !previous })
          return !previous
        })
      } else if (sessionManagerTab === 'workspaces' && lower === 'a') {
        beginWorkspaceAdd()
      } else if (input === 'R') {
        runSessionManagerMutation(() => props.onRefreshSessionManager())
      } else if (action === 'dialog.previous' || action === 'dialog.next') {
        if (sessionManagerItems.length === 0) return
        setSessionManagerSelection(previous => action === 'dialog.previous'
          ? (Math.min(previous, sessionManagerItems.length - 1) + sessionManagerItems.length - 1)
            % sessionManagerItems.length
          : (Math.min(previous, sessionManagerItems.length - 1) + 1) % sessionManagerItems.length)
        setSessionManagerError('')
      } else if (action === 'dialog.previousPage' || action === 'dialog.nextPage') {
        setSessionManagerSelection(previous => action === 'dialog.previousPage'
          ? Math.max(0, previous - sessionManagerVisibleCount)
          : Math.min(Math.max(0, sessionManagerItems.length - 1), previous + sessionManagerVisibleCount))
      } else if (action === 'dialog.accept') {
        if (sessionManagerItems.length > 0) setSessionManagerDetail(true)
      } else if (action === 'dialog.cancel') {
        closeSessionManagerLayer()
      } else if (key.backspace) {
        setSessionManagerQuery(previous => deleteComposerText(createComposerState(previous), 'backward').text)
        setSessionManagerSelection(0)
      } else if (input !== '' && acceptsCommittedText(key)) {
        setSessionManagerQuery(previous => insertComposerText(createComposerState(previous), input)
          .text.slice(0, TUI_SESSION_MANAGER_QUERY_LIMIT))
        setSessionManagerSelection(0)
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
      } else if (input === 'R') {
        const candidate = resumeCandidates[effectiveResumeSelection]
        if (candidate === undefined) setResumeError(tuiMessage(locale, 'resume.search.none.current'))
        else if (candidate.disabledReason !== undefined) setResumeError(candidate.disabledReason)
        else if (hasComposerDraft && composer.text.trim() !== '/resume') {
          setResumeError(tuiMessage(locale, 'resume.rename.draft'))
        } else {
          setResumeError('')
          void props.onResumeForRename(candidate)
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
        cancelSelectedWorkItem()
      } else if (action === 'work.inspect') {
        openSelectedWorkItem()
      } else if (action === 'work.close') setWorkOpen(false)
      return
    }
    if (inputContext === 'Detail' && (focus?.mode === 'detail' || footerDetail !== undefined)) {
      if (feedbackNoteDraft !== undefined) {
        if (key.escape) {
          setFeedbackNoteDraft(undefined)
        } else if (focusedFeedbackMutation?.status === 'pending') {
          return
        } else if (key.return) {
          const draft = feedbackNoteDraft
          void props.onSubmitFeedback(
            draft.messageId,
            draft.rating,
            draft.text.trim() === '' ? undefined : draft.text,
          )
        } else if (key.backspace || key.delete) {
          setFeedbackNoteDraft(previous => previous === undefined ? previous : {
            ...previous, text: previous.text.slice(0, -1),
          })
        } else if (input !== '' && acceptsCommittedText(key)) {
          setFeedbackNoteDraft(previous => previous === undefined ? previous : {
            ...previous, text: previous.text + input,
          })
        }
        return
      }
      const action = matchAction('Detail', input, key)
      if (focusedActivity !== undefined && inspectedActivityTool === undefined
        && (action === 'detail.previousItem' || action === 'detail.nextItem')) {
        selectActivityTool(activitySelection + (action === 'detail.previousItem' ? -1 : 1))
        return
      }
      if (focusedDeliverables !== undefined
        && (action === 'detail.previousItem' || action === 'detail.nextItem')) {
        const offset = action === 'detail.previousItem' ? -1 : 1
        setDeliverableSelection(previous => Math.max(
          0,
          Math.min(focusedDeliverables.items.length - 1, previous + offset),
        ))
        return
      }
      if (selectedDeliverable !== undefined && action === 'detail.copyPath') {
        const result = props.onCopy(selectedDeliverable.path)
        setNotice(result.ok
          ? tuiMessage(locale, 'clipboard.detail.copied')
          : result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
        return
      }
      if (selectedDeliverable !== undefined && action === 'detail.openPath') {
        if (props.pathOpenerAvailable) void props.onOpenPath(selectedDeliverable.path)
        else setNotice(tuiMessage(locale, 'deliverables.open.unavailable'))
        return
      }
      if (focusedFeedbackMessageId !== undefined
        && (action === 'detail.feedbackPositive' || action === 'detail.feedbackNegative')) {
        const rating = action === 'detail.feedbackPositive' ? 'positive' as const : 'negative' as const
        void props.onSubmitFeedback(focusedFeedbackMessageId, rating, focusedFeedback?.note)
        return
      }
      if (focusedFeedbackMessageId !== undefined && focusedFeedback !== undefined
        && action === 'detail.feedbackNote') {
        setFeedbackNoteDraft({
          messageId: focusedFeedbackMessageId,
          rating: focusedFeedback.rating,
          text: focusedFeedback.note ?? '',
        })
        return
      }
      if (focusedFeedbackMessageId !== undefined && focusedFeedback !== undefined
        && action === 'detail.feedbackClear') {
        void props.onClearFeedback(focusedFeedbackMessageId)
        return
      }
      if (action === 'detail.copy') {
        copyFocusedDetail()
        return
      }
      if (action === 'detail.exportMarkdown') {
        exportFocusedOutput()
        return
      }
      if (action === 'detail.toggleScope' && focusedAssistantParts.length > 1) {
        setOutputReaderScope(previous => previous === 'segment' ? 'response' : 'segment')
        setFocus(previous => previous?.mode !== 'detail' ? previous : { ...previous, detailOffset: 0 })
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
        if (focusedActivity !== undefined && inspectedActivityTool === undefined && key.return) {
          inspectActivityTool()
          return
        }
        if (focusedActivity !== undefined && inspectedActivityTool !== undefined) {
          setActivityInspector({ key: focusedActivity.key, selection: activitySelection })
          setFocus(previous => previous?.mode !== 'detail' ? previous : { ...previous, detailOffset: 0 })
          return
        }
        setFeedbackNoteDraft(undefined)
        if (screenSelection?.surface === 'detail') setScreenSelection(undefined)
        else if (footerDetail !== undefined) setFooterDetail(undefined)
        else {
          setFocus(previous => previous?.mode !== 'detail' ? previous : previous.returnToComposer === true
            ? undefined
            : { mode: 'browse', focusedKey: previous.focusedKey, focusedIndex: previous.focusedIndex })
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
            : tuiTranscriptDetailText(focusedTarget.node, focusedTarget.child, locale)
        const result = props.onCopy(copyText)
        if (result.ok) {
          setNotice('')
          setConfirmationNotice(previous => ({
            text: tuiMessage(locale, 'clipboard.transcript.copied'),
            generation: (previous?.generation ?? 0) + 1,
          }))
        } else {
          setConfirmationNotice(undefined)
          setNotice(result.message ?? tuiMessage(locale, 'clipboard.copy.failed'))
        }
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
      if (action === 'transcript.previousTurn' || action === 'transcript.nextTurn') {
        navigateCompletedTurn(action === 'transcript.previousTurn' ? 'previous' : 'next')
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
      } else if (composerAction === 'composer.transcriptPreviousTurn'
        || composerAction === 'composer.transcriptNextTurn') {
        navigateCompletedTurn(composerAction === 'composer.transcriptPreviousTurn' ? 'previous' : 'next')
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
    if (interaction === undefined && focus === undefined && composerAction === 'composer.openQueue') {
      openQueue()
      return
    }
    if (interaction === undefined && focus === undefined && composerAction === 'composer.openGoalPlan') {
      openGoalPlan()
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
      composerOwnsInput: inputContext === 'Composer',
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
    if (interaction === undefined && (composerAction === 'composer.transcriptPreviousTurn'
      || composerAction === 'composer.transcriptNextTurn')) {
      navigateCompletedTurn(composerAction === 'composer.transcriptPreviousTurn' ? 'previous' : 'next')
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
      const pastedPaths = key.paste === true && terminalInput.truncated !== true
        && inputContext === 'Composer' && interaction === undefined && focus === undefined && !busy
        ? parseTuiTerminalPathPaste(input)
        : undefined
      if (pastedPaths !== undefined) {
        pasteTerminalPaths(input, pastedPaths)
        return
      }
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
      {suggestion.status === 'empty' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{suggestion.kind === 'reference'
        ? tuiMessage(locale, 'suggestion.empty.references')
        : suggestion.kind === 'path' ? tuiMessage(locale, 'suggestion.empty.paths') : tuiMessage(locale, 'suggestion.empty.commands')}</Text>}
      {suggestion.error !== undefined && <Text {...tuiTextStyle(theme.tokens.error)}>{terminalSafe(suggestion.error)}</Text>}
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
        {suggestion.items.length === 0 ? tuiMessage(locale, 'suggestion.search.limit') : tuiMessage(locale,
          suggestion.kind === 'reference' ? 'suggestion.references.omitted' : 'suggestion.paths.omitted')}
      </Text>}
    </Box>
    : undefined
  const cursorPrefix = sessionExportDialog?.phase === 'selecting'
    ? composerPrefix
    : resumeDialog !== undefined || sessionManager !== undefined || freshSessionDialog !== undefined
      || rewindDialog !== undefined || sessionExportDialog !== undefined
      || (pluginHubDialog !== undefined && interaction === undefined)
      || helpVisible || doctorVisible || loadedContextVisible || providerCenterVisible || queueOpen || goalPlanOpen
      || footerSelection !== undefined || footerDetail !== undefined || workOpen
      ? undefined
      : question !== undefined
        ? composerPrefix
        : transcriptSearch !== undefined && interaction === undefined
          ? composerPrefix
          : historySearch !== undefined
            ? composerPrefix
            : interaction === undefined && focus === undefined && props.view.acceptsInput
              ? composerPrefix
              : undefined
  props.onInputCursor(fullscreenScene !== undefined || doctorVisible || loadedContextVisible
    || providerCenterVisible || queueOpen || goalPlanOpen || sessionManager !== undefined
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
        2 + (question === undefined ? 0 : 1) + attachmentRail.count,
      ))

  if (fullscreenScene !== undefined) {
    const frame = fullscreenFrame ?? {
      title: fullscreenScene.id, lines: [], footer: fullscreenCloseLabel,
    }
    return <TuiPane title={frame.title} titleTone="default" height={stdout.rows}>
      <TuiScrollablePanel framed marginX={1} paddingX={1}>
        {frame.lines.map((line, index) => <Text key={`${index}:${line}`} wrap="truncate-end">{line}</Text>)}
      </TuiScrollablePanel>
      <TuiSection paddingX={2} height={1}>
        <TuiHintLine>{fullscreenFooterLine}</TuiHintLine>
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
      <TuiActionFooter
        status={<TuiHintLine>
          {doctorLines.length === 0 ? 0 : visibleDoctorOffset + 1}–{Math.min(
            visibleDoctorOffset + doctorBodyRows, doctorLines.length,
          )} / {doctorLines.length}
        </TuiHintLine>}
        actions={<TuiHintLine>{scrollingDialogFooterLine}</TuiHintLine>}
      />
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
      <TuiActionFooter
        status={<TuiHintLine>
          {loadedContextLines.length === 0 ? 0 : visibleLoadedContextOffset + 1}–{Math.min(
            visibleLoadedContextOffset + loadedContextBodyRows, loadedContextLines.length,
          )} / {loadedContextLines.length}
        </TuiHintLine>}
        actions={<TuiHintLine>{scrollingDialogFooterLine}</TuiHintLine>}
      />
    </TuiPane>
  }

  if (queueOpen) {
    if (queueEditDraft !== undefined && selectedQueueItem !== undefined) {
      const lines = terminalWrappedLines(`${queueEditDraft}█`, Math.max(1, columns - 6))
      const visibleLines = lines.slice(Math.max(0, lines.length - Math.max(1, terminalRows - 7)))
      return <TuiPane title={tuiMessage(locale, 'queue.title')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection title={tuiMessage(locale, 'queue.edit.title')} tone="accent">
            {visibleLines.map((line, index) => <Text key={`${index}:${line}`}>{line}</Text>)}
            {queueError === '' ? undefined : <TuiHintLine tone="error">{queueError}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{tuiMessage(locale, 'queue.edit.identity', { id: selectedQueueItem.id })}</TuiHintLine>}
          actions={<TuiHintLine>{tuiMessage(locale, 'queue.hint.edit')}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (queueDeleteConfirmation && selectedQueueItem !== undefined) {
      return <TuiPane title={tuiMessage(locale, 'queue.title')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection title={tuiMessage(locale, 'queue.delete.title')} tone="warning">
            <Text>{tuiMessage(locale, 'queue.delete.question')}</Text>
            <TuiHintLine>{selectedQueueItem.preview}</TuiHintLine>
            {queueError === '' ? undefined : <TuiHintLine tone="error">{queueError}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{tuiMessage(locale, 'queue.delete.boundary')}</TuiHintLine>}
          actions={<TuiHintLine>{tuiMessage(locale, 'queue.hint.delete')}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (queueDetail && selectedQueueItem !== undefined) {
      return <TuiPane title={tuiMessage(locale, 'queue.title')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          {selectedQueueDetailLines.slice(queueDetailWindow.start, queueDetailWindow.end).map((line, index) => <Text
            key={`${queueDetailWindow.start + index}:${line}`}
            wrap="truncate-end"
          >{line}</Text>)}
          {queueError === '' ? undefined : <TuiHintLine tone="error">{queueError}</TuiHintLine>}
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{queueDetailWindow.start + 1}–{queueDetailWindow.end} / {selectedQueueDetailLines.length}</TuiHintLine>}
          actions={<TuiHintLine>{tuiMessage(locale, selectedQueueItem.canEdit || selectedQueueItem.canDelete
            ? 'queue.hint.detailActions' : 'queue.hint.detail')}</TuiHintLine>}
        />
      </TuiPane>
    }
    return <TuiPane title={tuiMessage(locale, 'queue.title')} titleTone="default" height={stdout.rows}>
      <TuiScrollablePanel framed marginX={1} paddingX={1}>
        {visibleQueueItems.map((item, index) => {
          const absoluteIndex = queueVisibleStart + index
          const lane = tuiMessage(locale, item.lane === 'next-step' ? 'queue.lane.step' : 'queue.lane.turn')
          const attachments = item.attachmentCount === 0 ? '' : ` · ${tuiMessage(locale, 'queue.attachments', {
            count: item.attachmentCount,
          })}`
          return <TuiListRow
            key={item.id}
            selected={absoluteIndex === effectiveQueueSelection}
            height={2}
            title={item.preview === '' ? tuiMessage(locale, 'queue.noText') : item.preview}
            trailing={lane}
            trailingTone={item.lane === 'next-step' ? 'warning' : 'accent'}
            description={`${formatTuiQueueAge(item.insertedAt, queueClock)} · ${item.source}${attachments}`}
          />
        })}
        {queue.omitted === 0 ? undefined : <TuiHintLine tone="warning">
          {tuiMessage(locale, 'queue.omitted', { count: queue.omitted })}
        </TuiHintLine>}
        {queueError === '' ? undefined : <TuiHintLine tone="error">{queueError}</TuiHintLine>}
      </TuiScrollablePanel>
      <TuiActionFooter
        status={<TuiHintLine>{tuiMessage(locale, 'queue.counts', {
          step: queue.nextStepCount, turn: queue.nextTurnCount,
        })}</TuiHintLine>}
        actions={<TuiHintLine>{tuiMessage(locale, 'queue.hint.list')}</TuiHintLine>}
      />
    </TuiPane>
  }

  if (providerCenterVisible) {
    const phaseStatus = providerCenter.onboarding !== undefined
      ? tuiMessage(locale, providerCenter.onboarding.durable
        ? 'provider.onboarding.prompt' : 'provider.onboarding.promptProcess')
      : providerCenter.phase === 'loading'
        ? tuiMessage(locale, 'provider.loading')
        : providerCenter.phase === 'error'
          ? tuiMessage(locale, 'provider.refreshFailed')
          : providerCenter.snapshot?.omittedProviders
            ? tuiMessage(locale, 'provider.omitted', { count: providerCenter.snapshot.omittedProviders })
            : `${providerRows.length}`
    if (providerWizard !== undefined) {
      const wizard = providerWizard
      const stepTitle = wizard.step === 'id' ? tuiMessage(locale, 'provider.custom.step.id')
        : wizard.step === 'name' ? tuiMessage(locale, 'provider.custom.step.name')
          : wizard.step === 'endpoint' ? tuiMessage(locale, 'provider.custom.step.endpoint')
            : wizard.step === 'protocol' ? tuiMessage(locale, 'provider.custom.step.protocol')
              : wizard.step === 'key' ? tuiMessage(locale, 'provider.custom.step.key')
                : wizard.step === 'models' ? tuiMessage(locale, 'provider.custom.step.models')
                  : wizard.step === 'picker' ? tuiMessage(locale, 'provider.custom.step.picker')
                    : tuiMessage(locale, 'provider.custom.step.confirm')
      const stepPosition = wizard.step === 'id' ? 1
        : wizard.step === 'name' ? 2
          : wizard.step === 'endpoint' ? 3
            : wizard.step === 'protocol' ? 4
              : wizard.step === 'key' ? 5
                : wizard.step === 'models' || wizard.step === 'picker' ? 6 : 7
      const textValue = wizard.step === 'id' ? wizard.id
        : wizard.step === 'name' ? wizard.displayName
          : wizard.step === 'endpoint' ? wizard.endpoint
            : wizard.step === 'models' ? wizard.modelText
              : ''
      const keyMaskCells = Math.max(1, columns - 22)
      const keyMask = `${'•'.repeat(Math.min(providerWizardSecret.length, keyMaskCells))}█`
      return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection title={tuiMessage(locale, 'provider.custom.title', {
            step: stepPosition, total: 7, title: stepTitle,
          })} tone="accent">
            {wizard.step === 'protocol'
              ? wizard.target.protocols.map((protocol, index) => <TuiListRow
                key={protocol}
                selected={index === wizard.protocolIndex}
                height={1}
                title={protocol}
              />)
              : wizard.step === 'picker'
                ? visibleProviderCandidates.map((candidate, index) => {
                  const absoluteIndex = providerCandidateStart + index
                  return <TuiListRow
                    key={`${absoluteIndex}:${candidate.id}`}
                    selected={absoluteIndex === wizard.candidateIndex}
                    height={1}
                    title={`${wizard.picked.has(candidate.id) ? '[x]' : '[ ]'} ${candidate.name ?? candidate.id}`}
                    trailing={candidate.name === undefined ? undefined : candidate.id}
                  />
                })
                : wizard.step === 'confirm'
                  ? <>
                    <Text>{tuiMessage(locale, 'provider.custom.confirm.identity', {
                      name: wizard.displayName, id: wizard.id,
                    })}</Text>
                    <Text>{tuiMessage(locale, 'provider.custom.confirm.endpoint', {
                      endpoint: providerWizardEndpointLabel(wizard.endpoint),
                    })}</Text>
                    <Text>{tuiMessage(locale, 'provider.custom.confirm.protocol', {
                      protocol: wizard.target.protocols[wizard.protocolIndex] ?? '?',
                    })}</Text>
                    <Text>{tuiMessage(locale, 'provider.custom.confirm.models', { count: wizard.models.length })}</Text>
                    <Text>{tuiMessage(locale, 'provider.custom.confirm.credential', {
                      state: tuiMessage(locale, providerWizardSecret.trim() === ''
                        ? 'provider.custom.credential.none' : 'provider.custom.credential.staged'),
                    })}</Text>
                  </>
                  : <>
                    <TuiHintLine>{tuiMessage(locale, wizard.step === 'id'
                      ? 'provider.custom.prompt.id'
                      : wizard.step === 'name'
                        ? 'provider.custom.prompt.name'
                        : wizard.step === 'endpoint'
                          ? 'provider.custom.prompt.endpoint'
                          : wizard.step === 'key'
                            ? 'provider.custom.prompt.key'
                            : 'provider.custom.prompt.models')}</TuiHintLine>
                    <Text wrap="truncate-end">{wizard.step === 'key' ? keyMask : `${textValue}█`}</Text>
                  </>}
            {wizard.error === '' ? undefined : <TuiHintLine tone="error">{wizard.error}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{busy
            ? tuiMessage(locale, wizard.step === 'picker'
              ? 'provider.custom.discovery.loading' : 'common.working')
            : wizard.step === 'picker'
              ? tuiMessage(locale, 'provider.custom.picker.count', {
                picked: wizard.picked.size, count: wizard.candidates.length,
              })
              : ''}</TuiHintLine>}
          actions={<TuiHintLine>{tuiMessage(locale, wizard.step === 'models'
            ? 'provider.custom.hint.models'
            : wizard.step === 'picker'
              ? 'provider.custom.hint.picker'
              : wizard.step === 'confirm'
                ? 'provider.custom.hint.confirm'
                : wizard.step === 'protocol'
                  ? 'provider.custom.hint.protocol'
                  : 'provider.custom.hint.input')}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (providerDetail && providerProfileEditor !== undefined) {
      const editor = providerProfileEditor
      const row = providerRows.find(candidate => candidate.id === editor.providerId)
      const editable = row?.settings?.editable
      const inherited = tuiMessage(locale, 'provider.profile.inherited')
      const protocol = editor.protocols[editor.protocolIndex] || inherited
      const models = editor.modelsText === '' ? tuiMessage(locale, 'provider.profile.modelsEmpty') : editor.modelsText
      return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection title={tuiMessage(locale, 'provider.profile.title', { provider: editor.providerId })} tone="accent">
            {editable?.displayNameSupported === true ? <Text {...editor.field === 'displayName' ? tuiTextStyle(theme.tokens.selection) : {}} wrap="truncate-end">
              {tuiMessage(locale, 'provider.profile.displayName', {
                value: `${editor.displayName || inherited}${editor.field === 'displayName' ? '█' : ''}`,
              })}
            </Text> : undefined}
            {editable?.protocolSupported === true ? <Text {...editor.field === 'protocol' ? tuiTextStyle(theme.tokens.selection) : {}} wrap="truncate-end">
              {tuiMessage(locale, 'provider.profile.protocol', {
                value: `${protocol}${editor.field === 'protocol' ? ' ◀▶' : ''}`,
              })}
            </Text> : undefined}
            {editable?.modelsSupported === true ? <Text {...editor.field === 'models' ? tuiTextStyle(theme.tokens.selection) : {}} wrap="wrap">
              {tuiMessage(locale, 'provider.profile.models', {
                value: `${terminalSafe(models)}${editor.field === 'models' ? '█' : ''}`,
              })}
            </Text> : undefined}
            {editable?.modelsSupported === true
              ? <TuiHintLine>{tuiMessage(locale, 'provider.profile.syntax')}</TuiHintLine> : undefined}
            {editor.error === '' ? undefined : <TuiHintLine tone="error">{editor.error}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{busy ? tuiMessage(locale, 'common.working') : ''}</TuiHintLine>}
          actions={<TuiHintLine>{providerDetailActionHint}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (providerDetail && providerDeleteConfirmation !== undefined) {
      const row = providerRows.find(candidate => candidate.id === providerDeleteConfirmation)
      return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection title={tuiMessage(locale, 'provider.remove.title', {
            provider: row?.name ?? providerDeleteConfirmation,
          })} tone="warning">
            <Text wrap="wrap">{tuiMessage(locale, 'provider.remove.detail')}</Text>
            {providerSecretError === '' ? undefined : <TuiHintLine tone="error">{providerSecretError}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{busy ? tuiMessage(locale, 'common.working') : ''}</TuiHintLine>}
          actions={<TuiHintLine>{providerDetailActionHint}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (providerDetail && providerLogoutConfirmation !== undefined) {
      const row = providerRows.find(candidate => candidate.id === providerLogoutConfirmation)
      return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection title={tuiMessage(locale, 'provider.logout.title', {
            provider: row?.name ?? providerLogoutConfirmation,
          })} tone="warning">
            <Text wrap="wrap">{tuiMessage(locale, 'provider.logout.detail')}</Text>
            {providerSecretError === '' ? undefined : <TuiHintLine tone="error">{providerSecretError}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{busy ? tuiMessage(locale, 'common.working') : ''}</TuiHintLine>}
          actions={<TuiHintLine>{providerDetailActionHint}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (providerDetail && selectedProvider !== undefined && providerEndpointDraft !== undefined) {
      const currentEndpoint = selectedProvider.settings?.endpoint
        ?? tuiMessage(locale, 'provider.endpoint.inherited')
      return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection
            title={tuiMessage(locale, 'provider.endpoint.prompt', { provider: selectedProvider.name })}
            tone="accent"
          >
            <TuiHintLine>{tuiMessage(locale, 'provider.endpoint.current', { endpoint: currentEndpoint })}</TuiHintLine>
            <Text wrap="truncate-end">{tuiMessage(locale, 'provider.endpoint.input', {
              value: `${providerEndpointDraft}█`,
            })}</Text>
            {providerEndpointError === '' ? undefined : <TuiHintLine tone="error">{providerEndpointError}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{busy ? tuiMessage(locale, 'common.working') : ''}</TuiHintLine>}
          actions={<TuiHintLine>{providerDetailActionHint}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (providerDetail && selectedProvider !== undefined && providerSecretDraft !== undefined) {
      const availableMaskCells = Math.max(1, columns - 16)
      const mask = `${'•'.repeat(Math.min(providerSecretDraft.length, availableMaskCells))}█`
      return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          <TuiSection
            title={tuiMessage(locale, 'provider.key.prompt', { provider: selectedProvider.name })}
            tone="accent"
          >
            <Text wrap="truncate-end">{tuiMessage(locale, 'provider.key.masked', { value: mask })}</Text>
            {providerSecretError === '' ? undefined : <TuiHintLine tone="error">{providerSecretError}</TuiHintLine>}
          </TuiSection>
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>{busy ? tuiMessage(locale, 'common.working') : ''}</TuiHintLine>}
          actions={<TuiHintLine>{providerDetailActionHint}</TuiHintLine>}
        />
      </TuiPane>
    }
    if (providerDetail && selectedProvider !== undefined) {
      return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
        <TuiScrollablePanel framed marginX={1} paddingX={1}>
          {selectedProviderDetailLines.slice(providerDetailWindow.start, providerDetailWindow.end).map((line, index) => <Text
            key={`${providerDetailWindow.start + index}:${line}`}
            {...line.startsWith('!') ? tuiTextStyle(theme.tokens.warning) : {}}
            wrap="truncate-end"
          >{line}</Text>)}
        </TuiScrollablePanel>
        <TuiActionFooter
          status={<TuiHintLine>
            {providerDetailWindow.start + 1}–{providerDetailWindow.end} / {selectedProviderDetailLines.length}
          </TuiHintLine>}
          actions={<TuiHintLine>{providerDetailActionHint}</TuiHintLine>}
        />
      </TuiPane>
    }
    return <TuiPane title={tuiMessage(locale, 'pane.provider')} titleTone="default" height={stdout.rows}>
      <TuiScrollablePanel framed marginX={1} paddingX={1}>
        {providerCenter.snapshot === undefined && providerCenter.phase === 'loading'
          ? <TuiLoadingState message={tuiMessage(locale, 'provider.loading')} columns={Math.max(1, columns - 6)} />
          : providerCenter.snapshot === undefined
            ? <TuiEmptyState
              message={tuiMessage(locale, 'provider.refreshFailed')}
              tone="error"
            />
            : providerRows.length === 0
              ? <TuiEmptyState message={tuiMessage(locale, 'provider.empty')} tone="warning" />
              : visibleProviderRows.map((row, index) => {
                const absoluteIndex = providerVisibleStart + index
                const models = row.modelCount === undefined
                  ? tuiMessage(locale, 'provider.models.unknown')
                  : tuiMessage(locale, 'provider.models.count', { count: row.modelCount })
                const settings = row.settings === undefined
                  ? tuiMessage(locale, 'provider.settings.none')
                  : row.settings.registered
                    ? row.settings.namespace
                    : tuiMessage(locale, 'provider.settings.unregistered')
                const route = tuiMessage(locale, row.active ? 'provider.state.active' : 'provider.state.dormant')
                return <TuiListRow
                  key={row.id}
                  selected={absoluteIndex === effectiveProviderSelection}
                  height={providerRowHeight}
                  title={`${row.name} (${row.id})`}
                  trailing={providerAuthenticationLabel(row, locale)}
                  trailingTone={row.authentication === 'configured'
                    ? 'success'
                    : row.authentication === 'unavailable' ? 'error' : 'warning'}
                  description={`${route}${row.declared ? ` · ${tuiMessage(locale, 'provider.state.custom')}` : ''} · ${models} · ${settings}`}
                />
              })}
      </TuiScrollablePanel>
      <TuiActionFooter
        status={<TuiHintLine tone={providerCenter.phase === 'error' ? 'error' : 'muted'}>{phaseStatus}</TuiHintLine>}
        actions={<TuiHintLine>{tuiMessage(locale, providerCenter.onboarding !== undefined
          ? providerCreationTarget === undefined ? 'provider.onboarding.hintNoAdd' : 'provider.onboarding.hint'
          : providerCreationTarget === undefined ? 'provider.hint.list' : 'provider.hint.listAdd')}</TuiHintLine>}
      />
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
              {index === 0 && <Text {...tuiTextStyle(theme.tokens.success)}>{composerPrefix}</Text>}
              {index === 0 ? '' : composerContinuation}{line === '' && composer.text === '' && index === 0
                ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{tuiMessage(locale, 'startup.placeholder')}</Text>
                : line}
            </Text>)}
            {attachmentRailView}
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
          : confirmationNotice !== undefined
            ? <Text {...tuiTextStyle(theme.tokens.success)}>{confirmationNotice.text}</Text>
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
        ? tuiMessage(locale, pluginHubDialog.discoveryDetail === undefined
          ? 'plugin.title.detail' : 'plugin.title.discoveryDetail')
        : pluginHubDialog.view === 'installed'
          ? tuiMessage(locale, 'plugin.title.installed')
          : pluginHubDialog.view === 'discovery'
            ? tuiMessage(locale, 'plugin.title.discovery')
            : tuiMessage(locale, 'plugin.title.discover')
    const statusLine = pluginHubDialog.view === 'installed'
      ? tuiMessage(locale, 'plugin.status.profile', {
        revision: pluginHubDialog.installed?.profileRevision ?? tuiMessage(locale, 'common.loading'),
      })
      : pluginHubDialog.view === 'discovery'
        ? tuiMessage(locale, 'plugin.discovery.status', {
          revision: pluginHubDialog.discoveryPage?.catalogRevision ?? tuiMessage(locale, 'plugin.discovery.unknown'),
          sort: tuiPluginHubSortLabel(pluginHubDialog.sort, locale),
        })
        : pluginHubCatalogLine ?? tuiPluginHubCatalogLine(pluginHubDialog, locale)
    const working = pluginHubDialog.phase === 'loading' || pluginHubDialog.phase === 'detail-loading'
      ? tuiMessage(locale, 'plugin.working.loading')
      : pluginHubDialog.phase === 'planning'
        ? tuiMessage(locale, 'plugin.working.planning')
        : pluginHubDialog.phase === 'staging'
          ? tuiMessage(locale, 'plugin.working.staging')
          : pluginHubDialog.phase === 'handoff'
            ? tuiMessage(locale, 'plugin.working.handoff')
            : undefined
    const progress = pluginHubDialog.progress
    return <TuiPane title={tuiMessage(locale, 'pane.plugins')} height={stdout.rows}>
      <TuiSection paddingX={2}>
        <Text>
          <Text {...pluginHubDialog.view === 'installed' ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)} bold={pluginHubDialog.view === 'installed'}>{pluginHubInstalledTabLabel}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
          <Text {...pluginHubDialog.view === 'discover' ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)} bold={pluginHubDialog.view === 'discover'}>{tuiMessage(locale, 'plugin.view.discover')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
          <Text {...pluginHubDialog.view === 'discovery' ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)} bold={pluginHubDialog.view === 'discovery'}>{tuiMessage(locale, 'plugin.view.discovery')}</Text>
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
                bold={line.kind === 'title' || line.kind === 'section' || line.kind === 'link'}
                wrap="truncate-end"
              >{line.text}</Text>)
              : pluginHubRows.length === 0
                ? <TuiEmptyState
                  tone="warning"
                  message={pluginHubDialog.view === 'installed'
                    ? tuiMessage(locale, 'plugin.empty.installed')
                    : pluginHubDialog.view === 'discovery'
                      ? tuiMessage(locale, 'plugin.empty.discovery')
                      : tuiMessage(locale, 'plugin.empty.discover')}
                />
                : pluginHubRows.slice(pluginHubVisibleStart, pluginHubVisibleStart + pluginHubVisibleCount).map((row) => {
                  const layout = tuiPluginHubCardLayout(row, stdout.columns || 80, Date.now(), locale)
                  const trailingTone = row.kind === 'discovery'
                    ? 'warning' as const
                    : row.verificationLevel === 'curated'
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
      <TuiActionFooter
        status={!detail && !confirmation && pluginHubDialog.view !== 'installed' && pluginHubRows.length > 0
          ? <TuiHintLine>
            {tuiMessage(locale, 'common.showing.range', {
              start: pluginHubVisibleStart + 1, end: pluginHubVisibleEnd,
            })}
            {pluginHubDialog.loadingMore
              ? tuiMessage(locale, 'plugin.loading.more')
              : pluginHubNextCursor !== undefined ? tuiMessage(locale, 'plugin.more.available') : ''}
          </TuiHintLine>
          : undefined}
        actions={<TuiHintLine>{pluginHubFooterLine}</TuiHintLine>}
      />
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
          {index === 0 && <Text {...tuiTextStyle(theme.tokens.selection)}>{composerPrefix}</Text>}
          {index === 0 ? '' : composerContinuation}{line}
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
    const targetPreset = freshSessionDialog.targetPreset
    return <TuiPane title={tuiMessage(locale, 'pane.fresh')} height={stdout.rows}>
      <TuiSection grow center paddingX={2}>
        <TuiSection framed tone="warning" title={tuiMessage(locale, 'fresh.title')}>
          <Text wrap="wrap">
            {targetPreset === undefined
              ? tuiMessage(locale, 'fresh.description', { command: commandLabel })
              : tuiMessage(locale, 'fresh.mode.description', {
                mode: targetPreset.name, id: targetPreset.id,
              })}
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
      <TuiSection height={1} paddingX={2}>
        <TuiHintLine>{tuiMessage(locale, freshSessionDialog.phase === 'creating'
          ? 'common.esc.close' : 'fresh.confirm')}</TuiHintLine>
      </TuiSection>
    </TuiPane>
  }

  if (goalPlanOpen && interaction === undefined && goalPlanSurface !== undefined) {
    const goal = goalPlanSurface.goal
    const plan = goalPlanSurface.plan
    return <TuiPane title={tuiMessage(locale, 'pane.goalPlan')} height={stdout.rows}>
      <TuiSection paddingX={2} height={2}>
        <Text bold>{tuiMessage(locale, 'goalPlan.title')}</Text>
        <TuiHintLine>{tuiMessage(locale, 'goalPlan.authoritative')}</TuiHintLine>
      </TuiSection>
      <TuiScrollablePanel paddingX={2}>
        {goalEditDraft !== undefined
          ? <TuiSection framed tone="accent" title={tuiMessage(locale, 'goalPlan.edit.title')}>
            <Text wrap="wrap">{terminalSafe(goalEditDraft)}█</Text>
            <TuiHintLine>{tuiMessage(locale, 'goalPlan.edit.boundary')}</TuiHintLine>
          </TuiSection>
          : goalClearConfirmation
            ? <TuiSection framed tone="warning" title={tuiMessage(locale, 'goalPlan.clear.title')}>
              <Text wrap="wrap">{tuiMessage(locale, 'goalPlan.clear.confirm')}</Text>
              {goal === undefined ? undefined : <TuiHintLine>{terminalSafe(goal.objective)}</TuiHintLine>}
            </TuiSection>
            : <>
              {goal === undefined
                ? <TuiEmptyState message={tuiMessage(locale, 'goalPlan.goal.none')} />
                : <TuiSection framed tone="accent" title={tuiMessage(locale, 'goalPlan.goal.title')}>
                  <Text wrap="wrap">{terminalSafe(goal.objective)}</Text>
                  <Text>{tuiMessage(locale, 'goalPlan.goal.phase', {
                    phase: tuiMessage(locale, `goalPlan.phase.${goal.phase}`),
                  })}</Text>
                  <Text>{tuiMessage(locale, 'goalPlan.detail.rounds', {
                    current: goalPlanSurface.roundsStarted ?? 0, maximum: goal.maxGoalRounds,
                  })}</Text>
                  {goal.blockedReason === undefined ? undefined
                    : <TuiHintLine tone="warning">{terminalSafe(goal.blockedReason.message)}</TuiHintLine>}
                </TuiSection>}
              {plan?.effective === true && <TuiSection framed tone="warning" title={tuiMessage(locale, 'goalPlan.plan.title')}>
                <Text>{tuiMessage(locale, plan.pending ? 'goalPlan.detail.planPending' : 'goalPlan.detail.plan')}</Text>
              </TuiSection>}
            </>}
      </TuiScrollablePanel>
      <TuiActionFooter
        status={goalPlanError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{goalPlanError}</Text>
          : busy ? <TuiHintLine>{tuiMessage(locale, 'goalPlan.working')}</TuiHintLine> : undefined}
        actions={<TuiHintLine>{goalPlanDialogActions.map(item => item.label).join(' · ')}</TuiHintLine>}
      />
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
      <TuiActionFooter
        status={<TuiHintLine tone="error">{effectiveError === '' ? '' : terminalSafe(effectiveError)}</TuiHintLine>}
        actions={<TuiHintLine>{rewindConfirmation !== undefined
          ? activeDraft
            ? [
              tuiMessage(locale, 'rewind.stash'),
              tuiMessage(locale, 'rewind.discard'),
              tuiMessage(locale, 'rewind.cancel'),
            ].join(' · ')
            : tuiMessage(locale, 'rewind.confirm')
          : rewindDialog.phase === 'browsing'
            ? tuiMessage(locale, 'rewind.footer.browse')
            : rewindDialog.phase === 'rewinding'
              ? tuiMessage(locale, 'rewind.footer.cancel') : tuiMessage(locale, 'common.esc.close')}</TuiHintLine>}
      />
    </TuiPane>
  }

  if (trajectory !== undefined && interaction === undefined) {
    const facts = trajectoryDetail !== undefined
      ? trajectoryTimingFacts(trajectory.entries, trajectory.entries.indexOf(trajectoryDetail))
      : undefined
    const inspectorLines = trajectoryDetail === undefined ? [] : trajectoryInspectorTab === 'input'
      ? [trajectoryDetail.input ?? tuiMessage(locale, 'trajectory.inspector.none')]
      : trajectoryInspectorTab === 'output'
        ? [trajectoryDetail.output ?? tuiMessage(locale, 'trajectory.inspector.none')]
        : trajectoryInspectorTab === 'timing'
          ? [
            tuiMessage(locale, 'trajectory.inspector.duration', {
              duration: formatTrajectoryDuration(facts?.durationMs),
            }),
            tuiMessage(locale, 'trajectory.inspector.ttft', { duration: formatTrajectoryDuration(facts?.ttftMs) }),
            tuiMessage(locale, 'trajectory.inspector.llm', { duration: formatTrajectoryDuration(facts?.llmMs) }),
            tuiMessage(locale, 'trajectory.inspector.tool', { duration: formatTrajectoryDuration(facts?.toolMs) }),
          ]
          : [
            trajectoryDetail.label,
            ...(trajectoryDetail.detail === undefined ? [] : [trajectoryDetail.detail]),
            ...(trajectoryDetail.usage === undefined ? [] : [tuiMessage(locale, 'trajectory.inspector.usage', {
              input: String((trajectoryDetail.usage as { inputTokens?: number }).inputTokens ?? '?'),
              output: String((trajectoryDetail.usage as { outputTokens?: number }).outputTokens ?? '?'),
            })]),
            ...(trajectoryDetail.interrupted ? [tuiMessage(locale, 'trajectory.inspector.interrupted')] : []),
            ...(trajectoryDetail.error === undefined ? [] : [tuiMessage(locale, 'trajectory.inspector.error', {
              code: trajectoryDetail.error.code,
            })]),
            `seq ${trajectoryDetail.seq} · ${new Date(trajectoryDetail.time).toISOString()}`,
          ]
    return <TuiPane title={tuiMessage(locale, 'trajectory.header')} height={stdout.rows}>
      <TuiSection paddingX={2} height={trajectoryQuery !== '' || trajectorySearchEditing ? 4 : 3}>
        <Text bold>{tuiMessage(locale, 'trajectory.header')}</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)}>{tuiMessage(locale, 'trajectory.stats', {
          turns: String(trajectory.turnCount),
          steps: String(trajectory.stepCount),
          events: String(trajectory.totalEvents),
        })}</Text>
        <TuiHintLine>{tuiMessage(locale, 'trajectory.loaded', {
          loaded: String(trajectory.entries.length), omitted: String(trajectory.omitted),
          tail: tuiMessage(locale, trajectoryTailFollow ? 'trajectory.tail.on' : 'trajectory.tail.off'),
        })}</TuiHintLine>
        {(trajectoryQuery !== '' || trajectorySearchEditing) && <Text {...tuiTextStyle(theme.tokens.selection)}>
          / {terminalSafe(trajectoryQuery)}{trajectorySearchEditing ? '█' : ''}
        </Text>}
      </TuiSection>
      {trajectoryDetail !== undefined
        ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
          <TuiSection title={trajectoryKindLabel(trajectoryDetail.kind, locale)} tone="accent" paddingX={0}>
            <Text>{(['summary', 'input', 'output', 'timing'] as const).map((tab, index) => <Text
              key={tab}
              bold={trajectoryInspectorTab === tab}
              {...trajectoryInspectorTab === tab ? tuiTextStyle(theme.tokens.selection) : tuiTextStyle(theme.tokens.muted)}
            >{index === 0 ? '' : ' · '}{tuiMessage(locale, `trajectory.tab.${tab}`)}</Text>)}</Text>
            {inspectorLines.flatMap(line => terminalWrappedLines(terminalSafe(line), Math.max(1, columns - 6)))
              .map((line, index) => <Text key={`${index}:${line}`}>{line}</Text>)}
          </TuiSection>
        </TuiScrollablePanel>
        : <TuiScrollablePanel paddingX={2}>
          {visibleTrajectoryItems.length === 0
            ? <TuiEmptyState tone="warning" message={tuiMessage(locale, 'trajectory.empty')} />
            : visibleTrajectoryItems.map((entry, visibleIndex) => {
              const index = trajectoryVisibleStart + visibleIndex
              const kindTag = trajectoryKindLabel(entry.kind, locale)
              const timing = entry.durationMs !== undefined ? ` · ${formatTrajectoryDuration(entry.durationMs)}` : ''
              const timeline = formatTuiTrajectoryTimeline(entry, trajectoryTimeline)
              const badge = entry.error !== undefined ? ` · ${entry.error.code}` : ''
              const interrupted = entry.interrupted ? ' !' : ''
              const folded = entry.kind === 'turn' && entry.turn !== undefined
                ? trajectoryCollapsedTurns.has(entry.turn)
                : entry.kind === 'step' && entry.turn !== undefined && entry.step !== undefined
                  ? trajectoryCollapsedSteps.has(`${entry.turn}:${entry.step}`)
                  : false
              const tree = `${'  '.repeat(Math.min(4, entry.depth))}${entry.kind === 'turn' || entry.kind === 'step'
                ? folded ? '▸ ' : '▾ ' : '· '}`
              return <TuiListRow
                key={entry.key}
                selected={index === effectiveTrajectorySelection}
                height={trajectoryRowHeight}
                title={`${tree}${kindTag} · ${terminalSafe(entry.label).slice(0, 60)}`}
                description={`${timeline} · seq ${entry.seq}${timing}${badge}${interrupted}`}
              />
            })}
        </TuiScrollablePanel>}
      <TuiActionFooter
        status={trajectoryEntries.length > trajectoryVisibleCount && trajectoryDetail === undefined
          ? <TuiHintLine>{tuiMessage(locale, 'common.showing', {
            start: trajectoryVisibleStart + 1,
            end: trajectoryVisibleStart + visibleTrajectoryItems.length,
            total: trajectoryEntries.length,
          })}</TuiHintLine>
          : undefined}
        actions={<TuiHintLine>{trajectoryDetail !== undefined
          ? tuiMessage(locale, 'trajectory.footer.detail')
          : tuiMessage(locale, 'trajectory.footer.list')}</TuiHintLine>}
      />
    </TuiPane>
  }

  if (hostPluginCenter !== undefined && interaction === undefined) {
    const filterLabel = tuiMessage(locale, `hostPlugins.filter.${hostPluginFilter}`)
    return <TuiPane title={tuiMessage(locale, 'hostPlugins.header')} height={stdout.rows}>
      <TuiSection paddingX={2} height={3}>
        <Text bold>{tuiMessage(locale, 'hostPlugins.header')}</Text>
        <Text>
          <Text bold={hostPluginTab === 'plugins'} {...hostPluginTab === 'plugins'
            ? tuiTextStyle(theme.tokens.selection) : {}}>{tuiMessage(locale, 'hostPlugins.tab.plugins')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
          <Text bold={hostPluginTab === 'presets'} {...hostPluginTab === 'presets'
            ? tuiTextStyle(theme.tokens.selection) : {}}>{tuiMessage(locale, 'hostPlugins.tab.presets')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
          <Text bold={hostPluginTab === 'settings'} {...hostPluginTab === 'settings'
            ? tuiTextStyle(theme.tokens.selection) : {}}>{tuiMessage(locale, 'hostPlugins.tab.settings')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · Tab</Text>
        </Text>
        {hostPluginTab === 'plugins' && <TuiHintLine>{filterLabel} · F</TuiHintLine>}
      </TuiSection>
      {hostPluginTab === 'plugins' && hostPluginQuery.length > 0 && <TuiSection framed direction="row" paddingX={1} marginX={1}>
        <Text {...tuiTextStyle(theme.tokens.selection)}>{tuiMessage(locale, 'composer.find')} › </Text>
        <Text>{terminalSafe(hostPluginQuery)}</Text>
      </TuiSection>}
      {(((hostPluginTab === 'plugins' || hostPluginTab === 'presets')
        && hostPluginCenter.inventoryState !== 'ready')
        || (hostPluginTab === 'settings' && hostPluginCenter.settingsState !== 'ready'))
        && hostPluginDetail === undefined && hostPresetDetail === undefined
        && hostSettingsDetail === undefined
        && <TuiSection paddingX={2}>
          <Text {...tuiTextStyle(theme.tokens.warning)}>{tuiMessage(locale,
            hostPluginTab === 'plugins' || hostPluginTab === 'presets'
              ? `hostPlugins.source.${hostPluginCenter.inventoryState}` as 'hostPlugins.source.unavailable'
              : `hostPlugins.source.${hostPluginCenter.settingsState}` as 'hostPlugins.source.unavailable')}</Text>
        </TuiSection>}
      {hostPluginDetail !== undefined
        ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
          <TuiSection title={terminalSafe(hostPluginDetail.moduleName)} tone="accent" paddingX={0}>
            <Text>{tuiMessage(locale, 'hostPlugins.detail.module', { module: hostPluginDetail.moduleName })}</Text>
            <Text>{tuiMessage(locale, 'hostPlugins.detail.entryId', { id: String(hostPluginDetail.entry.entryId) })}</Text>
            <Text>{tuiMessage(locale, 'hostPlugins.detail.enabled', { enabled: String(hostPluginDetail.enabled) })}</Text>
            <Text>{tuiMessage(locale, 'hostPlugins.detail.phase', { phase: hostPluginDetail.phaseLabel })}</Text>
            <Text wrap="wrap">{tuiMessage(locale, 'hostPlugins.detail.configBoundary')}</Text>
          </TuiSection>
        </TuiScrollablePanel>
        : hostPresetDetail !== undefined
          ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
            <TuiSection title={terminalSafe(hostPresetDetail.name)} tone="accent" paddingX={0}>
              <Text>{tuiMessage(locale, 'hostPlugins.presets.detail.identity', {
                id: hostPresetDetail.preset.id,
                trust: tuiMessage(locale, hostPresetDetail.preset.trust === 'system'
                  ? 'presets.system' : 'presets.user'),
              })}</Text>
              {hostPresetDetail.preset.isDefault
                && <Text bold>{tuiMessage(locale, 'hostPlugins.presets.default')}</Text>}
              {hostPresetDetail.broken !== undefined
                && <Text {...tuiTextStyle(theme.tokens.error)}>{tuiMessage(locale,
                  'hostPlugins.presets.broken', { reason: hostPresetDetail.broken })}</Text>}
              {hostPresetDetail.preset.rows.length === 0 && hostPresetDetail.broken === undefined
                ? <TuiEmptyState message={tuiMessage(locale, 'hostPlugins.presets.rows.empty')} />
                : hostPresetDetail.preset.rows.map((row, index) => <TuiListRow
                  key={`${row.entryId ?? 'row'}:${index}`}
                  selected={false}
                  height={2}
                  title={terminalSafe(row.moduleName)}
                  description={tuiMessage(locale, 'hostPlugins.presets.row', {
                    id: row.entryId ?? '—',
                    enabled: row.enabled === 'conditional'
                      ? tuiMessage(locale, 'hostPlugins.presets.conditional')
                      : row.enabled
                        ? tuiMessage(locale, 'hostPlugins.filter.enabled')
                        : tuiMessage(locale, 'hostPlugins.filter.disabled'),
                    phase: row.fiberPhase === null
                      ? tuiMessage(locale, 'hostPlugins.phase.unloaded')
                      : tuiMessage(locale, `hostPlugins.phase.${row.fiberPhase}`),
                  })}
                />)}
            </TuiSection>
          </TuiScrollablePanel>
          : hostSettingsDetail !== undefined
            ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
              <TuiSection title={String(hostSettingsDetail.ns)} tone="accent" paddingX={0}>
                <Text>{tuiMessage(locale, 'hostPlugins.settings.revision', {
                  revision: String(hostSettingsDetail.revision), applies: hostSettingsDetail.applies,
                })}</Text>
                <Text>{hostPluginCenter.settingsWritable
                  ? tuiMessage(locale, 'hostPlugins.settings.writable')
                  : tuiMessage(locale, 'hostPlugins.settings.readOnly')}</Text>
              </TuiSection>
              {hostSettingsFields.length === 0
                ? <TuiEmptyState message={tuiMessage(locale, 'hostPlugins.settings.unsupported')} />
                : hostSettingsFields.map((field, index) => {
                  const draft = hostSettingsDrafts[field.id]
                  const value = draft?.reset === true
                    ? tuiMessage(locale, 'hostPlugins.settings.resetValue', { value: field.value })
                    : draft?.text ?? field.value
                  const badge = draft === undefined
                    ? field.overridden
                      ? tuiMessage(locale, 'hostPlugins.settings.overridden')
                      : tuiMessage(locale, 'hostPlugins.settings.inherited')
                    : tuiMessage(locale, 'hostPlugins.settings.staged')
                  return <TuiListRow
                    key={field.id}
                    selected={index === effectiveHostSettingsFieldSelection}
                    height={2}
                    title={`${field.id}: ${terminalSafe(value)}`}
                    description={`${badge}${hostSettingsEditing && index === effectiveHostSettingsFieldSelection
                      ? ` · ${tuiMessage(locale, 'hostPlugins.settings.editing')}` : ''}`}
                  />
                })}
              {hostSettingsError !== '' && <Text {...tuiTextStyle(theme.tokens.error)}>{terminalSafe(hostSettingsError)}</Text>}
            </TuiScrollablePanel>
            : <TuiScrollablePanel paddingX={2}>
              {visibleHostPluginItems.length === 0
                ? <TuiEmptyState tone="warning" message={tuiMessage(locale,
                  hostPluginTab === 'plugins' ? 'hostPlugins.empty'
                    : hostPluginTab === 'presets' ? 'hostPlugins.presets.empty' : 'hostPlugins.settings.empty')} />
                : hostPluginTab === 'plugins'
                  ? (visibleHostPluginItems as readonly TuiHostPluginRow[]).map((row, visibleIndex) => {
                    const index = hostPluginVisibleStart + visibleIndex
                    const badge = row.enabled
                      ? row.phaseLabel
                      : `${tuiMessage(locale, 'hostPlugins.filter.disabled')} · ${row.phaseLabel}`
                    return <TuiListRow
                      key={String(row.entry.entryId)}
                      selected={index === effectiveHostPluginSelection}
                      height={hostPluginRowHeight}
                      title={terminalSafe(row.moduleName)}
                      description={badge}
                    />
                  })
                  : hostPluginTab === 'presets'
                    ? (visibleHostPluginItems as readonly TuiHostPresetPluginGroup[]).map((row, visibleIndex) => {
                      const index = hostPluginVisibleStart + visibleIndex
                      const detail = row.broken === undefined
                        ? tuiMessage(locale, 'hostPlugins.presets.count', { count: row.preset.rows.length })
                        : tuiMessage(locale, 'hostPlugins.presets.broken', { reason: row.broken })
                      const badges = [
                        tuiMessage(locale, row.preset.trust === 'system' ? 'presets.system' : 'presets.user'),
                        row.preset.isDefault ? tuiMessage(locale, 'presets.default') : undefined,
                      ].filter(Boolean).join(' · ')
                      return <TuiListRow
                        key={row.preset.id}
                        selected={index === effectiveHostPluginSelection}
                        height={hostPluginRowHeight}
                        title={terminalSafe(row.name)}
                        description={`${badges} · ${detail}`}
                      />
                    })
                    : (visibleHostPluginItems as readonly {
                      ns: unknown
                      revision: number
                      applies: string
                      hasUserOverride: boolean
                    }[]).map((row, visibleIndex) => {
                      const index = hostPluginVisibleStart + visibleIndex
                      const override = row.hasUserOverride
                        ? tuiMessage(locale, 'hostPlugins.settings.overridden')
                        : tuiMessage(locale, 'hostPlugins.settings.inherited')
                      return <TuiListRow
                        key={String(row.ns)}
                        selected={index === effectiveHostPluginSelection}
                        height={hostPluginRowHeight}
                        title={String(row.ns)}
                        description={`${tuiMessage(locale, 'hostPlugins.settings.revision', {
                          revision: String(row.revision), applies: row.applies,
                        })} · ${override}`}
                      />
                    })}
            </TuiScrollablePanel>}
      <TuiActionFooter
        status={hostPluginItems.length > hostPluginVisibleCount
          ? <TuiHintLine>{tuiMessage(locale, 'common.showing', {
            start: hostPluginVisibleStart + 1,
            end: hostPluginVisibleStart + visibleHostPluginItems.length,
            total: hostPluginItems.length,
          })}</TuiHintLine>
          : undefined}
        actions={<TuiHintLine>{hostSettingsDetail !== undefined
          ? tuiMessage(locale, hostSettingsCanEdit
            ? 'hostPlugins.footer.settingsDetail' : 'hostPlugins.footer.settingsReadOnly')
          : hostPluginDetail !== undefined || hostPresetDetail !== undefined
            ? tuiMessage(locale, 'hostPlugins.footer.detail')
            : hostPluginTab === 'plugins'
              ? tuiMessage(locale, 'hostPlugins.footer.plugins')
              : hostPluginTab === 'presets'
                ? tuiMessage(locale, 'hostPlugins.footer.presets')
                : tuiMessage(locale, 'hostPlugins.footer.settings')}</TuiHintLine>}
      />
    </TuiPane>
  }

  if (scheduleDialog !== undefined && interaction === undefined) {
    return <TuiPane title={tuiMessage(locale, 'schedules.header')} height={stdout.rows}>
      <TuiSection paddingX={2} height={2}>
        <Text bold>{tuiMessage(locale, 'schedules.header')}</Text>
        <TuiHintLine>{scheduleDialog.sourceState === 'ready'
          ? tuiMessage(locale, 'footer.schedules.active', { count: scheduleRows.length })
          : tuiMessage(locale, scheduleDialog.sourceState === 'unavailable'
            ? 'schedules.unavailable' : 'schedules.error', { reason: scheduleDialog.error ?? '' })}</TuiHintLine>
      </TuiSection>
      {currentScheduleDetail !== undefined
        ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
          <TuiSection title={terminalSafe(currentScheduleDetail.prompt)} tone="accent" paddingX={0}>
            <Text>{tuiMessage(locale, 'schedules.detail.id', { id: currentScheduleDetail.id })}</Text>
            <Text>{tuiMessage(locale, 'schedules.detail.kind', {
              kind: tuiMessage(locale, `schedules.kind.${currentScheduleDetail.kind}`),
            })}</Text>
            <Text>{tuiMessage(locale, 'schedules.detail.target', { time: currentScheduleDetail.scheduledAt })}</Text>
            <Text bold {...tuiTextStyle(currentScheduleDetail.state === 'overdue'
              ? theme.tokens.error : theme.tokens.success)}>{tuiMessage(locale,
                `schedules.state.${currentScheduleDetail.state}`)}</Text>
            {currentScheduleDetail.intervalSeconds !== undefined
              && <Text>{tuiMessage(locale, 'schedules.detail.interval', {
                seconds: currentScheduleDetail.intervalSeconds,
              })}</Text>}
            <Text wrap="wrap">{currentScheduleDetail.prompt}</Text>
            <TuiHintLine>{tuiMessage(locale, 'schedules.detail.owner')}</TuiHintLine>
          </TuiSection>
        </TuiScrollablePanel>
        : scheduleDialog.sourceState === 'unavailable'
          ? <TuiEmptyState tone="warning" message={tuiMessage(locale, 'schedules.unavailable')} />
          : scheduleDialog.sourceState === 'error'
            ? <TuiEmptyState tone="warning" message={tuiMessage(locale, 'schedules.error', {
              reason: scheduleDialog.error ?? '',
            })} />
            : <TuiScrollablePanel paddingX={2}>
              {visibleScheduleRows.length === 0
                ? <TuiEmptyState message={tuiMessage(locale, 'schedules.empty')} />
                : visibleScheduleRows.map((row, visibleIndex) => {
                  const index = scheduleVisibleStart + visibleIndex
                  return <TuiListRow
                    key={row.id}
                    selected={index === effectiveScheduleSelection}
                    height={scheduleRowHeight}
                    title={row.prompt}
                    description={tuiMessage(locale, 'schedules.row', {
                      state: tuiMessage(locale, `schedules.state.${row.state}`),
                      kind: tuiMessage(locale, `schedules.kind.${row.kind}`),
                      time: row.scheduledAt,
                    })}
                  />
                })}
            </TuiScrollablePanel>}
      <TuiActionFooter
        status={scheduleRows.length > scheduleVisibleCount && currentScheduleDetail === undefined
          ? <TuiHintLine>{tuiMessage(locale, 'common.showing', {
            start: scheduleVisibleStart + 1,
            end: scheduleVisibleStart + visibleScheduleRows.length,
            total: scheduleRows.length,
          })}</TuiHintLine>
          : undefined}
        actions={<TuiHintLine>{tuiMessage(locale, currentScheduleDetail === undefined
          ? 'schedules.footer.list' : 'schedules.footer.detail')}</TuiHintLine>}
      />
    </TuiPane>
  }

  if (presetManager !== undefined && interaction === undefined) {
    const effectiveError = presetManagerError || ''
    return <TuiPane title={tuiMessage(locale, 'presets.header')} height={stdout.rows}>
      <TuiSection paddingX={2} height={3}>
        <Text bold>{presetManagerRows.length === 0
          ? tuiMessage(locale, 'presets.loading')
          : tuiMessage(locale, 'presets.header')}</Text>
        <TuiHintLine>{presetManager.authorable
          ? tuiMessage(locale, 'presets.action.copy').slice(2)
          : tuiMessage(locale, 'presets.notAuthorable')}</TuiHintLine>
      </TuiSection>
      {presetManagerCopyDraft !== undefined
        ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
          <TuiSection title={tuiMessage(locale, 'presets.copy.title')} tone="accent" paddingX={0}>
            <Text wrap="wrap">{presetManagerCopyDraft.step === 'id'
              ? tuiMessage(locale, 'presets.copy.idPrompt')
              : tuiMessage(locale, 'presets.copy.namePrompt')}</Text>
            <Text wrap="wrap">{terminalSafe(presetManagerCopyDraft.step === 'id'
              ? presetManagerCopyDraft.idDraft : presetManagerCopyDraft.nameDraft)}█</Text>
          </TuiSection>
        </TuiScrollablePanel>
        : presetManagerDeleteConfirm !== undefined
          ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
            <TuiSection title={terminalSafe(presetManagerDeleteConfirm.name)} tone="warning" paddingX={0}>
              <Text wrap="wrap">{tuiMessage(locale, 'presets.delete.confirm', {
                name: presetManagerDeleteConfirm.name,
                id: presetManagerDeleteConfirm.preset.id,
              })}</Text>
              {presetManagerDeleteConfirm.current
                && <Text wrap="wrap">{tuiMessage(locale, 'presets.delete.currentImpact')}</Text>}
              {presetManagerDeleteConfirm.isDefault
                && <Text wrap="wrap">{tuiMessage(locale, 'presets.delete.defaultImpact')}</Text>}
              <Text>{tuiMessage(locale, 'presets.delete.yes')}</Text>
              <Text>{tuiMessage(locale, 'presets.delete.no')}</Text>
            </TuiSection>
          </TuiScrollablePanel>
          : presetManagerDetail !== undefined
            ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
              <TuiSection title={terminalSafe(presetManagerDetail.name)} tone="accent" paddingX={0}>
                <Text>{tuiMessage(locale, 'presets.detail.trust', {
                  trust: tuiMessage(locale, presetManagerDetail.trust === 'system' ? 'presets.system' : 'presets.user'),
                })}</Text>
                <Text>{tuiMessage(locale, 'presets.detail.source', {
                  source: presetManagerDetail.trust === 'system'
                    ? tuiMessage(locale, 'presets.source.deployment')
                    : tuiMessage(locale, 'presets.source.user'),
                })}</Text>
                <Text>{presetManagerDetail.current && currentPresetModel !== undefined
                  ? tuiMessage(locale, 'presets.detail.model.current', { model: currentPresetModel })
                  : tuiMessage(locale, 'presets.detail.model.deferred')}</Text>
                <Text>{presetManagerDetail.current && currentPresetPermission !== undefined
                  ? tuiMessage(locale, 'presets.detail.permission.current', { permission: currentPresetPermission })
                  : tuiMessage(locale, 'presets.detail.permission.deferred')}</Text>
                {presetManagerDetail.description !== undefined
                  && <Text wrap="wrap">{terminalSafe(presetManagerDetail.description)}</Text>}
                <Text>{tuiMessage(locale, 'presets.detail.path', { path: presetManagerDetail.preset.path })}</Text>
                <TuiSection title={tuiMessage(locale, 'presets.detail.plugins')} paddingX={0}>
                  {presetManager.compositionState === 'unavailable'
                    ? <TuiHintLine>{tuiMessage(locale, 'presets.detail.pluginsUnavailable')}</TuiHintLine>
                    : presetManager.compositionState === 'error'
                      ? <Text {...tuiTextStyle(theme.tokens.error)}>{tuiMessage(locale,
                        'presets.detail.pluginsError')}</Text>
                      : presetManagerDetail.composition?.broken !== undefined
                        ? <Text {...tuiTextStyle(theme.tokens.error)}>{tuiMessage(locale, 'presets.broken', {
                          reason: presetManagerDetail.composition.broken,
                        })}</Text>
                        : (presetManagerDetail.composition?.rows.length ?? 0) === 0
                          ? <TuiHintLine>{tuiMessage(locale, 'presets.detail.pluginsEmpty')}</TuiHintLine>
                          : presetManagerDetail.composition?.rows.map((row, index) => <Text
                            key={`${row.entryId ?? 'row'}:${index}`}
                            wrap="truncate-end"
                          >{tuiMessage(locale, 'presets.detail.pluginRow', {
                              module: row.moduleName,
                              id: row.entryId ?? '—',
                              enabled: row.enabled === 'conditional'
                                ? tuiMessage(locale, 'presets.detail.pluginConditional')
                                : row.enabled
                                  ? tuiMessage(locale, 'presets.detail.pluginEnabled')
                                  : tuiMessage(locale, 'presets.detail.pluginDisabled'),
                            })}</Text>)}
                </TuiSection>
                {presetManagerComposition?.id === presetManagerDetail.preset.id
                  && (presetManagerComposition.phase === 'loading'
                    ? <TuiLoadingState message={tuiMessage(locale, 'presets.composition.loading')} />
                    : <TuiSection title={tuiMessage(locale, 'presets.composition.title')} paddingX={0}>
                      <Text wrap="wrap">{presetManagerComposition.text}</Text>
                      {presetManagerComposition.truncated === true
                        && <TuiHintLine>{tuiMessage(locale, 'presets.composition.truncated')}</TuiHintLine>}
                    </TuiSection>)}
                {presetManagerDetail.isDefault && <Text bold>{tuiMessage(locale, 'presets.detail.default')}</Text>}
                {presetManagerDetail.current && <Text bold>{tuiMessage(locale, 'presets.detail.current')}</Text>}
                {presetManagerDetail.broken !== undefined
                  && <Text {...tuiTextStyle(theme.tokens.error)}>{tuiMessage(locale, 'presets.broken', {
                    reason: presetManagerDetail.broken,
                  })}</Text>}
                {!props.pathOpenerAvailable
                  && <TuiHintLine>{tuiMessage(locale, 'presets.detail.remotePath')}</TuiHintLine>}
              </TuiSection>
            </TuiScrollablePanel>
            : <TuiScrollablePanel paddingX={2}>
              {visiblePresetManagerItems.length === 0
                ? <TuiEmptyState tone="warning" message={tuiMessage(locale, 'presets.empty')} />
                : visiblePresetManagerItems.map((row, visibleIndex) => {
                  const index = presetManagerVisibleStart + visibleIndex
                  const badges = [
                    row.current ? tuiMessage(locale, 'presets.current') : undefined,
                    row.isDefault ? tuiMessage(locale, 'presets.default') : undefined,
                  ].filter(Boolean).join(' · ')
                  return <TuiListRow
                    key={row.preset.id}
                    selected={index === effectivePresetManagerSelection}
                    height={presetManagerRowHeight}
                    title={terminalSafe(row.name)}
                    description={`${tuiMessage(locale, row.trust === 'system' ? 'presets.system' : 'presets.user')}${badges ? ` · ${badges}` : ''}`}
                  />
                })}
            </TuiScrollablePanel>}
      <TuiActionFooter
        status={effectiveError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(effectiveError)}</Text>
          : presetManagerRows.length > presetManagerVisibleCount
            ? <TuiHintLine>{tuiMessage(locale, 'common.showing', {
              start: presetManagerVisibleStart + 1,
              end: presetManagerVisibleStart + visiblePresetManagerItems.length,
              total: presetManagerRows.length,
            })}</TuiHintLine>
            : undefined}
        actions={<TuiHintLine>{presetManagerCopyDraft !== undefined
          ? tuiMessage(locale, 'sessions.footer.edit')
          : presetManagerDeleteConfirm !== undefined
            ? tuiMessage(locale, 'sessions.footer.confirm')
            : presetManagerDetail !== undefined
              ? [
                presetManagerDetail.canSetDefault ? tuiMessage(locale, 'presets.action.setDefault') : undefined,
                presetManagerDetail.canCopy ? tuiMessage(locale, 'presets.action.copy') : undefined,
                presetManagerDetail.canDelete ? tuiMessage(locale, 'presets.action.delete') : undefined,
                tuiMessage(locale, 'presets.action.view'),
                props.pathOpenerAvailable ? tuiMessage(locale, 'presets.action.openFile') : undefined,
                props.pathOpenerAvailable ? tuiMessage(locale, 'presets.action.open') : undefined,
                tuiMessage(locale, 'presets.action.close'),
              ].filter(Boolean).join(' · ')
              : tuiMessage(locale, 'presets.action.close')}</TuiHintLine>}
      />
    </TuiPane>
  }

  if (sessionManager !== undefined && interaction === undefined) {
    const effectiveError = sessionManagerError || sessionManager.error || ''
    const archiveLabel = tuiMessage(locale, `sessions.archive.${sessionManagerArchive}`)
    const editorTitle = sessionManagerEdit?.kind === 'workspace-add'
      ? tuiMessage(locale, 'sessions.workspace.add')
      : sessionManagerEdit?.kind === 'workspace-rename'
        ? tuiMessage(locale, 'sessions.workspace.rename')
        : tuiMessage(locale, 'sessions.session.rename')
    if (directoryBrowser !== undefined) {
      const path = directoryBrowserPage?.path ?? directoryBrowser.requestedPath ?? ''
      const browserError = directoryBrowser.error || effectiveError
      return <TuiPane title={tuiMessage(locale, 'pane.sessions')} height={stdout.rows}>
        <TuiSection paddingX={2} height={3}>
          <Text bold>{tuiMessage(locale, 'sessions.directory.title')}</Text>
          <TuiHintLine>{tuiMessage(locale, 'sessions.directory.hidden', {
            state: tuiMessage(locale, directoryBrowser.showHidden
              ? 'sessions.directory.hiddenShown' : 'sessions.directory.hiddenHidden'),
          })}</TuiHintLine>
          <TuiHintLine>{directoryBrowserPage?.truncated === true
            ? tuiMessage(locale, 'sessions.directory.truncated')
            : directoryBrowser.phase === 'loading' ? tuiMessage(locale, 'sessions.directory.loading') : ''}</TuiHintLine>
        </TuiSection>
        <TuiSection framed direction="row" paddingX={1} marginX={1}>
          <Text {...tuiTextStyle(theme.tokens.selection)}>{tuiMessage(locale, 'sessions.directory.path', {
            path: terminalSafe(path),
          })}</Text>
        </TuiSection>
        {directoryBrowserPage === undefined
          ? <TuiScrollablePanel paddingX={2}><TuiLoadingState
            message={tuiMessage(locale, 'sessions.directory.loading')}
          /></TuiScrollablePanel>
          : <TuiScrollablePanel paddingX={2}>
            {visibleDirectoryRows.length === 0
              ? <TuiEmptyState message={tuiMessage(locale, 'sessions.directory.empty')} />
              : visibleDirectoryRows.map((row, visibleIndex) => {
                const index = directoryVisibleStart + visibleIndex
                return <TuiListRow
                  key={`${row.kind}:${row.path}`}
                  selected={index === effectiveDirectorySelection}
                  height={1}
                  title={row.kind === 'select-current'
                    ? tuiMessage(locale, 'sessions.directory.selectCurrent')
                    : `${row.hidden ? '·' : '▸'} ${row.name}`}
                  {...row.kind === 'select-current' ? { trailing: terminalSafe(row.path) } : {}}
                />
              })}
          </TuiScrollablePanel>}
        <TuiActionFooter
          status={browserError !== ''
            ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(browserError)}</Text>
            : directoryBrowserPage !== undefined && directoryBrowserPage.rows.length > directoryVisibleCount
              ? <TuiHintLine>{tuiMessage(locale, 'common.showing', {
                start: directoryVisibleStart + 1,
                end: directoryVisibleStart + visibleDirectoryRows.length,
                total: directoryBrowserPage.rows.length,
              })}</TuiHintLine>
              : undefined}
          actions={<TuiHintLine>{tuiMessage(locale, 'sessions.directory.footer')}</TuiHintLine>}
        />
      </TuiPane>
    }
    return <TuiPane title={tuiMessage(locale, 'pane.sessions')} height={stdout.rows}>
      <TuiSection paddingX={2} height={3}>
        <Text bold>{sessionManager.phase === 'loading'
          ? tuiMessage(locale, 'sessions.loading')
          : sessionManager.phase === 'mutating'
            ? tuiMessage(locale, 'sessions.mutating')
            : tuiMessage(locale, 'sessions.count', {
              sessions: sessionManagerProjection.sessions.length,
              workspaces: sessionManagerProjection.workspaces.length,
            })}</Text>
        <Text>
          <Text bold={sessionManagerTab === 'sessions'} {...sessionManagerTab === 'sessions'
            ? tuiTextStyle(theme.tokens.selection) : {}}>{tuiMessage(locale, 'sessions.tab.sessions')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
          <Text bold={sessionManagerTab === 'workspaces'} {...sessionManagerTab === 'workspaces'
            ? tuiTextStyle(theme.tokens.selection) : {}}>{tuiMessage(locale, 'sessions.tab.workspaces')}</Text>
          <Text {...tuiTextStyle(theme.tokens.muted)}> · Tab</Text>
        </Text>
        <TuiHintLine>{sessionManagerTab === 'sessions'
          ? tuiMessage(locale, 'sessions.filters', {
            scope: tuiMessage(locale, `sessions.scope.${sessionManagerScope}`),
            archive: archiveLabel,
            sort: tuiMessage(locale, `sessions.sort.${sessionManagerSort}`),
            group: tuiMessage(locale, sessionManagerGroup ? 'sessions.group.on' : 'sessions.group.off'),
          })
          : tuiMessage(locale, 'sessions.workspace.retention')}</TuiHintLine>
      </TuiSection>
      <TuiSection framed direction="row" paddingX={1} marginX={1}>
        <Text {...tuiTextStyle(theme.tokens.selection)}>{tuiMessage(locale, 'composer.find')} › </Text>
        <Text>{terminalSafe(sessionManagerQuery)}</Text>
      </TuiSection>
      {sessionManager.phase !== 'ready'
        ? <TuiScrollablePanel paddingX={2}><TuiLoadingState message={tuiMessage(locale,
          sessionManager.phase === 'loading' ? 'sessions.reading' : 'sessions.mutating')} /></TuiScrollablePanel>
        : sessionManagerEdit !== undefined
          ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
            <TuiSection title={editorTitle} tone="accent" paddingX={0}>
              <Text wrap="wrap">{terminalSafe(sessionManagerEdit.draft)}█</Text>
              {sessionManagerEdit.kind === 'workspace-add'
                ? <TuiHintLine>{tuiMessage(locale, 'sessions.workspace.addBoundary')}</TuiHintLine>
                : undefined}
            </TuiSection>
          </TuiScrollablePanel>
          : sessionManagerConfirm !== undefined
            ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
              <TuiSection title={tuiMessage(locale, 'sessions.confirm.title')} tone="warning" paddingX={0}>
                <Text wrap="wrap">{tuiMessage(locale, sessionManagerConfirm === 'workspace-delete'
                  ? 'sessions.confirm.workspaceDelete'
                  : sessionManagerConfirm === 'session-archive'
                    ? 'sessions.confirm.archive' : 'sessions.confirm.unarchive')}</Text>
                {sessionManagerConfirm === 'workspace-delete' && selectedManagedWorkspace !== undefined
                  ? <TuiHintLine>{selectedManagedWorkspace.title} · {selectedManagedWorkspace.path}</TuiHintLine>
                  : selectedManagedSession === undefined ? undefined
                    : <TuiHintLine>
                      {selectedManagedSession.candidate.title} · {selectedManagedSession.candidate.record.header.id}
                    </TuiHintLine>}
              </TuiSection>
            </TuiScrollablePanel>
            : sessionManagerDetail
              ? <TuiScrollablePanel framed marginX={1} paddingX={2}>
                {selectedManagedSession !== undefined
                  ? <TuiSection title={terminalSafe(selectedManagedSession.candidate.title)} tone="accent" paddingX={0}>
                    <Text>{tuiMessage(locale, 'sessions.detail.id', { id: selectedManagedSession.candidate.record.header.id })}</Text>
                    <Text>{tuiMessage(locale, 'sessions.detail.workspace', { workspace: selectedManagedSession.workspaceTitle })}</Text>
                    <Text>{tuiMessage(locale, 'sessions.detail.cwd', { cwd: selectedManagedSession.candidate.workspaceLabel })}</Text>
                    <Text>{tuiMessage(locale, 'sessions.detail.state', {
                      state: selectedManagedSession.current
                        ? tuiMessage(locale, 'common.current')
                        : selectedManagedSession.archived
                          ? tuiMessage(locale, 'sessions.archive.archived')
                          : tuiMessage(locale, 'sessions.archive.active'),
                    })}</Text>
                    {selectedManagedSession.candidate.disabledReason === undefined ? undefined
                      : <Text {...tuiTextStyle(theme.tokens.warning)} wrap="wrap">
                        {tuiMessage(locale, 'resume.status.unavailable', {
                          reason: terminalSafe(selectedManagedSession.candidate.disabledReason),
                        })}
                      </Text>}
                    {selectedManagedSession.candidate.preview.length === 0
                      ? <TuiHintLine>{tuiMessage(locale, 'resume.preview.empty')}</TuiHintLine>
                      : selectedManagedSession.candidate.preview.map(line => <Text key={`${line.seq}:${line.kind}`} wrap="wrap">
                        {terminalSafe(line.text)}
                      </Text>)}
                  </TuiSection>
                  : selectedManagedWorkspace !== undefined
                    ? <TuiSection title={terminalSafe(selectedManagedWorkspace.title)} tone="accent" paddingX={0}>
                      <Text>{tuiMessage(locale, 'sessions.detail.id', { id: selectedManagedWorkspace.id })}</Text>
                      <Text>{tuiMessage(locale, 'sessions.detail.path', { path: selectedManagedWorkspace.path })}</Text>
                      <Text>{tuiMessage(locale, 'sessions.detail.state', {
                        state: tuiMessage(locale, selectedManagedWorkspace.status === 'ok'
                          ? 'sessions.workspace.ok' : 'sessions.workspace.missing'),
                      })}</Text>
                      <Text>{tuiMessage(locale, 'sessions.detail.sessionCount', {
                        count: selectedManagedWorkspace.sessionIds.length,
                      })}</Text>
                    </TuiSection>
                    : <TuiEmptyState message={tuiMessage(locale, 'sessions.empty')} />}
              </TuiScrollablePanel>
              : <TuiScrollablePanel paddingX={2}>
                {visibleSessionManagerItems.length === 0
                  ? <TuiEmptyState tone="warning" message={tuiMessage(locale, 'sessions.empty')} />
                  : sessionManagerTab === 'sessions'
                    ? (visibleSessionManagerItems as readonly TuiSessionManagerRow[]).map((row, visibleIndex) => {
                      const index = sessionManagerVisibleStart + visibleIndex
                      const status = row.current
                        ? tuiMessage(locale, 'common.current')
                        : row.archived ? tuiMessage(locale, 'sessions.archive.archived')
                          : row.candidate.record.live ? tuiMessage(locale, 'common.live') : tuiMessage(locale, 'common.persisted')
                      return <TuiListRow
                        key={row.candidate.record.header.id}
                        selected={index === effectiveSessionManagerSelection}
                        height={sessionManagerRowHeight}
                        title={terminalSafe(sessionManagerGroup
                          ? row.groupStart
                            ? `▾ ${row.workspaceTitle} / ${row.candidate.title}`
                            : `  ${row.candidate.title}`
                          : row.candidate.title)}
                        description={`${terminalSafe(row.workspaceTitle)} · ${formatTuiRelativeTime(row.candidate.updatedAt, Date.now())}`}
                        detail={row.candidate.disabledReason === undefined
                          ? `${status} · ${row.candidate.record.header.id}`
                          : tuiMessage(locale, 'resume.status.unavailable', {
                            reason: terminalSafe(row.candidate.disabledReason),
                          })}
                      />
                    })
                    : (visibleSessionManagerItems as readonly TuiWorkspaceManagerRow[]).map((row, visibleIndex) => {
                      const index = sessionManagerVisibleStart + visibleIndex
                      return <TuiListRow
                        key={row.id}
                        selected={index === effectiveSessionManagerSelection}
                        height={sessionManagerRowHeight}
                        title={terminalSafe(row.title)}
                        description={terminalSafe(row.path)}
                        detail={`${tuiMessage(locale, row.status === 'ok'
                          ? 'sessions.workspace.ok' : 'sessions.workspace.missing')} · ${tuiMessage(locale,
                          'sessions.detail.sessionCount', { count: row.sessionIds.length })}`}
                      />
                    })}
              </TuiScrollablePanel>}
      <TuiActionFooter
        status={effectiveError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(effectiveError)}</Text>
          : sessionManagerItems.length > sessionManagerVisibleCount
            ? <TuiHintLine>{tuiMessage(locale, 'common.showing', {
              start: sessionManagerVisibleStart + 1,
              end: sessionManagerVisibleStart + visibleSessionManagerItems.length,
              total: sessionManagerItems.length,
            })}</TuiHintLine>
            : undefined}
        actions={<TuiHintLine>{sessionManagerEdit !== undefined
          ? tuiMessage(locale, 'sessions.footer.edit')
          : sessionManagerConfirm !== undefined
            ? tuiMessage(locale, 'sessions.footer.confirm')
            : sessionManagerDetail
              ? tuiMessage(locale, sessionManagerTab === 'sessions'
                ? sessionDetailFooterKey : 'sessions.footer.workspaceDetail')
              : tuiMessage(locale, sessionManagerTab === 'sessions'
                ? 'sessions.footer.sessions' : 'sessions.footer.workspaces')}</TuiHintLine>}
      />
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
                      candidate.agentPreset === undefined ? undefined : tuiMessage(locale, 'resume.mode', {
                        mode: candidate.agentPreset.label,
                      }),
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
                      metadata={resumeScope === 'all'
                        && (index === 0 || resumeCandidates[index - 1]?.workspaceLabel !== candidate.workspaceLabel)
                        ? terminalSafe(`— ${candidate.workspaceLabel} —`)
                        : undefined}
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
                  {selectedResumeCandidate.agentPreset === undefined ? '' : `${tuiMessage(locale, 'resume.mode', {
                    mode: selectedResumeCandidate.agentPreset.label,
                  })} · `}{terminalSafe(selectedResumeCandidate.workspaceLabel)} · {terminalSafe(selectedResumeCandidate.record.header.id)}
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
      <TuiActionFooter
        status={effectiveError !== ''
          ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(effectiveError)}</Text>
          : resumeCandidates.length > resumeVisibleCount
            ? <TuiHintLine>{tuiMessage(locale, 'common.showing', {
              start: resumeVisibleStart + 1,
              end: resumeVisibleStart + visibleResumeCandidates.length,
              total: resumeCandidates.length,
            })}</TuiHintLine>
            : undefined}
        actions={<TuiHintLine>{resumeConfirmation !== undefined
          ? [
            tuiMessage(locale, 'resume.stash'),
            tuiMessage(locale, 'resume.discard'),
            tuiMessage(locale, 'resume.cancel'),
          ].join(' · ')
          : resumeDialog.phase === 'resuming'
            ? tuiMessage(locale, 'resume.footer.cancel')
            : narrowResume
              ? tuiMessage(locale, 'resume.footer.narrow', {
                direction: tuiMessage(locale, resumeView === 'list'
                  ? 'resume.direction.preview' : 'resume.direction.list'),
              })
              : tuiMessage(locale, 'resume.footer.wide')}</TuiHintLine>}
      />
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
        columns={transcriptColumns}
      />}
    </Box>
    {!helpVisible && detailHeight > 0 && (footerDetailItem !== undefined || focusedTarget !== undefined) && <TuiScrollablePanel
      height={detailHeight}
      paddingX={1}
    >
      <TuiSection framed title={terminalSafe(footerDetailItem === undefined
        ? focusedAssistantOutput !== undefined && focusedAssistantParts.length > 1
          ? outputReaderScope === 'response'
            ? tuiMessage(locale, 'transcript.assistant.completeResponse', { count: focusedAssistantParts.length })
            : tuiMessage(locale, 'transcript.assistant.segment', {
              position: focusedAssistantPartIndex + 1, count: focusedAssistantParts.length,
            })
          : inspectedActivityTool !== undefined
            ? focusTitle(inspectedActivityTool)
            : focusedActivity !== undefined
              ? tuiMessage(locale, 'transcript.activity.title')
              : focusedTarget?.label ?? tuiMessage(locale, 'common.detail')
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
        {feedbackActionsVisible && <TuiHintLine tone="accent" bold>{feedbackActionLine}</TuiHintLine>}
        {deliverableActionsVisible && <TuiHintLine tone="accent" bold>{deliverableActionLine}</TuiHintLine>}
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
      <TuiHintLine tone="default">
        <Text {...tuiTextStyle(theme.tokens.muted)}>{tuiMessage(locale, 'approval.navigation')}</Text>
        <Text bold {...tuiTextStyle(theme.tokens.success)}>{tuiMessage(locale, 'approval.allow')}</Text>
        <Text {...tuiTextStyle(theme.tokens.muted)}> · </Text>
        <Text bold {...tuiTextStyle(theme.tokens.error)}>{tuiMessage(locale, 'approval.reject')}</Text>
      </TuiHintLine>
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
        {index === 0 ? composerPrefix : composerContinuation}{line}
      </Text>)}
      {attachmentRailView}
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
    {visibleGoalPlanSurface !== undefined && <TuiSection paddingX={2} height={1}>
      <Text wrap="truncate-end">
        {visibleGoalPlanSurface.goal === undefined ? undefined : <>
          <Text bold {...tuiTextStyle(theme.tokens.accent)}>{tuiMessage(locale, 'goalPlan.strip.goal', {
            phase: tuiMessage(locale, `goalPlan.phase.${visibleGoalPlanSurface.goal.phase}`),
          })}</Text>
          <Text> · {terminalSafe(visibleGoalPlanSurface.goal.objective)}</Text>
        </>}
        {visibleGoalPlanSurface.goal !== undefined && visibleGoalPlanSurface.plan?.effective === true ? '  |  ' : ''}
        {visibleGoalPlanSurface.plan?.effective === true && <Text bold {...tuiTextStyle(theme.tokens.warning)}>
          {tuiMessage(locale, visibleGoalPlanSurface.plan.pending ? 'goalPlan.strip.planPending' : 'goalPlan.strip.plan')}
        </Text>}
        <Text {...tuiTextStyle(theme.tokens.muted)}> · Alt+G</Text>
      </Text>
    </TuiSection>}
    {queueCardVisible && <TuiSection paddingX={2} height={1}>
      <Text {...tuiTextStyle(theme.tokens.warning)} wrap="truncate-end">
        {tuiMessage(locale, 'queue.card', {
          count: queue.items.length,
          step: queue.nextStepCount,
          turn: queue.nextTurnCount,
        })}
      </Text>
    </TuiSection>}
    <TuiSection paddingX={2} height={1}>
      {agentStatus === 'running'
        ? <Text wrap="truncate-end">
          <Text bold {...tuiTextStyle(theme.tokens.warning)}>{tuiWorkingFrame(workingFrameTick, props.activityPreference)}{props.activityPreference === 'off' ? '' : ' '}{tuiMessage(locale, 'common.working')}</Text>
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
                {composerPrefix}</Text>}
              {index === 0 ? '' : composerContinuation}{line}
            </Text>)}
            {attachmentRailView}
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
          {workFooterLine}
        </Text>
        : footerDetail !== undefined
          ? <Text {...tuiTextStyle(theme.tokens.selection)} wrap="truncate-end">{tuiMessage(locale, 'footer.detail')}</Text>
          : footerSelection !== undefined
            ? <Text {...tuiTextStyle(theme.tokens.selection)} bold wrap="truncate-end">{selectedFooterStatus}</Text>
            : notice !== ''
              ? <Text {...tuiTextStyle(theme.tokens.error)}>{notice}</Text>
              : confirmationNotice !== undefined
                ? <Text {...tuiTextStyle(theme.tokens.success)}>{confirmationNotice.text}</Text>
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
                        ? helpFooterLine
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
                                ? transcriptDetailFooterLine
                                : footerStatus}</Text>}
    </TuiSection>
  </Box>
}
