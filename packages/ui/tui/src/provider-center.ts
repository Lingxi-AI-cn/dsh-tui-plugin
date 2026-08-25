/** Bounded, non-secret provider configuration facts for the native TUI. */

import {
  credentialRef, normalizeApiKey, settingsNamespace, z as Schema,
  type CredentialRef,
  type LlmConfigurableProvider,
  type LlmDiscoveredModel,
  type LlmModelDiscoveryRequest,
  type SettingsDescriptor,
  type SettingsPathOp,
} from './host.ts'
import { terminalSafe } from './sanitize.ts'

const MAX_PROVIDERS = 128
const MAX_DISCOVERED_MODELS = 200
const MAX_TEXT_GRAPHEMES = 512
const TEXT_GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Non-secret authentication posture reported by a provider owner. */
export type TuiProviderAuthenticationState =
  | 'configured'
  | 'sign-in-required'
  | 'credential-required'
  | 'dormant'
  | 'unavailable'

/** One provider-owned interactive authentication method. */
export interface TuiProviderAuthenticationMethod {
  readonly id: string
  readonly name: string
}

/** Value-free credential facts returned by the credential owner. */
export interface TuiProviderCredentialSnapshot {
  readonly ref: string
  readonly configured: boolean
  readonly writable: boolean
  readonly source?: string
}

/** Redacted settings facts for one configurable provider route. */
export interface TuiProviderSettingsSnapshot {
  readonly namespace: string
  readonly path: readonly string[]
  readonly registered: boolean
  readonly writable: boolean
  readonly applies?: 'live' | 'restart'
  readonly revision?: number
  readonly userOverride: boolean
  readonly endpoint?: string
  readonly configuredModelCount?: number
  readonly credentialReferenceStored: boolean
  readonly credential?: TuiProviderCredentialSnapshot
  /** Owner-reviewed non-secret fields that this terminal surface can edit without rebuilding the profile. */
  readonly editable?: TuiProviderEditableProfileSnapshot
}

/** Curated effective profile values and field capabilities for one existing route. */
export interface TuiProviderEditableProfileSnapshot {
  readonly displayNameSupported: boolean
  readonly protocolSupported: boolean
  readonly modelsSupported: boolean
  readonly protocols: readonly string[]
  readonly displayName?: string
  readonly protocol?: string
  readonly models?: readonly TuiCustomProviderModelDraft[]
}

/** One complete provider row shown by the Provider Center. */
export interface TuiProviderCenterRow {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly declared: boolean
  readonly authentication: TuiProviderAuthenticationState
  readonly authenticationSource?: string
  readonly authenticationMethods: readonly TuiProviderAuthenticationMethod[]
  /** True only when the adapter explicitly reports that provider-owned persisted authentication can be removed. */
  readonly canLogout: boolean
  readonly modelCount?: number
  readonly settings?: TuiProviderSettingsSnapshot
  readonly issues: readonly (
    | 'authentication-unavailable'
    | 'models-unavailable'
    | 'settings-unavailable'
    | 'credential-unavailable'
  )[]
}

/** Capabilities and provider rows collected for one Provider Center refresh. */
export interface TuiProviderCenterSnapshot {
  readonly providers: readonly TuiProviderCenterRow[]
  /** Settings-owned profile collections capable of receiving a custom route. */
  readonly creationTargets: readonly TuiProviderCreationTarget[]
  readonly omittedProviders: number
  readonly capabilities: {
    readonly settings: boolean
    readonly settingsWritable: boolean
    readonly credentials: boolean
  }
}

/** One schema-derived settings collection that can own a custom provider profile. */
export interface TuiProviderCreationTarget {
  readonly namespace: string
  readonly path: readonly string[]
  readonly revision: number
  readonly writable: boolean
  readonly protocols: readonly string[]
  readonly existingProviderIds: readonly string[]
}

/** One staged model row for a custom provider profile. */
export interface TuiCustomProviderModelDraft {
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
}

/** Process-local custom-provider draft; `apiKey` must never enter a snapshot or Session event. */
export interface TuiCustomProviderDraft {
  readonly id: string
  readonly displayName: string
  readonly baseURL: string
  readonly protocol: string
  readonly apiKey?: string
  readonly models: readonly TuiCustomProviderModelDraft[]
}

/** Stable custom-provider failure categories without draft values or owner error messages. */
export type TuiCustomProviderErrorCode =
  | 'invalid-id'
  | 'id-taken'
  | 'invalid-display-name'
  | 'invalid-endpoint'
  | 'invalid-protocol'
  | 'models-required'
  | 'invalid-model'
  | 'duplicate-model'
  | 'invalid-key'
  | 'settings-unavailable'
  | 'settings-read-only'
  | 'settings-conflict'
  | 'settings-write-failed'
  | 'credentials-unavailable'
  | 'credential-write-failed'
  | 'discovery-unavailable'
  | 'discovery-failed'

/** Custom-provider rejection safe for ordinary TUI notices and diagnostics. */
export class TuiCustomProviderError extends Error {
  /** @param code - stable non-secret failure category. */
  constructor(readonly code: TuiCustomProviderErrorCode) {
    super(`Custom provider operation failed (${code}).`)
    this.name = 'TuiCustomProviderError'
  }
}

/** Host owners borrowed for one custom-provider create. */
export interface TuiCustomProviderWriters extends TuiProviderApiKeyWriters {}

/** Host model-discovery owner borrowed for one staged endpoint interrogation. */
export interface TuiProviderModelDiscovery {
  discoverModels(
    settingsNs: string,
    request: LlmModelDiscoveryRequest,
  ): Promise<readonly LlmDiscoveredModel[]>
}

