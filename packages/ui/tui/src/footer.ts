/** Pure actionable-footer descriptors and width-bounded projections. */

import stringWidth from 'string-width'
import type {
  AgentPreset,
  ContextBreakdownProjection,
  ContextPressureProjection,
  ModelSelection,
  PermissionSelect,
  SessionStatsProjection,
  TokenUsageProjection,
} from './host.ts'
import { terminalSafe } from './sanitize.ts'
import { tuiMessage, type TuiLocale } from './locale.ts'
import { tuiAgentModeDescription, tuiAgentModeName } from './mode.ts'
import type { TuiWorkSummary } from './work.ts'
import type { TuiSpeedProjection } from './live-feedback.ts'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Stable action targets exposed by the native TUI footer. */
export type TuiFooterItemId = 'model' | 'mode' | 'permission' | 'work' | 'speed' | 'context' | 'workspace' | 'transcript'

/** One actionable status item derived from authoritative runtime state. */
export interface TuiFooterItemDescriptor {
  /** Stable package-owned item identity. */
  readonly id: TuiFooterItemId
  /** Short label retained when the footer is narrow. */
  readonly label: string
  /** Compact current value shown in the status row. */
  readonly value: string
  /** Enter behavior for this item. */
  readonly action: 'models' | 'modes' | 'permissions' | 'work' | 'detail' | 'bottom'
  /** Complete read-only detail shown for local status items. */
  readonly detailLines: readonly string[]
}

/** One visible footer item span measured from the status row's content origin. */
export interface TuiFooterPointerTarget {
  /** Stable footer item identity. */
  readonly itemId: TuiFooterItemId
  /** Zero-based inclusive start cell within the status row content. */
  readonly left: number
  /** Zero-based inclusive end cell within the status row content. */
  readonly right: number
}

/** Current viewport position needed by the transcript footer item. */
export interface TuiFooterTranscriptPosition {
  /** Zero-based first mounted transcript node, or -1 when empty. */
  readonly startIndex: number
  /** Zero-based last mounted transcript node, or -1 when empty. */
  readonly endIndex: number
  /** Complete projected transcript node count. */
  readonly total: number
  /** Whether content exists above the mounted page. */
  readonly hasOlder: boolean
  /** Whether content exists below the mounted page. */
  readonly hasNewer: boolean
}

/** Authoritative values from which the current footer is projected. */
export interface TuiFooterSources {
  /** Selection used by the active request or the next request. */
  readonly modelSelection?: ModelSelection | undefined
  /** Whether the selection describes a captured running request. */
  readonly modelSelectionKind: 'running request' | 'next request'
  /** Agent preset composed for the active Session. */
  readonly agentPreset?: AgentPreset | undefined
  /** Effective permission select, absent when the capability is not composed. */
  readonly permissions?: PermissionSelect | undefined
  /** Provider-anchored approximate context occupancy. */
  readonly context?: ContextPressureProjection | undefined
  /** Durable provider usage buckets for the latest complete Session log. */
  readonly tokenUsage?: TokenUsageProjection | undefined
  /** Heuristic composition of the next request context. */
  readonly contextBreakdown?: ContextBreakdownProjection | undefined
  /** Whole-log settled model timing and decode facts. */
  readonly sessionStats?: SessionStatsProjection | undefined
  /** Latest-step or settled decode speed, with explicit approximation semantics. */
  readonly speed?: TuiSpeedProjection | undefined
  /** Authoritative background-work counters. */
  readonly work?: TuiWorkSummary | undefined
  /** Full Session workspace path. */
  readonly workspace?: string | undefined
  /** Current mounted transcript page. */
  readonly transcript: TuiFooterTranscriptPosition
}

/**
 * Project current authoritative state into stable actionable footer items.
 * @param sources - model, permission, context, workspace, and viewport facts.
 * @param locale - active TUI locale; defaults to English for non-UI callers.
 * @returns immutable items in navigation order; unavailable context is omitted.
 */
