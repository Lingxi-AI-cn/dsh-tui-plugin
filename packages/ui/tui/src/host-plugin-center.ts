/** Terminal-native Host Plugin Center: Loader inventory and settings namespace projection. */

import { terminalSafe } from './sanitize.ts'
import { tuiMessage, type TuiLocale } from './locale.ts'
import type {
  AgentPresetPluginGroup, PluginEntryId, PluginFiberPhase, PluginInventoryEntry,
  PluginInventorySnapshot, SettingsDescriptor, SettingsNamespace, SettingsPathOp,
} from './host.ts'

export type { PluginEntryId, PluginFiberPhase }

const MAX_ENTRIES = 256
const MAX_NAMESPACES = 64

/** One Loader entry projected for the Host Plugin Center panel. */
export interface TuiHostPluginRow {
  readonly entry: PluginInventoryEntry
  readonly moduleName: string
  readonly enabled: boolean
  readonly phase: PluginFiberPhase
  readonly phaseLabel: string
}

/** One Agent preset composition projected from the official Host inventory owner. */
export interface TuiHostPresetPluginGroup {
  readonly preset: AgentPresetPluginGroup
  readonly name: string
  readonly broken: string | undefined
}

/** One settings namespace projected for the Host Plugin Center panel. */
export interface TuiHostSettingsRow {
  readonly ns: SettingsNamespace
  readonly schema: unknown
  readonly revision: number
  readonly applies: string
  readonly hasUserOverride: boolean
  /** Explicit owner-reviewed field intersection; an empty list keeps the namespace read-only. */
  readonly fields: readonly TuiHostSettingsField[]
}

/** One non-secret Host setting the native TUI knows how to stage and validate. */
export interface TuiHostSettingsField {
  readonly id: string
  readonly path: readonly string[]
  readonly kind: 'enum' | 'number'
  readonly value: string
  readonly overridden: boolean
  readonly options?: readonly string[]
  readonly integer?: boolean
}

/** Source state is explicit so an empty inventory cannot masquerade as a successful read. */
export type TuiHostPluginSourceState = 'ready' | 'unavailable' | 'error'

/** Host Plugin Center snapshot. */
export interface TuiHostPluginCenterSnapshot {
  readonly plugins: readonly TuiHostPluginRow[]
  readonly agentPresets: readonly TuiHostPresetPluginGroup[]
  readonly settingsNamespaces: readonly TuiHostSettingsRow[]
  readonly omittedPlugins: number
  readonly omittedPresets: number
  readonly omittedNamespaces: number
  readonly inventoryState: TuiHostPluginSourceState
  readonly settingsState: TuiHostPluginSourceState
  readonly settingsWritable: boolean
}

/** Inputs borrowed for one Host Plugin Center refresh. */
export interface TuiHostPluginCenterCollectOptions {
  readonly inventory?: {
    list(): PluginInventorySnapshot | Promise<PluginInventorySnapshot>
  }
  readonly settings?: {
    readonly writable?: boolean
    describe(options?: { redactSecrets?: boolean }): SettingsDescriptor[]
  }
}

/** One staged, revision-fenced write accepted by the Host Plugin Center. */
export interface TuiHostSettingsMutation {
  readonly ns: SettingsNamespace
  readonly expectedRevision: number
  readonly ops: readonly SettingsPathOp[]
}

const ENUM_FIELDS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = Object.freeze({
  tui: Object.freeze({
    theme: Object.freeze(['auto', 'dark', 'light', 'no-color']),
    locale: Object.freeze(['en', 'zh']),
    mouse: Object.freeze(['auto', 'off']),
    activity: Object.freeze(['dots', 'pulse', 'minimal', 'off']),
  }),
})

const NUMBER_FIELDS: Readonly<Record<string, Readonly<Record<string, { readonly integer: boolean }>>>> = Object.freeze({
  shell: Object.freeze({
    timeoutMs: Object.freeze({ integer: false }),
    maxOutputBytes: Object.freeze({ integer: false }),
  }),
  'agent-loop': Object.freeze({
    maxParallelToolCalls: Object.freeze({ integer: true }),
  }),
})

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : Object.freeze({})
}

