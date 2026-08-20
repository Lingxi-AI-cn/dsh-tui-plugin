/** Opt-in deterministic benchmark for native TUI long-session projection and rendering. */

import { Readable, Writable } from 'node:stream'
import { cpus, release, totalmem } from 'node:os'
import { performance } from 'node:perf_hooks'
import React, { type ReactElement, type ReactNode } from 'react'
import { Box, render, Text } from 'ink'
import { describe, expect, it } from 'vitest'
import { CommandId } from '@deepseek-ai/dsh-commands'
import {
  CallId, createAssistantMessage, createToolResultMessage, createUserMessage,
} from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import {
  foldTranscript, TuiTranscriptProjectionCache, type TranscriptNode, type TranscriptTodoNode,
} from '../src/transcript.ts'
import { TuiTranscriptSearchIndex } from '../src/transcript-search.ts'
import { TuiTranscriptView } from '../src/transcript-view.tsx'
import { TuiTranscriptDetailCache } from '../src/detail.ts'
import {
  TuiTranscriptScrollController, TuiTranscriptViewportIndex,
  type TranscriptWindowEntry, type TuiTranscriptVirtualWindow,
} from '../src/viewport.ts'
import { TodoPanel, todoPanelRows } from '../src/todo-panel.tsx'

const NODE_COUNTS = [100, 1_000, 10_000] as const
const FRAME_ROWS = 24
const TRANSCRIPT_ROWS = 16
const LARGE_OUTPUT = Array.from({ length: 160 }, (_, index) =>
  `${String(index + 1).padStart(3, '0')} | ${'large deterministic output '.repeat(4)}`).join('\n')
const TARGETS = Object.freeze({
  initialFoldP95Ms10k: 250,
  appendProjectionRenderP95Ms10k: 16,
  pageUpP95Ms10k: 16,
  searchNextP95Ms10k: 16,
  searchRefreshP95Ms10k: 16,
  resizeP95Ms10k: 50,
  detailOpenP95Ms10k: 16,
  retainedHeapBytes10k: 128 * 1024 * 1024,
  mountedReactElements10k: 240,
  outputBytesPerFrame10k: 16 * 1024,
})

interface LongSessionFixture {
  readonly events: readonly SessionEvent[]
  readonly appendedEvents: readonly SessionEvent[]
}

interface SampleSummary {
  readonly medianMs: number
  readonly p95Ms: number
}

interface CaptureStream extends NodeJS.WriteStream {
  columns: number
  rows: number
  isTTY: boolean
  readonly chunks: Buffer[]
  reset(): void
  largestChunkBytes(): number
}

type SessionEventInput = {
  [T in SessionEvent['type']]: readonly [
    type: T,
    data: Extract<SessionEvent, { type: T }>['data'],
  ]
}[SessionEvent['type']]

function event<T extends SessionEvent['type']>(
  seq: number,
  type: T,
  data: Extract<SessionEvent, { type: T }>['data'],
): Extract<SessionEvent, { type: T }> {
  const surfaceOp = type === 'user/message' || type === 'assistant/message' || type === 'tool/result'
    ? { surfaceOp: 'append' as const }
    : {}
  return { seq, time: seq, type, data, ...surfaceOp } as Extract<SessionEvent, { type: T }>
}

