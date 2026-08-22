/** Bounded, non-secret runtime diagnostics projected for the native TUI. */

import type { TuiTerminalCapabilities } from './terminal-session.ts'
import { terminalSafe } from './sanitize.ts'
import { terminalWrappedLines } from './viewport.ts'
import { tuiMessage, type TuiLocale, type TuiMessageKey } from './locale.ts'

const MAX_DIAGNOSTIC_ROWS = 24
const MAX_PROVIDER_ROWS = 8
const MAX_FIELD_GRAPHEMES = 1_024
const FIELD_GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** One official Host package validated before terminal mutation. */
export interface TuiHostPackageDiagnostic {
  /** Exact npm package name. */
  readonly name: string
  /** Installed package version. */
  readonly version: string
  /** Canonical package manifest path outside the active profile. */
  readonly manifestPath: string
}

/** Successful post-install Host compatibility snapshot supplied by the top-level bundle. */
export interface TuiHostDiagnosticSnapshot {
  /** Compatibility result; incompatible installations fail before this snapshot is published. */
  readonly compatibility: 'compatible'
  /** Installed DSH release represented by the app-boot package. */
  readonly dshVersion: string
  /** Exact DSH release accepted by the packed TUI. */
  readonly supportedDshVersion: string
  /** Installed TUI bundle release. */
  readonly tuiVersion: string
  /** Fixed profile identity. */
  readonly profile: 'tui'
  /** Node runtime version without the leading `v`. */
  readonly nodeVersion: string
  /** Node platform identifier. */
  readonly platform: NodeJS.Platform
  /** Node architecture identifier. */
  readonly architecture: string
  /** Official packages resolved outside the profile installation. */
  readonly packages: readonly TuiHostPackageDiagnostic[]
  /** Shipped Agent preset ids verified before terminal mutation. */
  readonly agentPresetIds: readonly string[]
  /** Exact reinstall command for a Host/TUI compatibility failure. */
  readonly recoveryCommand: string
}

/** Diagnostic importance rendered without relying on color alone. */
export type TuiDiagnosticSeverity = 'pass' | 'info' | 'warning' | 'error'

/** One stable diagnostic result. */
export interface TuiDiagnosticRow {
  /** Stable row identity. */
  readonly id: string
  /** Result importance. */
  readonly severity: TuiDiagnosticSeverity
  /** Short human-readable result. */
  readonly summary: string
  /** Optional bounded supporting fact. */
  readonly detail?: string
  /** Optional exact next action. */
  readonly remediation?: string
  /** Service or startup check that owns the fact. */
  readonly source: string
}

/** Non-secret provider state collected through the LLM service. */
export interface TuiProviderDiagnostic {
  /** Stable provider id. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** Whether the provider reports configured credentials or equivalent access. */
  readonly configured: boolean
  /** Provider-owned authentication source label. */
  readonly authenticationSource?: string
  /** Selectable model count after successful discovery. */
  readonly modelCount?: number
  /** Contained non-secret provider failure label. */
  readonly error?: string
}

/** Plugin Hub health collected from its mounted provider. */
export type TuiPluginHubDiagnostic =
  | { readonly state: 'unavailable' }
  | {
    readonly state: 'available'
    readonly source: 'registry' | 'cache' | 'fixture'
    readonly stale: boolean
    readonly installedCount: number
    readonly profileMutations: boolean
  }
  | { readonly state: 'failed'; readonly error: string; readonly profileMutations: boolean }

/** Optional runtime capabilities whose absence changes only the corresponding TUI feature. */
export interface TuiRuntimeCapabilityDiagnostics {
  readonly settings: boolean
  readonly sessionProjection: boolean
  readonly pluginHub: boolean
  readonly jobs: boolean
  readonly subagents: boolean
}

/** Inputs collected by one `/doctor` invocation. */
export interface TuiDiagnosticInput {
  readonly host?: TuiHostDiagnosticSnapshot
  readonly terminal?: TuiTerminalCapabilities
  readonly providers: readonly TuiProviderDiagnostic[]
  readonly omittedProviders?: number
  readonly pluginHub: TuiPluginHubDiagnostic
  readonly capabilities: TuiRuntimeCapabilityDiagnostics
}

/** Complete process-local diagnostic panel state. */
export interface TuiDiagnosticSnapshot {
  readonly rows: readonly TuiDiagnosticRow[]
}

