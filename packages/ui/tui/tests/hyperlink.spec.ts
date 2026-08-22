import { describe, expect, it } from 'vitest'
import {
  projectTuiScreenMap, tuiFindHyperlinks, tuiOsc8Text, tuiSafeHyperlinkUrl,
} from '../src/index.ts'

describe('TUI OSC 8 hyperlinks', () => {
  it('allows only bounded HTTP(S) URLs without credentials or controls', () => {
    expect(tuiSafeHyperlinkUrl('https://example.test/path?q=1')).toBe('https://example.test/path?q=1')
    expect(tuiSafeHyperlinkUrl('javascript:alert(1)')).toBeUndefined()
    expect(tuiSafeHyperlinkUrl('https://user:secret@example.test')).toBeUndefined()
    expect(tuiSafeHyperlinkUrl('https://example.test/\u001b]8;;evil')).toBeUndefined()
  })

  it('finds URL spans without trailing sentence punctuation', () => {
    expect(tuiFindHyperlinks('Read https://example.test/docs, then stop.')).toEqual([
      { start: 5, end: 30, url: 'https://example.test/docs' },
    ])
  })

  it('emits bounded OSC 8 around the visible URL text', () => {
    expect(tuiOsc8Text('See https://example.test/docs.')).toBe(
      'See \u001b]8;;https://example.test/docs\u0007https://example.test/docs\u001b]8;;\u0007.',
    )
  })

  it('records hyperlink provenance on visible text cells', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'message:1', text: 'https://example.test/docs' },
    ], { columns: 32 })
    expect(map.rows[0]?.cells.find(cell => cell.grapheme === 'h')?.hyperlink)
      .toBe('https://example.test/docs')
    expect(map.rows[0]?.cells.every(cell => cell.source !== 'text' || cell.hyperlink === 'https://example.test/docs')).toBe(true)
  })
})
