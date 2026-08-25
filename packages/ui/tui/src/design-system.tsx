/** Internal semantic layout primitives for native-TUI panels and bounded states. */

import React, { type ReactNode } from 'react'
import { Box, Text } from 'ink'
import { tuiBorderStyle, tuiTextStyle, useTuiTheme, type TuiTheme } from './theme.tsx'

/** Semantic presentation roles shared by internal native-TUI components. */
export type TuiDesignTone =
  | 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'error' | 'selection' | 'permission'

/** One clamped physical-row window. */
export interface TuiScrollableWindow {
  readonly start: number
  readonly end: number
}

/**
 * Resolve one internal semantic role through the active terminal theme.
 * @param theme - active terminal theme.
 * @param tone - component semantic role.
 * @returns color token, or undefined for default/no-color text.
 */
export function tuiDesignToneColor(theme: TuiTheme, tone: TuiDesignTone): string | undefined {
  if (tone === 'default') return theme.tokens.text
  return theme.tokens[tone]
}

/**
 * Resolve the semantic title style shared by selectable list and menu rows.
 * @param theme - active terminal theme.
 * @param selected - whether the row owns keyboard or pointer selection.
 * @returns selection color plus emphasis for the active row, or plain text for another row.
 */
export function tuiListRowTextStyle(
  theme: TuiTheme,
  selected: boolean,
): Readonly<{ color?: string; bold: boolean }> {
  return { ...tuiTextStyle(selected ? theme.tokens.selection : undefined), bold: selected }
}

/**
 * Clamp a requested offset to one finite physical-row window.
 * @param total - complete row count.
 * @param offset - requested first row.
 * @param capacity - mounted physical rows.
 * @returns half-open mounted range.
 */
export function tuiScrollableWindow(total: number, offset: number, capacity: number): TuiScrollableWindow {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  const safeCapacity = Number.isFinite(capacity) ? Math.max(1, Math.floor(capacity)) : 1
  const requested = Number.isFinite(offset) ? Math.floor(offset) : 0
  const start = Math.max(0, Math.min(requested, Math.max(0, safeTotal - safeCapacity)))
  return Object.freeze({ start, end: Math.min(safeTotal, start + safeCapacity) })
}

/**
 * Build one exact-width progress label from bounded public counts.
 * @param completed - completed units.
 * @param total - total units; non-positive or non-finite values produce an indeterminate label.
 * @param columns - maximum terminal cells.
 * @returns ASCII progress text no wider than the requested cells.
 */
export function tuiProgressBarText(completed: number, total: number, columns: number): string {
  const width = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(completed)) return 'Working'.slice(0, width)
  const ratio = Math.max(0, Math.min(1, completed / total))
  const percent = Math.round(ratio * 100)
  const suffix = ` ${percent}%`
  if (width < suffix.length + 3) return `${percent}%`.slice(0, width)
  const barWidth = width - suffix.length - 2
  const filled = Math.round(barWidth * ratio)
  return `[${'='.repeat(filled)}${'-'.repeat(barWidth - filled)}]${suffix}`
}

/**
 * Render a full-screen native-TUI page with one stable two-row product header.
 * @param props - page title, terminal height, tone, and body.
 * @returns one full-screen page.
 */
export function TuiPane(props: {
  readonly title: string
  readonly height: number
  readonly titleTone?: TuiDesignTone | undefined
  readonly children?: ReactNode
}): React.ReactElement {
  const theme = useTuiTheme()
  return <Box flexDirection="column" height={props.height} width="100%">
    <Box paddingX={2} height={2} flexShrink={0}>
      <Text bold {...tuiTextStyle(theme.tokens.accent)}>DeepSeek Harness</Text>
      <Text {...tuiTextStyle(tuiDesignToneColor(theme, props.titleTone ?? 'muted'))}> · {props.title}</Text>
    </Box>
    {props.children}
  </Box>
}

/**
 * Render a bounded group with optional semantic heading and frame.
 * @param props - group layout, tone, title, and content.
 * @returns one first-party layout group.
 */