/** Process-local Provider Center loading state; prior data remains visible while a refresh settles. */
export interface TuiProviderCenterDialogSnapshot {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly snapshot?: TuiProviderCenterSnapshot
  /** Present only when first-run configuration opened the Provider Center automatically. */
  readonly onboarding?: {
    /** Whether acknowledgement can be persisted by the Host settings owner. */
    readonly durable: boolean
  }
}

/** Whether current redacted facts prove first-run Provider configuration is needed. */
export type TuiProviderOnboardingReadiness = 'needed' | 'skip' | 'unknown'

/**
 * Decide whether first-run Provider configuration should interrupt the startup surface.
 * An interactive provider-owned auth route is actionable through `/models`, so it does not trigger this API-key flow.
 * @param snapshot - joined redacted Provider Center facts.
 * @returns `needed` only when every known route is unreachable and facts are complete enough to prove it.
 */
export function tuiProviderOnboardingReadiness(
  snapshot: TuiProviderCenterSnapshot,
): TuiProviderOnboardingReadiness {
  for (const row of snapshot.providers) {
    if (!row.active) continue
    if (row.authentication === 'configured' || row.authentication === 'sign-in-required') return 'skip'
    if (row.authentication === 'unavailable') continue
    if (row.settings === undefined) return 'unknown'
    if (row.authentication === 'credential-required') return 'needed'
  }
  if (snapshot.providers.some(row => row.active && row.authentication === 'unavailable')) return 'unknown'
  return 'needed'
}

/** Minimum LLM reads needed by the Provider Center. */
export interface TuiProviderCenterLlmInspector {
  listProviders(): readonly { readonly id: string; readonly name: string }[]
  listConfigurableProviders(): readonly LlmConfigurableProvider[]
  authentication(provider: string): Promise<{
    readonly configured: boolean
    readonly source?: string
    readonly methods: readonly TuiProviderAuthenticationMethod[]
    readonly canLogout?: boolean
  }>
  listModels(provider: string): Promise<readonly unknown[]>
}

/** Redacted settings reads needed by the Provider Center. */
export interface TuiProviderCenterSettingsInspector {
  readonly writable: boolean
  describe(options: { readonly redactSecrets: true }): readonly SettingsDescriptor[]
}

/** Value-free credential read needed by the Provider Center. */
export interface TuiProviderCenterCredentialInspector {
  describe(ref: CredentialRef): Promise<{
    readonly configured: boolean
    readonly source?: string
    readonly writable: boolean
  }>
}

/** Inputs borrowed for one bounded Provider Center refresh. */
export interface TuiProviderCenterCollectOptions {
  readonly llm: TuiProviderCenterLlmInspector
  readonly settings?: TuiProviderCenterSettingsInspector
  readonly credentials?: TuiProviderCenterCredentialInspector
  readonly credentialRef: (value: string) => CredentialRef
  readonly signal?: AbortSignal
}

/** Stable API-key write failure categories that never retain the supplied value. */
export type TuiProviderApiKeyErrorCode =
  | 'invalid-key'
  | 'settings-unavailable'
  | 'settings-read-only'
  | 'settings-conflict'
  | 'settings-write-failed'
  | 'credentials-unavailable'
  | 'credential-read-only'
  | 'credential-write-failed'

/** API-key write rejection safe for ordinary TUI notice and diagnostics. */
export class TuiProviderApiKeyError extends Error {
  /** @param code - stable non-secret failure category. */
  constructor(readonly code: TuiProviderApiKeyErrorCode) {
    super(`Provider API key update failed (${code}).`)
    this.name = 'TuiProviderApiKeyError'
  }
}

/** Host owner writes borrowed for one Provider Center API-key update. */
export interface TuiProviderApiKeyWriters {
  readonly settings?: {
    mutate(ns: ReturnType<typeof settingsNamespace>, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>
  }
  readonly credentials?: {
    set(ref: CredentialRef, value: string): Promise<void>
    unset?(ref: CredentialRef): Promise<void>
  }
}

/** Existing-provider profile fields staged process-locally by the TUI. */
export interface TuiProviderProfileDraft {
  readonly displayName?: string
  readonly protocol?: string
  readonly models?: readonly TuiCustomProviderModelDraft[]
}

/** Stable existing-profile mutation failures without owner text or staged values. */
export type TuiProviderProfileErrorCode =
  | 'profile-unavailable'
  | 'settings-unavailable'
  | 'settings-read-only'
  | 'settings-conflict'
  | 'invalid-display-name'
  | 'invalid-protocol'
  | 'models-required'
  | 'invalid-model'
  | 'settings-write-failed'

/** Existing-profile rejection safe for notices, diagnostics, and Session-adjacent logs. */
export class TuiProviderProfileError extends Error {
  /** @param code - stable non-secret failure category. */
  constructor(readonly code: TuiProviderProfileErrorCode) {
    super(`Provider profile update failed (${code}).`)
    this.name = 'TuiProviderProfileError'
  }
}

/** Stable provider removal failures without owner text or credential values. */
export type TuiProviderRemoveErrorCode =
  | 'not-removable'
  | 'settings-unavailable'
  | 'settings-conflict'
  | 'credential-unavailable'
  | 'credential-remove-failed'
  | 'settings-write-failed'

/** Provider removal rejection safe for ordinary TUI rendering. */
export class TuiProviderRemoveError extends Error {
  /** @param code - stable non-secret failure category. */
  constructor(readonly code: TuiProviderRemoveErrorCode) {
    super(`Provider removal failed (${code}).`)
    this.name = 'TuiProviderRemoveError'
  }
}

/** Stable endpoint write failures that never retain the supplied URL. */
export type TuiProviderEndpointErrorCode =
  | 'invalid-endpoint'
  | 'settings-unavailable'
  | 'settings-read-only'
  | 'settings-conflict'
  | 'settings-write-failed'

/** Endpoint write rejection safe for ordinary TUI notice and diagnostics. */
export class TuiProviderEndpointError extends Error {
  /** @param code - stable non-secret failure category. */
  constructor(readonly code: TuiProviderEndpointErrorCode) {
    super(`Provider endpoint update failed (${code}).`)
    this.name = 'TuiProviderEndpointError'
  }
}

const ENV_LINE = /^[A-Z][A-Z0-9_]*=[^=]/u
const CUSTOM_PROVIDER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
const PRINTABLE_MODEL_ID = /^[\x21-\x7E]+$/u

/**
 * Derive the conventional credential reference for one configurable route.
 * @param provider - provider route id.
 * @returns uppercase POSIX-compatible `<ROUTE>_API_KEY` reference.
 */
export function deriveTuiProviderCredentialRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}_API_KEY`
}

function quoted(value: string): boolean {
  const first = value[0]
  return (first === '"' || first === '\'' || first === '`') && value.length > 1 && value.endsWith(first)
}