function longSessionFixture(nodeCount: number): LongSessionFixture {
  const events: SessionEvent[] = []
  let seq = 0
  const append = (...[type, data]: SessionEventInput): void => {
    const currentSeq = seq++
    const surfaceOp = type === 'user/message' || type === 'assistant/message' || type === 'tool/result'
      ? { surfaceOp: 'append' as const }
      : {}
    events.push({ seq: currentSeq, time: currentSeq, type, data, ...surfaceOp } as SessionEvent)
  }
  const ordinaryNodes = nodeCount - 1
  const streamTurn = ordinaryNodes + 1

  for (let index = 0; index < ordinaryNodes; index += 1) {
    const turn = index + 1
    if (index === ordinaryNodes - 1) {
      append('assistant/chunk', {
        turn: streamTurn, step: 1,
        chunk: { type: 'text-delta', index: 0, text: `streaming needle ${index}` },
      })
      continue
    }
    if (index % 5 === 0) {
      append('user/message', createUserMessage({
        content: [{ type: 'text', text: `Inspect fixture block ${index}${index % 100 === 0 ? ' needle' : ''}` }],
        source: { kind: 'user' },
      }))
      continue
    }
    if (index % 5 === 1) {
      append('assistant/message', {
        turn, step: 1,
        message: createAssistantMessage({
          content: [{
            type: 'text',
            text: `## Result ${index}\n\n- deterministic Markdown\n- Unicode 中文 e\u0301\n\n\`needle-${index}\``,
          }],
          source: { provider: 'fixture', model: 'benchmark' },
        }),
      })
      continue
    }
    if (index % 5 === 2) {
      const callId = CallId(`tool-${index}`)
      append('tool/call', {
        turn, step: 1, callId, name: 'fixture_tool',
        arguments: JSON.stringify({ path: `/workspace/src/file-${index}.ts`, needle: index }),
      })
      append('tool/result', {
        turn, step: 1,
        message: createToolResultMessage({
          callId,
          content: [{ type: 'text', text: index % 250 === 2 ? LARGE_OUTPUT : `tool result ${index} needle` }],
          isError: false,
        }),
      })
      continue
    }
    if (index % 5 === 3) {
      const members = Array.from({ length: 3 }, (_, member) => ({
        callId: CallId(`group-${index}-${member}`),
        name: member === 0 ? 'subagent' : 'fixture_tool',
        arguments: JSON.stringify({ index, member }),
      }))
      const delegate = members[0]
      if (delegate === undefined) throw new Error('delegation fixture requires one member')
      append('tool/execution-group', {
        turn, step: 1, group: 0, mode: 'parallel', members, closed: false,
      })
      for (const member of members) append('tool/call', { turn, step: 1, ...member })
      append('subagent/delegation-start', {
        runId: `run-${index}` as never,
        callId: delegate.callId,
        childId: `child-${index}` as never,
        provider: 'spawn',
        label: `Inspect group ${index}`,
        local: true,
      })
      for (const member of members) append('tool/result', {
        turn, step: 1,
        message: createToolResultMessage({
          callId: member.callId,
          content: [{ type: 'text', text: `group result ${index} needle` }],
          isError: false,
        }),
      })
      append('subagent/delegation-end', {
        runId: `run-${index}` as never,
        stopReason: 'completed',
        lastAssistantMessage: [{ type: 'text', text: `delegation outcome ${index} needle` }],
      })
      append('tool/execution-group', {
        turn, step: 1, group: 0, mode: 'parallel', members, closed: true,
      })
      continue
    }
    append('command/done', {
      commandId: CommandId(`command-${index}`),
      kind: 'success',
      text: `command result ${index} needle`,
    })
  }

  append('todo/write', { todos: [
    { content: 'Measure initial fold', status: 'completed' },
    { content: 'Measure streaming append', status: 'in_progress' },
    { content: 'Retain deterministic task fixture', status: 'pending' },
  ] })
  const appended = event(seq, 'assistant/chunk', {
    turn: streamTurn, step: 1,
    chunk: { type: 'text-delta', index: 0, text: ' appended streaming needle' },
  })
  return { events: Object.freeze(events), appendedEvents: Object.freeze([...events, appended]) }
}

function samples(operation: () => void, count = 7): SampleSummary {
  operation()
  const elapsed = Array.from({ length: count }, () => {
    const started = performance.now()
    operation()
    return performance.now() - started
  }).sort((left, right) => left - right)
  const median = elapsed[Math.floor(elapsed.length / 2)] ?? 0
  const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1] ?? 0
  return { medianMs: Number(median.toFixed(3)), p95Ms: Number(p95.toFixed(3)) }
}

function samplesWithSetup(setup: () => void, operation: () => void, count = 7): SampleSummary {
  setup()
  operation()
  const elapsed = Array.from({ length: count }, () => {
    setup()
    const started = performance.now()
    operation()
    return performance.now() - started
  }).sort((left, right) => left - right)
  const median = elapsed[Math.floor(elapsed.length / 2)] ?? 0
  const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1] ?? 0
  return { medianMs: Number(median.toFixed(3)), p95Ms: Number(p95.toFixed(3)) }
}

function captureStream(columns = 80): CaptureStream {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: string | Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
      chunks.push(Buffer.from(chunk))
      callback()
    },
  }) as unknown as CaptureStream
  stream.columns = columns
  stream.rows = FRAME_ROWS
  stream.isTTY = true
  Object.defineProperty(stream, 'chunks', { value: chunks })
  stream.reset = (): void => { chunks.length = 0 }
  stream.largestChunkBytes = (): number => chunks.reduce((largest, chunk) => Math.max(largest, chunk.byteLength), 0)
  return stream
}

