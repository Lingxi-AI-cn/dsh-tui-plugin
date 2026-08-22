/** Render-generation-bound terminal pointer regions and typed UI actions. */

import type { TuiInteractionContext } from './keybindings.ts'
import { tuiFooterPointerTargets, type TuiFooterItemId, type TuiFooterItemDescriptor } from './footer.ts'

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
    readonly id: 'footer.activate'
    readonly itemId: TuiFooterItemId
  }
  | {
    readonly id: 'work.select'
    readonly index: number
  }
  | {
    readonly id: 'pluginHub.toggleView'
    readonly targetView: 'discover' | 'installed'
  }
  | {
    readonly id: 'pluginHub.accept'
    readonly index?: number | undefined
  }
  | {
    readonly id: 'pluginHub.close'
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
    readonly id: 'resume.close'
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
 * @returns immutable work selection regions.
 */
export function tuiWorkPointerRegions(
  itemCount: number,
  selectedIndex: number,
  maxRows: number,
  columns: number,
  context: Extract<TuiInteractionContext, 'Work'>,
): readonly TuiPointerRegion[] {
  const count = Math.max(0, Math.floor(itemCount))
  const capacity = Math.max(1, Math.floor(maxRows) - 4)
  const visible = Math.min(count, capacity)
  const selected = count === 0 ? 0 : Math.min(Math.max(0, Math.floor(selectedIndex)), count - 1)
  const start = Math.max(0, Math.min(selected - Math.floor(capacity / 2), count - capacity))
  const right = Math.max(1, Math.floor(columns) - 2)
  return Object.freeze(Array.from({ length: visible }, (_, offset) => Object.freeze({
    id: `work:${start + offset}`,
    rect: { left: 2, top: offset + 2, right, bottom: offset + 2 },
    context,
    priority: 20,
    action: { id: 'work.select' as const, index: start + offset },
  })))
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
  readonly view: 'discover' | 'installed'
  /** Current controller phase. */
  readonly phase: 'loading' | 'browse' | 'detail-loading' | 'detail' | 'planning' | 'confirm' | 'staging' | 'handoff' | 'error'
  /** Index of the first row mounted in the current list window. */
  readonly visibleStart: number
  /** Bounded row heights for the mounted list slice. */
  readonly rowHeights: readonly number[]
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
    regions.push(
      {
        id: 'pluginHub:discover-tab',
        rect: { left: 3, top: 3, right: 9, bottom: 3 },
        context: options.context,
        priority: 40,
        action: { id: 'pluginHub.toggleView', targetView: 'discover' },
      },
      {
        id: 'pluginHub:installed-tab',
        rect: { left: 13, top: 3, right: 20, bottom: 3 },
        context: options.context,
        priority: 40,
        action: { id: 'pluginHub.toggleView', targetView: 'installed' },
      },
    )
  }
  if (options.phase === 'browse' && !options.detail && !options.confirmation) {
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
      action: { id: 'pluginHub.close' },
    })
  } else if (options.phase === 'confirm') {
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
  return Object.freeze(regions.map(region => Object.freeze(region)))
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
  if (options.phase !== 'ready' || options.confirmation) return Object.freeze([])
  regions.push(
    {
      id: 'resume:workspace-scope',
      rect: { left: 3, top: 4, right: 20, bottom: 4 },
      context: options.context,
      priority: 40,
      action: { id: 'resume.scope', scope: 'workspace' },
    },
    {
      id: 'resume:all-scope',
      rect: { left: 22, top: 4, right: 38, bottom: 4 },
      context: options.context,
      priority: 40,
      action: { id: 'resume.scope', scope: 'all' },
    },
  )
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
  if (options.previewVisible || options.listVisible) {
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
