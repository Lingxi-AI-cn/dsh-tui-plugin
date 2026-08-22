/** Compact durable todo checklist for the native TUI transcript. */

import React from 'react'
import { Box, Text } from 'ink'
import { STRUCTURED_CHILD_LIMIT, type TranscriptTodoNode } from './transcript.ts'
import { terminalSafe } from './sanitize.ts'
import { tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'
import type { TuiScreenMap, TuiScreenMapLine } from './screen-map.ts'
import { tuiScreenTextSegments, type TuiScreenSelection } from './selection.ts'

function marker(theme: TuiTheme, status: TranscriptTodoNode['todos'][number]['status']): {
  text: string
  color: string | undefined
} {
  if (status === 'completed') return { text: '✓', color: theme.tokens.success }
  if (status === 'in_progress') return { text: '›', color: theme.tokens.warning }
  return { text: '·', color: theme.tokens.muted }
}

/** Physical rows occupied by the pinned Tasks surface. */
export function todoPanelRows(node: TranscriptTodoNode | undefined): number {
  if (node === undefined || node.todos.length === 0) return 0
  const completed = node.todos.filter(todo => todo.status === 'completed').length
  if (completed === node.todos.length) return 1
  const visible = Math.min(node.todos.length, STRUCTURED_CHILD_LIMIT)
  return visible + 1 + (node.todos.length > visible ? 1 : 0)
}

/**
 * Project the pinned Tasks surface into selectable terminal rows.
 *
 * Status markers, indentation, and the omitted-count row remain gutter or
 * structural cells; the heading and bounded task content are selectable.
 * @param node - latest durable Tasks snapshot.
 * @returns bounded semantic rows matching {@link TodoPanel}.
 */
export function todoPanelScreenMapLines(node: TranscriptTodoNode | undefined): readonly TuiScreenMapLine[] {
  if (node === undefined || node.todos.length === 0) return Object.freeze([])
  const completed = node.todos.filter(todo => todo.status === 'completed').length
  const complete = completed === node.todos.length
  const lines: TuiScreenMapLine[] = [{
    semanticBlockKey: node.key,
    gutter: '  ',
    text: `Tasks ${completed}/${node.todos.length}${complete ? ' complete' : ''}`,
    selectable: true,
  }]
  if (complete) return Object.freeze(lines)
  const visible = node.todos.slice(0, STRUCTURED_CHILD_LIMIT)
  visible.forEach((todo, index) => {
    const itemText = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '›' : '·'
    lines.push({
      semanticBlockKey: `${node.key}:item:${index}`,
      gutter: `  ${itemText} `,
      text: terminalSafe(todo.content),
      selectable: true,
    })
  })
  if (node.todos.length > visible.length) lines.push({
    semanticBlockKey: node.key,
    gutter: '    ',
    text: `… ${node.todos.length - visible.length} more tasks`,
    selectable: false,
  })
  return Object.freeze(lines)
}

function selectedRow(
  map: TuiScreenMap | undefined,
  selection: TuiScreenSelection | undefined,
  key: string,
): number {
  if (map === undefined || selection === undefined) return -1
  return map.rows.findIndex(row => row.semanticBlockKey === key
    && row.cells.some(cell => cell.source === 'text' && cell.selectable))
}

function selectableLine(
  prefix: string,
  text: string,
  map: TuiScreenMap | undefined,
  selection: TuiScreenSelection | undefined,
  key: string,
  color: string | undefined,
  selectionColor: string | undefined,
  bold = false,
  prefixColor: string | undefined = color,
): React.ReactElement {
  const row = selectedRow(map, selection, key)
  const segments = row < 0 || map === undefined || selection === undefined
    ? undefined : tuiScreenTextSegments(map, row, selection)
  return <Text wrap="truncate-end" bold={bold} {...tuiTextStyle(color)}>
    <Text {...tuiTextStyle(prefixColor)}>{prefix}</Text>
    {segments === undefined || !segments.some(segment => segment.selected)
      ? text
      : segments.map((segment, index) => <Text
        key={`${row}:${index}:${segment.text}`}
        {...tuiTextStyle(segment.selected ? selectionColor : color)}
        inverse={segment.selected}
      >{segment.text}</Text>)}
  </Text>
}

/** Render the standing todo snapshot beside the composer. */
export function TodoPanel({
  node,
  focused = false,
  emphasized = new Set(),
  selectionMap,
  selection,
}: {
  node: TranscriptTodoNode
  focused?: boolean
  emphasized?: ReadonlySet<string>
  selectionMap?: TuiScreenMap | undefined
  selection?: TuiScreenSelection | undefined
}): React.ReactElement | null {
  const theme = useTuiTheme()
  if (node.todos.length === 0) return null
  const completed = node.todos.filter(todo => todo.status === 'completed').length
  const complete = completed === node.todos.length
  const visible = node.todos.slice(0, STRUCTURED_CHILD_LIMIT)
  return <Box flexDirection="column" flexShrink={0}>
    {selectableLine(
      focused ? '› ' : '  ',
      `Tasks ${completed}/${node.todos.length}${complete ? ' complete' : ''}`,
      selectionMap,
      selection,
      node.key,
      theme.tokens.accent,
      theme.tokens.selection,
      true,
      theme.tokens.selection,
    )}
    {!complete && visible.map((todo, index) => {
      const item = marker(theme, todo.status)
      const content = terminalSafe(todo.content)
      return <React.Fragment key={`${index}:${todo.content}`}>
        {selectableLine(
          `  ${item.text} `,
          content,
          selectionMap,
          selection,
          `${node.key}:item:${index}`,
          todo.status === 'completed' ? theme.tokens.muted : item.color,
          theme.tokens.selection,
          emphasized.has(todo.content),
        )}
      </React.Fragment>
    })}
    {!complete && node.todos.length > visible.length
      && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>    … {node.todos.length - visible.length} more tasks</Text>}
  </Box>
}
