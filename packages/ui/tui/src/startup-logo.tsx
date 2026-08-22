/** Supplied ANSI startup mark, terminal color fallback, and Ink rendering. */

import React from 'react'
import { Text } from 'ink'
import { tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'

type TuiStartupLogoPalette = readonly [foreground: string, background: string]

/** ANSI palette captured from the supplied startup logo.ansi artwork. */
const STARTUP_LOGO_PALETTE: readonly TuiStartupLogoPalette[] = Object.freeze([
  ['#ffffff', '#0000aa'],
  ['#aaaaaa', '#0000aa'],
  ['#aaaaaa', '#000000'],
  ['#ffffff', '#000000'],
  ['#ffffff', '#aaaaaa'],
  ['#555555', '#0000aa'],
  ['#0000aa', '#000000'],
  ['#0000aa', '#0000aa'],
  ['#555555', '#aaaaaa'],
  ['#555555', '#000000'],
])

/** Terminal text rows for the supplied startup mark without color escapes. */
export const TUI_STARTUP_LOGO_ROWS = Object.freeze([
  '█▀▀▀▀▀▀▀▀▄   ▄▀▀▀▀▀▀▀▀█ █▀▀█   █▀▀█      █▀▀▀▀▀▀▀▀▀█ █▀▀█   █▀▀█ █▀▀█',
  '█  ▄▄▄▄   █ █   ▄▄▄▄▄▄█ █  █   ████      █▄▄▄██▄▄▄▄█ █  █   █  █ █  █',
  '█  █   █  █ █  ▀▄▄▄▄    █  █▄▄▄████         █  █     █  █   █  █ █  █',
  '▀  █   ▄  ▄  ▀▄     ▀▄  ▀       ██▄         ▀  █     ▀  ▀   ▄  ▄ ▀  ▄',
  '█  █   █  █    ▀▀▀▀▄  █ █  █▀▀▀████         █  █     █  █   █  █ █  █',
  '█  ▀▀▀▀   █ █▀▀▀▀▀▀   █ █  █   ████         █  █     █   ▀▀▀   █ █  █',
  '█▄▄▄▄▄▄▄▄▀  █▄▄▄▄▄▄▄▄▀  █▄▄█   ▄▄▄█         █▄▄█      ▀▄▄▄▄▄▄▄▀  █▄▄█',
] as const)

/** Palette index for each display cell in each startup-logo row. */
const STARTUP_LOGO_STYLE_ROWS = Object.freeze([
  '000001111222230001111122400322231122222224000011111223003222211220002',
  '000551111122300001111122400322236622222224000771111220003222211220002',
  '300522221122300022222222400022226622222222224001222223003222211220002',
  '400222240082231111111922400000006682222222224002222224004222400824008',
  '211222200052222222215552211122226692222222222115222222112222000522115',
  '211110000052211111155552211222226652222222222115222222111100000522115',
  '211115555922955555555922211222285552222222222555222222211155559229555',
] as const)

/** Display-cell width of the supplied startup mark. */
export const TUI_STARTUP_LOGO_WIDTH = 69

/** Row count of the supplied startup mark. */
export const TUI_STARTUP_LOGO_HEIGHT = 7

/** Startup mark selected for the available terminal geometry. */
export type TuiStartupLogoVariant = 'primary' | 'compact'

const ANSI16_STARTUP_LOGO_PALETTE: readonly TuiStartupLogoPalette[] = Object.freeze([
  ['white', 'blue'],
  ['gray', 'blue'],
  ['gray', 'black'],
  ['white', 'black'],
  ['white', 'gray'],
  ['blackBright', 'blue'],
  ['blue', 'black'],
  ['blue', 'blue'],
  ['blackBright', 'gray'],
  ['blackBright', 'black'],
])

/**
 * Resolve one supplied-logo cell style for the active terminal theme.
 * @param theme - resolved TUI theme and negotiated color precision.
 * @param paletteIndex - captured ANSI palette index.
 * @returns foreground/background style, or no style for colorless output.
 */
export function tuiStartupLogoCellStyle(
  theme: Pick<TuiTheme, 'colorDepth'>,
  paletteIndex: number,
): { readonly color?: string; readonly backgroundColor?: string } {
  if (theme.colorDepth === 'none') return {}
  const palette = (theme.colorDepth === 'ansi16' ? ANSI16_STARTUP_LOGO_PALETTE : STARTUP_LOGO_PALETTE)[paletteIndex]
  if (palette === undefined) return {}
  return { color: palette[0], backgroundColor: palette[1] }
}

/**
 * Resolve the full supplied mark only when both dimensions preserve the centered startup workspace.
 * @param stdout - terminal dimensions used by the active Ink frame.
 * @param composerRows - mounted editor rows inside the bordered composer.
 * @param supplementalRows - suggestion rows mounted between the mark and composer.
 * @returns the full supplied mark or compact mark variant.
 */
export function resolveTuiStartupLogoVariant(
  stdout: Readonly<{ rows: number; columns: number }>,
  composerRows: number,
  supplementalRows = 0,
): TuiStartupLogoVariant {
  const columns = stdout.columns || 80
  const rows = stdout.rows || 24
  const requiredRows = TUI_STARTUP_LOGO_HEIGHT
    + Math.max(1, composerRows) + Math.max(0, supplementalRows) + 5
  return columns >= TUI_STARTUP_LOGO_WIDTH && Math.max(1, rows - 1) >= requiredRows
    ? 'primary'
    : 'compact'
}

/**
 * Return the physical row count of one startup mark variant.
 * @param variant - selected startup mark.
 * @returns its fixed terminal row count.
 */
export function tuiStartupLogoHeight(variant: TuiStartupLogoVariant): number {
  return variant === 'primary' ? TUI_STARTUP_LOGO_HEIGHT : 1
}

function startupLogoRowRuns(row: string, styles: string): readonly { readonly text: string; readonly paletteIndex: number }[] {
  const runs: Array<{ text: string; paletteIndex: number }> = []
  let start = 0
  while (start < row.length) {
    const paletteIndex = Number(styles[start] ?? '')
    let end = start + 1
    while (end < row.length && styles[end] === styles[start]) end += 1
    runs.push({ text: row.slice(start, end), paletteIndex })
    start = end
  }
  return runs
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
    return <Text bold {...tuiTextStyle(theme.colorDepth === 'none' ? undefined : theme.tokens.accent)}>DSH</Text>
  }
  if (theme.colorDepth === 'none') {
    return <>{TUI_STARTUP_LOGO_ROWS.map((row, rowIndex) => <Text key={rowIndex}>{row}</Text>)}</>
  }
  return <>
    {TUI_STARTUP_LOGO_ROWS.map((row, rowIndex) => <Text key={rowIndex} wrap="truncate-end">
      {startupLogoRowRuns(row, STARTUP_LOGO_STYLE_ROWS[rowIndex] ?? '').map((run, runIndex) => (
        <Text key={`${rowIndex}:${runIndex}`} {...tuiStartupLogoCellStyle(theme, run.paletteIndex)}>{run.text}</Text>
      ))}
    </Text>)}
  </>
})
