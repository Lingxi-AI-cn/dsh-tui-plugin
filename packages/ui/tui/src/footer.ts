/** Pure actionable-footer descriptors and width-bounded projections. */

import stringWidth from 'string-width'
import type { ContextPressureProjection, ModelSelection, PermissionSelect } from './host.ts'
import { terminalSafe } from './sanitize.ts'
import type { TuiWorkSummary } from './work.ts'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Stable action targets exposed by the native TUI footer. */
export type TuiFooterItemId = 'model' | 'permission' | 'work' | 'context' | 'workspace' | 'transcript'

/** One actionable status item derived from authoritative runtime state. */
export interface TuiFooterItemDescriptor {
  /** Stable package-owned item identity. */
  readonly id: TuiFooterItemId
  /** Short label retained when the footer is narrow. */
  readonly label: string
  /** Compact current value shown in the status row. */
  readonly value: string
  /** Enter behavior for this item. */
  readonly action: 'models' | 'permissions' | 'work' | 'detail'
  /** Complete read-only detail shown for local status items. */
  readonly detailLines: readonly string[]
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
  /** Effective permission select, absent when the capability is not composed. */
  readonly permissions?: PermissionSelect | undefined
  /** Provider-anchored approximate context occupancy. */
  readonly context?: ContextPressureProjection | undefined
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
 * @returns immutable items in navigation order; unavailable context is omitted.
 */
export function tuiFooterItems(sources: TuiFooterSources): readonly TuiFooterItemDescriptor[] {
  const items: TuiFooterItemDescriptor[] = []
  const selection = sources.modelSelection
  if (selection !== undefined) {
    const effort = selection.reasoningEffort
    items.push(item(
      'model',
      'model',
      effort === undefined ? selection.model : `${selection.model}/${effort}`,
      'models',
      [
        `Selection: ${sources.modelSelectionKind}`,
        `Provider: ${selection.provider}`,
        `Model: ${selection.model}`,
        `Reasoning effort: ${effort ?? 'provider default'}`,
      ],
    ))
  }

  const permissions = sources.permissions
  if (permissions !== undefined) {
    const current = permissions.options.find(option => option.value === permissions.currentValue)
    items.push(item(
      'permission',
      'perm',
      current?.name ?? permissions.currentValue,
      'permissions',
      [
        `Current preset: ${current?.name ?? permissions.currentValue}`,
        ...current?.description === undefined ? [] : [current.description],
        `Available presets: ${permissions.options.filter(option => option.value !== 'custom').map(option => option.name).join(', ')}`,
      ],
    ))
  }

  const work = sources.work
  if (work !== undefined && work.total > 0) {
    const value = work.failed > 0
      ? `${work.running}r/${work.queued}q/${work.failed}f`
      : work.queued > 0 ? `${work.running}r/${work.queued}q` : `${work.running} running`
    items.push(item(
      'work',
      'work',
      value,
      'work',
      [
        `Running: ${work.running}`,
        `Queued: ${work.queued}`,
        `Failed: ${work.failed}`,
        `Visible work rows: ${work.total}`,
      ],
    ))
  }

  const context = sources.context
  const used = context?.projectedTokens ?? context?.pressureTokens
  const capacity = context?.contextWindow
  if (used !== undefined && capacity !== undefined && capacity > 0) {
    const boundedUsed = Math.max(0, used)
    const percent = Math.round((boundedUsed / capacity) * 100)
    const kind = context?.projectedTokens === undefined ? 'last request prompt' : 'next request projection'
    items.push(item(
      'context',
      'ctx',
      `~${percent}%`,
      'detail',
      [
        `Approximate ${kind}: ${formatTokens(boundedUsed)} tokens`,
        `Context window: ${formatTokens(capacity)} tokens`,
        `Approximate remaining: ${formatTokens(Math.max(0, capacity - boundedUsed))} tokens`,
        'Provider usage anchors the sample; surface changes after that sample are estimated.',
      ],
    ))
  }

  if (sources.workspace !== undefined) {
    items.push(item(
      'workspace',
      'cwd',
      pathLabel(sources.workspace),
      'detail',
      [`Session workspace: ${sources.workspace}`],
    ))
  }

  const position = sources.transcript
  const range = position.total === 0 || position.startIndex < 0 || position.endIndex < 0
    ? '0/0'
    : `${position.startIndex + 1}-${position.endIndex + 1}/${position.total}`
  const positionValue = `${position.hasOlder ? '↑' : ''}${range}${position.hasNewer ? '↓' : ''}`
  items.push(item(
    'transcript',
    'view',
    positionValue,
    'detail',
    [
      `Mounted transcript blocks: ${range}`,
      `Older content: ${position.hasOlder ? 'available' : 'none'}`,
      `Newer content: ${position.hasNewer ? 'available' : 'none'}`,
      'Transcript truth remains the durable Session log.',
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
    ? ['model', 'work', 'permission']
    : columns < 78
      ? ['model', 'work', 'permission', 'context', 'transcript']
      : ['model', 'work', 'permission', 'context', 'workspace', 'transcript']
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
  if (items.length === 0 || columns <= 0) return ''
  const separator = ' | '
  const separators = separator.length * Math.max(0, items.length - 1)
  const available = Math.max(items.length, columns - separators)
  const texts = items.map(item => `${item.label} ${item.value}`)
  const budgets = items.map((item, index) => Math.min(
    stringWidth(texts[index] ?? ''),
    stringWidth(item.label) + 2,
  ))
  let remaining = Math.max(0, available - budgets.reduce((total, value) => total + value, 0))
  for (const id of ['work', 'context', 'transcript'] as const) {
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
  return truncateCells(rendered.join(separator), columns)
}

/**
 * Format one selected item with its navigation position.
 * @param items - visible footer items.
 * @param selected - current item id, possibly stale after a width change.
 * @param columns - complete row budget in terminal cells.
 * @returns one selected-item row no wider than the supplied budget.
 */
export function tuiSelectedFooterLine(
  items: readonly TuiFooterItemDescriptor[],
  selected: TuiFooterItemId | undefined,
  columns: number,
): string {
  if (items.length === 0) return ''
  const index = Math.max(0, items.findIndex(item => item.id === selected))
  const current = items[index] ?? items[0]
  if (current === undefined) return ''
  return truncateCells(`Footer ${index + 1}/${items.length} | ${current.label} ${current.value}`, columns)
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