/**
 * Validate one user-supplied key without returning it in a rejection.
 * @param raw - process-local masked draft.
 * @returns trimmed header-safe key.
 */
export function validateTuiProviderApiKey(raw: string): string {
  const normalized = normalizeApiKey(raw)
  if (!normalized.ok || ENV_LINE.test(normalized.value) || quoted(normalized.value)) {
    throw new TuiProviderApiKeyError('invalid-key')
  }
  return normalized.value
}

/**
 * Store one Provider Center API key through settings and credential owners.
 * @param row - latest redacted provider snapshot.
 * @param raw - process-local masked draft.
 * @param writers - optional Host settings and credential owners.
 * @returns credential reference updated by the operation.
 */
export async function saveTuiProviderApiKey(
  row: TuiProviderCenterRow,
  raw: string,
  writers: TuiProviderApiKeyWriters,
): Promise<{ readonly ref: string }> {
  const value = validateTuiProviderApiKey(raw)
  const settings = row.settings
  if (settings === undefined || !settings.registered) throw new TuiProviderApiKeyError('settings-unavailable')
  const credential = settings.credential
  if (credential === undefined || writers.credentials === undefined) {
    throw new TuiProviderApiKeyError('credentials-unavailable')
  }
  if (!credential.writable) throw new TuiProviderApiKeyError('credential-read-only')
  if (!settings.credentialReferenceStored) {
    if (!settings.writable || writers.settings === undefined || settings.revision === undefined) {
      throw new TuiProviderApiKeyError('settings-read-only')
    }
    try {
      await writers.settings.mutate(settingsNamespace(settings.namespace), [{
        op: 'set', path: [...settings.path, 'apiKeyEnv'], value: credential.ref,
      }], settings.revision)
    } catch (error: unknown) {
      if ((error as { readonly code?: unknown } | null)?.code === 'SETTINGS_CONFLICT') {
        throw new TuiProviderApiKeyError('settings-conflict')
      }
      throw new TuiProviderApiKeyError('settings-write-failed')
    }
  }
  try {
    await writers.credentials.set(credentialRef(credential.ref), value)
  } catch {
    throw new TuiProviderApiKeyError('credential-write-failed')
  }
  return Object.freeze({ ref: credential.ref })
}

/**
 * Validate one staged provider endpoint as an absolute HTTP(S) base URL.
 * @param raw - process-local endpoint draft.
 * @returns trimmed endpoint text preserved for the settings owner.
 */
export function validateTuiProviderEndpoint(raw: string): string {
  const value = raw.trim()
  if (value.length === 0) throw new TuiProviderEndpointError('invalid-endpoint')
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TuiProviderEndpointError('invalid-endpoint')
    }
  } catch (error: unknown) {
    if (error instanceof TuiProviderEndpointError) throw error
    throw new TuiProviderEndpointError('invalid-endpoint')
  }
  return value
}

/**
 * Set or reset one provider's base URL through the revision-aware settings owner.
 * @param row - latest redacted provider snapshot.
 * @param raw - staged endpoint, or `undefined` to unset the user override.
 * @param writer - optional Host settings owner.
 */
export async function saveTuiProviderEndpoint(
  row: TuiProviderCenterRow,
  raw: string | undefined,
  writer: TuiProviderApiKeyWriters['settings'],
): Promise<void> {
  const settings = row.settings
  if (settings === undefined || !settings.registered || settings.revision === undefined) {
    throw new TuiProviderEndpointError('settings-unavailable')
  }
  if (!settings.writable || writer === undefined) throw new TuiProviderEndpointError('settings-read-only')
  const op: SettingsPathOp = raw === undefined
    ? { op: 'unset', path: [...settings.path, 'baseURL'] }
    : { op: 'set', path: [...settings.path, 'baseURL'], value: validateTuiProviderEndpoint(raw) }
  try {
    await writer.mutate(settingsNamespace(settings.namespace), [op], settings.revision)
  } catch (error: unknown) {
    if ((error as { readonly code?: unknown } | null)?.code === 'SETTINGS_CONFLICT') {
      throw new TuiProviderEndpointError('settings-conflict')
    }
    throw new TuiProviderEndpointError('settings-write-failed')
  }
}

