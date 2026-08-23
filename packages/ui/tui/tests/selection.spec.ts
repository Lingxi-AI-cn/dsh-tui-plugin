import { describe, expect, it } from 'vitest'
import {
  advanceTuiScreenClick, extendTuiScreenSelection, projectTuiScreenMap, resolveTuiScreenSelection,
  tuiScreenSelectionText, tuiScreenTextSegments,
  type TuiScreenMap, type TuiScreenSelection,
} from '../src/index.ts'
import { tuiTranscriptScreenMapLines } from '../src/transcript-view.tsx'
import { todoPanelScreenMapLines } from '../src/todo-panel.tsx'
import type { TranscriptToolNode } from '../src/transcript.ts'

function textFor(map: TuiScreenMap, selection: TuiScreenSelection): string {
  const parts: string[] = []
  for (let row = selection.start.row; row <= selection.end.row; row += 1) {
    const cells = map.rows[row]?.cells ?? []
    const first = row === selection.start.row ? selection.start.column : 0
    const last = row === selection.end.row ? selection.end.column : cells.length - 1
    for (let column = first; column <= last; column += 1) {
      const cell = cells[column]
      if (cell?.source === 'text' && cell.selectable && !cell.continuation) parts.push(cell.grapheme)
    }
  }
  return parts.join('')
}

function columnOf(map: TuiScreenMap, row: number, grapheme: string): number {
  const column = map.rows[row]?.cells.findIndex(cell => cell.grapheme === grapheme) ?? -1
  if (column < 0) throw new Error(`Missing grapheme ${grapheme}`)
  return column
}

describe('resolveTuiScreenSelection', () => {
  it('keeps an unmoved drag available to the ordinary click owner', () => {
    const map = projectTuiScreenMap([{ semanticBlockKey: 'one', text: 'hello' }], { columns: 12 })
    expect(resolveTuiScreenSelection(map, { kind: 'drag', anchor: { row: 0, column: 1 }, focus: { row: 0, column: 1 } })).toBeUndefined()
    expect(resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 10 } })).toBeUndefined()
  })

  it('selects a path or URL as one contiguous word class', () => {
    const map = projectTuiScreenMap([{ semanticBlockKey: 'path', text: 'open src/foo.ts https://a.test/x?q=1' }], { columns: 60 })
    const path = resolveTuiScreenSelection(map, {
      kind: 'double', at: { row: 0, column: columnOf(map, 0, 'f') },
    })
    const url = resolveTuiScreenSelection(map, {
      kind: 'double', at: { row: 0, column: columnOf(map, 0, 'h') },
    })
    expect(path).toBeDefined()
    expect(url).toBeDefined()
    expect(textFor(map, path!)).toBe('src/foo.ts')
    expect(textFor(map, url!)).toBe('https://a.test/x?q=1')
  })

  it('keeps CJK and emoji atomic, and punctuation and spaces deterministic', () => {
    const map = projectTuiScreenMap([{ semanticBlockKey: 'unicode', text: '中🙂,  x' }], { columns: 20 })
    const cjk = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 0 } })
    const emoji = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 2 } })
    const punctuation = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 4 } })
    const spaces = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 5 } })

    expect(textFor(map, cjk!)).toBe('中')
    expect(textFor(map, emoji!)).toBe('🙂')
    expect(textFor(map, punctuation!)).toBe(',')
    expect(textFor(map, spaces!)).toBe('  ')
    expect(cjk?.end.column).toBe(1)
    expect(emoji?.end.column).toBe(3)
  })

  it('selects a complete soft-wrapped logical line on triple click', () => {
    const map = projectTuiScreenMap([{ semanticBlockKey: 'line', text: 'abcd\nxy' }], { columns: 3 })
    const firstLine = resolveTuiScreenSelection(map, { kind: 'triple', at: { row: 1, column: 0 } })
    const secondLine = resolveTuiScreenSelection(map, { kind: 'triple', at: { row: 2, column: 0 } })

    expect(firstLine).toMatchObject({ start: { row: 0, column: 0 }, end: { row: 1, column: 0 }, kind: 'triple' })
    expect(secondLine).toMatchObject({ start: { row: 2, column: 0 }, end: { row: 2, column: 1 }, kind: 'triple' })
    expect(textFor(map, firstLine!)).toBe('abcd')
    expect(textFor(map, secondLine!)).toBe('xy')
  })

  it('expands an existing range by grapheme and logical-line edge from the keyboard', () => {
    const map = projectTuiScreenMap([{ semanticBlockKey: 'line', text: 'alpha beta' }], { columns: 6 })
    const beta = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 1, column: 1 } })
    expect(beta).toBeDefined()
    const left = extendTuiScreenSelection(map, beta!, 'left')
    expect(left.kind).toBe('keyboard')
    expect(tuiScreenSelectionText(map, left)).toBe(' beta')
    const home = extendTuiScreenSelection(map, left, 'home')
    expect(tuiScreenSelectionText(map, home)).toBe('alpha beta')
    expect(extendTuiScreenSelection(map, home, 'right')).toBe(home)
  })

  it('never resolves a gutter or padding cell', () => {
    const map = projectTuiScreenMap([{ semanticBlockKey: 'gutter', gutter: '> ', text: 'x' }], { columns: 5 })
    expect(resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 0 } })).toBeUndefined()
    expect(resolveTuiScreenSelection(map, { kind: 'triple', at: { row: 0, column: 0 } })).toBeUndefined()
    expect(resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 4 } })).toBeUndefined()
  })
})

