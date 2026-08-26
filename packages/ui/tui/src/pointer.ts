/** Render-generation-bound terminal pointer regions and typed UI actions. */

import stringWidth from 'string-width'
import type { TuiInteractionContext } from './keybindings.ts'
import { tuiFooterPointerTargets, type TuiFooterItemId, type TuiFooterItemDescriptor } from './footer.ts'
import type { TuiDeliverableInlineReference } from './deliverables.ts'
import type { TuiScreenMap } from './screen-map.ts'

/** One-based inclusive terminal rectangle. */
export interface TuiPointerRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** One terminal pointer position in one-based cell coordinates. */
export interface TuiPointerPoint {
  readonly column: number
  readonly row: number
}

/** Pointer actions that delegate to existing keyboard-owned TUI transitions. */
export type TuiPointerAction =
  | {
    readonly id: 'transcript.focus'
    readonly key: string
    readonly index: number
    readonly childCallId?: string | undefined
  }
  | {
    readonly id: 'transcript.openFocused' | 'transcript.closeBrowse'
  }
  | {
    readonly id: 'transcript.output'
    readonly key: string
    readonly index: number
    readonly operation: 'open' | 'copy' | 'export'
  }
  | {
    readonly id: 'footer.activate'
    readonly itemId: TuiFooterItemId
  }
  | {
    readonly id: 'work.select'
    readonly index: number
  }
  | {
    readonly id: 'work.open' | 'work.stop' | 'work.close'
  }
  | {
    readonly id: 'pluginHub.toggleView'
    readonly targetView: 'discover' | 'discovery' | 'installed'
  }
  | {
    readonly id: 'pluginHub.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'pluginHub.close'
  }
  | {
    readonly id: 'pluginHub.refresh'
  }
  | {
    readonly id: 'pluginHub.sort'
  }
  | {
    readonly id: 'pluginHub.category'
  }
  | {
    readonly id: 'pluginHub.installable'
  }
  | {
    readonly id: 'pluginHub.openRepository'
  }
  | {
    readonly id: 'resume.scope'
    readonly scope: 'workspace' | 'all'
  }
  | {
    readonly id: 'resume.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'resume.toggleView'
    readonly view: 'list' | 'preview'
  }
  | {
    readonly id: 'resume.rename' | 'resume.stash' | 'resume.discard' | 'resume.close'
  }
  | {
    readonly id: 'provider.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'provider.authenticate'
  }
  | {
    readonly id: 'provider.editProfile' | 'provider.editEndpoint' | 'provider.editApiKey'
      | 'provider.logout' | 'provider.remove' | 'provider.profileSave' | 'provider.confirm'
      | 'provider.endpointReset' | 'provider.refresh'
  }
  | {
    readonly id: 'provider.add'
  }
  | {
    readonly id: 'provider.wizardAccept' | 'provider.wizardDiscover'
  }
  | {
    readonly id: 'provider.wizardBack'
  }
  | {
    readonly id: 'provider.wizardToggle'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'provider.wizardSelect'
    readonly index: number
  }
  | {
    readonly id: 'provider.profileField'
    readonly field: 'displayName' | 'protocol' | 'models'
  }
  | {
    readonly id: 'provider.close'
  }
  | {
    readonly id: 'rewind.select'
    readonly index: number
  }
  | {
    readonly id: 'rewind.accept' | 'rewind.stash' | 'rewind.discard' | 'rewind.close'
  }
  | {
    readonly id: 'fresh.accept' | 'fresh.close'
  }
  | {
    readonly id: 'sessionExport.accept' | 'sessionExport.scope' | 'sessionExport.close'
  }
  | {
    readonly id: 'queue.open'
  }
  | {
    readonly id: 'queue.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'queue.edit'
  }
  | {
    readonly id: 'queue.delete'
  }
  | {
    readonly id: 'queue.close'
  }
  | {
    readonly id: 'goalPlan.open'
  }
  | {
    readonly id: 'goalPlan.edit' | 'goalPlan.pause' | 'goalPlan.resume' | 'goalPlan.clear'
      | 'goalPlan.exitPlan' | 'goalPlan.accept' | 'goalPlan.close'
  }
  | {
    readonly id: 'sessionManager.tab'
    readonly tab: 'sessions' | 'workspaces'
  }
  | {
    readonly id: 'sessionManager.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'sessionManager.resume' | 'sessionManager.fork' | 'sessionManager.rename' | 'sessionManager.archive'
      | 'sessionManager.add' | 'sessionManager.moveUp' | 'sessionManager.moveDown'
      | 'sessionManager.delete' | 'sessionManager.scope' | 'sessionManager.archiveFilter'
      | 'sessionManager.sort' | 'sessionManager.group' | 'sessionManager.refresh' | 'sessionManager.close'
      | 'sessionManager.directoryParent' | 'sessionManager.directoryHome'
      | 'sessionManager.directoryHidden' | 'sessionManager.directoryRefresh'
  }
  | {
    readonly id: 'presetManager.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'presetManager.setDefault' | 'presetManager.copy' | 'presetManager.delete'
      | 'presetManager.view' | 'presetManager.openFile' | 'presetManager.open' | 'presetManager.close'
  }
  | {
    readonly id: 'hostPlugins.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'hostPlugins.field'
    readonly index: number
  }
  | {
    readonly id: 'hostPlugins.close' | 'hostPlugins.filter' | 'hostPlugins.refresh'
      | 'hostPlugins.edit' | 'hostPlugins.cycle' | 'hostPlugins.save'
      | 'hostPlugins.discard' | 'hostPlugins.reset'
  }
  | {
    readonly id: 'hostPlugins.tab'
    /** Omitted only by the footer shortcut, whose established behavior is to toggle. */
    readonly tab?: 'plugins' | 'settings' | undefined
  }
  | {
    readonly id: 'trajectory.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'trajectory.close' | 'trajectory.fold' | 'trajectory.search'
      | 'trajectory.older' | 'trajectory.tail' | 'trajectory.cycleTab'
  }
  | {
    readonly id: 'trajectory.tab'
    readonly tab: 'summary' | 'input' | 'output' | 'timing'
  }
  | {
    readonly id: 'feedback.like' | 'feedback.dislike' | 'feedback.clear' | 'feedback.note'
    readonly messageId: string
  }
  | {
    readonly id: 'attachment.remove'
    readonly index: number
  }
  | {
    readonly id: 'deliverables.open'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'deliverables.copy'
  }
  | {
    readonly id: 'deliverables.inline'
    readonly path: string
    readonly mode: 'open' | 'copy'
  }
  | {
    readonly id: 'dialog.option'
    readonly index: number
  }
  | {
    readonly id: 'dialog.accept'
  }
  | {
    readonly id: 'dialog.close'
  }
  | {
    readonly id: 'approval.allowOnce'
  }
  | {
    readonly id: 'approval.reject'
  }
  | {
    readonly id: 'detail.close'
  }
  | {
    readonly id: 'detail.copy'
  }
  | {
    readonly id: 'detail.exportMarkdown'
  }
  | {
    readonly id: 'detail.toggleScope'
  }
  | {
    readonly id: 'activity.open'
    readonly index: number
  }
  | {
    readonly id: 'suggestion.accept'
    readonly index: number
  }

/** One visible hit target published by a committed TUI frame. */
export interface TuiPointerRegion {
  readonly id: string
  readonly rect: TuiPointerRect
  readonly context: TuiInteractionContext
  /** Larger values represent a more modal or specific surface. */
  readonly priority: number
  readonly action: TuiPointerAction
  /** Disabled regions remain visible to diagnostics but never dispatch an action. */
  readonly disabledReason?: string | undefined
}

/** One footer action with an optional exact rendered label. */
export type TuiPointerFooterAction = TuiPointerAction | {
  readonly action: TuiPointerAction
  readonly label: string
}

function footerActionValue(entry: TuiPointerFooterAction): TuiPointerAction {
  return 'action' in entry ? entry.action : entry
}

function appendFooterPointerRegions(
  regions: TuiPointerRegion[],
  prefix: string,
  actions: readonly TuiPointerFooterAction[],
  columns: number,
  row: number,
  context: Extract<TuiInteractionContext, 'Composer' | 'Dialog' | 'Detail' | 'PluginHub' | 'Work' | 'Transcript'>,
  renderedLine?: string,
  lineLeft = 3,
): void {
  const exact = actions.every(entry => 'action' in entry)
  let exactLeft = lineLeft
  let lineSearchStart = 0
  actions.forEach((entry, index) => {
    const action = footerActionValue(entry)
    let left: number
    let right: number
    if (exact && 'action' in entry) {
      const lineIndex = renderedLine?.indexOf(entry.label, lineSearchStart) ?? -1
      if (renderedLine !== undefined && lineIndex < 0) return
      left = lineIndex < 0 ? exactLeft : lineLeft + stringWidth((renderedLine ?? '').slice(0, lineIndex))
      right = Math.min(columns, left + Math.max(1, stringWidth(entry.label)) - 1)
      exactLeft = right + stringWidth(' · ') + 1
      if (lineIndex >= 0) lineSearchStart = lineIndex + entry.label.length
    } else {
      left = Math.floor(index * columns / actions.length) + 1
      right = Math.max(left, Math.floor((index + 1) * columns / actions.length))
    }
    if (left > columns) return
    regions.push({
      id: `${prefix}:footer:${index}`,
      rect: { left, top: row, right, bottom: row },
      context,
      priority: 40,
      action,
    })
  })
}