export function TuiSection(props: {
  readonly title?: ReactNode | undefined
  readonly tone?: TuiDesignTone | undefined
  readonly framed?: boolean | undefined
  readonly direction?: 'row' | 'column' | undefined
  readonly grow?: boolean | undefined
  readonly center?: boolean | undefined
  readonly height?: number | undefined
  readonly paddingX?: number | undefined
  readonly marginX?: number | undefined
  readonly children?: ReactNode
}): React.ReactElement {
  const theme = useTuiTheme()
  const border = props.framed === true ? tuiBorderStyle(tuiDesignToneColor(theme, props.tone ?? 'muted')) : {}
  return <Box
    flexDirection={props.direction ?? 'column'}
    flexGrow={props.grow === true ? 1 : 0}
    flexShrink={props.grow === true ? 1 : 0}
    justifyContent={props.center === true ? 'center' : 'flex-start'}
    height={props.height}
    paddingX={props.paddingX ?? 1}
    marginX={props.marginX}
    borderStyle={props.framed === true ? 'round' : undefined}
    {...border}
    overflow="hidden"
  >
    {props.title === undefined ? undefined : <Text
      bold
      {...tuiTextStyle(tuiDesignToneColor(theme, props.tone ?? 'accent'))}
      wrap="truncate-end"
    >{props.title}</Text>}
    {props.children}
  </Box>
}

/**
 * Render one pointer-owned two-row footer with a stable physical action row.
 * The first row is always reserved for status, error, count, or an explicit
 * blank placeholder; the second row always contains the visible actions.
 * This keeps exact-label pointer regions on the terminal's final row aligned
 * with what Ink renders in every loading, error, and overflow branch.
 *
 * @param props - optional status row, required action row, and horizontal padding.
 * @returns one fixed two-row footer whose action row is always last.
 */
export function TuiActionFooter(props: {
  readonly status?: ReactNode | undefined
  readonly actions: ReactNode
  readonly paddingX?: number | undefined
}): React.ReactElement {
  return <TuiSection height={2} paddingX={props.paddingX ?? 2}>
    <Box height={1} flexShrink={0} overflow="hidden">
      {props.status ?? <Text> </Text>}
    </Box>
    <Box height={1} flexShrink={0} overflow="hidden">
      {props.actions}
    </Box>
  </TuiSection>
}

/**
 * Render a flexing bounded body for list and detail panels.
 * @param props - body height, frame, spacing, tone, and rows.
 * @returns one overflow-clipped body.
 */
export function TuiScrollablePanel(props: {
  readonly height?: number | undefined
  readonly framed?: boolean | undefined
  readonly tone?: TuiDesignTone | undefined
  readonly paddingX?: number | undefined
  readonly marginX?: number | undefined
  readonly children?: ReactNode
}): React.ReactElement {
  const theme = useTuiTheme()
  const border = props.framed === true ? tuiBorderStyle(tuiDesignToneColor(theme, props.tone ?? 'muted')) : {}
  return <Box
    flexDirection="column"
    flexGrow={props.height === undefined ? 1 : 0}
    flexShrink={props.height === undefined ? 1 : 0}
    height={props.height}
    paddingX={props.paddingX ?? 2}
    marginX={props.marginX}
    borderStyle={props.framed === true ? 'round' : undefined}
    {...border}
    overflow="hidden"
  >{props.children}</Box>
}

/**
 * Render a fixed-height selectable row with aligned trailing status and optional details.
 * @param props - selection, physical height, title, status, and detail rows.
 * @returns one overflow-clipped list row.
 */
export function TuiListRow(props: {
  readonly selected: boolean
  readonly height: number
  readonly title: ReactNode
  readonly trailing?: ReactNode | undefined
  readonly trailingTone?: TuiDesignTone | undefined
  readonly description?: ReactNode | undefined
  readonly metadata?: ReactNode | undefined
  readonly metadataTone?: TuiDesignTone | undefined
  readonly detail?: ReactNode | undefined
  readonly detailTone?: TuiDesignTone | undefined
}): React.ReactElement {
  const theme = useTuiTheme()
  const titleStyle = tuiListRowTextStyle(theme, props.selected)
  return <Box flexDirection="column" height={Math.max(1, props.height)} flexShrink={0} overflow="hidden">
    <Box justifyContent="space-between" flexShrink={0} overflow="hidden">
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text
          {...titleStyle}
          wrap="truncate-end"
        >{props.selected ? '› ' : '  '}{props.title}</Text>
      </Box>
      {props.trailing === undefined ? undefined : <Box flexShrink={0} overflow="hidden">
        <Text {...tuiTextStyle(tuiDesignToneColor(theme, props.trailingTone ?? 'muted'))} wrap="truncate-end">
          {props.trailing}
        </Text>
      </Box>}
    </Box>
    {props.description === undefined ? undefined : <Text wrap="truncate-end">  {props.description}</Text>}
    {props.metadata === undefined ? undefined : <Text
      {...tuiTextStyle(tuiDesignToneColor(theme, props.metadataTone ?? 'muted'))}
      wrap="truncate-end"
    >  {props.metadata}</Text>}
    {props.detail === undefined ? undefined : <Text
      {...tuiTextStyle(tuiDesignToneColor(theme, props.detailTone ?? 'warning'))}
      wrap="truncate-end"
    >  {props.detail}</Text>}
  </Box>
}

