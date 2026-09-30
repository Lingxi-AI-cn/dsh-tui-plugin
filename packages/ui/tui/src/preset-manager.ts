/** Terminal-native Agent Preset Manager: roster projection and mutation. */

import { terminalSafe } from './sanitize.ts'
import { tuiAgentModeDescription, tuiAgentModeName } from './mode.ts'
import type { AgentPreset, AgentPresetCompositionRow, SettingsForms, TuiAgentPresets } from './host.ts'
import { tuiMessage, type TuiLocale } from './locale.ts'

const MAX_COMPOSITION_PREVIEW = 4_096
const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const PRESET_SETTINGS_ENTRY = 'agent-preset-registry'

/** The official Settings owner is the only writer of the registry's selectedDefault field. */
export type TuiPresetSettings = Pick<SettingsForms, 'describe' | 'mutate' | 'writable'>

/** One preset row projected for the Preset Manager panel. */
export interface TuiPresetManagerRow {
  readonly preset: AgentPreset
  readonly name: string
  readonly description: string | undefined
  readonly trust: 'system' | 'user' | 'declared'
  readonly current: boolean
  readonly isDefault: boolean
  readonly broken: string | undefined
  readonly canCopy: boolean
  readonly canDelete: boolean
  readonly canSetDefault: boolean
  /** Structured plugin rows from the preset owner; absent when the capability is unavailable. */
  readonly composition: TuiPresetCompositionInventory | undefined
}

/** Terminal-safe structured composition facts owned by AgentPresets. */
export interface TuiPresetCompositionInventory {
  readonly broken: string | undefined
  readonly rows: readonly AgentPresetCompositionRow[]
}

/** Snapshot of the complete roster projected for the Preset Manager panel. */
export interface TuiPresetManagerSnapshot {
  readonly rows: readonly TuiPresetManagerRow[]
  readonly currentPresetId: string | undefined
  readonly defaultPresetId: string
  readonly defaultRevision: number | undefined
  readonly authorable: boolean
  readonly compositionState: 'ready' | 'unavailable' | 'error'
}

/**
 * Project the Host roster into bounded, terminal-safe manager rows.
 * @param presets - Host preset service.
 * @param currentPresetId - effective preset id of the current Session.
 * @param locale - active TUI locale.
 * @param settings - optional official Profile settings owner.
 * @returns frozen snapshot.
 */
export async function collectTuiPresetManager(
  presets: TuiAgentPresets,
  currentPresetId: string | undefined,
  locale: TuiLocale,
  settings?: TuiPresetSettings,
): Promise<TuiPresetManagerSnapshot> {
  const roster = await presets.list()
  const defaultId = presets.defaultId
  const canAuthor = false
  let defaultRevision: number | undefined
  if (settings?.writable) {
    try {
      defaultRevision = settings.describe({ redactSecrets: true })
        .find(row => String(row.ns) === PRESET_SETTINGS_ENTRY)?.revision
    } catch {
      // A missing or inactive Settings entry keeps the default action unavailable.
    }
  }
  let compositionState: TuiPresetManagerSnapshot['compositionState'] =
    typeof presets.compositionInventory === 'function' ? 'ready' : 'unavailable'
  let compositionById = new Map<string, TuiPresetCompositionInventory>()
  if (presets.compositionInventory !== undefined) {
    try {
      const inventory = await presets.compositionInventory()
      compositionById = new Map(inventory.map(composition => [composition.id, Object.freeze({
        broken: composition.broken === undefined ? undefined : terminalSafe(composition.broken),
        rows: Object.freeze(composition.rows.map(row => Object.freeze({
          ...row,
          moduleName: terminalSafe(row.moduleName),
          entryId: row.entryId === null ? null : terminalSafe(row.entryId),
          ...row.condition === undefined ? {} : { condition: terminalSafe(row.condition) },
        }))),
      })]))
    } catch {
      compositionState = 'error'
    }
  }

  const rows: TuiPresetManagerRow[] = roster
    .sort((a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id))
    .map(preset => Object.freeze({
      preset,
      name: tuiAgentModeName(preset, locale),
      description: tuiAgentModeDescription(preset, locale),
      trust: 'declared' as const,
      current: preset.id === currentPresetId,
      isDefault: preset.id === defaultId,
      broken: preset.broken === undefined ? undefined : terminalSafe(preset.broken),
      canCopy: false,
      canDelete: false,
      canSetDefault: defaultRevision !== undefined
        && preset.id !== defaultId
        && preset.broken === undefined,
      composition: compositionById.get(preset.id),
    }))

  return Object.freeze({
    rows,
    currentPresetId,
    defaultPresetId: defaultId,
    defaultRevision,
    authorable: canAuthor,
    compositionState,
  })
}