/** Settings owner methods needed for a revision-fenced existing-profile edit. */
export interface TuiProviderProfileWriter {
  describe(options: { readonly redactSecrets: true }): readonly SettingsDescriptor[]
  mutate(ns: ReturnType<typeof settingsNamespace>, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>
}

/**
 * Render the terminal profile editor's lossless curated model-table syntax.
 * @param models - validated staged model rows.
 * @returns semicolon-separated terminal editor value.
 */
export function formatTuiProviderModelDrafts(models: readonly TuiCustomProviderModelDraft[]): string {
  return models.map(model => [
    model.id,
    model.name ?? '',
    model.contextWindow?.toString() ?? '',
    model.maxTokens?.toString() ?? '',
  ].join('|')).join('; ')
}

/**
 * Parse `id|name|context|max; …` without retaining invalid input in an error object.
 * @param value - process-local editor value.
 * @returns validated detached model drafts.
 */
export function parseTuiProviderModelDrafts(value: string): readonly TuiCustomProviderModelDraft[] {
  const rows = value.split(/[;\n]+/u).flatMap((raw) => {
    const line = raw.trim()
    if (line === '') return []
    const parts = line.split('|')
    if (parts.length > 4) throw new TuiProviderProfileError('invalid-model')
    const [id = '', name = '', context = '', max = ''] = parts.map(part => part.trim())
    const capacity = (rawCapacity: string): number | undefined => {
      if (rawCapacity === '') return undefined
      if (!/^\d+$/u.test(rawCapacity)) throw new TuiProviderProfileError('invalid-model')
      const parsed = Number(rawCapacity)
      if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TuiProviderProfileError('invalid-model')
      return parsed
    }
    const contextWindow = capacity(context)
    const maxTokens = capacity(max)
    return [{
      id,
      ...(name === '' ? {} : { name }),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    }]
  })
  try {
    return customProviderModels(rows)
  } catch {
    throw new TuiProviderProfileError('invalid-model')
  }
}

function currentProviderDescriptor(
  row: TuiProviderCenterRow,
  writer: TuiProviderProfileWriter,
): SettingsDescriptor {
  const settings = row.settings
  if (settings === undefined || !settings.registered || settings.revision === undefined) {
    throw new TuiProviderProfileError('settings-unavailable')
  }
  let descriptor: SettingsDescriptor | undefined
  try {
    descriptor = writer.describe({ redactSecrets: true })
      .find(candidate => String(candidate.ns) === settings.namespace)
  } catch {
    throw new TuiProviderProfileError('settings-unavailable')
  }
  if (descriptor === undefined) throw new TuiProviderProfileError('settings-unavailable')
  if (descriptor.revision !== settings.revision) throw new TuiProviderProfileError('settings-conflict')
  return descriptor
}

function mergeProviderModels(
  descriptor: SettingsDescriptor,
  path: readonly string[],
  models: readonly TuiCustomProviderModelDraft[],
): readonly Readonly<Record<string, unknown>>[] {
  let validated: readonly TuiCustomProviderModelDraft[]
  try {
    validated = customProviderModels(models)
  } catch {
    throw new TuiProviderProfileError('invalid-model')
  }
  const effective = valueAt(descriptor.value, [...path, 'models'])
  const originals = Array.isArray(effective) ? effective : []
  const byId = new Map<string, Readonly<Record<string, unknown>>>()
  for (const candidate of originals) {
    if (isRecord(candidate) && typeof candidate['id'] === 'string') byId.set(candidate['id'], candidate)
  }
  return Object.freeze(validated.map((model) => {
    const merged: Record<string, unknown> = { ...(byId.get(model.id) ?? {}), id: model.id }
    if (model.name === undefined) delete merged['name']
    else merged['name'] = model.name
    if (model.contextWindow === undefined) delete merged['contextWindow']
    else merged['contextWindow'] = model.contextWindow
    if (model.maxTokens === undefined) delete merged['maxTokens']
    else merged['maxTokens'] = model.maxTokens
    return Object.freeze(merged)
  }))
}

/**
 * Commit the reviewed display-name, protocol, and model-table intersection for one existing route.
 * Unknown per-model fields are preserved from a fresh redacted owner descriptor rather than rebuilt by the TUI.
 * @param row - provider row and observed settings revision.
 * @param draft - reviewed process-local profile fields.
 * @param writer - settings owner, when writable.
 * @returns resolution after the owner commits the revision-fenced mutation.
 */
export async function saveTuiProviderProfile(
  row: TuiProviderCenterRow,
  draft: TuiProviderProfileDraft,
  writer: TuiProviderProfileWriter | undefined,
): Promise<void> {
  const settings = row.settings
  const editable = settings?.editable
  if (settings === undefined || editable === undefined) throw new TuiProviderProfileError('profile-unavailable')
  if (!settings.writable || writer === undefined) throw new TuiProviderProfileError('settings-read-only')
  const descriptor = currentProviderDescriptor(row, writer)
  const ops: SettingsPathOp[] = []
  if (editable.displayNameSupported) {
    const value = draft.displayName?.trim() ?? ''
    if (value !== '' && (value.length > 128 || singleLine(value) !== value)) {
      throw new TuiProviderProfileError('invalid-display-name')
    }
    ops.push(value === ''
      ? { op: 'unset', path: [...settings.path, 'displayName'] }
      : { op: 'set', path: [...settings.path, 'displayName'], value })
  }
  if (editable.protocolSupported) {
    const value = draft.protocol?.trim() ?? ''
    if (value === '' && row.declared) throw new TuiProviderProfileError('invalid-protocol')
    if (value !== '' && !editable.protocols.includes(value)) {
      throw new TuiProviderProfileError('invalid-protocol')
    }
    ops.push(value === ''
      ? { op: 'unset', path: [...settings.path, 'api'] }
      : { op: 'set', path: [...settings.path, 'api'], value })
  }
  if (editable.modelsSupported && draft.models !== undefined) {
    if (draft.models.length === 0) {
      if (row.declared) throw new TuiProviderProfileError('models-required')
      ops.push({ op: 'unset', path: [...settings.path, 'models'] })
    } else {
      ops.push({
        op: 'set', path: [...settings.path, 'models'],
        value: mergeProviderModels(descriptor, settings.path, draft.models),
      })
    }
  }
  if (ops.length === 0) throw new TuiProviderProfileError('profile-unavailable')
  try {
    await writer.mutate(settingsNamespace(settings.namespace), ops, settings.revision)
  } catch (error: unknown) {
    if ((error as { readonly code?: unknown } | null)?.code === 'SETTINGS_CONFLICT') {
      throw new TuiProviderProfileError('settings-conflict')
    }
    throw new TuiProviderProfileError('settings-write-failed')
  }
}

/**
 * True only for a user-layer route that its adapter identifies as hand-declared.
 * @param row - joined provider and settings facts.
 * @returns whether the TUI may offer profile removal.
 */
export function canRemoveTuiProvider(row: TuiProviderCenterRow): boolean {
  return row.declared && row.settings?.registered === true && row.settings.writable
    && row.settings.userOverride && row.settings.revision !== undefined
}

function requiredCredentialRemover(
  remover: ((ref: CredentialRef) => Promise<void>) | undefined,
): (ref: CredentialRef) => Promise<void> {
  if (remover === undefined) throw new TuiProviderRemoveError('credential-unavailable')
  return remover
}

/**
 * Remove one hand-declared provider and only the conventional writable credential the surface can prove it owns.
 * The revision-fenced profile commit precedes credential cleanup: a settings
 * conflict must never destroy a key still referenced by the live route.
 * @param row - removable provider row and observed revision.
 * @param writers - settings and credential owners.
 * @returns resolution after profile removal and any provably owned credential cleanup.
 */
export async function removeTuiProviderProfile(
  row: TuiProviderCenterRow,
  writers: TuiProviderApiKeyWriters,
): Promise<void> {
  if (!canRemoveTuiProvider(row) || writers.settings === undefined) {
    throw new TuiProviderRemoveError('not-removable')
  }
  const settings = row.settings
  if (settings === undefined || settings.revision === undefined) {
    throw new TuiProviderRemoveError('settings-unavailable')
  }
  const credential = settings.credential
  const ownedRef = deriveTuiProviderCredentialRef(row.id)
  const removeOwnedCredential = credential?.configured === true && credential.writable
    && credential.ref === ownedRef
  const unsetOwnedCredential = writers.credentials?.unset?.bind(writers.credentials)
  const ownedCredentialRemoval = removeOwnedCredential
    ? { ref: credentialRef(credential.ref), remove: requiredCredentialRemover(unsetOwnedCredential) }
    : undefined
  try {
    await writers.settings.mutate(settingsNamespace(settings.namespace), [{
      op: 'unset', path: [...settings.path],
    }], settings.revision)
  } catch (error: unknown) {
    if ((error as { readonly code?: unknown } | null)?.code === 'SETTINGS_CONFLICT') {
      throw new TuiProviderRemoveError('settings-conflict')
    }
    throw new TuiProviderRemoveError('settings-write-failed')
  }
  if (ownedCredentialRemoval !== undefined) {
    try {
      await ownedCredentialRemoval.remove(ownedCredentialRemoval.ref)
    } catch {
      throw new TuiProviderRemoveError('credential-remove-failed')
    }
  }
}

function customProviderApiKey(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined
  try {
    return validateTuiProviderApiKey(raw)
  } catch {
    throw new TuiCustomProviderError('invalid-key')
  }
}

function customProviderEndpoint(raw: string): string {
  try {
    return validateTuiProviderEndpoint(raw)
  } catch {
    throw new TuiCustomProviderError('invalid-endpoint')
  }
}

function customProviderIdentity(target: TuiProviderCreationTarget, draft: TuiCustomProviderDraft): {
  readonly id: string
  readonly displayName: string
  readonly baseURL: string
  readonly protocol: string
  readonly apiKey?: string
} {
  const id = draft.id.trim()
  if (!CUSTOM_PROVIDER_ID.test(id)) throw new TuiCustomProviderError('invalid-id')
  if (target.existingProviderIds.includes(id)) throw new TuiCustomProviderError('id-taken')
  const displayName = draft.displayName.trim()
  if (displayName.length === 0 || displayName.length > 128 || singleLine(displayName) !== displayName) {
    throw new TuiCustomProviderError('invalid-display-name')
  }
  const baseURL = customProviderEndpoint(draft.baseURL)
  if (!target.protocols.includes(draft.protocol)) throw new TuiCustomProviderError('invalid-protocol')
  const apiKey = customProviderApiKey(draft.apiKey)
  return {
    id, displayName, baseURL, protocol: draft.protocol,
    ...(apiKey === undefined ? {} : { apiKey }),
  }
}

function customProviderModels(models: readonly TuiCustomProviderModelDraft[]): readonly TuiCustomProviderModelDraft[] {
  if (models.length === 0) throw new TuiCustomProviderError('models-required')
  if (models.length > MAX_DISCOVERED_MODELS) throw new TuiCustomProviderError('invalid-model')
  const seen = new Set<string>()
  return Object.freeze(models.map((model) => {
    const id = model.id.trim()
    const name = model.name?.trim()
    const validCapacity = (value: number | undefined): boolean => value === undefined
      || (Number.isSafeInteger(value) && value > 0)
    if (
      id.length === 0 || id.length > 256 || !PRINTABLE_MODEL_ID.test(id)
      || (name !== undefined && (name.length === 0 || name.length > 256 || singleLine(name) !== name))
      || !validCapacity(model.contextWindow) || !validCapacity(model.maxTokens)
    ) throw new TuiCustomProviderError('invalid-model')
    if (seen.has(id)) throw new TuiCustomProviderError('duplicate-model')
    seen.add(id)
    return Object.freeze({
      id,
      ...(name === undefined ? {} : { name }),
      ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
      ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
    })
  }))
}

/**
 * Create one custom provider through its schema-derived settings owner.
 * The settings profile lands before an optional credential; a credential failure is safe to retry from the created row.
 * @param target - current settings collection and revision.
 * @param draft - process-local validated profile and optional secret.
 * @param writers - Host settings and credential owners.
 * @returns created route id and whether its optional credential was stored.
 */
export async function createTuiCustomProvider(
  target: TuiProviderCreationTarget,
  draft: TuiCustomProviderDraft,
  writers: TuiCustomProviderWriters,
): Promise<{ readonly id: string; readonly credentialStored: boolean }> {
  if (writers.settings === undefined) throw new TuiCustomProviderError('settings-unavailable')
  if (!target.writable) throw new TuiCustomProviderError('settings-read-only')
  const identity = customProviderIdentity(target, draft)
  const models = customProviderModels(draft.models)
  const ref = deriveTuiProviderCredentialRef(identity.id)
  const profile = {
    displayName: identity.displayName,
    ...(identity.apiKey === undefined ? {} : { apiKeyEnv: ref }),
    api: identity.protocol,
    baseURL: identity.baseURL,
    models,
  }
  try {
    await writers.settings.mutate(settingsNamespace(target.namespace), [{
      op: 'set', path: [...target.path, identity.id], value: profile,
    }], target.revision)
  } catch (error: unknown) {
    if ((error as { readonly code?: unknown } | null)?.code === 'SETTINGS_CONFLICT') {
      throw new TuiCustomProviderError('settings-conflict')
    }
    throw new TuiCustomProviderError('settings-write-failed')
  }
  if (identity.apiKey === undefined) return Object.freeze({ id: identity.id, credentialStored: false })
  if (writers.credentials === undefined) throw new TuiCustomProviderError('credentials-unavailable')
  try {
    await writers.credentials.set(credentialRef(ref), identity.apiKey)
  } catch {
    throw new TuiCustomProviderError('credential-write-failed')
  }
  return Object.freeze({ id: identity.id, credentialStored: true })
}

/**
 * Interrogate one staged custom endpoint without persisting its settings or credential.
 * @param target - settings namespace whose adapter owns discovery.
 * @param draft - current process-local custom-provider draft.
 * @param discovery - Host LLM discovery owner.
 * @param signal - caller cancellation.
 * @returns bounded, validated model candidates for an explicit picker.
 */
export async function discoverTuiCustomProviderModels(
  target: TuiProviderCreationTarget,
  draft: TuiCustomProviderDraft,
  discovery: TuiProviderModelDiscovery | undefined,
  signal?: AbortSignal,
): Promise<readonly TuiCustomProviderModelDraft[]> {
  signal?.throwIfAborted()
  if (discovery === undefined) throw new TuiCustomProviderError('discovery-unavailable')
  const identity = customProviderIdentity(target, draft)
  let models: readonly LlmDiscoveredModel[]
  try {
    models = await discovery.discoverModels(target.namespace, {
      baseURL: identity.baseURL,
      api: identity.protocol,
      ...(identity.apiKey === undefined ? {} : { apiKey: identity.apiKey }),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (_error: unknown) {
    signal?.throwIfAborted()
    throw new TuiCustomProviderError('discovery-failed')
  }
  signal?.throwIfAborted()
  const candidates = models.slice(0, MAX_DISCOVERED_MODELS).flatMap((model) => {
    try {
      return customProviderModels([model])
    } catch {
      return []
    }
  })
  const seen = new Set<string>()
  return Object.freeze(candidates.filter((model) => {
    if (seen.has(model.id)) return false
    seen.add(model.id)
    return true
  }))
}

function singleLine(value: string): string {
  const safe = terminalSafe(value).replace(/\s+/gu, ' ').trim()
  const graphemes = Array.from(TEXT_GRAPHEMES.segment(safe), entry => entry.segment)
  return graphemes.length <= MAX_TEXT_GRAPHEMES
    ? safe
    : `${graphemes.slice(0, MAX_TEXT_GRAPHEMES - 1).join('')}…`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueAt(root: unknown, path: readonly string[]): unknown {
  let current = root
  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) return undefined
    current = current[segment]
  }
  return current
}

function schemaNodeAtPath(serialized: unknown, path: readonly string[]): Schema | undefined {
  let node: Schema | undefined
  try {
    node = new Schema(serialized as Schema)
  } catch {
    return undefined
  }
  for (const segment of path) {
    if (node.type === 'object') node = node.dict?.[segment]
    else if (node.type === 'dict' || node.type === 'array') node = node.inner
    else return undefined
    if (node === undefined) return undefined
  }
  return node
}

function protocolChoices(descriptor: SettingsDescriptor, profilePath: readonly string[]): readonly string[] {
  const node = schemaNodeAtPath(descriptor.schema, [...profilePath, 'api'])
  if (node?.type !== 'union') return Object.freeze([])
  const protocols = (node.list ?? []).flatMap(candidate => (
    candidate.type === 'const' && typeof candidate.value === 'string'
      && candidate.value.length > 0 && singleLine(candidate.value) === candidate.value
      ? [candidate.value]
      : []
  ))
  return Object.freeze([...new Set(protocols)])
}

function providerCreationTargets(
  directory: readonly LlmConfigurableProvider[],
  descriptors: ReadonlyMap<string, SettingsDescriptor>,
  writable: boolean,
): readonly TuiProviderCreationTarget[] {
  const result: TuiProviderCreationTarget[] = []
  const seen = new Set<string>()
  for (const entry of directory) {
    if (entry.settingsPath.length === 0) continue
    const path = entry.settingsPath.slice(0, -1)
    const descriptor = descriptors.get(entry.settingsNs)
    if (descriptor === undefined) continue
    const key = `${entry.settingsNs}\u0000${path.join('\u0000')}`
    if (seen.has(key)) continue
    const profile = schemaNodeAtPath(descriptor.schema, [...path, '\u0000probe'])
    if (
      profile?.type !== 'object'
      || profile.dict?.['baseURL'] === undefined
      || profile.dict['api'] === undefined
      || profile.dict['models'] === undefined
    ) continue
    const protocols = protocolChoices(descriptor, [...path, '\u0000probe'])
    if (protocols.length === 0) continue
    const existingProviderIds = directory.flatMap(candidate => (
      candidate.settingsNs === entry.settingsNs
        && candidate.settingsPath.length === path.length + 1
        && candidate.settingsPath.slice(0, -1).every((segment, index) => segment === path[index])
        ? [candidate.provider]
        : []
    ))
    result.push(Object.freeze({
      namespace: entry.settingsNs,
      path: Object.freeze([...path]),
      revision: descriptor.revision,
      writable,
      protocols,
      existingProviderIds: Object.freeze([...new Set(existingProviderIds)]),
    }))
    seen.add(key)
  }
  return Object.freeze(result)
}

function hasValueAt(root: unknown, path: readonly string[]): boolean {
  if (root === undefined) return false
  if (path.length === 0) return true
  return valueAt(root, path) !== undefined
}

function safeEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return singleLine(url.toString().replace(/\/$/u, ''))
  } catch {
    return undefined
  }
}

function projectedProviderModels(value: unknown): readonly TuiCustomProviderModelDraft[] | undefined {
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value) || value.length > MAX_DISCOVERED_MODELS) return undefined
  const rows: TuiCustomProviderModelDraft[] = []
  try {
    for (const candidate of value) {
      if (!isRecord(candidate) || typeof candidate['id'] !== 'string') return undefined
      const row: TuiCustomProviderModelDraft = {
        id: candidate['id'],
        ...(typeof candidate['name'] === 'string' ? { name: candidate['name'] } : {}),
        ...(typeof candidate['contextWindow'] === 'number' ? { contextWindow: candidate['contextWindow'] } : {}),
        ...(typeof candidate['maxTokens'] === 'number' ? { maxTokens: candidate['maxTokens'] } : {}),
      }
      rows.push(row)
    }
    return customProviderModels(rows)
  } catch {
    return undefined
  }
}

