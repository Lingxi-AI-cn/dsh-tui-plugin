/** Ink rendering for one bounded semantic transcript frame. */

import React from 'react'
import { Box, Text } from 'ink'
import type { TranscriptNode, TranscriptTextNode } from './transcript.ts'
import type { TranscriptWindowEntry } from './viewport.ts'
import { ToolCard } from './tool-card.tsx'
import { ToolGroup } from './tool-group.tsx'
import { TodoPanel } from './todo-panel.tsx'
import { tuiTranscriptSearchSegments } from './transcript-search.ts'
import { tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'

function toneColor(theme: TuiTheme, tone: TranscriptTextNode['tone']): string | undefined {
  if (tone === 'user') return theme.tokens.accent
  if (tone === 'assistant') return theme.tokens.success
  if (tone === 'reasoning') return theme.tokens.reasoning
  if (tone === 'status') return theme.tokens.accent
  return theme.tokens.error
}

interface TuiTranscriptViewProps {
  entries: readonly TranscriptWindowEntry[]
  overscanBefore?: readonly TranscriptWindowEntry[] | undefined
  overscanAfter?: readonly TranscriptWindowEntry[] | undefined
  workspace?: string | undefined
  focusedNode?: TranscriptNode | undefined
  focusedCallId?: string | undefined
  rewindSelectedKey?: string | undefined
  searchSelectedKey?: string | undefined
  searchQuery?: string | undefined
}

function compactionStateMark(state: 'running' | 'success' | 'failure'): string {
  if (state === 'running') return '◌'
  return state === 'success' ? '✓' : '✕'
}

function compactionStateColor(theme: TuiTheme, state: 'running' | 'success' | 'failure'): string | undefined {
  if (state === 'running') return theme.tokens.warning
  return state === 'success' ? theme.tokens.success : theme.tokens.error
}

function CompactionCard({ node }: { node: Extract<TranscriptNode, { kind: 'compaction' }> }): React.ReactElement {
  const theme = useTuiTheme()
  const status = node.state === 'running' ? 'Compacting' : node.state === 'success' ? 'Compacted' : 'Compaction failed'
  const hasShadowStats = node.shadowedRange !== undefined
  return <Box flexDirection="column" flexShrink={0}>
    <Text bold {...tuiTextStyle(compactionStateColor(theme, node.state))} wrap="truncate-end">
      {compactionStateMark(node.state)} {status}
      {hasShadowStats && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
        {' · '}{node.shadowedItemCount} items · ~{node.shadowedTokenCount} tokens
      </Text>}
    </Text>
    {node.error !== undefined && <Text {...tuiTextStyle(theme.tokens.error)} wrap="truncate-end">{node.error}</Text>}
    {node.summary !== undefined && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim} wrap="truncate-end">{node.summary.split('\n')[0]}</Text>}
  </Box>
}

/**
 * Highlight the first normalized transcript-search match inside display text.
 * @param props - visible text and active query.
 * @returns segmented Ink text with the matching segment emphasized.
 */
export function TuiTranscriptSearchText({ text, query }: { text: string; query: string }): React.ReactElement {
  const theme = useTuiTheme()
  return <>{tuiTranscriptSearchSegments(text, query).map((segment, index) => <Text
    key={`${index}:${segment.text}`}
    {...segment.match ? { ...tuiTextStyle(theme.tokens.selection), bold: true } : {}}
  >{segment.text}</Text>)}</>
}

/**
 * Render the exact transcript blocks selected for one physical terminal frame.
 * @param props - bounded entries plus process-local focus and search state.
 * @returns one fragment containing the mounted transcript rows.
 */
export function TuiTranscriptView({
  entries,
  overscanBefore = [],
  overscanAfter = [],
  workspace,
  focusedNode,
  focusedCallId,
  rewindSelectedKey,
  searchSelectedKey,
  searchQuery,
}: TuiTranscriptViewProps): React.ReactElement {
  const theme = useTuiTheme()
  if (entries.length === 0) {
    return <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
      Start a conversation. Type / for commands.
    </Text>
  }
  return <>
    {overscanBefore.length > 0 && <Box height={0} overflow="hidden" flexDirection="column">
      <TuiTranscriptView entries={overscanBefore} workspace={workspace} />
    </Box>}
    {entries.map(entry => <Box
      key={entry.node.key}
      flexDirection="row"
      marginBottom={entry.node.kind === 'tool' ? 0 : 1}
      flexShrink={0}
    >
      <Text {...tuiTextStyle(theme.tokens.selection)}>{
        focusedNode === entry.node
          || rewindSelectedKey === entry.node.key
          || searchSelectedKey === entry.node.key
          ? '› ' : '  '
      }</Text>
      <Box flexDirection="column" flexGrow={1}>
        {entry.node.kind === 'tool'
          ? <ToolCard node={entry.node} expanded={false} workspace={workspace} />
          : entry.node.kind === 'tool-group'
            ? <ToolGroup node={entry.node} workspace={workspace} {...focusedNode === entry.node
              && focusedCallId !== undefined ? { focusedCallId } : {}} />
            : entry.node.kind === 'compaction'
              ? <CompactionCard node={entry.node} />
              : entry.node.kind === 'todo'
                ? <TodoPanel node={entry.node} />
                : <>
                  <Text bold {...tuiTextStyle(toneColor(theme, entry.node.tone))}>{entry.node.label}{entry.node.tone === 'reasoning' && entry.node.key.startsWith('event:') && entry.node.durationMs !== undefined
                    ? ` · ${(entry.node.durationMs / 1000).toFixed(1)}s` : ''}</Text>
                  {entry.text !== '' && <Text wrap="wrap">{
                    searchSelectedKey === entry.node.key && searchQuery !== undefined
                      ? <TuiTranscriptSearchText text={entry.text ?? ''} query={searchQuery} />
                      : entry.text
                  }</Text>}
                </>}
      </Box>
    </Box>)}
    {overscanAfter.length > 0 && <Box height={0} overflow="hidden" flexDirection="column">
      <TuiTranscriptView entries={overscanAfter} workspace={workspace} />
    </Box>}
  </>
}
