/** Hierarchical rendering for consecutive read and search tool activity. */

import React from 'react'
import { Box, Text } from 'ink'
import { isExplorationTool, STRUCTURED_CHILD_LIMIT, type TranscriptToolGroupNode } from './transcript.ts'
import { ToolCard, toolDisplayState } from './tool-card.tsx'
import { tuiTextStyle, useTuiTheme } from './theme.tsx'
import type { TuiScreenMap } from './screen-map.ts'
import { tuiScreenTextSegments, type TuiScreenSelection } from './selection.ts'

/** Stable text for the compact activity heading. */
export function toolGroupHeadingText(node: TranscriptToolGroupNode): string {
  const states = node.tools.map(toolDisplayState)
  const active = states.filter(state => state === 'queued' || state === 'running').length
  const cancelled = states.filter(state => state === 'cancelled').length
  const complete = node.tools.length - active
  const exploration = node.activity !== 'explore' && node.tools.length > 0 && node.tools.every(isExplorationTool)
  const title = node.activity === 'explore' ? 'Explore' : node.activity === 'parallel' ? 'Parallel' : 'Exclusive'
  return `${title} ${complete}/${node.tools.length} complete`
    + (cancelled === 0 ? '' : ` · ${cancelled} cancelled`)
    + (exploration ? ' · Explore' : '')
}

function selectionRow(map: TuiScreenMap | undefined, selection: TuiScreenSelection | undefined, key: string): number {
  if (map === undefined || selection === undefined) return -1
  return map.rows.findIndex(row => row.semanticBlockKey === key
    && row.cells.some(cell => cell.source === 'text' && cell.selectable))
}

function selectableLine(
  text: string,
  map: TuiScreenMap | undefined,
  selection: TuiScreenSelection | undefined,
  key: string,
  color: string | undefined,
  selectionColor: string | undefined,
): React.ReactElement {
  const row = selectionRow(map, selection, key)
  const segments = row < 0 || map === undefined || selection === undefined
    ? undefined : tuiScreenTextSegments(map, row, selection)
  if (segments === undefined || !segments.some(segment => segment.selected)) {
    return <Text bold {...tuiTextStyle(color)}>{text}</Text>
  }
  return <Text bold>{segments.map((segment, index) => <Text
    key={`${row}:${index}:${segment.text}`}
    {...tuiTextStyle(segment.selected ? selectionColor : color)}
    inverse={segment.selected}
  >{segment.text}</Text>)}</Text>
}

/** Render related exploration calls under one tree-like activity heading. */
export function ToolGroup({ node, focusedCallId, workspace, selectionMap, selection }: {
  node: TranscriptToolGroupNode
  focusedCallId?: string
  workspace?: string | undefined
  selectionMap?: TuiScreenMap | undefined
  selection?: TuiScreenSelection | undefined
}): React.ReactElement {
  const theme = useTuiTheme()
  const states = node.tools.map(toolDisplayState)
  const active = states.filter(state => state === 'queued' || state === 'running').length
  const failed = states.filter(state => state === 'error').length
  const headingText = toolGroupHeadingText(node)
  const visible = node.tools.slice(-STRUCTURED_CHILD_LIMIT)
  const omitted = node.tools.length - visible.length
  return <Box flexDirection="column" flexShrink={0}>
    {selectableLine(
      headingText,
      selectionMap,
      selection,
      node.key,
      failed > 0 ? theme.tokens.error : active > 0 ? theme.tokens.warning : theme.tokens.accent,
      theme.tokens.selection,
    )}
    {omitted > 0 && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>  … {omitted} earlier operations</Text>}
    {visible.map((tool, index) => <Box key={tool.key} paddingLeft={1} flexShrink={0}>
      {tool.callId === focusedCallId
        ? <Text {...tuiTextStyle(theme.tokens.selection)}>› </Text>
        : <Text>{index === visible.length - 1 ? '└─ ' : '├─ '}</Text>}
      <ToolCard
        node={tool}
        expanded={false}
        workspace={workspace}
        selectionMap={selectionMap}
        selection={selection}
      />
    </Box>)}
  </Box>
}
