import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import { projectTuiDiffLines, resolveTuiDiffMode } from '../src/diff.ts'

describe('adaptive TUI diff projection', () => {
  it('keeps narrow automatic layouts unified and selects split at a readable width', () => {
    expect(resolveTuiDiffMode(40)).toBe('unified')
    expect(resolveTuiDiffMode(51)).toBe('split')
    expect(resolveTuiDiffMode(40, 'unified')).toBe('unified')
    expect(resolveTuiDiffMode(40, 'split')).toBe('split')
  })

  it('preserves unified rows and treats a trailing newline as a terminator', () => {
    expect(projectTuiDiffLines([{ path: 'a.ts', oldText: 'old\n', newText: 'new\n' }], 40, 'unified'))
      .toEqual(['a.ts', '- old', '+ new'])
  })

  it('keeps unified and split projections on the same semantic alignment', () => {
    const diff = [{
      path: 'src/example.ts',
      oldText: 'header\nold A\nold B\nfooter',
      newText: 'header\nnew A\nfooter\ntrailer',
    }]
    expect(projectTuiDiffLines(diff, 80, 'unified')).toEqual([
      'src/example.ts',
      '  header',
      '- old A',
      '+ new A',
      '- old B',
      '  footer',
      '+ trailer',
    ])
    const split = projectTuiDiffLines(diff, 80, 'split')
    expect(split).toHaveLength(6)
    expect(split[1]).toContain('  header')
    expect(split[2]).toMatch(/- old A.*│.*\+ new A/)
    expect(split[3]).toContain('- old B')
    expect(split[3]).toContain('│')
    expect(split[4]).toContain('  footer')
    expect(split[5]).toContain('+ trailer')
  })

  it('renders only-add and only-delete hunks without inventing context', () => {
    expect(projectTuiDiffLines([{ path: 'new.ts', oldText: null, newText: 'first\nsecond' }], 80, 'unified'))
      .toEqual(['new.ts', '+ first', '+ second'])
    expect(projectTuiDiffLines([{ path: 'gone.ts', oldText: 'first\nsecond', newText: '' }], 80, 'unified'))
      .toEqual(['gone.ts', '- first', '- second'])
  })

  it('uses case-insensitive anchors without hiding case-only replacements', () => {
    expect(projectTuiDiffLines([{
      path: 'case.txt',
      oldText: 'Header\nSame\nfooter',
      newText: 'header\nsame\nfooter',
    }], 80, 'unified')).toEqual([
      'case.txt',
      '- Header',
      '+ header',
      '- Same',
      '+ same',
      '  footer',
    ])
  })

  it('aligns unchanged and replacement rows in the split projection', () => {
    const rows = projectTuiDiffLines([{
      path: 'a.ts',
      oldText: 'same\nold A\nold B\nend',
      newText: 'same\nnew A\nend',
    }], 60)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toBe('a.ts')
    expect(rows[1]).toContain('  same')
    expect(rows[2]).toContain('- old A')
    expect(rows[2]).toContain('+ new A')
    expect(rows[3]).toContain('- old B')
    expect(rows[3]).toContain('│')
    expect(rows[4]).toContain('  end')
    expect(rows.every(row => stringWidth(row) <= 60)).toBe(true)
  })

  it('keeps Unicode rows cell-bounded and terminal-safe', () => {
    const rows = projectTuiDiffLines([{
      path: '目录/文件.ts\u001b[31m',
      oldText: '旧值 e\u0301',
      newText: '新值 👩‍💻 and a long suffix',
    }], 51)
    expect(rows[0]).not.toContain('\u001b')
    expect(rows.every(row => stringWidth(row) <= 51)).toBe(true)
    expect(rows.some(row => row.includes('旧值'))).toBe(true)
    expect(rows.some(row => row.includes('新值'))).toBe(true)
  })

  it('bounds every requested layout, including an explicit split below gutter width', () => {
    const diffs = [{
      path: 'a/very-long-file-name.ts\u001b[31m',
      oldText: '删除 行\n\told e\u0301',
      newText: '新增 行\n\tnew 👩‍💻',
    }]
    for (const width of [1, 2, 3, 4, 5, 7, 12, 40, 51]) {
      for (const mode of ['unified', 'split', 'auto'] as const) {
        const rows = projectTuiDiffLines(diffs, width, mode)
        expect(rows.every(row => stringWidth(row) <= width), `${mode} at ${width}`).toBe(true)
        expect(rows.join('\n')).not.toContain('\u001b')
      }
    }
    expect(projectTuiDiffLines(diffs, 4, 'split').some(row => row.includes('│'))).toBe(false)
  })
})
