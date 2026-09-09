/** Pure, bounded first-run guidance over public Host and provider facts. */

import stringWidth from 'string-width'
import { terminalSafe } from './sanitize.ts'
import { tuiMessage, type TuiLocale } from './locale.ts'

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const NARROW_CONTENT_COLUMNS = 40

/** Selected provider state observed without reading credentials. */
export type TuiStartupProviderState =
  | { readonly state: 'checking'; readonly id: string; readonly name: string }
  | { readonly state: 'configured'; readonly id: string; readonly name: string; readonly modelCount: number }
  | { readonly state: 'unconfigured'; readonly id: string; readonly name: string; readonly method?: string }
  | { readonly state: 'missing'; readonly id: string }
  | { readonly state: 'failed'; readonly id: string; readonly name: string }

/** Process-local facts collected for the centered startup workspace. */
export interface TuiStartupGuidanceSnapshot {
  /** Whether the post-install compatibility snapshot reached the runtime. */
  readonly host: 'compatible' | 'unavailable'
  /** State of the provider named by the next model selection. */
  readonly provider: TuiStartupProviderState
  /** Whether `/plugins` has a mounted provider. */
  readonly pluginHub: boolean
}

/** One single-row startup message with semantic presentation tone. */
export interface TuiStartupGuidanceLine {
  readonly key: 'primary' | 'actions'
  readonly text: string
  readonly tone: 'success' | 'warning' | 'info' | 'secondary'
}

/** Public LLM reads borrowed by the first-run collector. */
export interface TuiStartupProviderInspector {
  authentication(provider: string): Promise<{
    readonly configured: boolean
    readonly methods: readonly { readonly name: string }[]
  }>
  listModels(provider: string): Promise<readonly unknown[]>
}

/** Stop waiting for a Host read even when that Host has no cancellation parameter. */
async function cancellableRead<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  if (signal === undefined) return read()
  let abort: () => void = () => {}
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => { reject(signal.reason instanceof Error ? signal.reason : new Error('Startup guidance cancelled', { cause: signal.reason })) }
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    return await Promise.race([read(), cancelled])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

/**
 * Inspect one selected provider without retaining credentials or raw failures.
 * @param provider - registered provider identity and display name.
 * @param inspector - public authentication and model-catalog reads.
 * @param signal - cancellation stops waiting for provider-owned asynchronous reads.
 * @returns configured, unconfigured, or contained-failure state.
 */
export async function inspectTuiStartupProvider(
  provider: Readonly<{ id: string; name: string }>,
  inspector: TuiStartupProviderInspector,
  signal?: AbortSignal,
): Promise<TuiStartupProviderState> {
  try {
    const authentication = await cancellableRead(() => inspector.authentication(provider.id), signal)
    signal?.throwIfAborted()
    if (!authentication.configured) return Object.freeze({
      state: 'unconfigured',
      id: provider.id,
      name: provider.name,
      ...(authentication.methods[0]?.name === undefined
        ? {}
        : { method: authentication.methods[0].name }),
    })
    const models = await cancellableRead(() => inspector.listModels(provider.id), signal)
    signal?.throwIfAborted()
    return Object.freeze({
      state: 'configured', id: provider.id, name: provider.name, modelCount: models.length,
    })
  } catch (error: unknown) {
    if (signal?.aborted === true) throw error
    return Object.freeze({ state: 'failed', id: provider.id, name: provider.name })
  }
}

function fit(value: string, columns: number): string {
  const width = Math.max(1, columns)
  const safe = terminalSafe(value).replace(/\s+/gu, ' ').trim()
  if (stringWidth(safe) <= width) return safe
  if (width === 1) return '…'
  let result = ''
  for (const { segment } of GRAPHEMES.segment(safe)) {
    if (stringWidth(result + segment) > width - 1) break
    result += segment
  }
  return `${result}…`
}

function secondaryActions(
  snapshot: TuiStartupGuidanceSnapshot,
  leading: string,
  locale: TuiLocale,
): string {
  return [
    leading,
    snapshot.pluginHub ? `/plugins ${locale === 'zh' ? '浏览' : 'browse'}` : undefined,
    tuiMessage(locale, 'startup.actions.help'),
  ].filter((value): value is string => value !== undefined).join(' · ')
}

