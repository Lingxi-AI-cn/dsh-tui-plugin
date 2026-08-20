/** Semantic terminal colors and user settings for the native TUI. */

import React, { createContext, type ReactNode, useContext } from 'react'
import { settingsNamespace, z } from './host.ts'
import {
  TUI_KEYBINDING_OVERRIDES_SCHEMA, validateTuiKeybindingOverrides, type TuiKeybindingOverrides,
} from './keybindings.ts'
import type { TuiTerminalColorDepth } from './terminal-session.ts'

/** Persisted built-in terminal theme names. */
export const TUI_THEME_PREFERENCES = ['dark', 'light', 'no-color'] as const

/** One persisted built-in terminal theme name. */
export type TuiThemePreference = typeof TUI_THEME_PREFERENCES[number]

/** Settings namespace owned by the native TUI. */
export const TUI_SETTINGS_NAMESPACE = settingsNamespace('tui')

/** User settings consumed live by the native TUI. */
export interface TuiSettings {
  /** Built-in semantic terminal theme. */
  theme: TuiThemePreference
  /** Per-action replacements for built-in key gestures. */
  keybindings: TuiKeybindingOverrides
}

/** Defaults used without a settings provider and below its user layer. */
export const DEFAULT_TUI_SETTINGS: TuiSettings = Object.freeze({
  theme: 'dark',
  keybindings: Object.freeze({}),
})

const TUI_SETTINGS_FIELDS = z.object({
  theme: z.union([...TUI_THEME_PREFERENCES]).default(DEFAULT_TUI_SETTINGS.theme),
  keybindings: TUI_KEYBINDING_OVERRIDES_SCHEMA.default(DEFAULT_TUI_SETTINGS.keybindings),
})

/** Persisted native-TUI settings schema, including effective-binding validation. */
export const TUI_SETTINGS_SCHEMA = z.transform(TUI_SETTINGS_FIELDS, (settings) => {
  const keybindings = settings.keybindings ?? DEFAULT_TUI_SETTINGS.keybindings
  validateTuiKeybindingOverrides(keybindings)
  return {
    theme: settings.theme ?? DEFAULT_TUI_SETTINGS.theme,
    keybindings,
  }
}, true) as unknown as z<TuiSettings>

/** Colors available to every native-TUI renderer. */
export interface TuiSemanticThemeTokens {
  readonly text: string | undefined
  readonly muted: string | undefined
  readonly accent: string | undefined
  readonly success: string | undefined
  readonly warning: string | undefined
  readonly error: string | undefined
  readonly permission: string | undefined
  readonly reasoning: string | undefined
  readonly selection: string | undefined
  readonly border: string | undefined
  readonly diffAdd: string | undefined
  readonly diffDelete: string | undefined
}

/** Resolved theme for one negotiated terminal color depth. */
export interface TuiTheme {
  readonly preference: TuiThemePreference
  readonly colorDepth: TuiTerminalColorDepth
  readonly tokens: TuiSemanticThemeTokens
  /** Whether secondary text may use ANSI dim styling. */
  readonly dim: boolean
}

const EMPTY_STYLE = Object.freeze({})

/**
 * Omit Ink's optional text color property when a no-color theme resolves it away.
 * @param color - one resolved semantic token.
 * @returns an exact-optional Ink text style.
 */
export function tuiTextStyle(color: string | undefined): Readonly<{ color?: string }> {
  return color === undefined ? EMPTY_STYLE : { color }
}

/**
 * Omit Ink's optional border color property when a no-color theme resolves it away.
 * @param color - one resolved semantic token.
 * @returns an exact-optional Ink box style.
 */
export function tuiBorderStyle(color: string | undefined): Readonly<{ borderColor?: string }> {
  return color === undefined ? EMPTY_STYLE : { borderColor: color }
}

const NO_COLOR_TOKENS: TuiSemanticThemeTokens = Object.freeze({
  text: undefined,
  muted: undefined,
  accent: undefined,
  success: undefined,
  warning: undefined,
  error: undefined,
  permission: undefined,
  reasoning: undefined,
  selection: undefined,
  border: undefined,
  diffAdd: undefined,
  diffDelete: undefined,
})

const DARK_ANSI16_TOKENS: TuiSemanticThemeTokens = Object.freeze({
  text: undefined,
  muted: 'gray',
  accent: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  permission: 'magenta',
  reasoning: 'gray',
  selection: 'cyan',
  border: 'blue',
  diffAdd: 'green',
  diffDelete: 'red',
})

const LIGHT_ANSI16_TOKENS: TuiSemanticThemeTokens = Object.freeze({
  text: undefined,
  muted: 'gray',
  accent: 'blue',
  success: 'green',
  warning: 'magenta',
  error: 'red',
  permission: 'magenta',
  reasoning: 'gray',
  selection: 'blue',
  border: 'blue',
  diffAdd: 'green',
  diffDelete: 'red',
})

const DARK_EXTENDED_TOKENS: TuiSemanticThemeTokens = Object.freeze({
  text: undefined,
  muted: '#8b949e',
  accent: '#58a6ff',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
  permission: '#d2a8ff',
  reasoning: '#8b949e',
  selection: '#79c0ff',
  border: '#6e7681',
  diffAdd: '#3fb950',
  diffDelete: '#f85149',
})

const LIGHT_EXTENDED_TOKENS: TuiSemanticThemeTokens = Object.freeze({
  text: undefined,
  muted: '#57606a',
  accent: '#0969da',
  success: '#1a7f37',
  warning: '#9a6700',
  error: '#cf222e',
  permission: '#8250df',
  reasoning: '#57606a',
  selection: '#0969da',
  border: '#57606a',
  diffAdd: '#1a7f37',
  diffDelete: '#cf222e',
})

/**
 * Resolve semantic colors for one persisted preference and terminal precision.
 * @param preference - selected built-in theme.
 * @param colorDepth - color precision negotiated for the active output stream.
 * @returns immutable tokens that never emit colors when either input requires no color.
 */
export function resolveTuiTheme(
  preference: TuiThemePreference,
  colorDepth: TuiTerminalColorDepth,
): TuiTheme {
  if (preference === 'no-color' || colorDepth === 'none') {
    return Object.freeze({ preference, colorDepth: 'none', tokens: NO_COLOR_TOKENS, dim: false })
  }
  const ansi16 = colorDepth === 'ansi16'
  const tokens = preference === 'light'
    ? ansi16 ? LIGHT_ANSI16_TOKENS : LIGHT_EXTENDED_TOKENS
    : ansi16 ? DARK_ANSI16_TOKENS : DARK_EXTENDED_TOKENS
  return Object.freeze({ preference, colorDepth, tokens, dim: true })
}

const DEFAULT_TUI_THEME = resolveTuiTheme(DEFAULT_TUI_SETTINGS.theme, 'ansi16')
const TuiThemeContext = createContext<TuiTheme>(DEFAULT_TUI_THEME)

/** Provide one resolved theme without changing descendant component identity. */
export function TuiThemeProvider({ theme, children }: {
  readonly theme: TuiTheme
  readonly children?: ReactNode
}): React.ReactElement {
  return <TuiThemeContext.Provider value={theme}>{children}</TuiThemeContext.Provider>
}

/** Read the semantic theme selected for the active terminal transaction. */
export function useTuiTheme(): TuiTheme {
  return useContext(TuiThemeContext)
}
