/** Bounded, owner-attributed loaded-context facts for the native TUI. */

import { terminalSafe } from './sanitize.ts'
import { tuiMessage, type TuiLocale, type TuiMessageKey } from './locale.ts'
import { terminalWrappedLines } from './viewport.ts'

const MAX_ENTRIES = 32
const MAX_FIELD_GRAPHEMES = 256
const FIELD_GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Structured facts exposed by the public prompt, skill, model, and permission services. */
export interface TuiLoadedContextInput {
  readonly sections: readonly string[]
  readonly contexts: readonly string[]
  readonly tools: readonly string[]
  readonly skills: readonly string[]
  readonly model?: string
  readonly permission?: string
}

/** One bounded category in the loaded-context panel. */
export interface TuiLoadedContextRow {
  readonly id: string
  readonly label: string
  readonly value: string
}

/** Complete process-local loaded-context panel state. */
export interface TuiLoadedContextSnapshot {
  readonly rows: readonly TuiLoadedContextRow[]
}

/** One physical line in the loaded-context panel. */
export interface TuiLoadedContextPanelLine {
  readonly key: string
  readonly text: string
}

function bounded(value: string): string {
  const safe = terminalSafe(value).replace(/\s+/gu, ' ').trim()
  const graphemes = Array.from(FIELD_GRAPHEMES.segment(safe), entry => entry.segment)
  return graphemes.length <= MAX_FIELD_GRAPHEMES
    ? safe
    : `${graphemes.slice(0, MAX_FIELD_GRAPHEMES - 1).join('')}…`
}

function category(
  id: string,
  key: TuiMessageKey,
  values: readonly string[],
  locale: TuiLocale,
): TuiLoadedContextRow {
  const boundedValues = values.slice(0, MAX_ENTRIES).map(bounded)
  const omitted = values.length - boundedValues.length
  const display = boundedValues.length === 0
    ? tuiMessage(locale, 'context.none')
    : boundedValues.join(', ')
  return Object.freeze({
    id,
    label: tuiMessage(locale, key),
    value: omitted > 0 ? `${display} ${tuiMessage(locale, 'context.omitted', { count: omitted })}` : display,
  })
}

/**
 * Project owner-provided loaded-context facts into bounded panel rows.
 * @param input - public prompt, skill, model, and permission facts.
 * @param locale - target locale for row labels and empty-state text.
 * @returns an immutable loaded-context snapshot.
 */
export function projectTuiLoadedContext(
  input: TuiLoadedContextInput,
  locale: TuiLocale = 'en',
): TuiLoadedContextSnapshot {
  const rows: TuiLoadedContextRow[] = [
    category('sections', 'context.sections', input.sections, locale),
    category('contexts', 'context.contexts', input.contexts, locale),
    category('tools', 'context.tools', input.tools, locale),
    category('skills', 'context.skills', input.skills, locale),
    ...(input.model === undefined ? [] : [{
      id: 'model', label: tuiMessage(locale, 'context.model'), value: bounded(input.model),
    }]),
    ...(input.permission === undefined ? [] : [{
      id: 'permission', label: tuiMessage(locale, 'context.permission'), value: bounded(input.permission),
    }]),
  ]
  return Object.freeze({ rows: Object.freeze(rows.map(row => Object.freeze(row))) })
}

/**
 * Wrap loaded-context rows to a physical terminal width.
 * @param snapshot - immutable loaded-context rows.
 * @param width - available content cells.
 * @returns immutable physical panel lines.
 */
export function tuiLoadedContextPanelLines(
  snapshot: TuiLoadedContextSnapshot,
  width: number,
): readonly TuiLoadedContextPanelLine[] {
  const columns = Math.max(1, width)
  const lines: TuiLoadedContextPanelLine[] = []
  for (const row of snapshot.rows) {
    for (const [index, text] of terminalWrappedLines(`${row.label}: ${row.value}`, columns).entries()) {
      lines.push(Object.freeze({ key: `${row.id}:${index}`, text }))
    }
  }
  return Object.freeze(lines)
}
