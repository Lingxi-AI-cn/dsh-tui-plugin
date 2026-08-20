/** Ink renderers for provider-neutral tool presentation intents. */

import React from 'react'
import { Box, Text } from 'ink'
import type { ContentBlock } from './host.ts'
import type { TranscriptToolNode } from './transcript.ts'
import { tuiBorderStyle, tuiTextStyle, useTuiTheme } from './theme.tsx'
import { terminalSafe } from './sanitize.ts'

const DETAIL_LINES = 8

function safe(value: unknown): string {
  if (typeof value === 'string') return terminalSafe(value)
  if (value === undefined) return ''
  return terminalSafe(JSON.stringify(value, null, 2))
}

function contentText(content: readonly ContentBlock[] | undefined): string {
  if (content === undefined) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' || block.type === 'reasoning') parts.push(block.text)
    else if (block.type === 'image') parts.push(`[image: ${block.attachment.name ?? block.attachment.attachmentId}]`)
    else if (block.type === 'tool-call') parts.push(`${block.name} ${block.arguments}`)
    else parts.push(contentText(block.content))
  }
  return terminalSafe(parts.filter(Boolean).join('\n'))
}

function firstLine(text: string | undefined): string {
  return text?.split('\n').find(line => line.trim() !== '')?.trim() ?? ''
}

function bounded(text: string, limit = 96): string {
  const value = terminalSafe(text).replace(/\s+/gu, ' ').trim()
  return value.length <= limit ? value : `${value.slice(0, Math.max(1, limit - 1))}…`
}

function pathFor(path: string, workspace?: string): string {
  if (workspace === undefined) return path
  const prefix = workspace.endsWith('/') ? workspace : `${workspace}/`
  if (path.startsWith(prefix)) return path.slice(prefix.length) || '.'
  return path.includes(prefix) ? path.replace(prefix, '') : path
}

function genericSummary(value: unknown, workspace?: string): string {
  if (typeof value === 'string') return bounded(firstLine(value))
  if (value === undefined || value === null) return ''
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return bounded(pathFor(firstLine(candidate), workspace))
    if (typeof candidate === 'number' || typeof candidate === 'boolean') return String(candidate)
  }
  return 'structured input'
}

function diffLines(node: TranscriptToolNode): { additions: number; deletions: number } {
  const diffs = node.resultView?.card === 'diff' ? node.resultView.diffs : node.callView.card === 'diff' ? node.callView.diffs : []
  return diffs.reduce((counts, diff) => ({
    additions: counts.additions + diff.newText.split('\n').length,
    deletions: counts.deletions + (diff.oldText === null ? 0 : diff.oldText.split('\n').length),
  }), { additions: 0, deletions: 0 })
}

function todoSummary(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null || !('todos' in args) || !Array.isArray(args.todos)) return undefined
  const todos = args.todos as Array<{ status?: unknown }>
  const completed = todos.filter(todo => todo.status === 'completed').length
  const active = todos.filter(todo => todo.status === 'in_progress').length
  return `${completed}/${todos.length} done${active === 0 ? '' : ` · ${active} active`}`
}

function titleFor(node: TranscriptToolNode): string {
  if (node.delegation?.label !== undefined) return node.delegation.label
  return node.resultView?.title ?? node.callView.title
}

/** Stable terminal symbol for one tool scheduler state. */
export function toolDisplayState(node: TranscriptToolNode): TranscriptToolNode['state'] {
  if (node.state === 'error' || node.state === 'cancelled') return node.state
  if (node.delegation?.stopReason === undefined) return node.delegation === undefined ? node.state : 'running'
  if (node.delegation.stopReason === 'completed') return 'success'
  if (node.delegation.stopReason === 'aborted') return 'cancelled'
  return 'error'
}

/** Stable terminal symbol for one tool scheduler state. */
export function toolStateMark(node: TranscriptToolNode): string {
  const state = toolDisplayState(node)
  if (state === 'queued') return '◌'
  if (state === 'running') return '○'
  if (state === 'success') return '✓'
  if (state === 'cancelled') return '⊘'
  return '✕'
}

/**
 * Derive the compact, single-line summary shown on a collapsed tool card.
 * @param node - paired semantic tool node.
 * @returns terminal-safe summary text.
 */
