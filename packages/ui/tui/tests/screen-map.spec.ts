import { describe, expect, it } from 'vitest'
import { projectTuiScreenMap, tuiBidiVisualText, tuiScreenSelectionText } from '../src/index.ts'

describe('projectTuiScreenMap', () => {
  it('records soft wraps and hard newlines while repeating a non-selectable gutter', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'message:1', gutter: '1 ', text: 'abcdE\nxy' },
    ], { columns: 4 })

    expect(map.rows.map(row => ({ softWrap: row.softWrap, hardNewline: row.hardNewline }))).toEqual([
      { softWrap: true, hardNewline: false },
      { softWrap: true, hardNewline: false },
      { softWrap: false, hardNewline: true },
      { softWrap: false, hardNewline: false },
    ])
    expect(map.rows[0]?.cells.slice(0, 2).map(cell => [cell.source, cell.selectable])).toEqual([
      ['gutter', false], ['gutter', false],
    ])
    expect(map.rows[2]?.cells.at(-1)).toMatchObject({ hardNewline: true, selectable: false })
  })

  it('keeps CJK and emoji graphemes atomic with continuation cells', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'unicode', text: 'A中B 👨‍👩‍👧‍👦' },
    ], { columns: 8 })

    const cells = map.rows.flatMap(row => row.cells)
    expect(cells.slice(0, 4).map(cell => ({
      grapheme: cell.grapheme, displayWidth: cell.displayWidth, continuation: cell.continuation,
    }))).toEqual([
      { grapheme: 'A', displayWidth: 1, continuation: false },
      { grapheme: '中', displayWidth: 2, continuation: false },
      { grapheme: '', displayWidth: 0, continuation: true },
      { grapheme: 'B', displayWidth: 1, continuation: false },
    ])
    const familyIndex = cells.findIndex(cell => cell.grapheme === '👨‍👩‍👧‍👦')
    expect(familyIndex).toBeGreaterThan(0)
    expect(cells[familyIndex]).toMatchObject({ displayWidth: 2, continuation: false })
    expect(cells[familyIndex + 1]).toMatchObject({ displayWidth: 0, continuation: true })
  })

  it('keeps combining marks attached and excludes padding from selection', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'combining', text: 'e\u0301x', selectable: false },
    ], { columns: 4 })
    const cells = map.rows[0]?.cells ?? []

    expect(cells[0]).toMatchObject({ grapheme: 'e\u0301', displayWidth: 1, selectable: false, source: 'text' })
    expect(cells[1]).toMatchObject({ grapheme: 'x', displayWidth: 1, selectable: false, source: 'text' })
    expect(cells.slice(2).every(cell => cell.source === 'padding' && !cell.selectable)).toBe(true)
  })

  it('bounds rows without splitting a grapheme and reports truncation', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'bounded', text: '中B' },
    ], { columns: 2, maxRows: 1 })

    expect(map.truncated).toBe(true)
    expect(map.rows).toHaveLength(1)
    expect(map.rows[0]?.cells.some(cell => cell.grapheme === '中')).toBe(true)
    expect(map.rows[0]?.cells.some(cell => cell.continuation)).toBe(true)
  })

  it('keeps logical bidi order explicit', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'rtl', text: 'abc אבג' },
    ], { columns: 20 })

    expect(map.bidi).toBe('logical')
    expect(map.rows[0]?.cells.map(cell => cell.grapheme).join('')).toContain('abc אבג')
  })

  it('supports visual bidi cell order while copying logical text', () => {
    expect(tuiBidiVisualText('abc אבג xyz')).toBe('abc גבא xyz')
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'rtl', text: 'abc אבג xyz' },
    ], { columns: 20, bidi: 'visual' })
    expect(map.bidi).toBe('visual')
    expect(map.rows[0]?.cells.map(cell => cell.grapheme).join('')).toContain('abc גבא xyz')
    expect(tuiScreenSelectionText(map, {
      start: { row: 0, column: 0 }, end: { row: 0, column: 10 }, kind: 'drag',
    })).toBe('abc אבג xyz')
  })
})