function editableProviderProfile(
  entry: LlmConfigurableProvider,
  descriptor: SettingsDescriptor | undefined,
  profile: unknown,
): TuiProviderEditableProfileSnapshot | undefined {
  if (descriptor === undefined || (entry.settingsNs !== 'llm-pi-ai' && entry.settingsNs !== 'llm-deepseek')) {
    return undefined
  }
  const displayNameSupported = entry.settingsNs === 'llm-pi-ai' && entry.declared === true
    && schemaNodeAtPath(descriptor.schema, [...entry.settingsPath, 'displayName'])?.type === 'string'
  const protocols = entry.settingsNs === 'llm-pi-ai' && entry.declared === true
    ? protocolChoices(descriptor, entry.settingsPath)
    : Object.freeze([] as string[])
  const protocolSupported = protocols.length > 0
  const modelsNode = schemaNodeAtPath(descriptor.schema, [...entry.settingsPath, 'models'])
  const projectedModels = projectedProviderModels(isRecord(profile) ? profile['models'] : undefined)
  const modelsSupported = modelsNode?.type === 'array' && modelsNode.inner?.type === 'object'
    && modelsNode.inner.dict?.['id']?.type === 'string' && projectedModels !== undefined
  if (!displayNameSupported && !protocolSupported && !modelsSupported) return undefined
  const rawDisplayName = isRecord(profile) && typeof profile['displayName'] === 'string'
    ? singleLine(profile['displayName'])
    : undefined
  const rawProtocol = isRecord(profile) && typeof profile['api'] === 'string' && protocols.includes(profile['api'])
    ? profile['api']
    : undefined
  return Object.freeze({
    displayNameSupported,
    protocolSupported,
    modelsSupported,
    protocols,
    ...(rawDisplayName === undefined ? {} : { displayName: rawDisplayName }),
    ...(rawProtocol === undefined ? {} : { protocol: rawProtocol }),
    ...(modelsSupported ? { models: projectedModels } : {}),
  })
}