export function tuiFooterItems(
  sources: TuiFooterSources,
  locale: TuiLocale = 'en',
): readonly TuiFooterItemDescriptor[] {
  const items: TuiFooterItemDescriptor[] = []
  const selection = sources.modelSelection
  if (selection !== undefined) {
    const effort = selection.reasoningEffort
    items.push(item(
      'model',
      tuiMessage(locale, 'footer.label.model'),
      effort === undefined ? selection.model : `${selection.model}/${effort}`,
      'models',
      [
        tuiMessage(locale, 'footer.model.selection', {
          selection: tuiMessage(locale, sources.modelSelectionKind === 'running request'
            ? 'footer.model.selection.running'
            : 'footer.model.selection.next'),
        }),
        tuiMessage(locale, 'footer.model.provider', { provider: selection.provider }),
        tuiMessage(locale, 'footer.model.model', { model: selection.model }),
        tuiMessage(locale, 'footer.model.effort', {
          effort: effort ?? tuiMessage(locale, 'footer.model.default'),
        }),
      ],
    ))
  }

  const preset = sources.agentPreset
  if (preset !== undefined) {
    const name = tuiAgentModeName(preset, locale)
    const description = tuiAgentModeDescription(preset, locale)
    items.push(item(
      'mode',
      tuiMessage(locale, 'footer.label.mode'),
      name,
      'modes',
      [
        tuiMessage(locale, 'footer.mode.current', { mode: name, id: preset.id }),
        tuiMessage(locale, 'footer.mode.kind', {
          kind: tuiMessage(locale, preset.trust === 'system' ? 'mode.kind.system' : 'mode.kind.user'),
        }),
        ...description === undefined ? [] : [description],
      ],
    ))
  }

  const permissions = sources.permissions
  if (permissions !== undefined) {
    const current = permissions.options.find(option => option.value === permissions.currentValue)
    items.push(item(
      'permission',
      tuiMessage(locale, 'footer.label.permission'),
      current?.name ?? permissions.currentValue,
      'permissions',
      [
        tuiMessage(locale, 'footer.permission.current', { preset: current?.name ?? permissions.currentValue }),
        ...current?.description === undefined ? [] : [current.description],
        tuiMessage(locale, 'footer.permission.available', {
          presets: permissions.options.filter(option => option.value !== 'custom').map(option => option.name).join(', '),
        }),
      ],
    ))
  }

  const work = sources.work
  if (work !== undefined && work.total > 0) {
    const value = work.failed > 0
      ? tuiMessage(locale, 'footer.work.compact.failed', {
        running: work.running, queued: work.queued, failed: work.failed,
      })
      : work.queued > 0 ? tuiMessage(locale, 'footer.work.compact.queued', {
        running: work.running, queued: work.queued,
      })
        : tuiMessage(locale, 'footer.work.value', { count: work.running })
    items.push(item(
      'work',
      tuiMessage(locale, 'footer.label.work'),
      value,
      'work',
      [
        tuiMessage(locale, 'footer.work.running', { count: work.running }),
        tuiMessage(locale, 'footer.work.queued', { count: work.queued }),
        tuiMessage(locale, 'footer.work.failed', { count: work.failed }),
        tuiMessage(locale, 'footer.work.visible', { count: work.total }),
      ],
    ))
  }

  const speed = sources.speed
  if (speed !== undefined) {
    items.push(item(
      'speed',
      'TPS',
      `${speed.approximate ? '~' : ''}${speed.tokensPerSecond.toFixed(1)}${speed.trend === '' ? '' : ` ${speed.trend}`}`,
      'detail',
      [
        tuiMessage(locale, speed.approximate ? 'footer.speed.live' : 'footer.speed.settled', {
          throughput: speed.tokensPerSecond.toFixed(1), tokens: formatTokens(speed.tokens),
          seconds: (speed.elapsedMs / 1_000).toFixed(1),
        }),
        ...speed.approximate ? [tuiMessage(locale, 'footer.speed.estimate')] : [],
      ],
    ))
  }

  const context = sources.context
  const used = context?.projectedTokens ?? context?.pressureTokens
  const capacity = context?.contextWindow
  if (used !== undefined && capacity !== undefined && capacity > 0) {
    const boundedUsed = Math.max(0, used)
    const percent = Math.round((boundedUsed / capacity) * 100)
    const kind = tuiMessage(locale, context?.projectedTokens === undefined
      ? 'footer.context.kind.last'
      : 'footer.context.kind.next')
    items.push(item(
      'context',
      tuiMessage(locale, 'footer.label.context'),
      `~${percent}%${sources.contextBreakdown === undefined ? '' : ` ${tuiContextSegmentBar(sources.contextBreakdown)}`}`,
      'detail',
      [
        tuiMessage(locale, 'footer.context.approximate', { kind, tokens: formatTokens(boundedUsed) }),
        tuiMessage(locale, 'footer.context.window', { tokens: formatTokens(capacity) }),
        tuiMessage(locale, 'footer.context.remaining', { tokens: formatTokens(Math.max(0, capacity - boundedUsed)) }),
        tuiMessage(locale, 'footer.context.estimate'),
        ...sources.contextBreakdown === undefined ? [] : [tuiMessage(locale, 'footer.context.bar')],
        ...contextBreakdownLines(sources.contextBreakdown, locale),
        ...tokenUsageLines(sources.tokenUsage, locale),
        ...sessionTimingLines(sources.sessionStats, locale),
      ],
    ))
  }

  if (sources.workspace !== undefined) {
    items.push(item(
      'workspace',
      tuiMessage(locale, 'footer.label.workspace'),
      pathLabel(sources.workspace),
      'detail',
      [tuiMessage(locale, 'footer.workspace', { workspace: sources.workspace })],
    ))
  }

  const position = sources.transcript
  const range = position.total === 0 || position.startIndex < 0 || position.endIndex < 0
    ? '0/0'
    : `${position.startIndex + 1}-${position.endIndex + 1}/${position.total}`
  const newerCount = position.hasNewer ? Math.max(0, position.total - position.endIndex - 1) : 0
  const positionValue = `${position.hasOlder ? '↑' : ''}${range}${newerCount > 0 ? `↓${newerCount}` : ''}`
  items.push(item(
    'transcript',
    tuiMessage(locale, 'footer.label.transcript'),
    positionValue,
    newerCount > 0 ? 'bottom' : 'detail',
    [
      tuiMessage(locale, 'footer.transcript.mounted', { range }),
      tuiMessage(locale, 'footer.transcript.older', {
        value: tuiMessage(locale, position.hasOlder ? 'footer.transcript.available' : 'footer.transcript.none'),
      }),
      tuiMessage(locale, 'footer.transcript.newer', {
        value: tuiMessage(locale, position.hasNewer ? 'footer.transcript.available' : 'footer.transcript.none'),
      }),
      tuiMessage(locale, 'footer.transcript.truth'),
    ],
  ))
  return Object.freeze(items)
}

