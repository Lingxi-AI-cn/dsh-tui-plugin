/** Semantic terminal colors and user settings for the native TUI. */

import React, { createContext, type ReactNode, useContext } from 'react'
import { settingsNamespace, z, ReasoningEffortId, type ModelSelection } from './host.ts'
import {
  TUI_KEYBINDING_OVERRIDES_SCHEMA, validateTuiKeybindingOverrides, type TuiKeybindingOverrides,
} from './keybindings.ts'
import { TUI_LOCALES, type TuiLocale } from './locale.ts'
import type { TuiTerminalBackground, TuiTerminalColorDepth } from './terminal-session.ts'
import {
  DEFAULT_TUI_SESSION_MANAGER_PREFERENCES,
  type TuiSessionManagerPreferences,
} from './session-manager.ts'

/** Persisted built-in terminal theme names. */
export const TUI_THEME_PREFERENCES = ['auto', 'dark', 'light', 'no-color'] as const

/** One persisted built-in terminal theme name. */
export type TuiThemePreference = typeof TUI_THEME_PREFERENCES[number]

/** Persisted running-Agent indicator preferences. */
export const TUI_ACTIVITY_PREFERENCES = ['dots', 'pulse', 'minimal', 'off'] as const

/** One persisted running-Agent indicator preference. */
export type TuiActivityPreference = typeof TUI_ACTIVITY_PREFERENCES[number]

/** Persisted terminal pointer ownership preferences. */
export const TUI_MOUSE_PREFERENCES = ['auto', 'off'] as const

/** One persisted terminal pointer ownership preference. */
export type TuiMousePreference = typeof TUI_MOUSE_PREFERENCES[number]

/** Supported runtime language preferences. */
export { TUI_LOCALES }
export type { TuiLocale }

/** Concrete palette selected after automatic terminal-background resolution. */
export type TuiResolvedThemePreference = Exclude<TuiThemePreference, 'auto'>

/** Settings namespace owned by the native TUI. */
export const TUI_SETTINGS_NAMESPACE = settingsNamespace('tui')

/** Exact first-run Provider onboarding copy/flow version acknowledged by the user. */
export const TUI_PROVIDER_ONBOARDING_VERSION = 1 as const

/** User settings consumed live by the native TUI. */
export interface TuiSettings {
  /** Default for new TUI Agents; never changes the shared Web model selection. */
  defaultModel?: ModelSelection
  /** Built-in semantic terminal theme. */
  theme: TuiThemePreference
  /** Optional JSON file name under the Harness home `themes` directory. */
  themeFile?: string
  /** Runtime catalog selected for first-party TUI messages. */
  locale: TuiLocale
  /** Whether the TUI or the outer terminal owns pointer reports. */
  mouse: TuiMousePreference
  /** Running-Agent animation rendered beside the status label. */
  activity: TuiActivityPreference
  /** Per-action replacements for built-in key gestures. */
  keybindings: TuiKeybindingOverrides
  /** Last native-TUI Provider onboarding version acknowledged through Host settings. */
  providerOnboardingVersion?: number
  /** Persisted Session Manager scope, archive, sort, and grouping controls. */
  sessionManager: TuiSessionManagerPreferences
}

/** Defaults used without a settings provider and below its user layer. */
export const DEFAULT_TUI_SETTINGS: TuiSettings = Object.freeze({
  theme: 'auto',
  locale: 'en',
  mouse: 'auto',
  activity: 'dots',
  keybindings: Object.freeze({}),
  sessionManager: DEFAULT_TUI_SESSION_MANAGER_PREFERENCES,
})

const TUI_SETTINGS_FIELDS = z.object({
  defaultModel: z.union([z.const(undefined), z.object({
    provider: z.string().required(),
    model: z.string().required(),
    reasoningEffort: z.string(),
  })]),
  theme: z.union([...TUI_THEME_PREFERENCES]).default(DEFAULT_TUI_SETTINGS.theme),
  themeFile: z.string(),
  locale: z.union([...TUI_LOCALES]).default(DEFAULT_TUI_SETTINGS.locale),
  mouse: z.union([...TUI_MOUSE_PREFERENCES]).default(DEFAULT_TUI_SETTINGS.mouse),
  activity: z.union([...TUI_ACTIVITY_PREFERENCES]).default(DEFAULT_TUI_SETTINGS.activity),
  keybindings: TUI_KEYBINDING_OVERRIDES_SCHEMA.default(DEFAULT_TUI_SETTINGS.keybindings),
  providerOnboardingVersion: z.number().step(1).min(1),
  sessionManager: z.object({
    scope: z.union(['workspace', 'all']).default(DEFAULT_TUI_SESSION_MANAGER_PREFERENCES.scope),
    archive: z.union(['active', 'archived', 'all']).default(DEFAULT_TUI_SESSION_MANAGER_PREFERENCES.archive),
    sort: z.union(['updated-desc', 'updated-asc', 'title', 'workspace'])
      .default(DEFAULT_TUI_SESSION_MANAGER_PREFERENCES.sort),
    groupByWorkspace: z.boolean().default(DEFAULT_TUI_SESSION_MANAGER_PREFERENCES.groupByWorkspace),
  }).default(DEFAULT_TUI_SESSION_MANAGER_PREFERENCES),
})

