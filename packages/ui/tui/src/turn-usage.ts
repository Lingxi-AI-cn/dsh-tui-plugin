/** Exact completed-Turn token accounting projected from durable provider facts. */

import type { TurnTokenUsage } from './host.ts'
import { tuiMessage, type TuiLocale } from './locale.ts'

function count(value: number, locale: TuiLocale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

/**
 * Build one compact, explicitly exact usage row for a completed Turn.
 * @param usage - official token-meter completed-Turn projection.
 * @param locale - active TUI message catalog locale.
 * @returns localized compact exact-usage row.
 */
export function formatTuiTurnUsage(usage: TurnTokenUsage, locale: TuiLocale): string {
  return [
    tuiMessage(locale, 'turn.usage.exact'),
    tuiMessage(locale, 'turn.usage.input', { tokens: count(usage.uncachedInputTokens, locale) }),
    ...(usage.cacheReadTokens === undefined ? [] : [
      tuiMessage(locale, 'turn.usage.cacheRead', { tokens: count(usage.cacheReadTokens, locale) }),
    ]),
    ...(usage.cacheWriteTokens === undefined ? [] : [
      tuiMessage(locale, 'turn.usage.cacheWrite', { tokens: count(usage.cacheWriteTokens, locale) }),
    ]),
    tuiMessage(locale, 'turn.usage.output', { tokens: count(usage.outputTokens, locale) }),
    tuiMessage(locale, 'turn.usage.total', { tokens: count(usage.totalTokens, locale) }),
  ].join(' · ')
}

/**
 * Build complete read-only details without inventing absent optional buckets.
 * @param usage - official token-meter completed-Turn projection.
 * @param locale - active TUI message catalog locale.
 * @returns localized immutable detail rows.
 */
export function tuiTurnUsageDetailLines(usage: TurnTokenUsage, locale: TuiLocale): readonly string[] {
  return Object.freeze([
    formatTuiTurnUsage(usage, locale),
    ...(usage.reasoningTokens === undefined ? [] : [
      tuiMessage(locale, 'turn.usage.reasoning', { tokens: count(usage.reasoningTokens, locale) }),
    ]),
    ...(usage.routes === undefined ? [] : [
      tuiMessage(locale, 'turn.usage.routes', {
        routes: usage.routes.map(route => `${route.provider}/${route.model}`).join(', '),
      }),
    ]),
  ])
}