/**
 * Hide lower-priority items at narrow widths while preserving model and permission.
 * @param items - complete current footer item list.
 * @param columns - physical cells available to the footer row.
 * @returns the navigable items mounted at this width.
 */
export function visibleTuiFooterItems(
  items: readonly TuiFooterItemDescriptor[],
  columns: number,
): readonly TuiFooterItemDescriptor[] {
  const allowed: readonly TuiFooterItemId[] = columns < 56
    ? ['model', 'mode', 'work', 'permission']
    : columns < 78
      ? ['model', 'mode', 'work', 'permission', 'context', 'transcript']
      : ['model', 'mode', 'work', 'permission', 'speed', 'context', 'workspace', 'transcript']
  const visible = items.filter(candidate => allowed.includes(candidate.id))
  return Object.freeze(visible.length === 0 ? items.slice(0, 1) : visible)
}

/**
 * Move a footer selection without depending on React state.
 * @param items - current visible footer items.
 * @param selected - current item id, possibly stale after capability changes.
 * @param direction - previous or next navigation.
 * @returns the selected id after cyclic movement, or undefined for no items.
 */
export function moveTuiFooterSelection(
  items: readonly TuiFooterItemDescriptor[],
  selected: TuiFooterItemId | undefined,
  direction: 'previous' | 'next',
): TuiFooterItemId | undefined {
  if (items.length === 0) return undefined
  const current = items.findIndex(item => item.id === selected)
  const index = current < 0 ? 0 : current
  const delta = direction === 'previous' ? -1 : 1
  return items[(index + delta + items.length) % items.length]?.id
}

/**
 * Format every mounted item into one physical row.
 * @param items - visible footer items.
 * @param columns - complete row budget in terminal cells.
 * @returns one row no wider than the supplied budget.
 */
export function tuiFooterStatusLine(
  items: readonly TuiFooterItemDescriptor[],
  columns: number,
): string {
  return footerStatusSegments(items, columns).map(segment => segment.text).join(' | ')
}

