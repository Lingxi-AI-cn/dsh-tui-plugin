/** Electric startup mark data, terminal color fallback, and Ink rendering. */

import React from 'react'
import { Text } from 'ink'
import { tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'

const D_MATRIX = [
  [1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 0],
] as const

const S_MATRIX = [
  [0, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 0],
] as const

const H_MATRIX = [
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
] as const

const SPACER = [0, 0, 0] as const
const ELECTRIC_LOGO_CANVAS = Object.freeze(D_MATRIX.map((row, index) => Object.freeze([
  ...row, ...SPACER, ...(S_MATRIX[index] ?? []), ...SPACER, ...(H_MATRIX[index] ?? []),
])))

/** Display-cell width of the full Electric startup mark. */
export const TUI_ELECTRIC_STARTUP_LOGO_WIDTH = 60

/** Row count of the full Electric startup mark. */
export const TUI_ELECTRIC_STARTUP_LOGO_HEIGHT = 9

/** Terminal text rows for the full Electric startup mark without color escapes. */
export const TUI_ELECTRIC_STARTUP_LOGO_ROWS = Object.freeze(ELECTRIC_LOGO_CANVAS.map(row => (
  row.map(cell => cell === 1 ? '██' : '  ').join('')
)))

/** Startup mark selected for the available terminal geometry. */
export type TuiStartupLogoVariant = 'electric' | 'compact'

function electricColor(column: number, row: number): string {
  const u = column / (TUI_ELECTRIC_STARTUP_LOGO_WIDTH / 2 - 1)
  const v = row / (ELECTRIC_LOGO_CANVAS.length - 1)
  const t = u * 0.8 - v * 0.8
  const normalized = [
    0.2 + 0.5 * Math.cos(2 * Math.PI * (2 * t + 0.2)),
    0.7 + 0.3 * Math.cos(2 * Math.PI * (1.5 * t + 0.5)),
    0.8 + 0.2 * Math.cos(2 * Math.PI * (t + 0.8)),
  ]
  return `#${normalized.map(channel => (
    Math.floor(255 * Math.max(0, Math.min(1, channel))).toString(16).padStart(2, '0')
  )).join('')}`
}

/**
 * Resolve one Electric mark cell color for the active terminal theme.
 * @param theme - resolved TUI theme and negotiated color precision.
 * @param column - zero-based 30-cell logo column.
 * @param row - zero-based logo row.
 * @returns a true/extended-color value, ANSI theme accent, or no style for blank, invalid, or colorless cells.
 */
export function tuiElectricStartupLogoCellColor(
  theme: Pick<TuiTheme, 'colorDepth' | 'tokens'>,
  column: number,
  row: number,
): string | undefined {
  const canvasRow = ELECTRIC_LOGO_CANVAS[row]
  if (canvasRow?.[column] !== 1 || theme.colorDepth === 'none') return undefined
  return theme.colorDepth === 'ansi16' ? theme.tokens.accent : electricColor(column, row)
}

/**
 * Select the full mark only when both dimensions preserve the complete centered startup workspace.
 * @param stdout - terminal dimensions used by the active Ink frame.
 * @param composerRows - mounted editor rows inside the bordered composer.
 * @param supplementalRows - suggestion rows mounted between the mark and composer.
 * @returns the full Electric or compact mark variant.
 */
export function resolveTuiStartupLogoVariant(
  stdout: Readonly<{ rows: number; columns: number }>,
  composerRows: number,
  supplementalRows = 0,
): TuiStartupLogoVariant {
  const columns = stdout.columns || 80
  const rows = stdout.rows || 24
  const requiredRows = TUI_ELECTRIC_STARTUP_LOGO_HEIGHT
    + Math.max(1, composerRows) + Math.max(0, supplementalRows) + 5
  return columns >= TUI_ELECTRIC_STARTUP_LOGO_WIDTH && Math.max(1, rows - 1) >= requiredRows
    ? 'electric'
    : 'compact'
}

/**
 * Return the physical row count of one startup mark variant.
 * @param variant - selected startup mark.
 * @returns its fixed terminal row count.
 */
export function tuiStartupLogoHeight(variant: TuiStartupLogoVariant): number {
  return variant === 'electric' ? TUI_ELECTRIC_STARTUP_LOGO_HEIGHT : 1
}

/**
 * Render the selected startup mark through Ink and the negotiated TUI theme.
 * @param props - selected startup mark variant.
 * @returns fixed-dimension Ink text rows for that variant.
 */
export const TuiStartupLogo = React.memo(function TuiStartupLogo({ variant }: {
  readonly variant: TuiStartupLogoVariant
}): React.ReactElement {
  const theme = useTuiTheme()
  if (variant === 'compact') {
    return <Text bold {...tuiTextStyle(theme.tokens.accent)}>DSH</Text>
  }
  if (theme.colorDepth === 'none' || theme.colorDepth === 'ansi16') {
    return <>
      {TUI_ELECTRIC_STARTUP_LOGO_ROWS.map((row, rowIndex) => (
        <Text key={rowIndex} {...tuiTextStyle(theme.tokens.accent)}>{row}</Text>
      ))}
    </>
  }
  return <>
    {ELECTRIC_LOGO_CANVAS.map((row, rowIndex) => <Text key={rowIndex}>
      {row.map((cell, column) => cell === 1
        ? <Text key={column} {...tuiTextStyle(tuiElectricStartupLogoCellColor(
          theme, column, rowIndex,
        ))}>██</Text>
        : <React.Fragment key={column}>  </React.Fragment>)}
    </Text>)}
  </>
})
