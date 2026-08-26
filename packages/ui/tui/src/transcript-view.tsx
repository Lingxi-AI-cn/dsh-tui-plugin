/** Ink rendering for one bounded semantic transcript frame. */

import React from 'react'
import { Box, Text } from 'ink'
import { STRUCTURED_CHILD_LIMIT, type TranscriptNode, type TranscriptTextNode } from './transcript.ts'
import { terminalWrappedLines, tuiTranscriptWindowEntryRows, type TranscriptWindowEntry } from './viewport.ts'
import { toolCardHeadingText, ToolCard } from './tool-card.tsx'
import { ToolGroup, toolGroupHeadingText } from './tool-group.tsx'
import { ToolActivity, toolActivityActiveText, toolActivityHeadingText } from './tool-activity.tsx'
import { TodoPanel } from './todo-panel.tsx'
import { tuiTranscriptSearchSegments } from './transcript-search.ts'
import { tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'
import type { TuiScreenMap, TuiScreenMapLine } from './screen-map.ts'
import { tuiScreenTextSegments, type TuiScreenSelection } from './selection.ts'
import { tuiOsc8Text } from './hyperlink.ts'
import { tuiBidiVisualText } from './bidi.ts'
import { formatTuiDeliverablesRow } from './deliverables.ts'
import { tuiMessage, useTuiLocale, type TuiLocale } from './locale.ts'

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
  selectionMap?: TuiScreenMap | undefined
  selection?: TuiScreenSelection | undefined
  columns?: number | undefined
}

function transcriptTextLabel(node: TranscriptTextNode, locale: TuiLocale): string {
  const label = node.tone === 'assistant' && node.continuation === true && node.label === 'Assistant'
    ? tuiMessage(locale, 'transcript.assistant.continuation')
    : node.label
  return `${label}${node.tone === 'reasoning' && node.key.startsWith('event:') && node.durationMs !== undefined
    ? ` · ${(node.durationMs / 1000).toFixed(1)}s` : ''}`
}

/**
 * Build the localized action labels shown below a completed assistant segment.
 * @param locale - active TUI locale.
 * @returns exact rendered line and its three independently clickable labels.
 */
export function tuiTranscriptAssistantReaderActions(locale: TuiLocale): {
  readonly line: string
  readonly open: string
  readonly copy: string
  readonly exportMarkdown: string
} {
  const open = tuiMessage(locale, 'transcript.assistant.readerOpen')
  const copy = tuiMessage(locale, 'transcript.assistant.readerCopy')
  const exportMarkdown = tuiMessage(locale, 'transcript.assistant.readerExport')
  return { line: [open, copy, exportMarkdown].join(' · '), open, copy, exportMarkdown }
}

/**
 * Describe the Output Reader actions on the final visible page of a completed assistant segment.
 * @param entry - one visible transcript entry.
 * @param locale - active TUI locale.
 * @returns localized hint text, or undefined before the segment's final page.
 */
export function tuiTranscriptAssistantReaderHint(
  entry: TranscriptWindowEntry,
  locale: TuiLocale,
): string | undefined {
  if (entry.node.kind !== 'text' || entry.node.tone !== 'assistant' || entry.node.closing !== true) return undefined
  if (entry.textRange !== undefined && entry.textRange.end < entry.textRange.total) return undefined
  return tuiTranscriptAssistantReaderActions(locale).line
}

function compactionStateMark(state: 'running' | 'success' | 'failure'): string {
  if (state === 'running') return '◌'
  return state === 'success' ? '✓' : '✕'
}

function compactionHeadingText(node: Extract<TranscriptNode, { kind: 'compaction' }>): string {
  const status = node.state === 'running' ? 'Compacting' : node.state === 'success' ? 'Compacted' : 'Compaction failed'
  return `${compactionStateMark(node.state)} ${status}${node.shadowedRange === undefined ? ''
    : ` · ${node.shadowedItemCount} items · ~${node.shadowedTokenCount} tokens`}`
}

/**
 * Project visible transcript rows into bounded selectable map lines.
 * @param entries - visible transcript frame.
 * @param width - available text-cell budget.
 * @param workspace - optional Session workspace for tool headings.
 * @returns map lines in rendered order; structural rows are non-selectable.
 */