/** One physical panel line derived from a diagnostic row. */
export interface TuiDiagnosticPanelLine {
  readonly key: string
  readonly text: string
  readonly severity: TuiDiagnosticSeverity
  readonly kind: 'summary' | 'detail' | 'remediation' | 'source'
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function isHostPackage(value: unknown): value is TuiHostPackageDiagnostic {
  return isRecord(value)
    && typeof value['name'] === 'string'
    && typeof value['version'] === 'string'
    && typeof value['manifestPath'] === 'string'
}

function isHostSnapshot(value: unknown): value is TuiHostDiagnosticSnapshot {
  return isRecord(value)
    && value['compatibility'] === 'compatible'
    && typeof value['dshVersion'] === 'string'
    && typeof value['supportedDshVersion'] === 'string'
    && typeof value['tuiVersion'] === 'string'
    && value['profile'] === 'tui'
    && typeof value['nodeVersion'] === 'string'
    && typeof value['platform'] === 'string'
    && typeof value['architecture'] === 'string'
    && Array.isArray(value['packages'])
    && value['packages'].every(isHostPackage)
    && Array.isArray(value['agentPresetIds'])
    && value['agentPresetIds'].every(entry => typeof entry === 'string')
    && typeof value['recoveryCommand'] === 'string'
}

/**
 * Read the typed Host snapshot from the bundle-owned startup service.
 * @param value - untyped service value injected by the post-install composition.
 * @returns validated snapshot, or `undefined` for a missing or foreign service.
 */
export function tuiHostDiagnosticsFromStartup(value: unknown): TuiHostDiagnosticSnapshot | undefined {
  if (!isRecord(value)) return undefined
  const diagnostics = value['diagnostics']
  return isHostSnapshot(diagnostics) ? diagnostics : undefined
}

function singleLine(value: string): string {
  const safe = terminalSafe(value).replace(/\s+/gu, ' ').trim()
  const graphemes = Array.from(FIELD_GRAPHEMES.segment(safe), entry => entry.segment)
  return graphemes.length <= MAX_FIELD_GRAPHEMES
    ? safe
    : `${graphemes.slice(0, MAX_FIELD_GRAPHEMES - 1).join('')}…`
}

function row(value: TuiDiagnosticRow): TuiDiagnosticRow {
  return Object.freeze({
    ...value,
    summary: singleLine(value.summary),
    ...(value.detail === undefined ? {} : { detail: singleLine(value.detail) }),
    ...(value.remediation === undefined ? {} : { remediation: singleLine(value.remediation) }),
    source: singleLine(value.source),
  })
}

function diagnosticMessage(
  locale: TuiLocale,
  key: TuiMessageKey,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return tuiMessage(locale, key, params)
}

function hostRows(host: TuiHostDiagnosticSnapshot | undefined, locale: TuiLocale): readonly TuiDiagnosticRow[] {
  if (host === undefined) return [row({
    id: 'host-compatibility', severity: 'warning',
    summary: diagnosticMessage(locale, 'diagnostics.host.unavailable.summary'),
    remediation: diagnosticMessage(locale, 'diagnostics.host.unavailable.remediation'),
    source: diagnosticMessage(locale, 'diagnostics.host.unavailable.source'),
  })]
  const appBoot = host.packages.find(entry => entry.name === '@deepseek-ai/dsh-app-boot')
  return [
    row({
      id: 'host-compatibility', severity: 'pass',
      summary: diagnosticMessage(locale, 'diagnostics.host.compatible.summary', {
        dsh: host.dshVersion, tui: host.tuiVersion,
      }),
      detail: diagnosticMessage(locale, 'diagnostics.host.compatible.detail', {
        profile: host.profile, node: host.nodeVersion, platform: host.platform, architecture: host.architecture,
      }),
      source: diagnosticMessage(locale, 'diagnostics.host.compatible.source'),
    }),
    row({
      id: 'host-packages', severity: 'pass',
      summary: diagnosticMessage(locale, 'diagnostics.host.packages.summary', { count: host.packages.length }),
      ...(appBoot === undefined ? {} : {
        detail: diagnosticMessage(locale, 'diagnostics.host.packages.detail', {
          name: appBoot.name, version: appBoot.version,
        }),
      }),
      source: diagnosticMessage(locale, 'diagnostics.host.packages.source'),
    }),
  ]
}

function terminalRow(terminal: TuiTerminalCapabilities | undefined, locale: TuiLocale): TuiDiagnosticRow {
  if (terminal === undefined) return row({
    id: 'terminal', severity: 'warning', summary: diagnosticMessage(locale, 'diagnostics.terminal.unavailable.summary'),
    remediation: diagnosticMessage(locale, 'diagnostics.terminal.unavailable.remediation'),
    source: diagnosticMessage(locale, 'diagnostics.terminal.unavailable.source'),
  })
  const degraded = terminal.mouse === 'none' || !terminal.bracketedPaste || !terminal.osc
  const yes = diagnosticMessage(locale, 'diagnostics.yes')
  const no = diagnosticMessage(locale, 'diagnostics.no')
  return row({
    id: 'terminal', severity: degraded ? 'info' : 'pass',
    summary: diagnosticMessage(locale, 'diagnostics.terminal.summary', {
      colorDepth: terminal.colorDepth, keyboardProtocol: terminal.keyboardProtocol, mouse: terminal.mouse,
    }),
    detail: diagnosticMessage(locale, 'diagnostics.terminal.detail', {
      background: terminal.background, focus: terminal.focus ? yes : no,
      paste: terminal.bracketedPaste ? yes : no, osc: terminal.osc ? yes : no,
      sync: terminal.synchronizedOutput ? yes : no, tmux: terminal.outer.tmux ? yes : no,
      ssh: terminal.outer.ssh ? yes : no,
    }),
    source: diagnosticMessage(locale, 'diagnostics.terminal.source'),
  })
}

function providerRows(
  providers: readonly TuiProviderDiagnostic[],
  omittedProviders: number,
  locale: TuiLocale,
): readonly TuiDiagnosticRow[] {
  if (providers.length === 0 && omittedProviders === 0) return [row({
    id: 'providers', severity: 'error', summary: diagnosticMessage(locale, 'diagnostics.providers.none.summary'),
    remediation: diagnosticMessage(locale, 'diagnostics.providers.none.remediation'),
    source: diagnosticMessage(locale, 'diagnostics.providers.none.source'),
  })]
  const visible = providers.slice(0, MAX_PROVIDER_ROWS).map((provider): TuiDiagnosticRow => {
    if (provider.error !== undefined) return row({
      id: `provider:${provider.id}`, severity: 'warning',
      summary: diagnosticMessage(locale, 'diagnostics.provider.error.summary', { name: provider.name, id: provider.id }),
      detail: provider.error,
      remediation: diagnosticMessage(locale, 'diagnostics.provider.error.remediation'),
      source: diagnosticMessage(locale, 'diagnostics.provider.source'),
    })
    if (!provider.configured) return row({
      id: `provider:${provider.id}`, severity: 'warning',
      summary: diagnosticMessage(locale, 'diagnostics.provider.unconfigured.summary', {
        name: provider.name, id: provider.id,
      }),
      ...(provider.authenticationSource === undefined ? {} : {
        detail: diagnosticMessage(locale, 'diagnostics.provider.auth.detail', { source: provider.authenticationSource }),
      }),
      remediation: diagnosticMessage(locale, 'diagnostics.provider.unconfigured.remediation'),
      source: diagnosticMessage(locale, 'diagnostics.provider.auth.source'),
    })
    const modelCount = provider.modelCount ?? 0
    return row({
      id: `provider:${provider.id}`, severity: modelCount === 0 ? 'warning' : 'pass',
      summary: diagnosticMessage(locale, 'diagnostics.provider.configured.summary', {
        name: provider.name, id: provider.id, count: modelCount,
        modelWord: diagnosticMessage(locale, modelCount === 1 ? 'diagnostics.model.one' : 'diagnostics.model.many'),
      }),
      ...(provider.authenticationSource === undefined ? {} : {
        detail: diagnosticMessage(locale, 'diagnostics.provider.auth.detail', { source: provider.authenticationSource }),
      }),
      ...(modelCount === 0 ? {
        remediation: diagnosticMessage(locale, 'diagnostics.provider.configured.remediation'),
      } : {}),
      source: diagnosticMessage(locale, 'diagnostics.provider.source'),
    })
  })
  const hidden = Math.max(0, providers.length - visible.length) + omittedProviders
  return hidden === 0 ? visible : [...visible, row({
    id: 'providers-omitted', severity: 'info',
    summary: diagnosticMessage(locale, 'diagnostics.providers.omitted.summary', {
      count: hidden,
      providerWord: diagnosticMessage(locale, hidden === 1 ? 'diagnostics.provider.one' : 'diagnostics.provider.many'),
    }),
    source: diagnosticMessage(locale, 'diagnostics.providers.omitted.source'),
  })]
}

function pluginHubRow(pluginHub: TuiPluginHubDiagnostic, locale: TuiLocale): TuiDiagnosticRow {
  if (pluginHub.state === 'unavailable') return row({
    id: 'plugin-hub', severity: 'info', summary: diagnosticMessage(locale, 'diagnostics.plugin.unavailable.summary'),
    source: diagnosticMessage(locale, 'diagnostics.plugin.source'),
  })
  if (pluginHub.state === 'failed') return row({
    id: 'plugin-hub', severity: 'warning', summary: diagnosticMessage(locale, 'diagnostics.plugin.failed.summary'),
    detail: pluginHub.error, remediation: diagnosticMessage(locale, 'diagnostics.plugin.failed.remediation'),
    source: diagnosticMessage(locale, 'diagnostics.plugin.source'),
  })
  return row({
    id: 'plugin-hub', severity: pluginHub.stale ? 'warning' : 'pass',
    summary: diagnosticMessage(locale, 'diagnostics.plugin.available.summary', {
      source: pluginHub.source,
      freshness: diagnosticMessage(locale, pluginHub.stale ? 'diagnostics.catalog.stale' : 'diagnostics.catalog.current'),
    }),
    detail: diagnosticMessage(locale, 'diagnostics.plugin.available.detail', {
      count: pluginHub.installedCount,
      pluginWord: diagnosticMessage(locale, pluginHub.installedCount === 1 ? 'diagnostics.plugin.one' : 'diagnostics.plugin.many'),
      mutation: diagnosticMessage(locale, pluginHub.profileMutations ? 'diagnostics.mutation.enabled' : 'diagnostics.mutation.external'),
    }),
    ...(pluginHub.stale ? { remediation: diagnosticMessage(locale, 'diagnostics.plugin.available.remediation') } : {}),
    source: diagnosticMessage(locale, 'diagnostics.plugin.source'),
  })
}

function capabilityRow(capabilities: TuiRuntimeCapabilityDiagnostics, locale: TuiLocale): TuiDiagnosticRow {
  const entries = Object.entries(capabilities)
  const available = entries.filter(([, value]) => value).map(([name]) => name)
  const unavailable = entries.filter(([, value]) => !value).map(([name]) => name)
  return row({
    id: 'runtime-capabilities', severity: unavailable.length === 0 ? 'pass' : 'info',
    summary: diagnosticMessage(locale, 'diagnostics.capabilities.summary', {
      available: available.length, total: entries.length,
    }),
    detail: diagnosticMessage(locale, 'diagnostics.capabilities.detail', {
      available: available.join(', ') || diagnosticMessage(locale, 'diagnostics.none'),
      unavailable: unavailable.length === 0 ? '' : diagnosticMessage(locale, 'diagnostics.capabilities.unavailable', {
        names: unavailable.join(', '),
      }),
    }),
    source: diagnosticMessage(locale, 'diagnostics.capabilities.source'),
  })
}

/**
 * Project one bounded process-local diagnostic snapshot.
 * @param input - Host, terminal, provider, Plugin Hub, and optional-service facts.
 * @param locale - target locale for diagnostic labels and remediation text.
 * @returns immutable rows suitable for a read-only panel.
 */
export function projectTuiDiagnostics(
  input: TuiDiagnosticInput,
  locale: TuiLocale = 'en',
): TuiDiagnosticSnapshot {
  return Object.freeze({
    rows: Object.freeze([
      ...hostRows(input.host, locale),
      terminalRow(input.terminal, locale),
      ...providerRows(input.providers, input.omittedProviders ?? 0, locale),
      pluginHubRow(input.pluginHub, locale),
      capabilityRow(input.capabilities, locale),
    ].slice(0, MAX_DIAGNOSTIC_ROWS)),
  })
}

const SEVERITY_MARKS: Readonly<Record<TuiDiagnosticSeverity, string>> = Object.freeze({
  pass: '✓', info: 'i', warning: '!', error: '✕',
})

/**
 * Wrap diagnostic rows into physical terminal lines without exposing controls.
 * @param snapshot - current process-local diagnostic results.
 * @param width - available content cells.
 * @param locale - target locale for panel labels.
 * @returns immutable physical lines retaining row severity and field kind.
 */
export function tuiDiagnosticPanelLines(
  snapshot: TuiDiagnosticSnapshot,
  width: number,
  locale: TuiLocale = 'en',
): readonly TuiDiagnosticPanelLine[] {
  const columns = Math.max(1, width)
  const lines: TuiDiagnosticPanelLine[] = []
  for (const diagnostic of snapshot.rows) {
    const fields: readonly (readonly [TuiDiagnosticPanelLine['kind'], string])[] = [
      ['summary', `${SEVERITY_MARKS[diagnostic.severity]} ${diagnostic.summary}`],
      ...(diagnostic.detail === undefined ? [] : [['detail', `  ${diagnostic.detail}`] as const]),
      ...(diagnostic.remediation === undefined ? [] : [['remediation', `  ${tuiMessage(locale, 'common.next', { text: diagnostic.remediation })}`] as const]),
      ['source', `  ${tuiMessage(locale, 'common.source', { source: diagnostic.source })}`],
    ]
    for (const [kind, text] of fields) {
      for (const [index, physical] of terminalWrappedLines(text, columns).entries()) {
        lines.push(Object.freeze({
          key: `${diagnostic.id}:${kind}:${index}`,
          text: physical,
          severity: diagnostic.severity,
          kind,
        }))
      }
    }
  }
  return Object.freeze(lines)
}