function BenchmarkFrame({
  entries,
  overscanBefore,
  overscanAfter,
  todo,
  detailLines,
}: {
  entries: readonly TranscriptWindowEntry[]
  overscanBefore?: readonly TranscriptWindowEntry[] | undefined
  overscanAfter?: readonly TranscriptWindowEntry[] | undefined
  todo?: TranscriptTodoNode | undefined
  detailLines?: readonly string[] | undefined
}): React.ReactElement {
  return <Box flexDirection="column" height={FRAME_ROWS} width="100%">
    <Box borderStyle="round" borderColor="blue" paddingX={1} flexShrink={0}>
      <Text bold color="blue">DeepSeek Harness</Text><Text dimColor> · TUI benchmark</Text>
    </Box>
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
      <TuiTranscriptView
        entries={entries}
        overscanBefore={overscanBefore}
        overscanAfter={overscanAfter}
        workspace="/workspace"
      />
    </Box>
    {detailLines !== undefined && <Box height={7} paddingX={1} overflow="hidden" flexShrink={0}>
      <Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1} flexShrink={0}>
        <Text bold color="blue">Detail</Text>
        {detailLines.slice(0, 4).map((line, index) => <Text key={`${index}:${line}`} wrap="truncate-end">{line}</Text>)}
      </Box>
    </Box>}
    {todo !== undefined && <Box paddingX={1} flexShrink={0}><TodoPanel node={todo} /></Box>}
    <Box borderStyle="round" borderColor="green" paddingX={1} flexShrink={0}><Text>prompt › </Text></Box>
    <Box paddingX={1} flexShrink={0}><Text wrap="truncate-end">model · permission · context · transcript</Text></Box>
  </Box>
}

function expandedReactElementCount(node: ReactNode): number {
  if (Array.isArray(node)) {
    let total = 0
    for (const child of node as readonly ReactNode[]) total += expandedReactElementCount(child)
    return total
  }
  if (!React.isValidElement(node)) return 0
  const element = node as ReactElement<Record<string, unknown>>
  let rendered: ReactNode = element.props.children as ReactNode
  if (typeof element.type === 'function') {
    // The measured tree contains pure function components and Ink forward refs, never classes or hooks.
    const component = element.type as (props: Record<string, unknown>) => ReactNode
    rendered = component(element.props)
  } else if (typeof element.type === 'object' && element.type !== null && 'render' in element.type) {
    const forwardRef = element.type as { render(props: Record<string, unknown>, ref: unknown): ReactNode }
    rendered = forwardRef.render(element.props, null)
  }
  return 1 + expandedReactElementCount(rendered)
}

function projectedRows(nodes: readonly TranscriptNode[]): {
  readonly rows: readonly TranscriptNode[]
  readonly todo: TranscriptTodoNode | undefined
} {
  const todo = nodes.find((node): node is TranscriptTodoNode => node.kind === 'todo')
  return { rows: nodes.filter(node => node.kind !== 'todo'), todo }
}

function forceGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc
  if (gc === undefined) throw new Error('long-session benchmark requires --expose-gc')
  gc()
}

