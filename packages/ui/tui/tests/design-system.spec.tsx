/** Internal native-TUI design-system projection and render coverage. */

import React from 'react'
import { render } from 'ink'
import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import {
  TuiActionFooter, TuiEmptyState, TuiHintLine, TuiListRow, TuiLoadingState, TuiPane, TuiScrollablePanel,
  TuiSection, tuiDesignToneColor, tuiListRowTextStyle, tuiProgressBarText, tuiScrollableWindow,
} from '../src/design-system.tsx'
import { resolveTuiTheme, TuiThemeProvider } from '../src/theme.tsx'

interface CaptureStream {
  readonly chunks: string[]
  readonly stream: {
    readonly columns: number
    readonly rows: number
    readonly isTTY: true
    write(chunk: string | Uint8Array): boolean
    on(): CaptureStream['stream']
    off(): CaptureStream['stream']
  }
}

function captureStream(columns = 80, rows = 24): CaptureStream {
  const chunks: string[] = []
  const stream = {
    columns,
    rows,
    isTTY: true,
    write(chunk: string | Uint8Array): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
      return true
    },
    on() { return this },
    off() { return this },
  }
  return { chunks, stream }
}

describe('native TUI internal design system', () => {
  it('clamps physical windows without mounting unbounded rows', () => {
    expect(tuiScrollableWindow(10, 8, 4)).toEqual({ start: 6, end: 10 })
    expect(tuiScrollableWindow(10, -4, 3)).toEqual({ start: 0, end: 3 })
    expect(tuiScrollableWindow(0, 20, 0)).toEqual({ start: 0, end: 0 })
    expect(tuiScrollableWindow(Number.NaN, Number.NaN, Number.NaN)).toEqual({ start: 0, end: 0 })
  })

  it('projects bounded determinate and indeterminate progress text', () => {
    expect(tuiProgressBarText(1, 4, 20)).toBe('[====----------] 25%')
    expect(tuiProgressBarText(20, 10, 12)).toBe('[=====] 100%')
    expect(tuiProgressBarText(1, 0, 4)).toBe('Work')
    expect(tuiProgressBarText(1, 2, Number.NaN)).toBe('5')
    for (const columns of [1, 4, 8, 20]) {
      expect(stringWidth(tuiProgressBarText(3, 7, columns))).toBeLessThanOrEqual(columns)
    }
  })

  it('removes semantic colors in no-color mode without removing text marks', () => {
    const theme = resolveTuiTheme('no-color', 'truecolor')
    for (const tone of ['default', 'muted', 'accent', 'success', 'warning', 'error', 'selection', 'permission'] as const) {
      expect(tuiDesignToneColor(theme, tone)).toBeUndefined()
    }
  })

  it('renders pane, section, list, hints, loading, progress, and empty states together', () => {
    const stdout = captureStream(60, 18)
    const stderr = captureStream(60, 18)
    const instance = render(<TuiThemeProvider theme={resolveTuiTheme('no-color', 'none')}>
      <TuiPane title="Fixture" height={18}>
        <TuiSection title="Catalog" framed>
          <TuiHintLine>Stable hint</TuiHintLine>
        </TuiSection>
        <TuiScrollablePanel>
          <TuiListRow
            selected
            height={3}
            title="Plugin"
            trailing="verified"
            trailingTone="success"
            description="Description"
            metadata="Metadata"
          />
          <TuiLoadingState message="Downloading" completed={1} total={2} columns={18} />
          <TuiEmptyState tone="warning" message="No matches" detail="Change the filter" />
        </TuiScrollablePanel>
      </TuiPane>
    </TuiThemeProvider>, {
      stdout: stdout.stream as never,
      stderr: stderr.stream as never,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    instance.unmount()
    instance.cleanup()
    const output = stdout.chunks.join('')
    expect(output).toContain('DeepSeek Harness · Fixture')
    expect(output).toContain('Catalog')
    expect(output).toContain('› Plugin')
    expect(output).toContain('verified')
    expect(output).toContain('◐ Downloading')
    expect(output).toContain('50%')
    expect(output).toContain('! No matches')
    expect(output).toContain('Change the filter')
  })

  it('pins pointer-owned actions to the second physical footer row with or without status', () => {
    const renderFooter = (status: React.ReactNode | undefined): readonly string[] => {
      const stdout = captureStream(40, 2)
      const stderr = captureStream(40, 2)
      const instance = render(<TuiThemeProvider theme={resolveTuiTheme('no-color', 'none')}>
        <TuiActionFooter
          status={status}
          actions={<TuiHintLine>回车打开 · Esc 关闭</TuiHintLine>}
        />
      </TuiThemeProvider>, {
        stdout: stdout.stream as never,
        stderr: stderr.stream as never,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false,
      })
      instance.unmount()
      instance.cleanup()
      const lines = stdout.chunks.join('').replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '').split('\n')
      if (lines.at(-1) === '') lines.pop()
      return lines
    }

    const withStatus = renderFooter(<TuiHintLine>显示 1–6 / 20</TuiHintLine>)
    expect(withStatus[0]).toContain('显示 1–6 / 20')
    expect(withStatus[0]).not.toContain('回车打开')
    expect(withStatus[1]).toContain('回车打开 · Esc 关闭')

    const withoutStatus = renderFooter(undefined)
    expect(withoutStatus[0]?.trim()).toBe('')
    expect(withoutStatus[1]).toContain('回车打开 · Esc 关闭')
  })

  it('resolves the selected list-row title to the semantic color and emphasis', () => {
    const theme = resolveTuiTheme('dark', 'ansi16')
    expect(tuiListRowTextStyle(theme, true)).toEqual({ color: 'cyan', bold: true })
    expect(tuiListRowTextStyle(theme, false)).toEqual({ bold: false })
  })
})
