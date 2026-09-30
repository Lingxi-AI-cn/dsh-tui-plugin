/** Pure Agent-preset labels and menu projection for the native TUI. */

import type { AgentPreset } from './host.ts'
import { terminalSafe } from './sanitize.ts'
import { tuiMessage, type TuiLocale, type TuiMessageKey } from './locale.ts'

const OFFICIAL_MODE_KEYS: Readonly<Record<string, { name: TuiMessageKey; description: TuiMessageKey }>> = Object.freeze({
  standard: { name: 'mode.standard.name', description: 'mode.standard.description' },
  ptc: { name: 'mode.ptc.name', description: 'mode.ptc.description' },
  minimal: { name: 'mode.minimal.name', description: 'mode.minimal.description' },
  cordis: { name: 'mode.cordis.name', description: 'mode.cordis.description' },
})

/** One detached option used by the question interaction and footer. */
export interface TuiAgentModeOption {
  readonly preset: AgentPreset
  readonly name: string
  readonly description: string
  readonly label: string
}

/**
 * Localize one mode name without exposing the preset's filesystem path.
 * @param preset - Host-owned Agent preset metadata.
 * @param locale - active TUI locale.
 * @returns terminal-safe localized name.
 */
export function tuiAgentModeName(preset: AgentPreset, locale: TuiLocale): string {
  const official = OFFICIAL_MODE_KEYS[preset.id]
  return terminalSafe(official === undefined
    ? preset.name ?? preset.id
    : tuiMessage(locale, official.name))
}

/**
 * Localize one official description with user metadata fallback.
 * @param preset - Host-owned Agent preset metadata.
 * @param locale - active TUI locale.
 * @returns terminal-safe description when the preset provides one.
 */
export function tuiAgentModeDescription(preset: AgentPreset, locale: TuiLocale): string | undefined {
  const official = OFFICIAL_MODE_KEYS[preset.id]
  const description = official === undefined ? preset.description : tuiMessage(locale, official.description)
  return description === undefined ? undefined : terminalSafe(description)
}

/**
 * Project and deterministically sort the dynamic Host roster.
 * @param presets - Agent presets discovered by the Host.
 * @param currentId - effective preset id for the current Session.
 * @param locale - active TUI locale.
 * @returns immutable localized options in stable display order.
 */
export function tuiAgentModeOptions(
  presets: readonly AgentPreset[],
  currentId: string,
  locale: TuiLocale,
): readonly TuiAgentModeOption[] {
  return Object.freeze([...presets]
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id))
    .map((preset) => {
      const name = tuiAgentModeName(preset, locale)
      const kind = tuiMessage(locale, preset.trust === 'system' ? 'mode.kind.system'
        : preset.trust === 'user' ? 'mode.kind.user' : 'mode.kind.declared')
      const state = preset.broken !== undefined
        ? tuiMessage(locale, 'mode.state.unavailable')
        : preset.id === currentId ? tuiMessage(locale, 'mode.state.current') : undefined
      const description = terminalSafe([
        tuiAgentModeDescription(preset, locale),
        kind,
        state,
        preset.broken,
      ].filter(value => value !== undefined && value !== '').join(' · '))
      return Object.freeze({
        preset,
        name,
        description,
        label: terminalSafe(`${name} (${preset.id})${state === undefined ? '' : ` · ${state}`}`),
      })
    }))
}
