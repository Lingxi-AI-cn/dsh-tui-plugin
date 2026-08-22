/** Bounded native-TUI background-work panel. */

import React from 'react'
import { Box, Text } from 'ink'
import type { TuiWorkItemState, TuiWorkItemView, TuiWorkSnapshot } from './work.ts'
import { terminalSafe } from './sanitize.ts'
import { tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'
import { tuiMessage, useTuiLocale, type TuiLocale, type TuiMessageKey } from './locale.ts'

/** Fixed rows reserved around the selectable work list. */
const TUI_WORK_PANEL_CHROME_ROWS = 4

const WORK_STATE_MESSAGE_KEYS: Readonly<Record<TuiWorkItemState, TuiMessageKey>> = Object.freeze({
  running: 'work.state.running',
  stopping: 'work.state.stopping',
  failed: 'work.state.failed',
  completed: 'work.state.completed',
  killed: 'work.state.killed',
  waiting: 'work.state.waiting',
  inactive: 'work.state.inactive',
})

/**
 * Format one work duration from authoritative timestamps or durable subagent timing.
 * @param item - projected work row.
 * @param now - current local clock used only for a still-live interval.
 * @returns compact elapsed duration, or `--` when the source exposes none.
 */
export function formatTuiWorkElapsed(item: TuiWorkItemView, now: number): string {
  let elapsed: number | undefined
  if (item.timing !== undefined) {
    const active = item.timing.active
    elapsed = item.timing.settledMs + (active === undefined
      ? 0
      : Math.max(0, Math.max(active.through, now) - active.since))
  } else if (item.startedAt !== undefined) {
    elapsed = Math.max(0, (item.finishedAt ?? now) - item.startedAt)
  }
  if (elapsed === undefined) return '--'
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/**
 * Format the owning Agent fact carried by one work row.
 * @param item - projected work row.
 * @param locale - active TUI locale; defaults to English for non-UI callers.
 * @returns the owner Session id, or an explicit absence marker.
 */
export function formatTuiWorkOwner(item: TuiWorkItemView, locale: TuiLocale = 'en'): string {
  return tuiMessage(locale, 'work.owner', {
    owner: item.ownerSession ?? tuiMessage(locale, 'work.owner.none'),
  })
}

/**
 * Render the selectable slice of one work snapshot.
 * @param props - snapshot, selection, dimensions, and current clock.
 * @returns one stable-height panel.
 */
export function TuiWorkPanel(props: {
  readonly snapshot: TuiWorkSnapshot
  readonly selectedIndex: number
  readonly maxRows: number
  readonly now: number
}): React.ReactElement {
  const theme = useTuiTheme()
  const locale = useTuiLocale()
  const capacity = Math.max(1, props.maxRows - TUI_WORK_PANEL_CHROME_ROWS)
  const selected = props.snapshot.items.length === 0
    ? 0
    : Math.min(props.selectedIndex, props.snapshot.items.length - 1)
  const start = Math.max(0, Math.min(
    selected - Math.floor(capacity / 2),
    props.snapshot.items.length - capacity,
  ))
  const visible = props.snapshot.items.slice(start, start + capacity)
  const summary = props.snapshot.summary
  const selectedItem = props.snapshot.items[selected]
  return <Box flexDirection="column" paddingX={1} height={props.maxRows} overflow="hidden">
    <Text bold {...tuiTextStyle(theme.tokens.accent)}>
      {tuiMessage(locale, 'work.title', {
        running: summary.running, queued: summary.queued, failed: summary.failed,
      })}
    </Text>
    {props.snapshot.error !== undefined
      ? <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{terminalSafe(props.snapshot.error)}</Text>
      : props.snapshot.items.length === 0
        ? <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{tuiMessage(locale,
          props.snapshot.loading ? 'work.loading' : 'work.empty')}</Text>
        : visible.map((item, offset) => {
          const index = start + offset
          const active = index === selected
          const color = workColor(theme, item.state)
          return <Text key={item.key} {...tuiTextStyle(color)} dimColor={theme.dim && !active && workSettled(item.state)} wrap="truncate-end">
            {active ? '›' : ' '} {stateMark(item.state)} {item.depth > 0 ? '  '.repeat(Math.min(3, item.depth - 1)) : ''}
            {terminalSafe(item.label)} · {terminalSafe(formatTuiWorkOwner(item, locale))}
            {' · '}{terminalSafe(item.detail ?? tuiMessage(locale, WORK_STATE_MESSAGE_KEYS[item.state]))} · {formatTuiWorkElapsed(item, props.now)}
          </Text>
        })}
    <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
      {selectedItem === undefined
        ? tuiMessage(locale, 'work.footer.empty')
        : tuiMessage(locale, 'work.footer.select', {
          inspect: selectedItem.inspectable ? tuiMessage(locale, 'work.footer.inspect') : '',
          stop: selectedItem.action === 'none' ? '' : tuiMessage(locale, 'work.footer.stop'),
        })}
    </Text>
  </Box>
}

function stateMark(state: TuiWorkItemState): string {
  if (state === 'running') return '●'
  if (state === 'stopping') return '◐'
  if (state === 'failed') return '!'
  if (state === 'completed') return '✓'
  if (state === 'killed') return '×'
  if (state === 'waiting') return '○'
  return '·'
}

function workColor(theme: TuiTheme, state: TuiWorkItemState): string | undefined {
  if (state === 'running') return theme.tokens.success
  if (state === 'stopping' || state === 'waiting') return theme.tokens.warning
  if (state === 'failed') return theme.tokens.error
  return undefined
}

function workSettled(state: TuiWorkItemState): boolean {
  return state === 'completed' || state === 'killed' || state === 'inactive'
}
