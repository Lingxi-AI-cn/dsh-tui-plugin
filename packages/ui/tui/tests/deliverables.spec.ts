import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import { ToolCallId, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  formatTuiDeliverableDetailLines, formatTuiDeliverablesRow,
  projectTuiDeliverables, projectTuiTurnDeliverables, tuiDeliverableInlineReferences,
} from '../src/deliverables.ts'
import type { TranscriptNode } from '../src/transcript.ts'
import { foldTranscript } from '../src/transcript.ts'

function diffNode(
  callId: string,
  turn: number,
  path: string,
  oldText: string | null,
  state: 'success' | 'error' = 'success',
): TranscriptNode {
  return {
    kind: 'tool', key: `tool:${callId}`, callId, turn, step: 0, name: 'edit', args: {},
    rawArguments: '{}', state,
    callView: { card: 'diff', title: 'Edit', diffs: [{ path, oldText, newText: 'after' }] },
    resultView: { card: 'diff', diffs: [{ path, oldText, newText: 'after' }] },
  }
}

describe('TUI deliverables projection', () => {
  it('keeps the first successful mutation per path from the latest turn', () => {
    const snapshot = projectTuiDeliverables([
      diffNode('old', 1, 'old.ts', null),
      diffNode('first', 2, 'src/a.ts', null),
      diffNode('duplicate', 2, 'src/a.ts', 'before'),
      diffNode('second', 2, 'src/b.ts', 'before'),
    ])
    expect(snapshot).toEqual({
      turn: 2,
      items: [
        { path: 'src/a.ts', operation: 'write', turn: 2, callId: 'first' },
        { path: 'src/b.ts', operation: 'edit', turn: 2, callId: 'second' },
      ],
      omitted: 0,
    })
  })

  it('excludes reads, deletes, failed mutations, and unbounded paths', () => {
    const generic: TranscriptNode = {
      kind: 'tool', key: 'tool:read', callId: 'read', turn: 4, name: 'read', args: {}, rawArguments: '{}', state: 'success',
      callView: { card: 'generic', title: 'Read', kind: 'read', locations: [{ path: 'read.ts' }] },
    }
    const deleted: TranscriptNode = {
      kind: 'tool', key: 'tool:delete', callId: 'delete', turn: 4, name: 'delete', args: {}, rawArguments: '{}', state: 'success',
      callView: { card: 'generic', title: 'Delete', kind: 'delete', locations: [{ path: 'deleted.ts' }] },
    }
    const longPath = `/tmp/${'x'.repeat(2_000)}.ts`
    const snapshot = projectTuiDeliverables([
      generic,
      deleted,
      diffNode('failed', 4, 'failed.ts', null, 'error'),
      diffNode('long', 4, longPath, null),
      diffNode('control', 4, 'unsafe\npath.ts', null),
    ])
    expect(snapshot.items).toEqual([])
  })

  it('projects one exact Turn and fits hidden paths into a width-aware +N row', () => {
    const nodes = [
      diffNode('old', 1, 'old.ts', null),
      diffNode('a', 2, 'src/a.ts', null),
      diffNode('b', 2, 'src/a-file-with-a-long-name.ts', 'before'),
    ]
    const snapshot = projectTuiTurnDeliverables(nodes, 2)
    expect(snapshot.items.map(item => item.path)).toEqual(['src/a.ts', 'src/a-file-with-a-long-name.ts'])
    const row = formatTuiDeliverablesRow(snapshot, 22, 'en')
    expect(stringWidth(row.text)).toBeLessThanOrEqual(22)
    expect(row.text).toContain('+1')
    expect(row.omitted).toBe(1)
    expect(stringWidth(formatTuiDeliverablesRow(snapshot, 4, 'zh').text)).toBeLessThanOrEqual(4)
  })

  it('keeps each detail item on one bounded physical row', () => {
    const snapshot = projectTuiTurnDeliverables([
      diffNode('a', 2, 'src/a-file-with-a-very-long-name.ts', null),
      diffNode('b', 2, '文档/输出结果.md', 'before'),
    ], 2)
    const lines = formatTuiDeliverableDetailLines(snapshot, 18)
    expect(lines).toHaveLength(2)
    expect(lines.every(line => stringWidth(line) <= 18)).toBe(true)
    expect(lines[0]).toMatch(/^1\. write/u)
    expect(lines[1]).toMatch(/^2\. edit/u)
    const chinese = formatTuiDeliverableDetailLines(snapshot, 40, 'zh')
    expect(chinese[0]).toContain('写入')
    expect(chinese[1]).toContain('编辑')
    expect(chinese.every(line => stringWidth(line) <= 40)).toBe(true)
  })

  it('appends successful mutation facts after the closing assistant node', () => {
    const callId = ToolCallId('write-1')
    const events = [
      { type: 'tool/call', seq: 1, time: 10, data: { turn: 1, step: 1, callId, name: 'write', arguments: '{}' } },
      {
        type: 'tool/result', seq: 2, time: 20,
        data: {
          turn: 1, step: 1,
          message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'ok' }], isError: false }),
        },
        surfaceOp: 'append',
      },
      {
        type: 'assistant/message', seq: 3, time: 30,
        data: {
          turn: 1, step: 2,
          message: createAssistantMessage({
            content: [{ type: 'text', text: 'Done' }], source: { provider: 'test', model: 'test' },
          }),
        },
        surfaceOp: 'append',
      },
      { type: 'turn/end', seq: 4, time: 40, data: { turn: 1, reason: { kind: 'completed' } } },
    ] as SessionEvent[]
    const nodes = foldTranscript(events, () => ({
      name: 'write', description: '', parameters: {},
      presentCall: () => ({
        card: 'generic', title: 'Write', kind: 'edit', locations: [{ path: 'src/output.ts' }],
      }),
    } as never))
    expect(nodes.map(node => node.kind)).toEqual(['tool-activity', 'text', 'deliverables'])
    expect(nodes.at(-1)).toMatchObject({
      kind: 'deliverables', turn: 1,
      items: [{ path: 'src/output.ts', operation: 'edit', callId: 'write-1' }],
    })
  })

  it('resolves only same-turn closing inline code to exact or unique delivered paths', () => {
    const delivered = {
      kind: 'deliverables' as const,
      key: 'deliverables:2',
      turn: 2,
      items: [
        { path: 'src/output.ts', operation: 'write' as const, turn: 2, callId: 'a' },
        { path: 'docs/report.txt', operation: 'edit' as const, turn: 2, callId: 'b' },
        { path: 'archive/report.txt', operation: 'move' as const, turn: 2, callId: 'c' },
        { path: 'C:\\work\\summary.txt', operation: 'write' as const, turn: 2, callId: 'd' },
      ],
      omitted: 0,
    }
    const closing = {
      kind: 'text' as const,
      key: 'event:closing',
      tone: 'assistant' as const,
      label: 'Assistant',
      text: 'Created `src/output.ts` and `summary.txt`; report.txt is ambiguous. Plain docs/report.txt is inert.',
      messageId: 'message-2',
      turn: 2,
      step: 1,
      closing: true as const,
    }
    expect(tuiDeliverableInlineReferences(closing, delivered)).toEqual([
      { text: 'src/output.ts', path: 'src/output.ts', itemIndex: 0 },
      { text: 'summary.txt', path: 'C:\\work\\summary.txt', itemIndex: 3 },
    ])
    expect(tuiDeliverableInlineReferences({ ...closing, closing: undefined }, delivered)).toEqual([])
    expect(tuiDeliverableInlineReferences({ ...closing, turn: 3 }, delivered)).toEqual([])
  })
})