/**
 * Render one bounded instruction or metadata row.
 * @param props - semantic tone, optional dim treatment, emphasis, wrapping, and content.
 * @returns one single-row hint.
 */
export function TuiHintLine(props: {
  readonly tone?: TuiDesignTone | undefined
  readonly subtle?: boolean | undefined
  readonly bold?: boolean | undefined
  readonly wrap?: 'wrap' | 'truncate' | 'truncate-start' | 'truncate-middle' | 'truncate-end' | undefined
  readonly children?: ReactNode
}): React.ReactElement {
  const theme = useTuiTheme()
  return <Text
    {...tuiTextStyle(tuiDesignToneColor(theme, props.tone ?? 'muted'))}
    dimColor={props.subtle === true && theme.dim}
    {...props.bold === undefined ? {} : { bold: props.bold }}
    wrap={props.wrap ?? 'truncate-end'}
  >{props.children}</Text>
}

/**
 * Render a semantic status mark whose meaning survives no-color output.
 * @param props - tone, optional explicit mark, and label.
 * @returns marked status text.
 */
export function TuiStatusMark(props: {
  readonly tone: TuiDesignTone
  readonly mark?: string | undefined
  readonly children?: ReactNode
}): React.ReactElement {
  const theme = useTuiTheme()
  const mark = props.mark ?? (props.tone === 'success'
    ? '✓'
    : props.tone === 'error'
      ? '×'
      : props.tone === 'warning'
        ? '!'
        : props.tone === 'selection'
          ? '›'
          : '·')
  return <Text bold {...tuiTextStyle(tuiDesignToneColor(theme, props.tone))}>
    {mark}{props.children === undefined ? '' : ' '}{props.children}
  </Text>
}

/**
 * Render one bounded semantic progress bar.
 * @param props - public progress counts, cell budget, and tone.
 * @returns exact-width progress text.
 */
export function TuiProgressBar(props: {
  readonly completed: number
  readonly total: number
  readonly columns: number
  readonly tone?: TuiDesignTone | undefined
}): React.ReactElement {
  return <TuiHintLine tone={props.tone ?? 'accent'}>
    {tuiProgressBarText(props.completed, props.total, props.columns)}
  </TuiHintLine>
}

/**
 * Render a stable loading state with optional determinate progress.
 * @param props - loading message and optional progress counts and width.
 * @returns marked loading content.
 */
export function TuiLoadingState(props: {
  readonly message: ReactNode
  readonly completed?: number | undefined
  readonly total?: number | undefined
  readonly columns?: number | undefined
}): React.ReactElement {
  const determinate = props.completed !== undefined && props.total !== undefined
  return <Box flexDirection="column" flexShrink={0} overflow="hidden">
    <TuiStatusMark tone="accent" mark="◐">{props.message}</TuiStatusMark>
    {determinate ? <TuiProgressBar
      completed={props.completed}
      total={props.total}
      columns={Math.max(1, props.columns ?? 24)}
    /> : undefined}
  </Box>
}

/**
 * Render a stable empty or failure state with an explicit text mark.
 * @param props - state message, optional detail, and semantic tone.
 * @returns marked bounded state content.
 */
export function TuiEmptyState(props: {
  readonly message: ReactNode
  readonly detail?: ReactNode | undefined
  readonly tone?: TuiDesignTone | undefined
}): React.ReactElement {
  const tone = props.tone ?? 'muted'
  return <Box flexDirection="column" flexShrink={0} overflow="hidden">
    <TuiStatusMark tone={tone}>{props.message}</TuiStatusMark>
    {props.detail === undefined ? undefined : <TuiHintLine tone="muted">{props.detail}</TuiHintLine>}
  </Box>
}