function settingsProfile(
  entry: LlmConfigurableProvider,
  descriptors: ReadonlyMap<string, SettingsDescriptor>,
  settings: TuiProviderCenterSettingsInspector | undefined,
): {
  readonly snapshot: TuiProviderSettingsSnapshot
  readonly credentialRef?: string
} {
  const descriptor = descriptors.get(entry.settingsNs)
  const profile = valueAt(descriptor?.value, entry.settingsPath)
  const models = isRecord(profile) && Array.isArray(profile['models']) ? profile['models'] : undefined
  const rawRef = isRecord(profile) && typeof profile['apiKeyEnv'] === 'string'
    ? profile['apiKeyEnv']
    : undefined
  const endpoint = isRecord(profile) ? safeEndpoint(profile['baseURL']) : undefined
  const editable = editableProviderProfile(entry, descriptor, profile)
  return {
    snapshot: Object.freeze({
      namespace: singleLine(entry.settingsNs),
      path: Object.freeze(entry.settingsPath.map(singleLine)),
      registered: descriptor !== undefined,
      writable: settings?.writable === true,
      ...(descriptor?.applies === undefined ? {} : { applies: descriptor.applies }),
      ...(descriptor?.revision === undefined ? {} : { revision: descriptor.revision }),
      userOverride: descriptor === undefined ? false : hasValueAt(descriptor.user, entry.settingsPath),
      ...(endpoint === undefined ? {} : { endpoint }),
      ...(models === undefined ? {} : { configuredModelCount: models.length }),
      credentialReferenceStored: rawRef !== undefined,
      ...(editable === undefined ? {} : { editable }),
    }),
    credentialRef: rawRef ?? deriveTuiProviderCredentialRef(entry.provider),
  }
}