/** Project only fields whose current owner value agrees with the reviewed editor contract. */
function editableFields(descriptor: SettingsDescriptor): readonly TuiHostSettingsField[] {
  const ns = String(descriptor.ns)
  const value = record(descriptor.value)
  const user = record(descriptor.user)
  const fields: TuiHostSettingsField[] = []
  for (const [id, options] of Object.entries(ENUM_FIELDS[ns] ?? {})) {
    const current = value[id]
    if (typeof current !== 'string' || !options.includes(current)) continue
    fields.push(Object.freeze({
      id,
      path: Object.freeze([id]),
      kind: 'enum',
      value: current,
      overridden: Object.prototype.hasOwnProperty.call(user, id),
      options,
    }))
  }
  for (const [id, spec] of Object.entries(NUMBER_FIELDS[ns] ?? {})) {
    const current = value[id]
    if (typeof current !== 'number' || !Number.isFinite(current) || current <= 0) continue
    fields.push(Object.freeze({
      id,
      path: Object.freeze([id]),
      kind: 'number',
      value: String(current),
      overridden: Object.prototype.hasOwnProperty.call(user, id),
      integer: spec.integer,
    }))
  }
  return Object.freeze(fields)
}

/** Phase labels for terminal display. */
function phaseLabel(phase: PluginFiberPhase, locale: TuiLocale): string {
  if (phase === null) return locale === 'zh' ? '未加载' : 'unloaded'
  const labels: Record<string, Record<TuiLocale, string>> = {
    pending: { en: 'pending', zh: '等待中' },
    loading: { en: 'loading', zh: '加载中' },
    active: { en: 'active', zh: '活跃' },
    failed: { en: 'failed', zh: '失败' },
    unloading: { en: 'unloading', zh: '卸载中' },
  }
  return labels[phase]?.[locale] ?? phase
}

/**
 * Collect a bounded, terminal-safe Host Plugin Center snapshot.
 * @param options - Host service handles.
 * @param locale - active TUI locale.
 * @returns frozen snapshot.
 */
export async function collectTuiHostPluginCenter(
  options: TuiHostPluginCenterCollectOptions,
  locale: TuiLocale,
): Promise<TuiHostPluginCenterSnapshot> {
  let inventoryState: TuiHostPluginSourceState = options.inventory === undefined ? 'unavailable' : 'ready'
  let allEntries: readonly PluginInventoryEntry[] = []
  let allPresets: readonly AgentPresetPluginGroup[] = []
  try {
    const inventory = options.inventory === undefined ? undefined : await options.inventory.list()
    allEntries = inventory?.entries ?? []
    allPresets = inventory?.agentPresets ?? []
  } catch {
    inventoryState = 'error'
  }
  const boundedEntries = allEntries.slice(0, MAX_ENTRIES)
  const boundedPresets = allPresets.slice(0, MAX_ENTRIES)

  const plugins: TuiHostPluginRow[] = boundedEntries.map(entry => Object.freeze({
    entry,
    moduleName: terminalSafe(entry.moduleName),
    enabled: entry.enabled,
    phase: entry.fiberPhase,
    phaseLabel: phaseLabel(entry.fiberPhase, locale),
  }))
  const agentPresets: TuiHostPresetPluginGroup[] = boundedPresets.map(preset => Object.freeze({
    preset,
    name: terminalSafe(preset.name ?? preset.id),
    broken: preset.broken === undefined ? undefined : terminalSafe(preset.broken),
  }))

  let settingsState: TuiHostPluginSourceState = options.settings === undefined ? 'unavailable' : 'ready'
  let allDescriptors: readonly SettingsDescriptor[] = []
  try {
    allDescriptors = options.settings?.describe({ redactSecrets: true }) ?? []
  } catch {
    settingsState = 'error'
  }
  const boundedDescriptors = allDescriptors.slice(0, MAX_NAMESPACES)

  const settingsNamespaces: TuiHostSettingsRow[] = boundedDescriptors.map(descriptor => Object.freeze({
    ns: descriptor.ns,
    schema: descriptor.schema,
    revision: descriptor.revision,
    applies: descriptor.applies,
    hasUserOverride: descriptor.user !== undefined && Object.keys(descriptor.user as object).length > 0,
    fields: editableFields(descriptor),
  }))

  return Object.freeze({
    plugins: Object.freeze(plugins),
    agentPresets: Object.freeze(agentPresets),
    settingsNamespaces: Object.freeze(settingsNamespaces),
    omittedPlugins: Math.max(0, allEntries.length - MAX_ENTRIES),
    omittedPresets: Math.max(0, allPresets.length - MAX_ENTRIES),
    omittedNamespaces: Math.max(0, allDescriptors.length - MAX_NAMESPACES),
    inventoryState,
    settingsState,
    settingsWritable: options.settings?.writable === true,
  })
}