describe('native TUI long-session benchmark', () => {
  it('records deterministic 100/1,000/10,000-node projection, navigation, and render baselines', () => {
    const results: Record<string, unknown>[] = []
    for (const nodeCount of NODE_COUNTS) {
      forceGc()
      const heapBefore = process.memoryUsage().heapUsed
      const fixture = longSessionFixture(nodeCount)
      const projection = foldTranscript(fixture.events)
      const searchIndex = new TuiTranscriptSearchIndex()
      searchIndex.update(projection)
      forceGc()
      const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore)

      expect(projection).toHaveLength(nodeCount)
      expect(projection.some(node => node.kind === 'tool-group')).toBe(true)
      expect(projection.some(node => node.kind === 'todo')).toBe(true)
      expect(projection.some(node => node.kind === 'tool' && node.output?.includes('large deterministic output'))).toBe(true)
      expect(projection.some(node => node.kind === 'tool-group'
        && node.tools.some(tool => tool.delegation?.stopReason === 'completed'))).toBe(true)

      let folded: readonly TranscriptNode[] = projection
      const initialFold = samples(() => { folded = foldTranscript(fixture.events) })
      const appendedFold = samples(() => { folded = foldTranscript(fixture.appendedEvents) })
      const { rows, todo } = projectedRows(projection)
      const pageRows = Math.max(1, TRANSCRIPT_ROWS - todoPanelRows(todo))
      const viewport = new TuiTranscriptViewportIndex()
      const scroll = new TuiTranscriptScrollController(viewport)
      viewport.update(rows, 80)
      const tail = viewport.page(pageRows)
      let page: TuiTranscriptVirtualWindow = tail
      const pageUp = samples(() => {
        page = viewport.page(pageRows, scroll.previous(tail, pageRows))
      })

      const hits = searchIndex.search('needle')
      expect(hits.length).toBeGreaterThan(0)
      let hitIndex = 0
      const searchNext = samples(() => {
        hitIndex = (hitIndex + 1) % hits.length
        const hit = hits.at(hitIndex)
        if (hit === undefined) throw new Error('search hit disappeared during deterministic benchmark')
        page = viewport.page(pageRows, scroll.reveal(hit.key, hit.nodeIndex))
      })
      const searchRefresh = samples(() => {
        searchIndex.update(projection)
        searchIndex.search('needle')
      })

      const resize = Object.fromEntries([40, 80, 160].map(columns => [columns, samplesWithSetup(
        () => { viewport.update(rows, columns === 80 ? 81 : 80) },
        () => {
          viewport.update(rows, columns)
          const middleIndex = Math.floor(rows.length / 2)
          const middle = rows[middleIndex]
          page = viewport.page(pageRows, middle === undefined ? undefined : scroll.reveal(middle.key, middleIndex))
        },
      )]))
      viewport.update(rows, 80)

      const detailNode = projection.find((node): node is Extract<TranscriptNode, { kind: 'tool' }> =>
        node.kind === 'tool' && node.output?.includes('large deterministic output') === true)
      if (detailNode === undefined) throw new Error('large-output detail fixture did not project')
      const detailCache = new TuiTranscriptDetailCache()
      let detailLines: readonly string[] = []
      const detailProjection = samplesWithSetup(() => { detailCache.reset() }, () => {
        detailLines = detailCache.lines(detailNode, 76)
      })
      expect(detailLines.length).toBeGreaterThan(160)

      const frame = <BenchmarkFrame
        entries={tail.entries}
        overscanBefore={tail.overscanBefore}
        overscanAfter={tail.overscanAfter}
        todo={todo}
      />
      const mountedReactElements = expandedReactElementCount(frame)
      const stdout = captureStream(80)
      const stdin = new Readable({ read() {} }) as NodeJS.ReadStream
      const stderr = captureStream(80)
      const instance = render(frame, {
        stdout,
        stdin,
        stderr,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false,
      })
      stdout.reset()
      let outputBytesPerFrame = 0
      const projectionCache = new TuiTranscriptProjectionCache()
      const appendedProjectionRender = samplesWithSetup(() => {
        projectionCache.reset()
        projectionCache.update(fixture.events)
        instance.rerender(frame)
        stdout.reset()
      }, () => {
        const nextProjection = projectionCache.update(fixture.appendedEvents)
        const next = projectedRows(nextProjection)
        viewport.update(next.rows, 80)
        const nextPage = viewport.page(pageRows)
        instance.rerender(<BenchmarkFrame
          entries={nextPage.entries}
          overscanBefore={nextPage.overscanBefore}
          overscanAfter={nextPage.overscanAfter}
          todo={next.todo}
        />)
        outputBytesPerFrame = Math.max(outputBytesPerFrame, stdout.largestChunkBytes())
        stdout.reset()
      })
      const detailOpen = samplesWithSetup(() => {
        detailCache.reset()
        instance.rerender(frame)
        stdout.reset()
      }, () => {
        detailLines = detailCache.lines(detailNode, 76)
        instance.rerender(<BenchmarkFrame
          entries={tail.entries}
          overscanBefore={tail.overscanBefore}
          overscanAfter={tail.overscanAfter}
          todo={todo}
          detailLines={detailLines}
        />)
        outputBytesPerFrame = Math.max(outputBytesPerFrame, stdout.largestChunkBytes())
        stdout.reset()
        instance.rerender(frame)
        stdout.reset()
      })
      instance.unmount()
      instance.cleanup()

      results.push({
        nodeCount,
        eventCount: fixture.events.length,
        initialFold,
        appendedFold,
        appendProjectionRender: appendedProjectionRender,
        pageUp,
        searchNext,
        searchRefresh,
        resize,
        detailProjection,
        detailOpen,
        retainedHeapBytes,
        mountedReactElements,
        mountedTranscriptBlocks: tail.mountedEndIndex - tail.mountedStartIndex + 1,
        measuredTranscriptBlocks: viewport.stats().measuredBlocks,
        indexedTranscriptRows: viewport.stats().indexedRows,
        outputBytesPerFrame,
      })
      expect(folded).toHaveLength(nodeCount)
      expect(page.entries.length).toBeGreaterThan(0)
    }

    console.log(JSON.stringify({
      benchmark: 'native-tui-long-session',
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        release: release(),
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
        totalMemoryBytes: totalmem(),
      },
      samplesPerMetric: 7,
      targets: TARGETS,
      results,
    }, null, 2))
  })
})
