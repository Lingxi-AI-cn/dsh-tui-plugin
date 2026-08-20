/** Hierarchical rendering for consecutive read and search tool activity. */

import React from 'react'
import { Box, Text } from 'ink'
import { isExplorationTool, STRUCTURED_CHILD_LIMIT, type TranscriptToolGroupNode } from './transcript.ts'
import { ToolCard, toolDisplayState } from './tool-card.tsx'
import { tuiTextStyle, useTuiTheme } from './theme.tsx'

/** Render related exploration calls under one tree-like activity heading. */
export function ToolGroup({ node, focusedCallId, workspace }: {
  node: TranscriptToolGroupNode
  focusedCallId?: string
  workspace?: string | undefined
}): React.ReactElement {
  const theme = useTuiTheme()
  const states = node.tools.map(toolDisplayState)
  const active = states.filter(state => state === 'queued' || state === 'running').length
  const failed = states.filter(state => state === 'error').length
  const cancelled = states.filter(state => state === 'cancelled').length
  const complete = node.tools.length - active
  const exploration = node.activity !== 'explore' && node.tools.length > 0 && node.tools.every(isExplorationTool)
  const title = node.activity === 'explore' ? 'Explore' : node.activity === 'parallel' ? 'Parallel' : 'Exclusive'
  const visible = node.tools.slice(-STRUCTURED_CHILD_LIMIT)
  const omitted = node.tools.length - visible.length
  return <Box flexDirection="column" flexShrink={0}>
    <Text bold {...tuiTextStyle(failed > 0 ? theme.tokens.error : active > 0 ? theme.tokens.warning : theme.tokens.accent)}>
      {title} <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>{complete}/{node.tools.length} complete
        {cancelled === 0 ? '' : ` · ${cancelled} cancelled`}{exploration ? ' · Explore' : ''}
      </Text>
    </Text>
    {omitted > 0 && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>  … {omitted} earlier operations</Text>}
    {visible.map((tool, index) => <Box key={tool.key} paddingLeft={1} flexShrink={0}>
      {tool.callId === focusedCallId
        ? <Text {...tuiTextStyle(theme.tokens.selection)}>› </Text>
        : <Text>{index === visible.length - 1 ? '└─ ' : '├─ '}</Text>}
      <ToolCard node={tool} expanded={false} workspace={workspace} />
    </Box>)}
  </Box>
}