describe('screen selection projection', () => {
  it('keeps transcript labels and structural rows out of copied body text', () => {
    const lines = tuiTranscriptScreenMapLines([{
      node: { kind: 'text', key: 'event:1', tone: 'user', label: 'You', text: 'hello world' },
      text: 'hello world',
    }], 12)
    const map = projectTuiScreenMap(lines, { columns: 20 })
    expect(map.rows[0]?.cells.some(cell => cell.selectable)).toBe(false)
    expect(map.rows[1]?.cells.some(cell => cell.selectable)).toBe(true)
    const selection = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 1, column: 3 } })
    expect(selection).toBeDefined()
    expect(tuiScreenSelectionText(map, selection!)).toBe('hello')
  })

  it('copies soft-wrapped text without gutters or padding and keeps hard newlines', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'one', gutter: '› ', text: 'abcd\nxy' },
      { semanticBlockKey: 'two', gutter: '  ', text: 'last' },
    ], { columns: 5 })
    const selection = resolveTuiScreenSelection(map, { kind: 'triple', at: { row: 1, column: 2 } })
    expect(selection).toBeDefined()
    expect(tuiScreenSelectionText(map, selection!)).toBe('abcd')
    const whole = resolveTuiScreenSelection(map, { kind: 'drag', anchor: { row: 0, column: 2 }, focus: { row: 4, column: 2 } })
    expect(whole).toBeDefined()
    expect(tuiScreenSelectionText(map, whole!)).toBe('abcd\nxy\nlast')
  })

  it('keeps compact tool headings selectable while structural rows stay excluded', () => {
    const node: TranscriptToolNode = {
      kind: 'tool', key: 'tool:heading', callId: 'heading', name: 'read', args: {}, rawArguments: '{}',
      state: 'success', callView: { card: 'generic', title: 'Fixture' },
    }
    const lines = tuiTranscriptScreenMapLines([{ node }], 40)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.selectable).toBe(true)
    const map = projectTuiScreenMap(lines, { columns: 43 })
    const heading = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 5 } })
    expect(heading).toBeDefined()
    expect(tuiScreenSelectionText(map, heading!)).toBe('Fixture')
  })

  it('projects tool-group headings and child rows as separate selectable blocks', () => {
    const child: TranscriptToolNode = {
      kind: 'tool', key: 'tool:group-child', callId: 'group-child', name: 'read', args: {}, rawArguments: '{}',
      state: 'success', callView: { card: 'generic', title: 'src/example.ts' },
    }
    const group = {
      kind: 'tool-group' as const,
      key: 'group:selection',
      activity: 'parallel' as const,
      closed: true,
      tools: [child],
    }
    const lines = tuiTranscriptScreenMapLines([{ node: group }], 60)
    expect(lines.map(line => [line.semanticBlockKey, line.selectable])).toEqual([
      ['group:selection', true],
      ['tool:group-child', true],
    ])
    const map = projectTuiScreenMap(lines, { columns: 63 })
    const heading = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 0, column: 4 } })
    const childHeading = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 1, column: 10 } })
    expect(heading).toBeDefined()
    expect(childHeading).toBeDefined()
    expect(tuiScreenSelectionText(map, heading!)).toBe('Parallel')
    expect(tuiScreenSelectionText(map, childHeading!)).toBe('src/example.ts')
  })

  it('projects compaction status and summary rows without selecting their structural margin', () => {
    const node = {
      kind: 'compaction' as const,
      key: 'compaction:selection',
      compactionId: 'selection',
      state: 'success' as const,
      summary: 'Retained decisions',
      shadowedItemCount: 2,
      shadowedTokenCount: 120,
      shadowedRange: { start: 1, end: 2 },
    }
    const lines = tuiTranscriptScreenMapLines([{ node }], 60)
    expect(lines.map(line => line.selectable)).toEqual([true, true])
    const map = projectTuiScreenMap(lines, { columns: 63 })
    const summary = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 1, column: 4 } })
    expect(summary).toBeDefined()
    expect(tuiScreenSelectionText(map, summary!)).toBe('Retained')
  })

  it('projects pinned Tasks headings and content while excluding markers and omitted rows', () => {
    const lines = todoPanelScreenMapLines({
      kind: 'todo', key: 'todo:latest', todos: [
        { content: 'Inspect src', status: 'in_progress' },
        { content: 'Run tests', status: 'pending' },
        { content: 'Write release note', status: 'pending' },
        { content: 'Publish', status: 'pending' },
        { content: 'Verify', status: 'pending' },
        { content: 'Archive', status: 'pending' },
        { content: 'Omitted', status: 'pending' },
      ],
    })
    expect(lines.map(line => [line.semanticBlockKey, line.selectable])).toEqual([
      ['todo:latest', true],
      ['todo:latest:item:0', true],
      ['todo:latest:item:1', true],
      ['todo:latest:item:2', true],
      ['todo:latest:item:3', true],
      ['todo:latest:item:4', true],
      ['todo:latest:item:5', true],
      ['todo:latest', false],
    ])
    const map = projectTuiScreenMap(lines, { columns: 28, maxRows: 8 })
    const task = resolveTuiScreenSelection(map, { kind: 'double', at: { row: 1, column: 12 } })
    expect(task).toBeDefined()
    expect(tuiScreenSelectionText(map, task!)).toBe('src')
    expect(resolveTuiScreenSelection(map, { kind: 'double', at: { row: 1, column: 2 } })).toBeUndefined()
    expect(resolveTuiScreenSelection(map, { kind: 'double', at: { row: 7, column: 8 } })).toBeUndefined()
  })

  it('returns grapheme-safe highlight segments and bounded click counts', () => {
    const map = projectTuiScreenMap([{ semanticBlockKey: 'one', gutter: '> ', text: 'ab中🙂' }], { columns: 12 })
    const selection = resolveTuiScreenSelection(map, { kind: 'drag', anchor: { row: 0, column: 4 }, focus: { row: 0, column: 7 } })
    expect(tuiScreenTextSegments(map, 0, selection)).toEqual([
      { text: 'ab', selected: false },
      { text: '中🙂', selected: true },
    ])
    const first = advanceTuiScreenClick(undefined, { surface: 'detail', at: { row: 1, column: 2 } }, 100)
    const second = advanceTuiScreenClick(first, { surface: 'detail', at: { row: 1, column: 2 } }, 200)
    const third = advanceTuiScreenClick(second, { surface: 'detail', at: { row: 1, column: 2 } }, 300)
    const restart = advanceTuiScreenClick(third, { surface: 'detail', at: { row: 1, column: 2 } }, 400)
    expect([first.count, second.count, third.count, restart.count]).toEqual([1, 2, 3, 1])
    expect(advanceTuiScreenClick(first, { surface: 'other', at: first.at }, 200).count).toBe(1)
    expect(advanceTuiScreenClick(first, { surface: 'detail', at: first.at }, 701).count).toBe(1)
  })
})
