/** Compact durable todo checklist for the native TUI transcript. */

import React from 'react'
import { Box, Text } from 'ink'
import { STRUCTURED_CHILD_LIMIT, type TranscriptTodoNode } from './transcript.ts'
import { terminalSafe } from './sanitize.ts'
import { tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'

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

/** Render the standing todo snapshot beside the composer. */
export function TodoPanel({
  node,
  focused = false,
  emphasized = new Set(),
}: {
  node: TranscriptTodoNode
  focused?: boolean
  emphasized?: ReadonlySet<string>
}): React.ReactElement | null {
  const theme = useTuiTheme()
  if (node.todos.length === 0) return null
  const completed = node.todos.filter(todo => todo.status === 'completed').length
  const complete = completed === node.todos.length
  const visible = node.todos.slice(0, STRUCTURED_CHILD_LIMIT)
  return <Box flexDirection="column" flexShrink={0}>
    <Text bold {...tuiTextStyle(theme.tokens.accent)}>{focused ? <Text {...tuiTextStyle(theme.tokens.selection)}>› </Text> : '  '}Tasks <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
      {completed}/{node.todos.length}{complete ? ' complete' : ''}
    </Text></Text>
    {!complete && visible.map((todo, index) => {
      const item = marker(theme, todo.status)
      return <Text key={`${index}:${todo.content}`} {...tuiTextStyle(item.color)} bold={emphasized.has(todo.content)}>
        {'  '}
        {item.text} {todo.status === 'completed'
          ? <Text {...tuiTextStyle(theme.tokens.muted)}>{terminalSafe(todo.content)}</Text>
          : terminalSafe(todo.content)}
      </Text>
    })}
    {!complete && node.todos.length > visible.length
      && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>    … {node.todos.length - visible.length} more tasks</Text>}
  </Box>
}