export function toolSummary(node: TranscriptToolNode, workspace?: string): string {
  if (node.delegation !== undefined) {
    const elapsed = Math.max(0, (node.delegation.endedAt ?? Date.now()) - node.delegation.startedAt)
    const state = node.delegation.stopReason ?? 'running'
    return `${state} · ${Math.floor(elapsed / 1000)}s · ${node.delegation.childId}`
  }
  const result = node.resultView
  if (result?.card === 'terminal') {
    const ending = result.signal ?? (result.exitCode === undefined ? '' : `exit ${result.exitCode}`)
    const duration = node.startedAt === undefined || node.endedAt === undefined ? '' : `${Math.max(0, node.endedAt - node.startedAt)}ms`
    const failure = node.state === 'error' ? firstLine(result.output) : ''
    return [ending, duration, failure || firstLine(result.output)].filter(Boolean).join(' · ')
  }
  if (result?.card === 'diff') {
    const counts = diffLines(node)
    return `${result.diffs.length} file${result.diffs.length === 1 ? '' : 's'} changed · +${counts.additions}/-${counts.deletions}`
  }
  if (result?.card === 'search') {
    const args = typeof node.args === 'object' && node.args !== null ? node.args as { pattern?: unknown; query?: unknown; path?: unknown; root?: unknown } : {}
    const query = typeof args.pattern === 'string' ? args.pattern : typeof args.query === 'string' ? args.query : ''
    const root = typeof args.path === 'string' ? args.path : typeof args.root === 'string' ? args.root : ''
    return [query && `/${bounded(query, 32)}/`, root && pathFor(root, workspace), `${result.total} ${result.shape === 'matches' ? 'matches' : 'paths'}`, result.truncated ? 'capped' : ''].filter(Boolean).join(' · ')
  }
  if (result?.card === 'read') {
    const args = typeof node.args === 'object' && node.args !== null ? node.args as { offset?: unknown; limit?: unknown } : {}
    const requested = typeof args.offset === 'number' && typeof args.limit === 'number'
      ? `${args.offset}-${args.offset + args.limit - 1}`
      : String(result.offset)
    return `${pathFor(result.path, workspace)}:${requested} · ${result.lines.length}/${result.totalLines} lines${result.lang === undefined ? '' : ` · ${result.lang}`}`
  }
  if (result?.card === 'web') {
    if (result.kind === 'fetch') {
      let host = result.url
      try { host = new URL(result.url).host } catch { /* retain provider URL */ }
      return `${host} · ${result.statusCode}${result.truncated ? ' · capped' : ''}`
    }
    return `${result.sources.length} sources${result.truncated ? ' · capped' : ''}`
  }
  if (result?.card === 'generic') return bounded(firstLine(contentText(result.content) || node.output) || 'completed')
  if (node.name === 'todo_write') return todoSummary(node.args) ?? 'checklist'
  if (node.callView.card === 'terminal') return node.callView.description ?? node.callView.cwd ?? ''
  if (node.callView.card === 'diff') return `${node.callView.diffs.length} pending change${node.callView.diffs.length === 1 ? '' : 's'}`
  const location = node.callView.locations?.[0]
  return location === undefined
    ? genericSummary(node.callView.rawInput, workspace) || 'running'
    : `${pathFor(location.path, workspace)}${location.line === undefined ? '' : `:${location.line}`}`
}