function providerIdentity(
  live: ReadonlyMap<string, { readonly id: string; readonly name: string }>,
  directory: readonly LlmConfigurableProvider[],
): readonly {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly declared: boolean
  readonly settingsEntry?: LlmConfigurableProvider
}[] {
  const rows: Array<{
    readonly id: string
    readonly name: string
    readonly active: boolean
    readonly declared: boolean
    readonly settingsEntry?: LlmConfigurableProvider
  }> = []
  const seen = new Set<string>()
  for (const entry of directory) {
    if (seen.has(entry.provider)) continue
    const registered = live.get(entry.provider)
    rows.push({
      id: entry.provider,
      name: entry.displayName,
      active: registered !== undefined,
      declared: entry.declared === true,
      settingsEntry: entry,
    })
    seen.add(entry.provider)
  }
  for (const registered of live.values()) {
    if (seen.has(registered.id)) continue
    rows.push({
      id: registered.id,
      name: registered.name,
      active: true,
      declared: false,
    })
  }
  return rows
}

/**
 * Collect one redacted provider/configuration snapshot from same-process Host owners.
 * @param options - LLM, optional settings/credential inspectors, credential branding, and cancellation.
 * @returns bounded provider rows; contained owner failures are represented only by stable issue ids.
 */
export async function collectTuiProviderCenter(
  options: TuiProviderCenterCollectOptions,
): Promise<TuiProviderCenterSnapshot> {
  options.signal?.throwIfAborted()
  const live = new Map(options.llm.listProviders().map(provider => [provider.id, provider]))
  const directory = options.llm.listConfigurableProviders()
  let descriptorFailure = false
  let descriptors = new Map<string, SettingsDescriptor>()
  if (options.settings !== undefined) {
    try {
      descriptors = new Map(options.settings.describe({ redactSecrets: true }).map(entry => [String(entry.ns), entry]))
    } catch {
      descriptorFailure = true
    }
  }
  const identities = providerIdentity(live, directory)
  const creationTargets = descriptorFailure
    ? Object.freeze([] as TuiProviderCreationTarget[])
    : providerCreationTargets(directory, descriptors, options.settings?.writable === true)
  const visible = identities.slice(0, MAX_PROVIDERS)
  const providers = await Promise.all(visible.map(async (identity): Promise<TuiProviderCenterRow> => {
    options.signal?.throwIfAborted()
    const issues: TuiProviderCenterRow['issues'][number][] = []
    let settings: TuiProviderSettingsSnapshot | undefined
    let rawCredentialRef: string | undefined
    if (identity.settingsEntry !== undefined) {
      const projected = settingsProfile(identity.settingsEntry, descriptors, options.settings)
      settings = projected.snapshot
      rawCredentialRef = projected.credentialRef
      if (descriptorFailure) issues.push('settings-unavailable')
      if (rawCredentialRef !== undefined && options.credentials !== undefined) {
        try {
          const ref = options.credentialRef(rawCredentialRef)
          const info = await options.credentials.describe(ref)
          options.signal?.throwIfAborted()
          settings = Object.freeze({
            ...settings,
            credential: Object.freeze({
              ref: singleLine(rawCredentialRef),
              configured: info.configured,
              writable: info.writable,
              ...(info.source === undefined ? {} : { source: singleLine(info.source) }),
            }),
          })
        } catch (_error: unknown) {
          options.signal?.throwIfAborted()
          issues.push('credential-unavailable')
        }
      }
    }

    let authentication: TuiProviderAuthenticationState = identity.active ? 'unavailable' : 'dormant'
    let authenticationSource: string | undefined
    let authenticationMethods: readonly TuiProviderAuthenticationMethod[] = Object.freeze([])
    let canLogout = false
    let modelCount: number | undefined
    if (identity.active) {
      try {
        const auth = await options.llm.authentication(identity.id)
        options.signal?.throwIfAborted()
        authentication = auth.configured
          ? 'configured'
          : auth.methods.length > 0 ? 'sign-in-required' : 'credential-required'
        authenticationSource = auth.source === undefined ? undefined : singleLine(auth.source)
        authenticationMethods = Object.freeze(auth.methods.map(method => Object.freeze({
          id: singleLine(method.id), name: singleLine(method.name),
        })))
        canLogout = auth.canLogout === true
      } catch (_error: unknown) {
        options.signal?.throwIfAborted()
        issues.push('authentication-unavailable')
      }
      try {
        modelCount = (await options.llm.listModels(identity.id)).length
        options.signal?.throwIfAborted()
      } catch (_error: unknown) {
        options.signal?.throwIfAborted()
        issues.push('models-unavailable')
      }
    }
    return Object.freeze({
      id: singleLine(identity.id),
      name: singleLine(identity.name),
      active: identity.active,
      declared: identity.declared,
      authentication,
      ...(authenticationSource === undefined ? {} : { authenticationSource }),
      authenticationMethods,
      canLogout,
      ...(modelCount === undefined ? {} : { modelCount }),
      ...(settings === undefined ? {} : { settings }),
      issues: Object.freeze(issues),
    })
  }))
  options.signal?.throwIfAborted()
  return Object.freeze({
    providers: Object.freeze(providers),
    creationTargets,
    omittedProviders: Math.max(0, identities.length - visible.length),
    capabilities: Object.freeze({
      settings: options.settings !== undefined,
      settingsWritable: options.settings?.writable === true,
      credentials: options.credentials !== undefined,
    }),
  })
}
