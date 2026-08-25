/** Terminal-native Agent Preset Manager: roster projection and mutation. */

import { terminalSafe } from './sanitize.ts'
import { tuiAgentModeDescription, tuiAgentModeName } from './mode.ts'
import type { AgentPreset, TuiAgentPresets } from './host.ts'
import { tuiMessage, type TuiLocale } from './locale.ts'

const MAX_COMPOSITION_PREVIEW = 4_096
const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** One preset row projected for the Preset Manager panel. */
export interface TuiPresetManagerRow {
  readonly preset: AgentPreset
  readonly name: string
  readonly description: string | undefined
  readonly trust: 'system' | 'user'
  readonly current: boolean
  readonly isDefault: boolean
  readonly broken: string | undefined
  readonly canCopy: boolean
  readonly canDelete: boolean
  readonly canSetDefault: boolean
}

/** Snapshot of the complete roster projected for the Preset Manager panel. */
export interface TuiPresetManagerSnapshot {
  readonly rows: readonly TuiPresetManagerRow[]
  readonly currentPresetId: string | undefined
  readonly defaultPresetId: string
  readonly defaultRevision: number | undefined
  readonly authorable: boolean
}

/**
 * Project the Host roster into bounded, terminal-safe manager rows.
 * @param presets - Host preset service.
 * @param currentPresetId - effective preset id of the current Session.
 * @param locale - active TUI locale.
 * @returns frozen snapshot.
 */
export async function collectTuiPresetManager(
  presets: TuiAgentPresets,
  currentPresetId: string | undefined,
  locale: TuiLocale,
): Promise<TuiPresetManagerSnapshot> {
  const roster = await presets.list()
  const defaultId = presets.defaultId
  const canAuthor = presets.authorable

  const rows: TuiPresetManagerRow[] = roster
    .sort((a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id))
    .map(preset => Object.freeze({
      preset,
      name: tuiAgentModeName(preset, locale),
      description: tuiAgentModeDescription(preset, locale),
      trust: preset.trust,
      current: preset.id === currentPresetId,
      isDefault: preset.id === defaultId,
      broken: preset.broken === undefined ? undefined : terminalSafe(preset.broken),
      canCopy: canAuthor && preset.broken === undefined,
      canDelete: preset.trust === 'user',
      canSetDefault: typeof presets.setDefault === 'function'
        && presets.defaultRevision !== undefined
        && preset.id !== defaultId
        && preset.broken === undefined,
    }))

  return Object.freeze({
    rows,
    currentPresetId,
    defaultPresetId: defaultId,
    defaultRevision: presets.defaultRevision,
    authorable: canAuthor,
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

/** Result of a copy mutation. */
export interface TuiPresetCopyResult {
  readonly id: string
}

/**
 * Copy a preset and return the new id.
 * @param presets - Host preset service.
 * @param sourceId - id of the preset to copy.
 * @param newId - validated target id.
 * @param displayName - optional display name for the copy.
 * @returns the created preset id.
 */
export async function copyTuiPreset(
  presets: TuiAgentPresets,
  sourceId: string,
  newId: string,
  displayName?: string,
): Promise<TuiPresetCopyResult> {
  await presets.copy(sourceId, newId, displayName)
  return { id: newId }
}

/**
 * Delete a user-owned preset.
 * @param presets - Host preset service.
 * @param id - the preset to delete.
 * @throws on system presets or unknown ids.
 */
export async function deleteTuiPreset(
  presets: TuiAgentPresets,
  id: string,
): Promise<void> {
  await presets.remove(id)
}

/**
 * Select a future-session default through the preset owner at the observed revision.
 * @param presets - Host preset service.
 * @param id - existing preset id.
 * @param expectedRevision - settings revision carried by the roster snapshot.
 * @returns a promise settled after the owner commits the settings mutation.
 */
export async function setTuiDefaultPreset(
  presets: TuiAgentPresets,
  id: string,
  expectedRevision: number | undefined,
): Promise<void> {
  if (expectedRevision === undefined || typeof presets.setDefault !== 'function') {
    throw new Error('preset default is read-only because settings are unavailable')
  }
  await presets.setDefault(id, expectedRevision)
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
  const text = await presets.read(id)
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