/** Return a terminal-safe logical detail listing for one tool lifecycle. */
export function toolDetailLines(node: TranscriptToolNode): readonly string[] {
  if (node.delegation !== undefined) {
    const elapsed = Math.max(0, (node.delegation.endedAt ?? Date.now()) - node.delegation.startedAt)
    return [
      `Child: ${node.delegation.childId}`,
      `Provider: ${node.delegation.provider}`,
      `State: ${node.delegation.stopReason ?? 'running'}`,
      `Elapsed: ${Math.floor(elapsed / 1000)}s`,
      ...(node.delegation.outcome ?? node.output ?? '').split('\n'),
    ].map(terminalSafe)
  }
  const result = node.resultView
  if (result?.card === 'terminal') return [
    node.callView.card === 'terminal' ? node.callView.cwd ?? 'workspace' : 'workspace',
    `$ ${titleFor(node)}`,
    ...(result.output ?? node.output ?? '').split('\n'),
  ].map(terminalSafe)
  if (result?.card === 'diff') return result.diffs.flatMap(diff => [
    diff.path,
    ...(diff.oldText === null ? [] : terminalSafe(diff.oldText).split('\n').map(line => `- ${line}`)),
    ...terminalSafe(diff.newText).split('\n').map(line => `+ ${line}`),
  ])
  if (result?.card === 'search') {
    if (result.shape === 'paths') return result.paths.map(path => terminalSafe(`· ${path}`))
    return result.files.flatMap(file => [file.path, ...file.matches.map(match => `${match.lineNumber} ${match.line}`)]).map(terminalSafe)
  }
  if (result?.card === 'read') return [
    `${result.path} (${result.lang ?? 'text'})`,
    ...result.lines.map(line => `${line.number} | ${line.text}`),
  ].map(terminalSafe)
  if (result?.card === 'web') return result.kind === 'fetch'
    ? [result.url, ...(node.output ?? '').split('\n')].map(terminalSafe)
    : [result.answer ?? '', ...result.sources.flatMap(source => [source.title ?? source.url, source.url, source.snippet ?? ''])].map(terminalSafe)
  if (node.callView.card === 'terminal') return [
    node.callView.cwd ?? 'workspace', `$ ${node.callView.title}`, node.callView.description ?? '', node.output ?? '',
  ].flatMap(line => line.split('\n')).map(terminalSafe)
  if (node.callView.card === 'diff') return node.callView.diffs.flatMap(diff => [
    diff.path,
    ...(diff.oldText === null ? [] : terminalSafe(diff.oldText).split('\n').map(line => `- ${line}`)),
    ...terminalSafe(diff.newText).split('\n').map(line => `+ ${line}`),
  ])
  const body = result?.card === 'generic'
    ? contentText(result.content)
    : node.output ?? (contentText(node.callView.content) || safe(node.callView.rawInput))
  return body.split('\n').map(terminalSafe)
}

/** Render one paired tool lifecycle as a compact or detailed terminal card. */
export function ToolCard({ node, expanded, detailOffset = 0, detailRows = DETAIL_LINES, workspace }: {
  node: TranscriptToolNode
  expanded: boolean
  detailOffset?: number
  detailRows?: number
  workspace?: string | undefined
}): React.ReactElement {
  const theme = useTuiTheme()
  const state = toolDisplayState(node)
  const stateColor = state === 'queued' ? theme.tokens.muted
    : state === 'running' ? theme.tokens.warning
      : state === 'success' ? theme.tokens.success
        : state === 'cancelled' ? theme.tokens.muted : theme.tokens.error
  const stateMark = toolStateMark(node)
  const summary = toolSummary(node, workspace)
  const heading = <Text wrap="truncate-end">
    <Text bold {...tuiTextStyle(stateColor)}>{stateMark} {terminalSafe(pathFor(titleFor(node), workspace))}</Text>
    {summary !== '' && <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> · {terminalSafe(summary)}</Text>}
    <Text {...tuiTextStyle(theme.tokens.muted)} dimColor={theme.dim}> {expanded ? '▾' : '▸'}</Text>
  </Text>
  if (!expanded) return <Box flexGrow={1} flexShrink={1}>{heading}</Box>
  return <Box borderStyle="round" {...tuiBorderStyle(stateColor)} flexDirection="column" paddingX={1} flexShrink={0}>
    {heading}
    {node.errorCode !== undefined && <Text {...tuiTextStyle(theme.tokens.error)}>{terminalSafe(node.errorCode)}</Text>}
    <Box flexDirection="column">
      {toolDetailLines(node).slice(detailOffset, detailOffset + detailRows).map((line, index) =>
        <Text
          key={`${detailOffset + index}:${line}`}
          {...tuiTextStyle(node.callView.card !== 'diff' ? theme.tokens.text
            : line.startsWith('+ ') ? theme.tokens.diffAdd
              : line.startsWith('- ') ? theme.tokens.diffDelete : theme.tokens.text)}
          wrap="truncate-end"
        >{line}</Text>)}
    </Box>
  </Box>
}