export function tuiTranscriptScreenMapLines(
  entries: readonly TranscriptWindowEntry[],
  width: number,
  workspace?: string,
  locale: 'en' | 'zh' = 'en',
): readonly TuiScreenMapLine[] {
  const lines: TuiScreenMapLine[] = []
  const columns = Math.max(1, Math.floor(width))
  for (const entry of entries) {
    const key = entry.node.key
    if (entry.node.kind === 'text') {
      lines.push({ semanticBlockKey: key, gutter: ' '.repeat(3), text: transcriptTextLabel(entry.node, locale), selectable: false })
      lines.push({ semanticBlockKey: key, gutter: ' '.repeat(3), text: entry.text ?? '', selectable: true })
      if (entry.node.tone === 'reasoning' && entry.node.key.startsWith('event:')) continue
      lines.push({
        semanticBlockKey: key,
        gutter: ' '.repeat(3),
        text: tuiTranscriptAssistantReaderHint(entry, locale) ?? '',
        selectable: false,
      })
      continue
    }
    if (entry.node.kind === 'tool') {
      lines.push({ semanticBlockKey: key, gutter: ' '.repeat(3), text: toolCardHeadingText(entry.node, workspace), selectable: true })
      continue
    }
    if (entry.node.kind === 'tool-group') {
      lines.push({ semanticBlockKey: key, gutter: ' '.repeat(3), text: toolGroupHeadingText(entry.node), selectable: true })
      const visible = entry.node.tools.slice(-STRUCTURED_CHILD_LIMIT)
      const omitted = entry.node.tools.length - visible.length
      if (omitted > 0) lines.push({
        semanticBlockKey: key,
        gutter: ' '.repeat(3),
        text: `  … ${omitted} earlier operations`,
        selectable: false,
      })
      visible.forEach((tool, index) => lines.push({
        semanticBlockKey: tool.key,
        gutter: `    ${index === visible.length - 1 ? '└─ ' : '├─ '}`,
        text: toolCardHeadingText(tool, workspace),
        selectable: true,
      }))
      continue
    }
    if (entry.node.kind === 'tool-activity') {
      lines.push({
        semanticBlockKey: key,
        gutter: ' '.repeat(3),
        text: toolActivityHeadingText(entry.node, locale),
        selectable: true,
      })
      const active = toolActivityActiveText(entry.node, locale, workspace)
      if (active !== undefined) lines.push({
        semanticBlockKey: key,
        gutter: ' '.repeat(3),
        text: `  └─ ${active}`,
        selectable: false,
      })
      continue
    }
    if (entry.node.kind === 'compaction') {
      lines.push({ semanticBlockKey: key, gutter: ' '.repeat(3), text: compactionHeadingText(entry.node), selectable: true })
      if (entry.node.error !== undefined) lines.push({
        semanticBlockKey: key, gutter: ' '.repeat(3), text: entry.node.error, selectable: true,
      })
      if (entry.node.summary !== undefined) lines.push({
        semanticBlockKey: key, gutter: ' '.repeat(3), text: entry.node.summary.split('\n')[0] ?? '', selectable: true,
      })
      continue
    }
    if (entry.node.kind === 'deliverables') {
      lines.push({
        semanticBlockKey: key,
        gutter: ' '.repeat(3),
        text: formatTuiDeliverablesRow(entry.node, columns, locale).text,
        selectable: true,
      })
      continue
    }
    const rows = tuiTranscriptWindowEntryRows(entry, columns)
    for (let row = 0; row < rows; row += 1) {
      lines.push({ semanticBlockKey: key, gutter: ' '.repeat(3), text: '', selectable: false })
    }
  }
  return Object.freeze(lines)
}

function compactionStateColor(theme: TuiTheme, state: 'running' | 'success' | 'failure'): string | undefined {
  if (state === 'running') return theme.tokens.warning
  return state === 'success' ? theme.tokens.success : theme.tokens.error
}

function selectionRow(
  map: TuiScreenMap | undefined,
  selection: TuiScreenSelection | undefined,
  key: string,
  occurrence: number,
): number {
  if (map === undefined || selection === undefined) return -1
  let seen = 0
  for (const row of map.rows) {
    if (row.semanticBlockKey !== key || !row.cells.some(cell => cell.source === 'text' && cell.selectable)) continue
    if (seen === occurrence) return row.row
    seen += 1
  }
  return -1
}

function selectedLine(
  text: string,
  map: TuiScreenMap | undefined,
  selection: TuiScreenSelection | undefined,
  key: string,
  occurrence: number,
  color: string | undefined,
  selectionColor: string | undefined,
): React.ReactElement {
  const row = selectionRow(map, selection, key, occurrence)
  const segments = row < 0 || map === undefined || selection === undefined
    ? undefined : tuiScreenTextSegments(map, row, selection)
  if (segments === undefined || !segments.some(segment => segment.selected)) {
    return <Text wrap="truncate-end" {...tuiTextStyle(color)}>{text}</Text>
  }
  return <Text wrap="truncate-end">{segments.map((segment, index) => <Text
    key={`${row}:${index}:${segment.text}`}
    {...tuiTextStyle(segment.selected ? selectionColor : color)}
    inverse={segment.selected}
  >{segment.text}</Text>)}</Text>
}

function CompactionCard({
  node,
  selectionMap,
  selection,
}: {
  node: Extract<TranscriptNode, { kind: 'compaction' }>
  selectionMap?: TuiScreenMap | undefined
  selection?: TuiScreenSelection | undefined
}): React.ReactElement {
  const theme = useTuiTheme()
  return <Box flexDirection="column" flexShrink={0}>
    {selectedLine(
      compactionHeadingText(node), selectionMap, selection, node.key, 0,
      compactionStateColor(theme, node.state), theme.tokens.selection,
    )}
    {node.error !== undefined && selectedLine(node.error, selectionMap, selection, node.key, 1, theme.tokens.error, theme.tokens.selection)}
    {node.summary !== undefined && selectedLine(
      node.summary.split('\n')[0] ?? '', selectionMap, selection, node.key,
      node.error === undefined ? 1 : 2, theme.tokens.muted, theme.tokens.selection,
    )}
  </Box>
}