/** Inputs needed to map one rendered dialog footer without approximating action widths. */
export interface TuiDialogFooterPointerOptions {
  /** Stable region id prefix for the owning surface. */
  readonly id: string
  /** Complete terminal width. */
  readonly columns: number
  /** Physical row containing the rendered footer. */
  readonly row: number
  /** First physical cell occupied by the rendered line. */
  readonly lineLeft?: number | undefined
  /** Complete footer text exactly as rendered. */
  readonly line: string
  /** Visible action labels and their keyboard-equivalent actions. */
  readonly actions: readonly TuiPointerFooterAction[]
  /** Active surface context; defaults to a dialog-owned footer. */
  readonly context?: Extract<TuiInteractionContext, 'Dialog' | 'Detail' | 'Transcript'> | undefined
}

/** Build exact label hit regions for a dialog footer. */
export function tuiDialogFooterPointerRegions(
  options: TuiDialogFooterPointerOptions,
): readonly TuiPointerRegion[] {
  const regions: TuiPointerRegion[] = []
  appendFooterPointerRegions(
    regions,
    options.id,
    options.actions,
    Math.max(1, Math.floor(options.columns)),
    Math.max(1, Math.floor(options.row)),
    options.context ?? 'Dialog',
    options.line,
    Math.max(1, Math.floor(options.lineLeft ?? 3)),
  )
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs for the three inline actions rendered below one completed assistant output. */
export interface TuiAssistantOutputPointerOptions {
  readonly columns: number
  readonly row: number
  readonly lineLeft: number
  readonly line: string
  readonly labels: {
    readonly open: string
    readonly copy: string
    readonly exportMarkdown: string
  }
  readonly key: string
  readonly index: number
  readonly context: Extract<TuiInteractionContext, 'Composer' | 'Transcript'>
}

/**
 * Map each assistant output action label to its own exact terminal cells.
 * @param options - rendered action line, target identity, and committed geometry.
 * @returns independently clickable view, copy, and export regions.
 */
export function tuiAssistantOutputPointerRegions(
  options: TuiAssistantOutputPointerOptions,
): readonly TuiPointerRegion[] {
  const regions: TuiPointerRegion[] = []
  appendFooterPointerRegions(
    regions,
    `transcript:output:${options.key}`,
    [
      {
        action: { id: 'transcript.output', key: options.key, index: options.index, operation: 'open' },
        label: options.labels.open,
      },
      {
        action: { id: 'transcript.output', key: options.key, index: options.index, operation: 'copy' },
        label: options.labels.copy,
      },
      {
        action: { id: 'transcript.output', key: options.key, index: options.index, operation: 'export' },
        label: options.labels.exportMarkdown,
      },
    ],
    Math.max(1, Math.floor(options.columns)),
    Math.max(1, Math.floor(options.row)),
    options.context,
    options.line,
    Math.max(1, Math.floor(options.lineLeft)),
  )
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/**
 * Restrict visible transcript hit regions to durable rewind candidates.
 * @param regions - physical transcript regions for the current viewport.
 * @param candidateKeys - candidate event keys in owner selection order.
 * @returns dialog-owned row regions that select, but do not immediately commit, a rewind boundary.
 */
export function tuiRewindCandidatePointerRegions(
  regions: readonly TuiPointerRegion[],
  candidateKeys: readonly string[],
): readonly TuiPointerRegion[] {
  const indexByKey = new Map(candidateKeys.map((key, index) => [key, index]))
  return Object.freeze(regions.flatMap((region): TuiPointerRegion[] => {
    if (region.action.id !== 'transcript.focus') return []
    const index = indexByKey.get(region.action.key)
    return index === undefined ? [] : [Object.freeze({
      ...region,
      id: `rewind:select:${index}`,
      context: 'Dialog',
      priority: 30,
      action: { id: 'rewind.select' as const, index },
    })]
  }))
}

/** A region hit by a pointer press, including the current render generation. */
export interface TuiPointerHit {
  readonly generation: number
  readonly region: TuiPointerRegion
}

/**
 * Build footer hit regions from the same cell-bounded projection used to render
 * the status row. The row is one-based and the outer section's horizontal
 * padding is accounted for by the returned coordinates.
 *
 * @param items - currently mounted footer items.
 * @param columns - complete terminal width.
 * @param row - one-based status row.
 * @param context - current non-modal input context.
 * @returns immutable footer regions for the current render generation.
 */
export function tuiFooterPointerRegions(
  items: readonly TuiFooterItemDescriptor[],
  columns: number,
  row: number,
  context: Extract<TuiInteractionContext, 'Composer' | 'Transcript'>,
): readonly TuiPointerRegion[] {
  const contentColumns = Math.max(1, Math.floor(columns) - 2)
  const targets = tuiFooterPointerTargets(items, contentColumns)
  return Object.freeze(targets.map(target => Object.freeze({
    id: `footer:${target.itemId}`,
    rect: { left: target.left + 2, top: Math.floor(row), right: target.right + 2, bottom: Math.floor(row) },
    context,
    priority: 30,
    action: { id: 'footer.activate' as const, itemId: target.itemId },
  })))
}

/**
 * Build row hit regions for the visible work list. Header and footer chrome are
 * excluded so a click only changes the same selection controlled by Up/Down.
 *
 * @param itemCount - complete work item count.
 * @param selectedIndex - currently selected item index.
 * @param maxRows - physical rows allocated to the work panel.
 * @param columns - complete terminal width.
 * @param context - active Work input context.
 * @param footer - optional exact rendered footer geometry and actions.
 * @returns immutable work selection regions.
 */
export function tuiWorkPointerRegions(
  itemCount: number,
  selectedIndex: number,
  maxRows: number,
  columns: number,
  context: Extract<TuiInteractionContext, 'Work'>,
  footer?: {
    readonly row: number
    readonly line: string
    readonly lineLeft?: number | undefined
    readonly actions: readonly TuiPointerFooterAction[]
  },
): readonly TuiPointerRegion[] {
  const count = Math.max(0, Math.floor(itemCount))
  const capacity = Math.max(1, Math.floor(maxRows) - 4)
  const visible = Math.min(count, capacity)
  const selected = count === 0 ? 0 : Math.min(Math.max(0, Math.floor(selectedIndex)), count - 1)
  const start = Math.max(0, Math.min(selected - Math.floor(capacity / 2), count - capacity))
  const right = Math.max(1, Math.floor(columns) - 2)
  const regions: TuiPointerRegion[] = Array.from({ length: visible }, (_, offset) => ({
    id: `work:${start + offset}`,
    rect: { left: 2, top: offset + 2, right, bottom: offset + 2 },
    context,
    priority: 20,
    action: { id: 'work.select' as const, index: start + offset },
  }))
  if (footer !== undefined) {
    appendFooterPointerRegions(
      regions, 'work', footer.actions, Math.max(1, Math.floor(columns)),
      footer.row, context, footer.line, footer.lineLeft ?? 2,
    )
  }
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to publish Plugin Hub list, tab, and footer hit regions. */
export interface TuiPluginHubPointerOptions {
  /** Complete terminal width. */
  readonly columns: number
  /** Complete terminal height. */
  readonly rows: number
  /** Whether the bounded search field is mounted above the list. */
  readonly searchVisible: boolean
  /** Whether the detail projection is active. */
  readonly detail: boolean
  /** Whether the profile change confirmation projection is active. */
  readonly confirmation: boolean
  /** Current Plugin Hub browse mode. */
  readonly view: 'discover' | 'discovery' | 'installed'
  /** Current controller phase. */
  readonly phase: 'loading' | 'browse' | 'detail-loading' | 'detail' | 'planning' | 'confirm' | 'staging' | 'handoff' | 'error'
  /** Rendered tab prefix and labels in their visual order. */
  readonly tabs: {
    readonly line: string
    readonly installedLabel: string
    readonly registryLabel: string
    readonly repositoriesLabel: string
  }
  /** Rendered Registry status line and the labels that own catalog controls. */
  readonly catalog?: {
    readonly line: string
    /** Omitted when the Registry has not supplied any usable category facets. */
    readonly categoryLabel?: string | undefined
    readonly installableLabel: string
    readonly sortLabel: string
  } | undefined
  /** Visible zero-based detail rows that open the current GitHub repository. */
  readonly detailLinks?: readonly {
    readonly rowOffset: number
    readonly text: string
  }[] | undefined
  /** Index of the first row mounted in the current list window. */
  readonly visibleStart: number
  /** Bounded row heights for the mounted list slice. */
  readonly rowHeights: readonly number[]
  /** Exact rendered footer actions for the active Hub layer. */
  readonly footerActions?: readonly TuiPointerFooterAction[] | undefined
  /** Complete rendered footer line used to locate exact action labels. */
  readonly footerLine?: string | undefined
  /** Active input context. */
  readonly context: Extract<TuiInteractionContext, 'PluginHub'>
}

/**
 * Build Plugin Hub pointer regions from the same bounded card/window facts used
 * by the renderer. List clicks carry the row index; destructive transitions
 * still enter the existing plan or confirmation owner.
 *
 * @param options - current Plugin Hub layout and controller facts.
 * @returns immutable Plugin Hub regions for the current render generation.
 */
export function tuiPluginHubPointerRegions(
  options: TuiPluginHubPointerOptions,
): readonly TuiPointerRegion[] {
  const regions: TuiPointerRegion[] = []
  if (options.phase === 'browse' || options.phase === 'detail') {
    const installed = textPointerRegion('pluginHub:installed-tab', options.tabs.line, options.tabs.installedLabel,
      0, options.context, { id: 'pluginHub.toggleView', targetView: 'installed' }, 3)
    const registry = textPointerRegion('pluginHub:discover-tab', options.tabs.line, options.tabs.registryLabel,
      installed?.endIndex ?? 0, options.context, { id: 'pluginHub.toggleView', targetView: 'discover' }, 3)
    const repositories = textPointerRegion('pluginHub:discovery-tab', options.tabs.line, options.tabs.repositoriesLabel,
      registry?.endIndex ?? 0, options.context, { id: 'pluginHub.toggleView', targetView: 'discovery' }, 3)
    if (installed !== undefined) regions.push(installed.region)
    if (registry !== undefined) regions.push(registry.region)
    if (repositories !== undefined) regions.push(repositories.region)
  }
  if (options.phase === 'browse' && !options.detail && !options.confirmation) {
    if (options.view === 'discover' && options.catalog !== undefined) {
      const installable = textPointerRegion(
        'pluginHub:installable', options.catalog.line, options.catalog.installableLabel, 0,
        options.context, { id: 'pluginHub.installable' },
      )
      const category = options.catalog.categoryLabel === undefined ? undefined : textPointerRegion(
        'pluginHub:category', options.catalog.line, options.catalog.categoryLabel, installable?.endIndex ?? 0,
        options.context, { id: 'pluginHub.category' },
      )
      const sort = textPointerRegion(
        'pluginHub:sort', options.catalog.line, options.catalog.sortLabel,
        category?.endIndex ?? installable?.endIndex ?? 0, options.context, { id: 'pluginHub.sort' },
      )
      if (installable !== undefined) regions.push(installable.region)
      if (category !== undefined) regions.push(category.region)
      if (sort !== undefined) regions.push(sort.region)
    }
    const top = options.searchVisible ? 8 : 5
    let row = top
    options.rowHeights.forEach((height, offset) => {
      const boundedHeight = Math.max(1, Math.floor(height))
      regions.push({
        id: `pluginHub:row:${options.visibleStart + offset}`,
        rect: {
          left: 3,
          top: row,
          right: Math.max(3, Math.floor(options.columns) - 2),
          bottom: row + boundedHeight - 1,
        },
        context: options.context,
        priority: 20,
        action: { id: 'pluginHub.accept', index: options.visibleStart + offset },
      })
      row += boundedHeight
    })
  }
  if (options.phase === 'detail') {
    for (const [index, link] of (options.detailLinks ?? []).entries()) {
      const top = 4 + Math.max(0, Math.floor(link.rowOffset))
      regions.push({
        id: `pluginHub:detail-link:${index}`,
        rect: {
          left: 3,
          top,
          right: Math.min(Math.max(3, Math.floor(options.columns) - 2), Math.max(3, 2 + stringWidth(link.text))),
          bottom: top,
        },
        context: options.context,
        priority: 40,
        action: { id: 'pluginHub.openRepository' },
      })
    }
    if (options.footerActions === undefined) {
      regions.push({
        id: 'pluginHub:detail-close',
        rect: {
          left: 1,
          top: Math.max(1, Math.floor(options.rows)),
          right: Math.max(1, Math.floor(options.columns)),
          bottom: Math.max(1, Math.floor(options.rows)),
        },
        context: options.context,
        priority: 30,
        action: options.view === 'discovery' ? { id: 'pluginHub.openRepository' } : { id: 'pluginHub.close' },
      })
    }
  } else if (options.phase === 'confirm') {
    if (options.footerActions === undefined) {
      regions.push({
        id: 'pluginHub:confirm',
        rect: {
          left: 1,
          top: Math.max(1, Math.floor(options.rows)),
          right: Math.max(1, Math.floor(options.columns)),
          bottom: Math.max(1, Math.floor(options.rows)),
        },
        context: options.context,
        priority: 30,
        action: { id: 'pluginHub.accept' },
      })
    }
  }
  if (options.footerActions !== undefined) {
    appendFooterPointerRegions(
      regions,
      'pluginHub',
      options.footerActions,
      Math.max(1, Math.floor(options.columns)),
      Math.max(1, Math.floor(options.rows)),
      options.context,
      options.footerLine,
    )
  }
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

function textPointerRegion(
  id: string,
  line: string,
  label: string,
  startIndex: number,
  context: Extract<TuiInteractionContext, 'PluginHub'>,
  action: Extract<TuiPointerAction, { readonly id: 'pluginHub.sort' | 'pluginHub.category' | 'pluginHub.installable' | 'pluginHub.toggleView' }>,
  top = 4,
): { readonly region: TuiPointerRegion; readonly endIndex: number } | undefined {
  const index = line.indexOf(label, startIndex)
  const width = stringWidth(label)
  if (index < 0 || width === 0) return undefined
  const left = 3 + stringWidth(line.slice(0, index))
  return Object.freeze({
    endIndex: index + label.length,
    region: Object.freeze({
      id,
      rect: { left, top, right: left + width - 1, bottom: top },
      context,
      priority: 40,
      action,
    }),
  })
}

/** Inputs needed to publish Session picker pointer regions. */
export interface TuiResumePointerOptions {
  /** Complete terminal width. */
  readonly columns: number
  /** Complete terminal height. */
  readonly rows: number
  /** Whether the picker is narrow enough to switch between list and preview. */
  readonly narrow: boolean
  /** Whether the preview panel is currently visible. */
  readonly previewVisible: boolean
  /** Whether the list panel is currently visible. */
  readonly listVisible: boolean
  /** Current picker phase. */
  readonly phase: 'opening' | 'loading' | 'ready' | 'resuming' | 'error'
  /** Whether draft confirmation owns the body. */
  readonly confirmation: boolean
  /** Index of the first candidate mounted in the current list window. */
  readonly visibleStart: number
  /** Number of visible candidates. */
  readonly visibleCount: number
  /** Fixed row height used by the picker renderer. */
  readonly rowHeight: number
  /** Exact localized scope labels rendered on the picker header row. */
  readonly scopeTabs?: {
    readonly row: number
    readonly left: number
    readonly workspaceLabel: string
    readonly allLabel: string
    readonly gap: string
  } | undefined
  /** Exact rendered footer actions for the current picker layer. */
  readonly footerActions?: readonly TuiPointerFooterAction[] | undefined
  /** Complete rendered footer line used to locate action labels. */
  readonly footerLine?: string | undefined
  /** Active input context. */
  readonly context: Extract<TuiInteractionContext, 'Dialog'>
}

/**
 * Build Session picker regions from the existing bounded list and footer
 * layout. Selecting a row delegates to the same resume transaction as Enter;
 * it never swaps the live Agent directly.
 *
 * @param options - current Session picker layout and controller facts.
 * @returns immutable Session picker regions for the current render generation.
 */
export function tuiResumePointerRegions(
  options: TuiResumePointerOptions,
): readonly TuiPointerRegion[] {
  const regions: TuiPointerRegion[] = []
  if (options.phase !== 'ready' || options.confirmation) {
    if (options.footerActions !== undefined) appendFooterPointerRegions(
      regions,
      'resume',
      options.footerActions,
      Math.max(1, Math.floor(options.columns)),
      Math.max(1, Math.floor(options.rows)),
      options.context,
      options.footerLine,
    )
    return Object.freeze(regions.map(region => Object.freeze(region)))
  }
  const scope = options.scopeTabs ?? {
    row: 4, left: 3, workspaceLabel: 'This workspace', allLabel: 'All workspaces', gap: ' ',
  }
  const workspaceWidth = stringWidth(scope.workspaceLabel)
  const allLeft = scope.left + workspaceWidth + stringWidth(scope.gap)
  regions.push({
    id: 'resume:workspace-scope',
    rect: {
      left: scope.left,
      top: scope.row,
      right: scope.left + Math.max(1, workspaceWidth) - 1,
      bottom: scope.row,
    },
    context: options.context,
    priority: 40,
    action: { id: 'resume.scope', scope: 'workspace' },
  }, {
    id: 'resume:all-scope',
    rect: {
      left: allLeft,
      top: scope.row,
      right: allLeft + Math.max(1, stringWidth(scope.allLabel)) - 1,
      bottom: scope.row,
    },
    context: options.context,
    priority: 40,
    action: { id: 'resume.scope', scope: 'all' },
  })
  if (options.listVisible) {
    const top = 9
    const right = options.previewVisible && !options.narrow
      ? Math.max(3, Math.floor(options.columns * 0.55) - 1)
      : Math.max(3, Math.floor(options.columns) - 2)
    const height = Math.max(1, Math.floor(options.rowHeight))
    for (let offset = 0; offset < Math.max(0, Math.floor(options.visibleCount)); offset += 1) {
      const row = top + offset * height
      regions.push({
        id: `resume:row:${options.visibleStart + offset}`,
        rect: { left: 3, top: row, right, bottom: row + height - 1 },
        context: options.context,
        priority: 20,
        action: { id: 'resume.accept', index: options.visibleStart + offset },
      })
    }
  }
  if (!options.narrow && options.listVisible && options.previewVisible) {
    regions.push({
      id: 'resume:preview',
      rect: {
        left: Math.max(3, Math.floor(options.columns * 0.55)),
        top: 9,
        right: Math.max(3, Math.floor(options.columns) - 2),
        bottom: Math.max(9, Math.floor(options.rows) - 2),
      },
      context: options.context,
      priority: 10,
      action: { id: 'resume.accept' },
    })
  }
  if (options.footerActions !== undefined) {
    appendFooterPointerRegions(
      regions,
      'resume',
      options.footerActions,
      Math.max(1, Math.floor(options.columns)),
      Math.max(1, Math.floor(options.rows)),
      options.context,
      options.footerLine,
    )
  } else if (options.previewVisible || options.listVisible) {
    const footerRow = Math.max(1, Math.floor(options.rows))
    regions.push({
      id: 'resume:accept',
      rect: { left: 1, top: footerRow, right: Math.max(1, Math.floor(options.columns)), bottom: footerRow },
      context: options.context,
      priority: 30,
      action: { id: 'resume.accept' },
    })
  }
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to publish option rows for a question-owned dialog. */
export interface TuiQuestionPointerOptions {
  /** Complete terminal width. */
  readonly columns: number
  /** First visible option row in one-based terminal coordinates. */
  readonly optionTop: number
  /** Index represented by the first visible row. */
  readonly optionStart: number
  /** Number of option rows mounted in the current frame. */
  readonly visibleCount: number
  /** Physical row height for one option. */
  readonly rowHeight: number
  /** Optional row that submits the current answer. */
  readonly acceptRow?: number | undefined
  /** Active input context. */
  readonly context: Extract<TuiInteractionContext, 'Dialog'>
}

/**
 * Build pointer regions for question options and the answer submit row.
 * Selection changes only the existing dialog cursor; submit remains owned by
 * the same interaction provider used by Enter.
 *
 * @param options - mounted option rows and bounded dialog geometry.
 * @returns immutable question regions for the current render generation.
 */
export function tuiQuestionPointerRegions(
  options: TuiQuestionPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const top = Math.max(1, Math.floor(options.optionTop))
  const start = Math.max(0, Math.floor(options.optionStart))
  const count = Math.max(0, Math.floor(options.visibleCount))
  const height = Math.max(1, Math.floor(options.rowHeight))
  const regions: TuiPointerRegion[] = []
  for (let offset = 0; offset < count; offset += 1) {
    const row = top + offset * height
    regions.push({
      id: `dialog:option:${start + offset}`,
      rect: { left: 2, top: row, right: Math.max(2, columns - 1), bottom: row + height - 1 },
      context: options.context,
      priority: 30,
      action: { id: 'dialog.option', index: start + offset },
    })
  }
  if (options.acceptRow !== undefined) {
    const row = Math.max(1, Math.floor(options.acceptRow))
    regions.push({
      id: 'dialog:accept',
      rect: { left: 1, top: row, right: columns, bottom: row },
      context: options.context,
      priority: 20,
      action: { id: 'dialog.accept' },
    })
  }
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to publish Approval decision button regions. */
export interface TuiApprovalPointerOptions {
  /** Complete terminal width. */
  readonly columns: number
  /** One-based row containing the rendered allow/reject hint. */
  readonly actionRow: number
  /** Optional visible-cell range for the allow-once label. */
  readonly allowRange?: Readonly<{ left: number; right: number }> | undefined
  /** Optional visible-cell range for the reject label. */
  readonly rejectRange?: Readonly<{ left: number; right: number }> | undefined
  /** Active input context. */
  readonly context: Extract<TuiInteractionContext, 'Approval'>
}

/**
 * Build the two explicit Approval decision regions shown by the current
 * approval footer. The service exposes only allow-once and reject, so no other
 * pointer action is published.
 *
 * @param options - terminal width and action row.
 * @returns immutable decision regions.
 */
export function tuiApprovalPointerRegions(
  options: TuiApprovalPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(2, Math.floor(options.columns))
  const row = Math.max(1, Math.floor(options.actionRow))
  const midpoint = Math.floor(columns / 2)
  const allowLeft = Math.max(1, Math.min(columns, Math.floor(options.allowRange?.left ?? 1)))
  const allowRight = Math.max(allowLeft, Math.min(columns, Math.floor(options.allowRange?.right ?? midpoint)))
  const rejectLeft = Math.max(allowRight + 1, Math.min(columns, Math.floor(options.rejectRange?.left ?? midpoint + 1)))
  const rejectRight = Math.max(rejectLeft, Math.min(columns, Math.floor(options.rejectRange?.right ?? columns)))
  return Object.freeze([
    Object.freeze({
      id: 'approval:allow-once',
      rect: { left: allowLeft, top: row, right: allowRight, bottom: row },
      context: options.context,
      priority: 40,
      action: { id: 'approval.allowOnce' as const },
    }),
    Object.freeze({
      id: 'approval:reject',
      rect: { left: rejectLeft, top: row, right: rejectRight, bottom: row },
      context: options.context,
      priority: 40,
      action: { id: 'approval.reject' as const },
    }),
  ])
}

/** Inputs needed to publish a generic modal close region. */
export interface TuiModalClosePointerOptions {
  /** Complete terminal width. */
  readonly columns: number
  /** One-based row containing the modal footer. */
  readonly row: number
  /** Active input context. */
  readonly context: Extract<TuiInteractionContext, 'Dialog' | 'Detail'>
  /** Stable region id for diagnostics. */
  readonly id?: string | undefined
  /** Action emitted when the footer is clicked. */
  readonly action?: 'dialog.close' | 'detail.close' | undefined
}

/**
 * Build a full-width modal footer close region.
 * @param options - modal footer geometry and close action.
 * @returns immutable close region for the current render generation.
 */
export function tuiModalClosePointerRegions(
  options: TuiModalClosePointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const row = Math.max(1, Math.floor(options.row))
  const action = options.action ?? 'dialog.close'
  return Object.freeze([Object.freeze({
    id: options.id ?? 'dialog:close',
    rect: { left: 1, top: row, right: columns, bottom: row },
    context: options.context,
    priority: 35,
    action: { id: action } as TuiPointerAction,
  })])
}

/** Inputs needed to publish visible suggestion rows. */
export interface TuiSuggestionPointerOptions {
  /** Complete terminal width. */
  readonly columns: number
  /** First visible suggestion row in one-based terminal coordinates. */
  readonly top: number
  /** Index represented by the first visible row. */
  readonly visibleStart: number
  /** Number of visible suggestion rows. */
  readonly visibleCount: number
  /** Active input context. */
  readonly context: Extract<TuiInteractionContext, 'Composer'>
}

/**
 * Build pointer regions that accept an existing suggestion item.
 * @param options - visible suggestion window and bounded terminal geometry.
 * @returns immutable suggestion regions for the current render generation.
 */
export function tuiSuggestionPointerRegions(
  options: TuiSuggestionPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const top = Math.max(1, Math.floor(options.top))
  const start = Math.max(0, Math.floor(options.visibleStart))
  const count = Math.max(0, Math.floor(options.visibleCount))
  return Object.freeze(Array.from({ length: count }, (_, offset) => Object.freeze({
    id: `suggestion:${start + offset}`,
    rect: { left: 2, top: top + offset, right: Math.max(2, columns - 1), bottom: top + offset },
    context: options.context,
    priority: 25,
    action: { id: 'suggestion.accept' as const, index: start + offset },
  })))
}

/** Inputs needed to publish Provider Center list/detail pointer regions. */
export interface TuiProviderPointerOptions {
  /** Complete terminal width. */
  readonly columns: number
  /** Complete terminal height. */
  readonly rows: number
  /** Whether provider detail currently owns the panel. */
  readonly detail: boolean
  /** Whether the custom-provider wizard owns the panel. */
  readonly wizard: boolean
  /** Whether the wizard currently renders discovery candidates. */
  readonly picker: boolean
  /** Visible one-row wizard list kind, if any. */
  readonly wizardListKind?: 'picker' | 'protocol' | undefined
  /** Whether the list can open a writable custom-provider target. */
  readonly canAdd: boolean
  /** Whether the selected detail offers interactive authentication. */
  readonly canAuthenticate: boolean
  /** Exact rendered detail-footer labels and the keyboard-owned actions they expose. */
  readonly detailActions?: readonly {
    readonly id: 'provider.authenticate' | 'provider.editProfile' | 'provider.editEndpoint'
      | 'provider.editApiKey' | 'provider.logout' | 'provider.remove' | 'provider.profileSave'
      | 'provider.confirm' | 'provider.endpointReset' | 'provider.refresh' | 'provider.close'
    readonly label: string
  }[]
  /** Index represented by the first visible provider row. */
  readonly visibleStart: number
  /** Number of visible provider rows. */
  readonly visibleCount: number
  /** Fixed physical height of each provider row. */
  readonly rowHeight: number
  /** First discovery-candidate index mounted by the picker. */
  readonly candidateStart: number
  /** Number of discovery candidates mounted by the picker. */
  readonly candidateCount: number
  /** First physical row for picker/protocol entries. */
  readonly candidateTop?: number | undefined
  /** Exact visible spans for existing-profile editor fields. */
  readonly profileFields?: readonly {
    readonly field: 'displayName' | 'protocol' | 'models'
    readonly top: number
    readonly bottom: number
  }[] | undefined
  /** Exact rendered wizard or list footer actions. */
  readonly footerActions?: readonly TuiPointerFooterAction[] | undefined
  /** Complete rendered footer line used to locate exact action labels. */
  readonly footerLine?: string | undefined
  /** Active modal context. */
  readonly context: Extract<TuiInteractionContext, 'Dialog'>
}

/**
 * Build Provider Center row and footer actions from its fixed terminal layout.
 * @param options - current list/detail geometry and authentication capability.
 * @returns immutable regions delegating to the same transitions as keyboard actions.
 */
export function tuiProviderPointerRegions(
  options: TuiProviderPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const rows = Math.max(1, Math.floor(options.rows))
  const detailAction: TuiPointerAction = options.canAuthenticate
    ? { id: 'provider.authenticate' }
    : { id: 'provider.close' }
  if (options.wizard) {
    const regions: TuiPointerRegion[] = []
    const wizardListKind = options.wizardListKind ?? (options.picker ? 'picker' : undefined)
    if (wizardListKind !== undefined) {
      for (let offset = 0; offset < Math.max(0, options.candidateCount); offset += 1) {
        const index = options.candidateStart + offset
        regions.push({
          id: `provider:wizard:${wizardListKind}:${index}`,
          rect: {
            left: 2,
            top: (options.candidateTop ?? 5) + offset,
            right: Math.max(2, columns - 1),
            bottom: (options.candidateTop ?? 5) + offset,
          },
          context: options.context,
          priority: 35,
          action: wizardListKind === 'picker'
            ? { id: 'provider.wizardToggle', index }
            : { id: 'provider.wizardSelect', index },
        })
      }
    }
    if (options.footerActions !== undefined) {
      appendFooterPointerRegions(
        regions, 'provider:wizard', options.footerActions, columns, rows, options.context, options.footerLine,
      )
    } else {
      regions.push({
        id: 'provider:wizard:accept',
        rect: { left: 1, top: rows, right: Math.max(1, Math.floor(columns / 2)), bottom: rows },
        context: options.context,
        priority: 35,
        action: { id: 'provider.wizardAccept' },
      }, {
        id: 'provider:wizard:back',
        rect: { left: Math.max(1, Math.floor(columns / 2) + 1), top: rows, right: columns, bottom: rows },
        context: options.context,
        priority: 35,
        action: { id: 'provider.wizardBack' },
      })
    }
    return Object.freeze(regions.map(region => Object.freeze(region)))
  }
  if (options.detail) {
    const fieldRegions = (options.profileFields ?? []).map((field): TuiPointerRegion => ({
      id: `provider:profile-field:${field.field}`,
      rect: {
        left: 4,
        top: field.top,
        right: Math.max(4, columns - 3),
        bottom: field.bottom,
      },
      context: options.context,
      priority: 40,
      action: { id: 'provider.profileField', field: field.field },
    }))
    if (options.detailActions !== undefined && options.detailActions.length > 0) {
      let left = 3
      const regions: TuiPointerRegion[] = [...fieldRegions]
      for (const entry of options.detailActions) {
        const width = Math.max(1, stringWidth(entry.label))
        const right = Math.min(columns, left + width - 1)
        if (left <= columns) regions.push({
          id: `provider:${entry.id}`,
          rect: { left, top: rows, right, bottom: rows },
          context: options.context,
          priority: 35,
          action: { id: entry.id },
        })
        left = right + 4 // rendered separator is ` · `
      }
      return Object.freeze(regions.map(region => Object.freeze(region)))
    }
    return Object.freeze([...fieldRegions, Object.freeze({
      id: options.canAuthenticate ? 'provider:authenticate' : 'provider:close',
      rect: { left: 1, top: rows, right: columns, bottom: rows },
      context: options.context,
      priority: 35,
      action: detailAction,
    })])
  }
  const top = 4
  const regions: TuiPointerRegion[] = Array.from({ length: Math.max(0, options.visibleCount) }, (_, offset) => ({
    id: `provider:${options.visibleStart + offset}`,
    rect: {
      left: 2,
      top: top + offset * options.rowHeight,
      right: Math.max(2, columns - 1),
      bottom: top + offset * options.rowHeight + options.rowHeight - 1,
    },
    context: options.context,
    priority: 30,
    action: { id: 'provider.accept', index: options.visibleStart + offset },
  }))
  if (options.footerActions !== undefined) {
    appendFooterPointerRegions(
      regions, 'provider', options.footerActions, columns, rows, options.context, options.footerLine,
    )
    return Object.freeze(regions.map(region => Object.freeze(region)))
  }
  if (options.canAdd) regions.push({
    id: 'provider:add',
    rect: { left: 1, top: rows, right: Math.max(1, Math.floor(columns / 2)), bottom: rows },
    context: options.context,
    priority: 25,
    action: { id: 'provider.add' },
  })
  regions.push({
    id: 'provider:close',
    rect: {
      left: options.canAdd ? Math.max(1, Math.floor(columns / 2) + 1) : 1,
      top: rows, right: columns, bottom: rows,
    },
    context: options.context,
    priority: 20,
    action: { id: 'provider.close' },
  })
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to publish collapsed and expanded pending Queue regions. */
export interface TuiQueuePointerOptions {
  readonly columns: number
  readonly rows: number
  readonly open: boolean
  readonly detail: boolean
  readonly editing: boolean
  readonly confirmingDelete: boolean
  readonly canEdit: boolean
  readonly canDelete: boolean
  readonly collapsedRow?: number | undefined
  readonly visibleStart: number
  readonly visibleCount: number
  readonly rowHeight: number
  readonly footerActions?: readonly TuiPointerFooterAction[] | undefined
  readonly footerLine?: string | undefined
  readonly context: Extract<TuiInteractionContext, 'Composer' | 'Transcript' | 'Dialog'>
}

/**
 * Build pointer regions from the same Queue card and full-screen list geometry as the renderer.
 * @param options - exact Queue visibility, geometry, capabilities, and footer facts.
 * @returns immutable regions for the current Queue render generation.
 */
export function tuiQueuePointerRegions(options: TuiQueuePointerOptions): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const rows = Math.max(1, Math.floor(options.rows))
  if (!options.open) {
    if (options.collapsedRow === undefined) return Object.freeze([])
    return Object.freeze([Object.freeze({
      id: 'queue:open',
      rect: { left: 1, top: options.collapsedRow, right: columns, bottom: options.collapsedRow },
      context: options.context,
      priority: 35,
      action: { id: 'queue.open' as const },
    })])
  }
  const regions: TuiPointerRegion[] = []
  if (!options.detail && !options.editing && !options.confirmingDelete) {
    for (let offset = 0; offset < Math.max(0, options.visibleCount); offset += 1) {
      const top = 4 + offset * options.rowHeight
      regions.push({
        id: `queue:${options.visibleStart + offset}`,
        rect: { left: 2, top, right: Math.max(2, columns - 1), bottom: top + options.rowHeight - 1 },
        context: 'Dialog',
        priority: 35,
        action: { id: 'queue.accept', index: options.visibleStart + offset },
      })
    }
  }
  if (options.footerActions !== undefined) {
    appendFooterPointerRegions(
      regions, 'queue', options.footerActions, columns, rows, 'Dialog', options.footerLine,
    )
    return Object.freeze(regions.map(region => Object.freeze(region)))
  }
  if (options.editing || options.confirmingDelete) {
    regions.push({
      id: 'queue:accept',
      rect: { left: 1, top: rows, right: Math.max(1, Math.floor(columns / 2)), bottom: rows },
      context: 'Dialog', priority: 40, action: { id: 'queue.accept' },
    })
  } else if (options.detail) {
    const third = Math.max(1, Math.floor(columns / 3))
    if (options.canEdit) regions.push({
      id: 'queue:edit', rect: { left: 1, top: rows, right: third, bottom: rows },
      context: 'Dialog', priority: 40, action: { id: 'queue.edit' },
    })
    if (options.canDelete) regions.push({
      id: 'queue:delete', rect: { left: third + 1, top: rows, right: third * 2, bottom: rows },
      context: 'Dialog', priority: 40, action: { id: 'queue.delete' },
    })
  }
  regions.push({
    id: 'queue:close',
    rect: {
      left: options.editing || options.confirmingDelete ? Math.max(1, Math.floor(columns / 2) + 1)
        : options.detail ? Math.max(1, Math.floor(columns * 2 / 3) + 1) : 1,
      top: rows, right: columns, bottom: rows,
    },
    context: 'Dialog', priority: 30, action: { id: 'queue.close' },
  })
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/**
 * Map the complete one-line Goal/Plan strip to its keyboard-equivalent control dialog.
 * @param columns - complete terminal width.
 * @param row - one-based physical row containing the strip.
 * @param context - current non-modal interaction context.
 * @returns the single visible Goal/Plan open region.
 */
export function tuiGoalPlanPointerRegions(
  columns: number,
  row: number,
  context: Extract<TuiInteractionContext, 'Composer' | 'Transcript'>,
): readonly TuiPointerRegion[] {
  const right = Math.max(1, Math.floor(columns))
  const top = Math.max(1, Math.floor(row))
  return Object.freeze([Object.freeze({
    id: 'goalPlan:open',
    rect: { left: 1, top, right, bottom: top },
    context,
    priority: 38,
    action: { id: 'goalPlan.open' as const },
  })])
}

/**
 * Map visible Goal/Plan dialog footer actions to equal-width physical cells.
 * @param columns - complete terminal width.
 * @param rows - complete terminal height and footer row.
 * @param actions - rendered actions and their localized labels.
 * @returns immutable regions for actions that fit the rendered footer.
 */
export function tuiGoalPlanDialogPointerRegions(
  columns: number,
  rows: number,
  actions: readonly {
    readonly action: Extract<TuiPointerAction, { id: `goalPlan.${string}` }>
    readonly label: string
  }[],
): readonly TuiPointerRegion[] {
  const width = Math.max(1, Math.floor(columns))
  const row = Math.max(1, Math.floor(rows))
  let left = 3
  const regions: TuiPointerRegion[] = []
  for (const [index, item] of actions.entries()) {
    const right = Math.min(width - 2, left + Math.max(1, stringWidth(item.label)) - 1)
    if (left <= right) regions.push(Object.freeze({
      id: `goalPlan:dialog:${index}`,
      rect: { left, top: row, right, bottom: row },
      context: 'Dialog',
      priority: 40,
      action: item.action,
    }))
    left = right + 4
    if (left > width - 2) break
  }
  return Object.freeze(regions)
}

/** Inputs needed to map the Session Manager tabs, rows, and visible footer actions. */
export interface TuiSessionManagerPointerOptions {
  readonly columns: number
  readonly rows: number
  readonly listVisible: boolean
  readonly visibleStart: number
  readonly visibleCount: number
  readonly rowHeight: number
  /** First physical list row; defaults to the normal manager layout. */
  readonly rowTop?: number
  /** Whether the normal Sessions/Workspaces tabs are currently rendered. */
  readonly showTabs?: boolean
  /** Exact geometry of the localized Sessions/Workspaces labels. */
  readonly tabs?: {
    readonly row: number
    readonly left: number
    readonly labels: Readonly<Record<'sessions' | 'workspaces', string>>
  } | undefined
  readonly footerActions: readonly TuiPointerFooterAction[]
  readonly footerLine?: string | undefined
  readonly context: Extract<TuiInteractionContext, 'Dialog'>
}

/**
 * Build physical Session Manager hit regions from its fixed full-screen layout.
 * @param options - exact tabs, rows, footer, and dialog geometry.
 * @returns immutable regions for the current Session Manager render generation.
 */
export function tuiSessionManagerPointerRegions(
  options: TuiSessionManagerPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const rows = Math.max(1, Math.floor(options.rows))
  const regions: TuiPointerRegion[] = []
  if (options.showTabs !== false) {
    const labels = options.tabs?.labels ?? { sessions: 'Sessions', workspaces: 'Workspaces' }
    const row = options.tabs?.row ?? 4
    let left = options.tabs?.left ?? 3
    for (const tab of ['sessions', 'workspaces'] as const) {
      const width = stringWidth(labels[tab])
      if (width > 0 && left <= columns) {
        regions.push({
          id: `sessionManager:tab:${tab}`,
          rect: { left, top: row, right: Math.min(columns, left + width - 1), bottom: row },
          context: options.context,
          priority: 45,
          action: { id: 'sessionManager.tab', tab },
        })
      }
      left += width + stringWidth(' · ')
    }
  }
  if (options.listVisible) {
    for (let offset = 0; offset < Math.max(0, options.visibleCount); offset += 1) {
      const top = (options.rowTop ?? 9) + offset * options.rowHeight
      regions.push({
        id: `sessionManager:${options.visibleStart + offset}`,
        rect: { left: 2, top, right: Math.max(2, columns - 1), bottom: top + options.rowHeight - 1 },
        context: options.context,
        priority: 35,
        action: { id: 'sessionManager.accept', index: options.visibleStart + offset },
      })
    }
  }
  const actions = options.footerActions.length === 0
    ? [{ id: 'sessionManager.close' as const }]
    : options.footerActions
  appendFooterPointerRegions(regions, 'sessionManager', actions, columns, rows, options.context, options.footerLine)
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to map the Preset Manager rows and visible footer actions. */
export interface TuiPresetManagerPointerOptions {
  readonly columns: number
  readonly rows: number
  readonly listVisible: boolean
  readonly visibleStart: number
  readonly visibleCount: number
  readonly rowHeight: number
  /** First physical list row; defaults to the legacy fixed layout. */
  readonly listTop?: number | undefined
  readonly footerActions: readonly TuiPointerFooterAction[]
  readonly footerLine?: string | undefined
  readonly context: Extract<TuiInteractionContext, 'Dialog'>
}

/** Build physical Preset Manager hit regions from its fixed full-screen layout. */
export function tuiPresetManagerPointerRegions(
  options: TuiPresetManagerPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const rows = Math.max(1, Math.floor(options.rows))
  const regions: TuiPointerRegion[] = []
  if (options.listVisible) {
    for (let offset = 0; offset < Math.max(0, options.visibleCount); offset += 1) {
      const top = (options.listTop ?? 7) + offset * options.rowHeight
      regions.push({
        id: `presetManager:${options.visibleStart + offset}`,
        rect: { left: 2, top, right: Math.max(2, columns - 1), bottom: top + options.rowHeight - 1 },
        context: options.context,
        priority: 35,
        action: { id: 'presetManager.accept', index: options.visibleStart + offset },
      })
    }
  }
  const actions = options.footerActions.length === 0
    ? [{ id: 'presetManager.close' as const }]
    : options.footerActions
  appendFooterPointerRegions(regions, 'presetManager', actions, columns, rows, options.context, options.footerLine)
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to map the Trajectory ledger rows and visible footer actions. */
export interface TuiTrajectoryPointerOptions {
  readonly columns: number
  readonly rows: number
  readonly listVisible: boolean
  readonly visibleStart: number
  readonly visibleCount: number
  readonly rowHeight: number
  /** First physical row occupied by the list; defaults to the legacy fixed layout. */
  readonly listTop?: number | undefined
  /** Exact inspector-tab geometry, present only while detail is rendered. */
  readonly inspectorTabs?: {
    readonly row: number
    readonly left: number
    readonly labels: Readonly<Record<'summary' | 'input' | 'output' | 'timing', string>>
  } | undefined
  readonly footerActions: readonly TuiPointerFooterAction[]
  readonly footerLine?: string | undefined
  readonly context: Extract<TuiInteractionContext, 'Dialog'>
}

/** Build physical Trajectory hit regions from its fixed full-screen layout. */
export function tuiTrajectoryPointerRegions(
  options: TuiTrajectoryPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const rows = Math.max(1, Math.floor(options.rows))
  const regions: TuiPointerRegion[] = []
  if (options.inspectorTabs !== undefined) {
    const tabs = ['summary', 'input', 'output', 'timing'] as const
    let left = Math.max(1, Math.floor(options.inspectorTabs.left))
    for (const tab of tabs) {
      const width = stringWidth(options.inspectorTabs.labels[tab])
      if (width > 0 && left <= columns) {
        regions.push({
          id: `trajectory:tab:${tab}`,
          rect: {
            left,
            top: options.inspectorTabs.row,
            right: Math.min(columns, left + width - 1),
            bottom: options.inspectorTabs.row,
          },
          context: options.context,
          priority: 45,
          action: { id: 'trajectory.tab', tab },
        })
      }
      left += width + stringWidth(' · ')
    }
  }
  if (options.listVisible) {
    for (let offset = 0; offset < Math.max(0, options.visibleCount); offset += 1) {
      const top = (options.listTop ?? 7) + offset * options.rowHeight
      regions.push({
        id: `trajectory:${options.visibleStart + offset}`,
        rect: { left: 2, top, right: Math.max(2, columns - 1), bottom: top + options.rowHeight - 1 },
        context: options.context,
        priority: 35,
        action: { id: 'trajectory.accept', index: options.visibleStart + offset },
      })
    }
  }
  const actions = options.footerActions.length === 0
    ? [{ id: 'trajectory.close' as const }]
    : options.footerActions
  appendFooterPointerRegions(regions, 'trajectory', actions, columns, rows, options.context, options.footerLine)
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to map the Host Plugin Center rows and visible footer actions. */
export interface TuiHostPluginCenterPointerOptions {
  readonly columns: number
  readonly rows: number
  readonly listVisible: boolean
  readonly visibleStart: number
  readonly visibleCount: number
  readonly rowHeight: number
  /** First physical row occupied by the list; defaults to the legacy fixed layout. */
  readonly listTop?: number | undefined
  /** Exact geometry of the always-visible Loaded/Settings labels. */
  readonly tabs?: {
    readonly row: number
    readonly left: number
    readonly labels: Readonly<Record<'plugins' | 'settings', string>>
  } | undefined
  /** Visible editable field rows in a Settings detail panel. */
  readonly settingsFields?: {
    readonly rowTop: number
    readonly count: number
    readonly rowHeight: number
  } | undefined
  readonly footerActions: readonly TuiPointerFooterAction[]
  readonly footerLine?: string | undefined
  readonly context: Extract<TuiInteractionContext, 'Dialog'>
}

/** Build physical Host Plugin Center hit regions from its fixed full-screen layout. */
export function tuiHostPluginCenterPointerRegions(
  options: TuiHostPluginCenterPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const rows = Math.max(1, Math.floor(options.rows))
  const regions: TuiPointerRegion[] = []
  if (options.tabs !== undefined) {
    const tabs = ['plugins', 'settings'] as const
    let left = Math.max(1, Math.floor(options.tabs.left))
    for (const tab of tabs) {
      const width = stringWidth(options.tabs.labels[tab])
      if (width > 0 && left <= columns) {
        regions.push({
          id: `hostPlugins:tab:${tab}`,
          rect: {
            left,
            top: options.tabs.row,
            right: Math.min(columns, left + width - 1),
            bottom: options.tabs.row,
          },
          context: options.context,
          priority: 45,
          action: { id: 'hostPlugins.tab', tab },
        })
      }
      left += width + stringWidth(' · ')
    }
  }
  if (options.settingsFields !== undefined) {
    for (let index = 0; index < Math.max(0, options.settingsFields.count); index += 1) {
      const top = options.settingsFields.rowTop + index * options.settingsFields.rowHeight
      regions.push({
        id: `hostPlugins:field:${index}`,
        rect: {
          left: 2,
          top,
          right: Math.max(2, columns - 1),
          bottom: top + options.settingsFields.rowHeight - 1,
        },
        context: options.context,
        priority: 35,
        action: { id: 'hostPlugins.field', index },
      })
    }
  }
  if (options.listVisible) {
    for (let offset = 0; offset < Math.max(0, options.visibleCount); offset += 1) {
      const top = (options.listTop ?? 7) + offset * options.rowHeight
      regions.push({
        id: `hostPlugins:${options.visibleStart + offset}`,
        rect: { left: 2, top, right: Math.max(2, columns - 1), bottom: top + options.rowHeight - 1 },
        context: options.context,
        priority: 35,
        action: { id: 'hostPlugins.accept', index: options.visibleStart + offset },
      })
    }
  }
  const actions = options.footerActions.length === 0
    ? [{ id: 'hostPlugins.close' as const }]
    : options.footerActions
  appendFooterPointerRegions(regions, 'hostPlugins', actions, columns, rows, options.context, options.footerLine)
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

function finiteCell(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined
  const cell = Math.floor(value)
  return cell < 1 ? undefined : cell
}

function validRect(rect: TuiPointerRect): boolean {
  const left = finiteCell(rect.left)
  const top = finiteCell(rect.top)
  const right = finiteCell(rect.right)
  const bottom = finiteCell(rect.bottom)
  return left !== undefined && top !== undefined && right !== undefined && bottom !== undefined
    && left <= right && top <= bottom
}

function contains(rect: TuiPointerRect, point: TuiPointerPoint): boolean {
  return point.column >= rect.left && point.column <= rect.right
    && point.row >= rect.top && point.row <= rect.bottom
}

function area(rect: TuiPointerRect): number {
  return (rect.right - rect.left + 1) * (rect.bottom - rect.top + 1)
}

/**
 * Own the visible pointer hit regions for one TUI render generation.
 * Replacing a frame is atomic, so an event never dispatches a region removed by
 * resize, modal transition, Agent switch, or unmount.
 */
export class TuiPointerRegionRegistry {
  private currentGeneration = 0
  private currentRegions: readonly TuiPointerRegion[] = Object.freeze([])

  /** Current committed frame generation. */
  get generation(): number {
    return this.currentGeneration
  }

  /**
   * Return an immutable snapshot of the currently committed regions.
   * @returns the regions published for the current generation.
   */
  snapshot(): readonly TuiPointerRegion[] {
    return this.currentRegions
  }

  /**
   * Atomically publish a new committed frame.
   * @param regions - visible regions from the just-committed render.
   * @returns the new generation number.
   */
  replace(regions: readonly TuiPointerRegion[]): number {
    const next: TuiPointerRegion[] = []
    for (const region of regions) {
      if (!validRect(region.rect)) continue
      const priority = Number.isFinite(region.priority) ? Math.floor(region.priority) : 0
      next.push(Object.freeze({
        ...region,
        priority,
        rect: Object.freeze({
          left: finiteCell(region.rect.left) as number,
          top: finiteCell(region.rect.top) as number,
          right: finiteCell(region.rect.right) as number,
          bottom: finiteCell(region.rect.bottom) as number,
        }),
      }))
    }
    this.currentGeneration += 1
    this.currentRegions = Object.freeze(next)
    return this.currentGeneration
  }

  /**
   * Remove all current regions while advancing the generation.
   * @returns the new empty-frame generation number.
   */
  clear(): number {
    return this.replace([])
  }

  /**
   * Resolve one primary-button press against the current frame.
   * @param point - one-based terminal cell coordinates.
   * @param context - active interaction context, when known.
   * @returns the highest-priority containing region, or undefined.
   */
  hitTest(point: TuiPointerPoint, context?: TuiInteractionContext): TuiPointerHit | undefined {
    const column = finiteCell(point.column)
    const row = finiteCell(point.row)
    if (column === undefined || row === undefined) return undefined
    const candidates = this.currentRegions.filter(region =>
      (context === undefined || region.context === context) && contains(region.rect, { column, row }))
    candidates.sort((left, right) => right.priority - left.priority || area(left.rect) - area(right.rect))
    const region = candidates[0]
    return region === undefined ? undefined : Object.freeze({ generation: this.currentGeneration, region })
  }
}

/** Inputs needed to map feedback action hit targets on a transcript message row. */
export interface TuiFeedbackPointerOptions {
  readonly columns: number
  readonly row: number
  readonly hasFeedback: boolean
  readonly messageId: string
  readonly labels: {
    readonly like: string
    readonly dislike: string
    readonly note: string
    readonly clear: string
  }
  readonly context: Extract<TuiInteractionContext, 'Detail'>
}

/** Build feedback action hit regions for one assistant message row in the transcript. */
export function tuiFeedbackPointerRegions(
  options: TuiFeedbackPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const regions: TuiPointerRegion[] = []
  let left = 3
  const actions: readonly {
    readonly id: 'feedback.like' | 'feedback.dislike' | 'feedback.clear' | 'feedback.note'
    readonly label: string
  }[] = [
    { id: 'feedback.like', label: options.labels.like },
    { id: 'feedback.dislike', label: options.labels.dislike },
    ...(options.hasFeedback ? [
      { id: 'feedback.note' as const, label: options.labels.note },
      { id: 'feedback.clear' as const, label: options.labels.clear },
    ] : []),
  ]
  for (const action of actions) {
    const buttonWidth = stringWidth(action.label)
    if (left > columns - 2) break
    const right = Math.min(columns - 2, left + Math.max(1, buttonWidth) - 1)
    regions.push({
      id: `${action.id}:${options.messageId}:${options.row}`,
      rect: { left, top: options.row, right, bottom: options.row },
      context: options.context,
      priority: 25,
      action: { id: action.id, messageId: options.messageId },
    })
    left = right + 4
  }
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to map visible deliverable path rows in transcript detail. */
export interface TuiDeliverablesPointerOptions {
  readonly columns: number
  readonly startRow: number
  readonly visibleStart: number
  readonly visibleCount: number
  readonly total: number
  readonly context: Extract<TuiInteractionContext, 'Detail'>
}

/** Build one drill-down hit target for each visible tool-activity list row. */
export function tuiActivityPointerRegions(options: {
  readonly columns: number
  readonly startRow: number
  readonly visibleStart: number
  readonly visibleCount: number
  readonly total: number
  readonly context: Extract<TuiInteractionContext, 'Detail'>
}): readonly TuiPointerRegion[] {
  const right = Math.max(3, Math.floor(options.columns) - 2)
  const count = Math.max(0, Math.min(options.visibleCount, options.total - options.visibleStart))
  return Object.freeze(Array.from({ length: count }, (_, offset) => Object.freeze({
    id: `activity:open:${options.visibleStart + offset}`,
    rect: {
      left: 3,
      top: options.startRow + offset,
      right,
      bottom: options.startRow + offset,
    },
    context: options.context,
    priority: 25,
    action: { id: 'activity.open' as const, index: options.visibleStart + offset },
  })))
}

/** Build one Host-open hit target for each visible delivered path. */
export function tuiDeliverablesPointerRegions(
  options: TuiDeliverablesPointerOptions,
): readonly TuiPointerRegion[] {
  const right = Math.max(3, Math.floor(options.columns) - 2)
  const count = Math.max(0, Math.min(options.visibleCount, options.total - options.visibleStart))
  return Object.freeze(Array.from({ length: count }, (_, offset) => Object.freeze({
    id: `deliverables:open:${options.visibleStart + offset}`,
    rect: {
      left: 3,
      top: options.startRow + offset,
      right,
      bottom: options.startRow + offset,
    },
    context: options.context,
    priority: 25,
    action: { id: 'deliverables.open' as const, index: options.visibleStart + offset },
  })))
}

/** Inputs needed to map the visible Deliverables action line. */
export interface TuiDeliverableActionPointerOptions {
  readonly columns: number
  readonly row: number
  readonly line: string
  readonly copyLabel: string
  readonly openLabel?: string | undefined
  readonly context: Extract<TuiInteractionContext, 'Detail'>
}

/** Build exact Copy/Open hit regions for the selected delivered path. */
export function tuiDeliverableActionPointerRegions(
  options: TuiDeliverableActionPointerOptions,
): readonly TuiPointerRegion[] {
  const regions: TuiPointerRegion[] = []
  appendFooterPointerRegions(
    regions,
    'deliverables:action',
    [
      { action: { id: 'deliverables.copy' }, label: options.copyLabel },
      ...(options.openLabel === undefined ? [] : [{
        action: { id: 'deliverables.open' as const }, label: options.openLabel,
      }]),
    ],
    Math.max(1, Math.floor(options.columns)),
    Math.max(1, Math.floor(options.row)),
    options.context,
    options.line,
  )
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** One inline deliverable reference attached to its assistant transcript block. */
export interface TuiDeliverableInlinePointerReference extends TuiDeliverableInlineReference {
  /** Semantic transcript block whose rendered cells contain the inline code. */
  readonly semanticBlockKey: string
}

/** Inputs needed to map verified inline deliverable text across wrapped screen rows. */
export interface TuiDeliverableInlinePointerOptions {
  readonly map: TuiScreenMap
  /** One-based terminal row occupied by map row zero. */
  readonly topRow: number
  readonly references: readonly TuiDeliverableInlinePointerReference[]
  readonly openerAvailable: boolean
  readonly context: Extract<TuiInteractionContext, 'Composer' | 'Transcript'>
}

interface InlineScreenCell {
  readonly row: number
  readonly column: number
  readonly start: number
  readonly end: number
}

/**
 * Map only owner-proven closing-message inline paths to exact rendered cells.
 * Soft-wrapped paths may produce one region per physical row; ordinary prose,
 * gutters, padding, and non-selectable headings never receive a path action.
 */
export function tuiDeliverableInlinePointerRegions(
  options: TuiDeliverableInlinePointerOptions,
): readonly TuiPointerRegion[] {
  const regions: TuiPointerRegion[] = []
  const keys = new Set(options.references.map(reference => reference.semanticBlockKey))
  for (const key of keys) {
    let text = ''
    const cells: InlineScreenCell[] = []
    let previousMapRow: TuiScreenMap['rows'][number] | undefined
    for (const row of options.map.rows) {
      if (row.semanticBlockKey !== key
        || !row.cells.some(cell => cell.source === 'text' && cell.selectable)) continue
      if (previousMapRow !== undefined && !previousMapRow.softWrap) text += '\n'
      for (const [column, cell] of row.cells.entries()) {
        if (cell.source !== 'text' || !cell.selectable || cell.continuation || cell.grapheme === '') continue
        const start = text.length
        text += cell.grapheme
        cells.push(Object.freeze({ row: row.row, column, start, end: text.length }))
      }
      previousMapRow = row
    }
    for (const [referenceIndex, reference] of options.references.entries()) {
      if (reference.semanticBlockKey !== key || reference.text === '') continue
      let searchStart = 0
      for (let occurrence = 0; occurrence < 64;) {
        const matchStart = text.indexOf(reference.text, searchStart)
        if (matchStart < 0) break
        const matchEnd = matchStart + reference.text.length
        const matched = cells.filter(cell => cell.end > matchStart && cell.start < matchEnd)
        let group: InlineScreenCell[] = []
        const publish = (): void => {
          if (group.length === 0) return
          const first = group.at(0)
          const last = group.at(-1)
          if (first === undefined || last === undefined) return
          const top = Math.max(1, Math.floor(options.topRow + first.row))
          regions.push({
            id: `deliverables:inline:${referenceIndex}:${occurrence}:${first.row}`,
            rect: {
              left: first.column + 1,
              top,
              right: last.column + 1,
              bottom: top,
            },
            context: options.context,
            priority: 46,
            action: {
              id: 'deliverables.inline',
              path: reference.path,
              mode: options.openerAvailable ? 'open' : 'copy',
            },
          })
          group = []
        }
        for (const cell of matched) {
          const previous = group.at(-1)
          if (previous !== undefined && (previous.row !== cell.row || previous.column + 1 !== cell.column)) publish()
          group.push(cell)
        }
        publish()
        occurrence += 1
        searchStart = matchEnd
      }
    }
  }
  return Object.freeze(regions.map(region => Object.freeze(region)))
}

/** Inputs needed to map attachment rail remove buttons. */
export interface TuiAttachmentRailPointerOptions {
  readonly columns: number
  readonly startRow: number
  readonly count: number
  readonly left?: number
  readonly right?: number
  readonly context: Extract<TuiInteractionContext, 'Composer' | 'Dialog'>
}

/** Build attachment rail hit regions for the remove button on each chip. */
export function tuiAttachmentRailPointerRegions(
  options: TuiAttachmentRailPointerOptions,
): readonly TuiPointerRegion[] {
  const columns = Math.max(1, Math.floor(options.columns))
  const leftBound = Math.max(1, Math.min(columns, Math.floor(options.left ?? 1)))
  const rightBound = Math.max(leftBound, Math.min(columns, Math.floor(options.right ?? columns)))
  const regions: TuiPointerRegion[] = []
  for (let i = 0; i < options.count; i += 1) {
    const row = options.startRow + i
    const removeLeft = Math.max(leftBound, rightBound - 4)
    regions.push({
      id: `attachment:remove:${i}`,
      rect: { left: removeLeft, top: row, right: rightBound, bottom: row },
      context: options.context,
      priority: 25,
      action: { id: 'attachment.remove', index: i },
    })
  }
  return Object.freeze(regions.map(region => Object.freeze(region)))
}