/** Persisted native-TUI settings schema, including effective-binding validation. */
export const TUI_SETTINGS_SCHEMA = z.transform(TUI_SETTINGS_FIELDS, (settings) => {
  const keybindings = settings.keybindings ?? DEFAULT_TUI_SETTINGS.keybindings
  validateTuiKeybindingOverrides(keybindings)
  const themeFile = settings.themeFile?.trim()
  if (themeFile !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(themeFile)) {
    throw new Error('TUI themeFile must be one JSON file name under the Harness themes directory')
  }
  return {
    ...settings.defaultModel == null ? {} : { defaultModel: {
      provider: settings.defaultModel.provider,
      model: settings.defaultModel.model,
      ...settings.defaultModel.reasoningEffort == null ? {} : {
        reasoningEffort: ReasoningEffortId(settings.defaultModel.reasoningEffort),
      },
    } },
    theme: settings.theme ?? DEFAULT_TUI_SETTINGS.theme,
    ...themeFile === undefined || themeFile === '' ? {} : { themeFile },
    locale: settings.locale ?? DEFAULT_TUI_SETTINGS.locale,
    mouse: settings.mouse ?? DEFAULT_TUI_SETTINGS.mouse,
    activity: settings.activity ?? DEFAULT_TUI_SETTINGS.activity,
    keybindings,
    sessionManager: settings.sessionManager ?? DEFAULT_TUI_SESSION_MANAGER_PREFERENCES,
    ...settings.providerOnboardingVersion === undefined
      ? {}
      : { providerOnboardingVersion: settings.providerOnboardingVersion },
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
  readonly resolvedPreference: TuiResolvedThemePreference
  readonly colorDepth: TuiTerminalColorDepth
  readonly tokens: TuiSemanticThemeTokens
  /** Validated custom palette name, when a file augments the built-in base. */
  readonly customName?: string
  /** Whether secondary text may use ANSI dim styling. */
  readonly dim: boolean
}

/** Validated custom palette loaded from one JSON file. */
export interface TuiCustomThemeDefinition {
  /** User-facing theme name. */
  readonly name: string
  /** Built-in extended-color palette inherited before overrides. */
  readonly base: 'dark' | 'light'
  /** Whether semantic muted text may use ANSI dim styling. */
  readonly dim?: boolean
  /** Validated semantic-color overrides. */
  readonly tokens: Partial<Record<keyof TuiSemanticThemeTokens, string>>
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
 * Resolve semantic colors for one persisted preference and terminal snapshot.
 * @param preference - selected built-in theme.
 * @param colorDepth - color precision negotiated for the active output stream.
 * @param background - normalized OSC 11 background class; unknown falls back to dark.
 * @param custom - validated extended-color overrides, when selected.
 * @returns immutable tokens that never emit colors when either input requires no color.
 */
export function resolveTuiTheme(
  preference: TuiThemePreference,
  colorDepth: TuiTerminalColorDepth,
  background: TuiTerminalBackground = 'unknown',
  custom?: TuiCustomThemeDefinition,
): TuiTheme {
  if (preference === 'no-color' || colorDepth === 'none') {
    return Object.freeze({
      preference, resolvedPreference: 'no-color', colorDepth: 'none', tokens: NO_COLOR_TOKENS, dim: false,
    })
  }
  const resolvedPreference = custom?.base
    ?? (preference === 'auto' ? background === 'light' ? 'light' : 'dark' : preference)
  const ansi16 = colorDepth === 'ansi16'
  const baseTokens = resolvedPreference === 'light'
    ? ansi16 ? LIGHT_ANSI16_TOKENS : LIGHT_EXTENDED_TOKENS
    : ansi16 ? DARK_ANSI16_TOKENS : DARK_EXTENDED_TOKENS
  const tokens = custom === undefined || ansi16
    ? baseTokens
    : Object.freeze({ ...baseTokens, ...custom.tokens })
  return Object.freeze({
    preference, resolvedPreference, colorDepth, tokens,
    ...custom === undefined || ansi16 ? {} : { customName: custom.name },
    dim: custom?.dim ?? true,
  })
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