/**
 * Project the highest-priority first-run action without guessing provider internals.
 * @param snapshot - Host, selected-provider, and Plugin Hub facts.
 * @param modelLabel - selected model and optional reasoning effort already shown by the TUI.
 * @param columns - available cells in the centered startup workspace.
 * @param locale - target locale for guidance text.
 * @returns one narrow line or a primary line plus secondary actions.
 */
export function projectTuiStartupGuidance(
  snapshot: TuiStartupGuidanceSnapshot,
  modelLabel: string,
  columns: number,
  locale: TuiLocale = 'en',
): readonly TuiStartupGuidanceLine[] {
  const narrow = columns <= NARROW_CONTENT_COLUMNS
  let primary: Omit<TuiStartupGuidanceLine, 'key'>
  let actions: string
  let narrowText: string

  if (snapshot.host === 'unavailable') {
    primary = { text: tuiMessage(locale, 'startup.host.unavailable'), tone: 'warning' }
    actions = secondaryActions(snapshot, tuiMessage(locale, 'startup.actions.setup'), locale)
    narrowText = tuiMessage(locale, 'startup.narrow.doctor')
  } else if (snapshot.provider.state === 'missing') {
    primary = { text: tuiMessage(locale, 'startup.provider.missing', { id: snapshot.provider.id }), tone: 'warning' }
    actions = secondaryActions(snapshot, tuiMessage(locale, 'startup.actions.choose'), locale)
    narrowText = tuiMessage(locale, 'startup.narrow.provider')
  } else if (snapshot.provider.state === 'unconfigured') {
    primary = { text: tuiMessage(locale, 'startup.provider.unconfigured', { name: snapshot.provider.name }), tone: 'warning' }
    actions = secondaryActions(
      snapshot,
      snapshot.provider.method === undefined
        ? tuiMessage(locale, 'startup.actions.doctor')
        : `/models ${snapshot.provider.method}`,
      locale,
    )
    narrowText = tuiMessage(locale, 'startup.narrow.models', { name: snapshot.provider.name })
  } else if (snapshot.provider.state === 'failed') {
    primary = { text: tuiMessage(locale, 'startup.provider.failed', { name: snapshot.provider.name }), tone: 'warning' }
    actions = secondaryActions(snapshot, tuiMessage(locale, 'startup.actions.retry'), locale)
    narrowText = tuiMessage(locale, 'startup.narrow.failed', { name: snapshot.provider.name })
  } else if (snapshot.provider.state === 'configured' && snapshot.provider.modelCount === 0) {
    primary = { text: tuiMessage(locale, 'startup.provider.empty', { name: snapshot.provider.name }), tone: 'warning' }
    actions = secondaryActions(snapshot, tuiMessage(locale, 'startup.actions.doctor'), locale)
    narrowText = tuiMessage(locale, 'startup.narrow.empty')
  } else if (snapshot.provider.state === 'checking') {
    primary = {
      text: modelLabel === ''
        ? tuiMessage(locale, 'startup.checking')
        : tuiMessage(locale, 'startup.checking.model', { model: modelLabel }),
      tone: 'info',
    }
    actions = secondaryActions(snapshot, tuiMessage(locale, 'startup.actions.setup'), locale)
    narrowText = tuiMessage(locale, 'startup.narrow.checking')
  } else {
    primary = {
      text: modelLabel === '' ? tuiMessage(locale, 'startup.ready') : modelLabel,
      tone: 'success',
    }
    actions = secondaryActions(snapshot, tuiMessage(locale, 'startup.actions.models'), locale)
    narrowText = modelLabel === ''
      ? tuiMessage(locale, 'startup.narrow.ready')
      : tuiMessage(locale, 'startup.narrow.model', { model: modelLabel })
  }

  if (narrow) {
    return Object.freeze([Object.freeze({
      key: 'primary', text: fit(narrowText, columns), tone: primary.tone,
    })])
  }
  return Object.freeze([
    Object.freeze({ key: 'primary', text: fit(primary.text, columns), tone: primary.tone }),
    Object.freeze({ key: 'actions', text: fit(actions, columns), tone: 'secondary' }),
  ])
}
