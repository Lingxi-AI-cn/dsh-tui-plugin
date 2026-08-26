/** Compact main-transcript projection for one consecutive run of tool activity. */

import React from 'react'
import { Box, Text } from 'ink'
import type { TranscriptToolActivityNode, TranscriptToolNode } from './transcript.ts'
import { toolCardHeadingText, toolDisplayState } from './tool-card.tsx'
import { tuiMessage, useTuiLocale, type TuiLocale } from './locale.ts'
import { tuiTextStyle, useTuiTheme } from './theme.tsx'
import type { TuiScreenMap } from './screen-map.ts'
import { tuiScreenTextSegments, type TuiScreenSelection } from './selection.ts'

/** Provider-intent category used only for compact activity counts. */
export type TuiToolActivityCategory =
  | 'read' | 'search' | 'web' | 'terminal' | 'change' | 'delegation' | 'other'

/** Derived lifecycle/count facts shared by rendering, row budgeting, and tests. */
export interface TuiToolActivitySummary {
  readonly total: number
  readonly complete: number
  readonly running: number
  readonly failed: number
  readonly cancelled: number
  readonly categories: Readonly<Record<TuiToolActivityCategory, number>>
  readonly activeTool?: TranscriptToolNode | undefined
}

/** Classify from provider-owned render intents, never from a tool-name whitelist. */
export function tuiToolActivityCategory(tool: TranscriptToolNode): TuiToolActivityCategory {
  if (tool.delegation !== undefined) return 'delegation'
  if (tool.callView.card === 'diff' || tool.resultView?.card === 'diff') return 'change'
  if (tool.callView.card === 'terminal' || tool.resultView?.card === 'terminal') return 'terminal'
  if (tool.resultView?.card === 'web') return 'web'
  if (tool.resultView?.card === 'read') return 'read'
  if (tool.resultView?.card === 'search') return 'search'
  if (tool.callView.kind === 'read') return 'read'
  if (tool.callView.kind === 'search') return 'search'
  if (tool.callView.kind === 'fetch') return 'web'
  if (tool.callView.kind === 'execute') return 'terminal'
  if (tool.callView.kind === 'edit' || tool.callView.kind === 'delete' || tool.callView.kind === 'move') return 'change'
  return 'other'
}

/** Derive bounded activity facts without retaining another transcript store. */
export function tuiToolActivitySummary(node: TranscriptToolActivityNode): TuiToolActivitySummary {
  const categories: Record<TuiToolActivityCategory, number> = {
    read: 0, search: 0, web: 0, terminal: 0, change: 0, delegation: 0, other: 0,
  }
  let complete = 0
  let running = 0
  let failed = 0
  let cancelled = 0
  let activeTool: TranscriptToolNode | undefined
  for (const tool of node.tools) {
    categories[tuiToolActivityCategory(tool)] += 1
    const state = toolDisplayState(tool)
    if (state === 'queued' || state === 'running') {
      running += 1
      activeTool ??= tool
    } else {
      complete += 1
      if (state === 'error') failed += 1
      if (state === 'cancelled') cancelled += 1
    }
  }
  return Object.freeze({
    total: node.tools.length, complete, running, failed, cancelled,
    categories: Object.freeze(categories),
    ...activeTool === undefined ? {} : { activeTool },
  })
}

const CATEGORY_KEYS = {
  read: 'transcript.activity.read',
  search: 'transcript.activity.search',
  web: 'transcript.activity.web',
  terminal: 'transcript.activity.terminal',
  change: 'transcript.activity.change',
  delegation: 'transcript.activity.delegation',
  other: 'transcript.activity.other',
} as const

/** Stable single-row heading for the compact main transcript. */
export function toolActivityHeadingText(node: TranscriptToolActivityNode, locale: TuiLocale): string {
  const summary = tuiToolActivitySummary(node)
  const mark = summary.running > 0 ? '◌' : summary.failed > 0 ? '✕' : summary.cancelled > 0 ? '⊘' : '✓'
  const parts = [tuiMessage(locale, 'transcript.activity.operations', { count: summary.total })]
  if (summary.failed > 0) parts.push(tuiMessage(locale, 'transcript.activity.failed', { count: summary.failed }))
  if (summary.cancelled > 0) parts.push(tuiMessage(locale, 'transcript.activity.cancelled', { count: summary.cancelled }))
  if (summary.running > 0) {
    parts.push(tuiMessage(locale, 'transcript.activity.complete', { count: summary.complete }))
    parts.push(tuiMessage(locale, 'transcript.activity.running', { count: summary.running }))
  } else {
    for (const category of Object.keys(CATEGORY_KEYS) as TuiToolActivityCategory[]) {
      const count = summary.categories[category]
      if (count > 0) parts.push(tuiMessage(locale, CATEGORY_KEYS[category], { count }))
    }
  }
  return `${mark} ${parts.join(' · ')}`
}

/** Optional second row retained only while one or more operations are active. */
export function toolActivityActiveText(
  node: TranscriptToolActivityNode,
  locale: TuiLocale,
  workspace?: string,
): string | undefined {
  const active = tuiToolActivitySummary(node).activeTool
  return active === undefined ? undefined : tuiMessage(locale, 'transcript.activity.active', {
    title: toolCardHeadingText(active, workspace),
  })
}

/** Exact main-transcript row budget for one activity summary. */
export function tuiToolActivityRows(node: TranscriptToolActivityNode): 1 | 2 {
  return tuiToolActivitySummary(node).running > 0 ? 2 : 1
}

function selectedHeading(
  text: string,
  map: TuiScreenMap | undefined,
  selection: TuiScreenSelection | undefined,
  key: string,
  color: string | undefined,
  selectionColor: string | undefined,
): React.ReactElement {
  const row = map?.rows.find(entry => entry.semanticBlockKey === key
    && entry.cells.some(cell => cell.source === 'text' && cell.selectable))?.row ?? -1
  const segments = row < 0 || map === undefined || selection === undefined
    ? undefined : tuiScreenTextSegments(map, row, selection)
  if (segments === undefined || !segments.some(segment => segment.selected)) {
    return <Text bold wrap="truncate-end" {...tuiTextStyle(color)}>{text}</Text>
  }
  return <Text bold wrap="truncate-end">{segments.map((segment, index) => <Text
    key={`${row}:${index}:${segment.text}`}
    {...tuiTextStyle(segment.selected ? selectionColor : color)}
    inverse={segment.selected}
  >{segment.text}</Text>)}</Text>
}

/** Render one completed row or two active rows, with full calls retained for detail. */
export function ToolActivity({ node, workspace, selectionMap, selection }: {
  node: TranscriptToolActivityNode
  workspace?: string | undefined
  selectionMap?: TuiScreenMap | undefined
  selection?: TuiScreenSelection | undefined
}): React.ReactElement {
  const theme = useTuiTheme()
  const locale = useTuiLocale()
  const summary = tuiToolActivitySummary(node)
  const active = toolActivityActiveText(node, locale, workspace)
  const color = summary.failed > 0 ? theme.tokens.error
    : summary.running > 0 ? theme.tokens.warning : theme.tokens.accent
  return <Box flexDirection="column" flexShrink={0}>
    {selectedHeading(
      toolActivityHeadingText(node, locale), selectionMap, selection, node.key,
      color, theme.tokens.selection,
    )}
    {active !== undefined && <Text wrap="truncate-end" {...tuiTextStyle(theme.tokens.muted)}>  └─ {active}</Text>}
  </Box>
}