/**
 * Resolve the visible footer item spans using the exact status-row width policy.
 * Separator cells are intentionally excluded so a click between items does not
 * activate either adjacent status item.
 *
 * @param items - visible footer items.
 * @param columns - physical status-row budget.
 * @returns rendered item text and cell spans.
 */
function footerStatusSegments(
  items: readonly TuiFooterItemDescriptor[],
  columns: number,
): readonly { readonly itemId: TuiFooterItemId; readonly text: string; readonly width: number }[] {
  if (items.length === 0 || columns <= 0) return []
  const separator = ' | '
  const separators = separator.length * Math.max(0, items.length - 1)
  const available = Math.max(items.length, columns - separators)
  const texts = items.map(item => `${item.label} ${item.value}`)
  const budgets = items.map((item, index) => Math.min(
    stringWidth(texts[index] ?? ''),
    stringWidth(item.label) + 2,
  ))
  let remaining = Math.max(0, available - budgets.reduce((total, value) => total + value, 0))
  for (const id of ['work', 'speed', 'transcript', 'context'] as const) {
    const index = items.findIndex(item => item.id === id)
    if (index < 0) continue
    const wanted = Math.max(0, stringWidth(texts[index] ?? '') - (budgets[index] ?? 0))
    const growth = Math.min(remaining, wanted)
    budgets[index] = (budgets[index] ?? 0) + growth
    remaining -= growth
  }
  while (remaining > 0) {
    let grew = false
    for (let index = 0; index < items.length && remaining > 0; index += 1) {
      if ((budgets[index] ?? 0) >= stringWidth(texts[index] ?? '')) continue
      budgets[index] = (budgets[index] ?? 0) + 1
      remaining -= 1
      grew = true
    }
    if (!grew) break
  }
  const rendered = texts.map((text, index) => truncateCells(text, budgets[index] ?? 1))
  const clipped = truncateCells(rendered.join(separator), columns)
  const clippedWidth = stringWidth(clipped)
  const segments: { itemId: TuiFooterItemId; text: string; width: number }[] = []
  let offset = 0
  for (let index = 0; index < rendered.length; index += 1) {
    if (offset >= clippedWidth) break
    const width = Math.min(stringWidth(rendered[index] ?? ''), clippedWidth - offset)
    if (width > 0) {
      segments.push({
        itemId: items[index]?.id ?? 'model',
        text: truncateCells(rendered[index] ?? '', width),
        width,
      })
    }
    offset += stringWidth(rendered[index] ?? '') + (index === rendered.length - 1 ? 0 : stringWidth(separator))
  }
  return Object.freeze(segments.map(segment => Object.freeze(segment)))
}

/**
 * Return clickable spans for the mounted footer status row.
 * @param items - visible footer items.
 * @param columns - physical status-row budget.
 * @returns immutable zero-based content offsets.
 */
export function tuiFooterPointerTargets(
  items: readonly TuiFooterItemDescriptor[],
  columns: number,
): readonly TuiFooterPointerTarget[] {
  const targets: TuiFooterPointerTarget[] = []
  let offset = 0
  for (const segment of footerStatusSegments(items, columns)) {
    targets.push(Object.freeze({
      itemId: segment.itemId,
      left: offset,
      right: offset + segment.width - 1,
    }))
    offset += segment.width + 3
  }
  return Object.freeze(targets)
}

/**
 * Format one selected item with its navigation position.
 * @param items - visible footer items.
 * @param selected - current item id, possibly stale after a width change.
 * @param columns - complete row budget in terminal cells.
 * @param locale - active TUI locale; defaults to English for non-UI callers.
 * @returns one selected-item row no wider than the supplied budget.
 */
export function tuiSelectedFooterLine(
  items: readonly TuiFooterItemDescriptor[],
  selected: TuiFooterItemId | undefined,
  columns: number,
  locale: TuiLocale = 'en',
): string {
  if (items.length === 0) return ''
  const index = Math.max(0, items.findIndex(item => item.id === selected))
  const current = items[index] ?? items[0]
  if (current === undefined) return ''
  return truncateCells(tuiMessage(locale, 'footer.selected', {
    position: index + 1, total: items.length, label: current.label, value: current.value,
  }), columns)
}