function DeliverablesCard({
  node,
  columns,
}: {
  node: Extract<TranscriptNode, { kind: 'deliverables' }>
  columns: number
}): React.ReactElement {
  const theme = useTuiTheme()
  const locale = useTuiLocale()
  const row = formatTuiDeliverablesRow(node, columns, locale)
  return <Text wrap="truncate-end" {...tuiTextStyle(theme.tokens.success)}>{row.text}</Text>
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

function transcriptBodyView(
  theme: TuiTheme,
  entry: TranscriptWindowEntry,
  selectionMap: TuiScreenMap | undefined,
  selection: TuiScreenSelection | undefined,
  searchSelectedKey: string | undefined,
  searchQuery: string | undefined,
): React.ReactElement | string | undefined {
  if (entry.text === undefined || entry.text === '') return undefined
  const visualText = tuiBidiVisualText(entry.text)
  if (searchSelectedKey === entry.node.key && searchQuery !== undefined) {
    return <TuiTranscriptSearchText text={visualText} query={searchQuery} />
  }
  if (selectionMap === undefined || selection === undefined || entry.node.kind !== 'text') return tuiOsc8Text(visualText)
  const row = selectionMap.rows.findIndex(candidate => candidate.semanticBlockKey === entry.node.key
    && candidate.cells.some(cell => cell.source === 'text' && cell.selectable))
  if (row < 0) return entry.text
  const lines = terminalWrappedLines(visualText, Math.max(1, selectionMap.columns - 3))
  return <>{lines.map((line, index) => {
    const segments = tuiScreenTextSegments(selectionMap, row + index, selection)
    return <React.Fragment key={`${index}:${line}`}>
      {index > 0 ? '\n' : ''}{segments.length === 0 ? line : segments.map((segment, segmentIndex) => <Text
        key={`${row + index}:${segmentIndex}:${segment.text}`}
        {...tuiTextStyle(segment.selected ? theme.tokens.selection : theme.tokens.text)}
        inverse={segment.selected}
      >{segment.text}</Text>)}
    </React.Fragment>
  })}</>
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
  selectionMap,
  selection,
  columns = 80,
}: TuiTranscriptViewProps): React.ReactElement {
  const theme = useTuiTheme()
  const locale = useTuiLocale()
  if (entries.length === 0) {
    return <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}>
      Start a conversation. Type / for commands.
    </Text>
  }
  return <>
    {overscanBefore.length > 0 && <Box height={0} overflow="hidden" flexDirection="column">
      <TuiTranscriptView entries={overscanBefore} workspace={workspace} columns={columns} />
    </Box>}
    {entries.map((entry, index) => {
      const readerHint = tuiTranscriptAssistantReaderHint(entry, locale)
      return <Box
        key={entry.node.key}
        flexDirection="row"
        marginBottom={readerHint !== undefined || entry.node.kind === 'tool' || entry.node.kind === 'deliverables'
          || entry.node.kind === 'tool-activity'
          || entries[index + 1]?.node.kind === 'deliverables' ? 0 : 1}
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
            ? <ToolCard
              node={entry.node}
              expanded={false}
              workspace={workspace}
              selectionMap={selectionMap}
              selection={selection}
            />
            : entry.node.kind === 'tool-group'
              ? <ToolGroup node={entry.node} workspace={workspace} {...focusedNode === entry.node
                && focusedCallId !== undefined ? { focusedCallId } : {}} selectionMap={selectionMap} selection={selection} />
              : entry.node.kind === 'tool-activity'
                ? <ToolActivity node={entry.node} workspace={workspace} selectionMap={selectionMap} selection={selection} />
                : entry.node.kind === 'compaction'
                  ? <CompactionCard node={entry.node} selectionMap={selectionMap} selection={selection} />
                  : entry.node.kind === 'deliverables'
                    ? <DeliverablesCard node={entry.node} columns={columns} />
                    : entry.node.kind === 'todo'
                      ? <TodoPanel node={entry.node} />
                      : <>
                        <Text bold {...tuiTextStyle(toneColor(theme, entry.node.tone))}>{transcriptTextLabel(entry.node, locale)}</Text>
                        {entry.text !== '' && <Text wrap="wrap">{transcriptBodyView(
                          theme, entry, selectionMap, selection, searchSelectedKey, searchQuery,
                        )}</Text>}
                        {readerHint !== undefined && <Text {...tuiTextStyle(theme.tokens.selection)}>{readerHint}</Text>}
                      </>}
        </Box>
      </Box>
    })}
    {overscanAfter.length > 0 && <Box height={0} overflow="hidden" flexDirection="column">
      <TuiTranscriptView entries={overscanAfter} workspace={workspace} columns={columns} />
    </Box>}
  </>
}