/**
 * Convert staged field drafts into one atomic path mutation without ever restating redacted fields.
 * @param row - fresh redacted namespace descriptor projection.
 * @param drafts - staged values; `reset` unsets the user override.
 * @returns a revision-fenced settings mutation for the owner.
 */
export function planTuiHostSettingsMutation(
  row: TuiHostSettingsRow,
  drafts: Readonly<Record<string, { readonly text: string; readonly reset?: boolean }>>,
): TuiHostSettingsMutation {
  const fields = new Map(row.fields.map(field => [field.id, field]))
  const ops: SettingsPathOp[] = []
  for (const [id, draft] of Object.entries(drafts)) {
    const field = fields.get(id)
    if (field === undefined) throw new Error(`unsupported Host setting field: ${id}`)
    if (draft.reset === true) {
      ops.push({ op: 'unset', path: field.path })
      continue
    }
    const text = draft.text.trim()
    if (field.kind === 'enum') {
      if (field.options?.includes(text) !== true) throw new Error(`invalid value for ${id}`)
      ops.push({ op: 'set', path: field.path, value: text })
      continue
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value <= 0 || (field.integer === true && !Number.isInteger(value))) {
      throw new Error(`invalid value for ${id}`)
    }
    ops.push({ op: 'set', path: field.path, value })
  }
  if (ops.length === 0) throw new Error('no Host settings changes are staged')
  return Object.freeze({ ns: row.ns, expectedRevision: row.revision, ops: Object.freeze(ops) })
}

/**
 * Filter plugins by enabled state or fiber phase.
 * @param rows - complete bounded inventory rows.
 * @param filter - lifecycle subset selected by the user.
 * @param query - case-insensitive module-name query.
 * @returns matching rows in owner order.
 */
export function filterTuiHostPlugins(
  rows: readonly TuiHostPluginRow[],
  filter: 'all' | 'enabled' | 'disabled' | 'failed',
  query: string,
): readonly TuiHostPluginRow[] {
  let filtered = rows
  if (filter === 'enabled') filtered = filtered.filter(r => r.enabled)
  else if (filter === 'disabled') filtered = filtered.filter(r => !r.enabled)
  else if (filter === 'failed') filtered = filtered.filter(r => r.phase === 'failed')

  if (query.length > 0) {
    const lower = query.toLowerCase()
    filtered = filtered.filter(r => r.moduleName.toLowerCase().includes(lower))
  }
  return filtered
}

/** Lifecycle filter offered by the Host Plugin Center. */
export type TuiHostPluginFilter = 'all' | 'enabled' | 'disabled' | 'failed'

/**
 * Map settings-owner failures to stable guidance while retaining staged drafts for retry.
 * @param error - settings-owner or local validation failure.
 * @param locale - selected first-party locale.
 * @returns localized stable guidance.
 */
export function tuiHostSettingsErrorMessage(error: unknown, locale: TuiLocale = 'en'): string {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : undefined
  const code = typeof record?.['code'] === 'string' ? record['code'] : undefined
  const message = typeof record?.['message'] === 'string' ? record['message'] : ''
  const field = /^(?:invalid value for|unsupported Host setting field:) (.+)$/u.exec(message)?.[1]
  if (message === 'no Host settings changes are staged') {
    return tuiMessage(locale, 'hostPlugins.settings.error.noChanges')
  }
  if (message.startsWith('invalid value for ') && field !== undefined) {
    return tuiMessage(locale, 'hostPlugins.settings.error.invalid', { field: terminalSafe(field) })
  }
  if (message.startsWith('unsupported Host setting field:') && field !== undefined) {
    return tuiMessage(locale, 'hostPlugins.settings.error.unsupported', { field: terminalSafe(field) })
  }
  if (code === 'SETTINGS_CONFLICT') return tuiMessage(locale, 'hostPlugins.settings.error.conflict')
  if (message.includes('read-only')) return tuiMessage(locale, 'hostPlugins.settings.error.readOnly')
  if (message.includes('not registered') || message.includes('disposed')) {
    return tuiMessage(locale, 'hostPlugins.settings.error.unavailable')
  }
  return tuiMessage(locale, 'hostPlugins.settings.error.failed')
}