function item(
  id: TuiFooterItemId,
  label: string,
  value: string,
  action: TuiFooterItemDescriptor['action'],
  detailLines: readonly string[],
): TuiFooterItemDescriptor {
  return Object.freeze({
    id,
    label: terminalSafe(label),
    value: terminalSafe(value),
    action,
    detailLines: Object.freeze(detailLines.map(line => terminalSafe(line))),
  })
}

function pathLabel(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path
}

function formatTokens(tokens: number): string {
  return String(Math.round(tokens)).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
}

/**
 * Build a system/tools/messages composition bar using largest remainders.
 * @param breakdown - approximate token composition from the Host projection.
 * @param cells - fixed number of rendered composition cells.
 * @returns one bracketed S/T/M segment bar.
 */
export function tuiContextSegmentBar(
  breakdown: ContextBreakdownProjection,
  cells = 8,
): string {
  const count = Math.max(1, Math.floor(cells))
  const values = [breakdown.systemTokens, breakdown.toolsTokens, breakdown.messageTokens]
    .map(value => Math.max(0, value))
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return `[${'·'.repeat(count)}]`
  const exact = values.map(value => value * count / total)
  const allocated = exact.map(value => Math.floor(value))
  let remaining = count - allocated.reduce((sum, value) => sum + value, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const entry of order) {
    if (remaining <= 0) break
    allocated[entry.index] = (allocated[entry.index] ?? 0) + 1
    remaining -= 1
  }
  return `[${'S'.repeat(allocated[0] ?? 0)}${'T'.repeat(allocated[1] ?? 0)}${'M'.repeat(allocated[2] ?? 0)}]`
}

function contextBreakdownLines(
  breakdown: ContextBreakdownProjection | undefined,
  locale: TuiLocale,
): readonly string[] {
  if (breakdown === undefined) return []
  return [
    tuiMessage(locale, 'footer.context.composition', {
      system: formatTokens(breakdown.systemTokens),
      tools: formatTokens(breakdown.toolsTokens),
      messages: formatTokens(breakdown.messageTokens),
    }),
    tuiMessage(locale, 'footer.context.heuristic'),
  ]
}

function tokenUsageLines(usage: TokenUsageProjection | undefined, locale: TuiLocale): readonly string[] {
  if (usage === undefined) return []
  const promptTokens = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const totalTokens = promptTokens + usage.outputTokens
  if (totalTokens <= 0) return []
  const cacheLines = usage.cacheReadTokens > 0 && promptTokens > 0
    ? [tuiMessage(locale, 'footer.usage.cacheHit', {
      cached: formatTokens(usage.cacheReadTokens),
      prompt: formatTokens(promptTokens),
      percent: Math.round((usage.cacheReadTokens / promptTokens) * 100),
    })]
    : []
  return [
    tuiMessage(locale, 'footer.usage.inputOutput', {
      input: formatTokens(usage.uncachedInputTokens), output: formatTokens(usage.outputTokens),
    }),
    ...usage.cacheWriteTokens > 0 ? [tuiMessage(locale, 'footer.usage.cacheWrite', {
      tokens: formatTokens(usage.cacheWriteTokens),
    })] : [],
    ...cacheLines,
  ]
}

function sessionTimingLines(stats: SessionStatsProjection | undefined, locale: TuiLocale): readonly string[] {
  if (stats === undefined) return []
  const lines: string[] = []
  if (stats.ttftSteps > 0 && stats.ttftMs >= 0) {
    lines.push(tuiMessage(locale, 'footer.timing.ttft', {
      milliseconds: Math.round(stats.ttftMs / stats.ttftSteps), steps: stats.ttftSteps,
    }))
  }
  if (stats.decodeTokens > 0 && stats.decodeMs > 0) {
    const throughput = stats.decodeTokens * 1_000 / stats.decodeMs
    lines.push(tuiMessage(locale, 'footer.timing.decode', {
      throughput: throughput.toFixed(1), tokens: formatTokens(stats.decodeTokens),
    }))
  }
  return lines
}

function truncateCells(text: string, columns: number): string {
  if (columns <= 0) return ''
  if (stringWidth(text) <= columns) return text
  if (columns === 1) return '…'
  let result = ''
  for (const segment of graphemes.segment(text)) {
    if (stringWidth(result + segment.segment) > columns - 1) break
    result += segment.segment
  }
  return `${result}…`
}