/** Error class for preset id validation failures. */
export class TuiPresetIdError extends Error {
  /** Stable validation reason for localized presentation. */
  readonly code: 'empty' | 'invalid-pattern' | 'id-taken'
  constructor(code: TuiPresetIdError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Validate a proposed preset id.
 * @param id - raw user input.
 * @param existingIds - ids already in the roster.
 * @returns sanitized id.
 * @throws {TuiPresetIdError} on empty, pattern mismatch, or collision.
 */
export function validateTuiPresetId(id: string, existingIds: readonly string[]): string {
  const trimmed = id.trim()
  if (trimmed.length === 0) throw new TuiPresetIdError('empty', 'preset id is required')
  if (!PRESET_ID_PATTERN.test(trimmed)) {
    throw new TuiPresetIdError('invalid-pattern', 'preset id must match [a-z0-9][a-z0-9-]*')
  }
  if (existingIds.includes(trimmed)) {
    throw new TuiPresetIdError('id-taken', 'preset id is already in use')
  }
  return trimmed
}

/** Retired copy result retained for the exported compatibility signature. */
export interface TuiPresetCopyResult {
  readonly id: string
}

/**
 * Refuse a directory-style copy because the official registry only reads plugin declarations.
 * @param presets - Host preset service.
 * @param sourceId - id of the preset to copy.
 * @param newId - validated target id.
 * @param displayName - optional display name for the copy.
 * @returns A rejected promise because the official registry has no authoring operation.
 */
export function copyTuiPreset(
  presets: TuiAgentPresets,
  sourceId: string,
  newId: string,
  displayName?: string,
): Promise<TuiPresetCopyResult> {
  void presets
  void sourceId
  void newId
  void displayName
  return Promise.reject(new Error('preset copying is unavailable: the official preset registry has no authoring operation'))
}

/**
 * Refuse deletion because the official registry does not own declaration files.
 * @param presets - Host preset service.
 * @param id - the preset to delete.
 * @returns A rejected promise because the official registry has no deletion operation.
 */
export function deleteTuiPreset(
  presets: TuiAgentPresets,
  id: string,
): Promise<void> {
  void presets
  void id
  return Promise.reject(new Error('preset deletion is unavailable: the official preset registry has no authoring operation'))
}

/**
 * Select a future-session default through the official Profile Settings owner.
 * @param presets - Host preset service.
 * @param settings - official Profile settings owner.
 * @param id - existing preset id.
 * @param expectedRevision - settings revision carried by the roster snapshot.
 * @returns a promise settled after the owner commits the settings mutation.
 */
export async function setTuiDefaultPreset(
  presets: TuiAgentPresets,
  settings: TuiPresetSettings | undefined,
  id: string,
  expectedRevision: number | undefined,
): Promise<void> {
  if (expectedRevision === undefined || !settings?.writable) {
    throw new Error('preset default is read-only because settings are unavailable')
  }
  const row = (await presets.list()).find(preset => preset.id === id)
  if (row === undefined || row.broken !== undefined) {
    throw new Error('preset default cannot select an unknown or broken preset')
  }
  await settings.mutate(PRESET_SETTINGS_ENTRY, [{
    op: 'set', path: ['selectedDefault'], value: id,
  }], expectedRevision)
}

/** Bounded composition preview. */
export interface TuiPresetCompositionPreview {
  readonly text: string
  readonly truncated: boolean
}

/**
 * Read a preset's composition and return a bounded preview.
 * @param presets - Host preset service.
 * @param id - the preset id.
 * @returns bounded terminal-safe composition text.
 */
export async function readTuiPresetComposition(
  presets: TuiAgentPresets,
  id: string,
): Promise<TuiPresetCompositionPreview> {
  const { content: text } = await presets.readDocument(id)
  const safe = terminalSafe(text)
  if (safe.length <= MAX_COMPOSITION_PREVIEW) {
    return { text: safe, truncated: false }
  }
  return { text: safe.slice(0, MAX_COMPOSITION_PREVIEW), truncated: true }
}

/**
 * Stable user-facing preset mutation errors; drafts and confirmations stay process-local.
 * @param error - owner or validation failure.
 * @param operation - mutation whose draft remains available.
 * @param locale - selected first-party locale.
 * @returns localized stable remediation text.
 */
export function tuiPresetMutationErrorMessage(
  error: unknown,
  operation: 'copy' | 'delete' | 'setDefault',
  locale: TuiLocale = 'en',
): string {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : undefined
  const code = typeof record?.['code'] === 'string' ? record['code'] : undefined
  const message = typeof record?.['message'] === 'string' ? record['message'] : ''
  if (code === 'SETTINGS_CONFLICT') return tuiMessage(locale, 'presets.error.conflict')
  if (message.includes('already exists')) return tuiMessage(locale, 'presets.error.idTaken')
  if (message.includes('settings') && (message.includes('read-only') || message.includes('without'))) {
    return tuiMessage(locale, 'presets.error.readOnly')
  }
  return tuiMessage(locale, `presets.error.${operation}`)
}
