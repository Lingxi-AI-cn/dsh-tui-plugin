/** Provider-neutral Plugin Hub catalog vocabulary. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Exact opaque identifier assigned to one catalog plugin. */
export type PluginId = Branded<'PluginId'>
/**
 * Brand a catalog plugin id received from a provider.
 * @param value - provider-issued opaque id.
 * @returns the same string with the PluginId brand.
 */
export function PluginId(value: string): PluginId { return value as PluginId }

/** Exact opaque identifier assigned to one published plugin version. */
export type PluginVersionId = Branded<'PluginVersionId'>
/**
 * Brand a catalog version id received from a provider.
 * @param value - provider-issued opaque id.
 * @returns the same string with the PluginVersionId brand.
 */
export function PluginVersionId(value: string): PluginVersionId { return value as PluginVersionId }

/** Opaque identifier for one detached local profile change plan. */
export type PluginChangePlanId = Branded<'PluginChangePlanId'>
/**
 * Brand a provider-issued detached plan id.
 * @param value - provider-issued opaque id.
 * @returns the same string with the PluginChangePlanId brand.
 */
export function PluginChangePlanId(value: string): PluginChangePlanId { return value as PluginChangePlanId }

/** Opaque identifier for one durable local profile transaction. */
export type PluginTransactionId = Branded<'PluginTransactionId'>
/**
 * Brand a provider-issued transaction id.
 * @param value - provider-issued opaque id.
 * @returns the same string with the PluginTransactionId brand.
 */
export function PluginTransactionId(value: string): PluginTransactionId { return value as PluginTransactionId }

/** Stable wire/API version currently understood by the local consumer. */
export const PLUGIN_HUB_API_VERSION = 'dsh.plugin-hub/v1' as const

/** Public error taxonomy shared by providers and TUI consumers. */
export type PluginHubErrorCode =
  | 'REGISTRY_UNAVAILABLE' | 'CATALOG_STALE' | 'CONTRACT_UNSUPPORTED'
  | 'SIGNATURE_INVALID' | 'DESCRIPTOR_EXPIRED' | 'PLUGIN_NOT_FOUND'
  | 'VERSION_NOT_INSTALLABLE' | 'DSH_INCOMPATIBLE' | 'SURFACE_INCOMPATIBLE'
  | 'PLUGIN_QUARANTINED' | 'ARTIFACT_TOO_LARGE' | 'ARTIFACT_DIGEST_MISMATCH'
  | 'PROFILE_BUSY' | 'PROFILE_CHANGED' | 'PNPM_UNAVAILABLE' | 'PNPM_FAILED'
  | 'BUILD_NOT_ALLOWED' | 'PROFILE_INVALID' | 'PLAN_EXPIRED' | 'STAGE_FAILED'
  | 'HANDOFF_FAILED' | 'INVALID_CURSOR' | 'OPERATION_ABORTED'

/** Typed failure that callers can branch on without parsing a message. */
export class PluginHubError extends Error {
  /** Stable category consumed by UI and retry policy. */
  readonly code: PluginHubErrorCode

  /**
   * @param message - bounded public diagnostic.
   * @param code - stable machine-readable category.
   * @param options - optional underlying cause.
   */
  constructor(message: string, code: PluginHubErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PluginHubError'
    this.code = code
  }
}

/** Provider health and last-good catalog state. */
export interface PluginHubStatus {
  readonly apiVersion: typeof PLUGIN_HUB_API_VERSION
  readonly catalogRevision?: number | undefined
  readonly generatedAt?: string | undefined
  readonly stale: boolean
  readonly source: 'registry' | 'cache' | 'fixture'
}

/** Provider-neutral catalog ordering applied by Registry providers. */
export type PluginCatalogSort = 'relevance' | 'stars' | 'updated' | 'newest'

/** Registry-owned discovery category; this is presentation metadata, not trust state. */
export type PluginCategory =
  | 'communication' | 'vision' | 'browser' | 'interface' | 'agent' | 'development'
  | 'data' | 'automation' | 'integration' | 'theme' | 'other'

/** Registry-owned package classification used for discovery display. */
export type PluginPackageKind = 'plugin' | 'bundle' | 'skill' | 'tool' | 'integration'

/** Authority that supplied one discovery metadata value. */
export type PluginDiscoveryMetadataSource = 'author' | 'curator' | 'automatic'

/** Bounded literal catalog search request. */
export interface PluginSearchRequest {
  readonly query?: string | undefined
  readonly surface?: 'tui' | 'web' | 'headless' | 'unknown' | undefined
  readonly dshVersion?: string | undefined
  readonly verification?: 'discovered' | 'manifest-valid' | 'install-verified' | 'tui-boot-verified' | 'curated' | undefined
  readonly installable?: boolean | undefined
  readonly category?: PluginCategory | undefined
  readonly kind?: PluginPackageKind | undefined
  readonly language?: string | undefined
  readonly sort?: PluginCatalogSort | undefined
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
}

/** Compatibility result returned by the Registry. */
export interface PluginCompatibility {
  readonly dsh?: string | undefined
  readonly match: 'compatible' | 'incompatible' | 'unknown'
}

/** Verification state for one catalog row. */
export interface PluginVerification {
  readonly level: 'discovered' | 'manifest-valid' | 'install-verified' | 'tui-boot-verified' | 'curated'
  readonly status: 'passed' | 'failed' | 'unknown'
}

/** Repository identity displayed by the native TUI. */
export interface PluginRepository {
  readonly provider: string
  readonly providerId?: string
  readonly fullName: string
  readonly url: string
  /** Primary language reported by the repository provider, when available. */
  readonly primaryLanguage?: string | undefined
  /** Whether the source repository is archived and no longer maintained. */
  readonly archived?: boolean | undefined
}

/** Bounded curation facts supplied by the Registry for human display. */
export interface PluginCurationSummary {
  readonly policyRevision: string
  readonly notes?: string | undefined
  readonly curatedAt: string
}

/** Structured advisory facts supplied by the Registry. */
export interface PluginAdvisorySummary {
  readonly id: string
  readonly severity: 'low' | 'moderate' | 'high' | 'critical'
  readonly reason: string
  readonly recommendedAction?: string | undefined
}

/** Published version summary shown in Discover and Detail. */
export interface PluginVersionSummary {
  readonly id: PluginVersionId
  readonly version?: string | undefined
  readonly sourceCommit?: string | undefined
  readonly publishedAt?: string | undefined
  readonly installable: boolean
  readonly reason?: string | undefined
}

/** One bounded plugin row in a catalog page. */
export interface PluginSummary {
  readonly id: PluginId
  readonly packageName: string
  readonly displayName: string
  readonly summary: string
  readonly repository: PluginRepository
  /** Registry-owned discovery categories; never used as installation authority. */
  readonly categories?: readonly PluginCategory[] | undefined
  readonly categorySource?: PluginDiscoveryMetadataSource | undefined
  readonly kind?: PluginPackageKind | undefined
  readonly kindSource?: PluginDiscoveryMetadataSource | undefined
  readonly surfaces: { readonly declared: readonly string[]; readonly verified: readonly string[] }
  readonly compatibility: PluginCompatibility
  readonly verification: PluginVerification
  readonly latestVersion?: PluginVersionSummary | undefined
  readonly license?: string | undefined
  readonly stars?: number | undefined
  readonly updatedAt?: string | undefined
}

/** Search response with an opaque continuation cursor. */
export interface PluginSearchPage {
  readonly apiVersion: typeof PLUGIN_HUB_API_VERSION
  readonly catalogRevision: number
  readonly items: readonly PluginSummary[]
  readonly nextCursor?: string | undefined
  readonly stale?: boolean | undefined
}

/** Bounded request for the discovered GitHub repository view. */
export interface PluginDiscoverySearchRequest {
  readonly query?: string | undefined
  readonly state?: 'candidate' | 'active' | 'missing' | 'quarantined' | 'rejected' | undefined
  readonly scanStatus?: 'never' | 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded' | undefined
  readonly sort?: 'stars' | 'updated' | 'newest' | undefined
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
}

/** One discovered repository, independent from installable plugin truth. */
export interface PluginDiscoveryRepository {
  readonly id: string
  readonly repository: {
    readonly provider: string
    readonly providerId?: string | undefined
    readonly fullName: string
    readonly url: string
    readonly primaryLanguage?: string | null | undefined
  }
  readonly stars: number
  readonly forks: number
  readonly topics: readonly string[]
  readonly catalogState: 'candidate' | 'active' | 'missing' | 'quarantined' | 'rejected'
  readonly stateReason?: string | null | undefined
  readonly observedAt: string
  readonly installable: false
  readonly sync: {
    readonly headSha?: string | null | undefined
    readonly lastSeenAt: string
    readonly lastSyncedAt?: string | null | undefined
  }
  readonly scan: {
    readonly status: 'never' | 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded'
    readonly scannerVersion?: string | null | undefined
    readonly sourceCommit?: string | null | undefined
    readonly packageCount: number
    readonly updatedAt?: string | null | undefined
    readonly errorCode?: string | null | undefined
    readonly errorSummary?: string | null | undefined
    readonly rejectionCodes: readonly string[]
  }
  readonly packages: { readonly total: number; readonly active: number; readonly rejected: number }
  readonly published: { readonly projectionCount: number; readonly installableCount: number; readonly revision?: number | null | undefined }
}

/** Cursor-paginated discovery repository page. */
export interface PluginDiscoveryRepositoryPage {
  readonly apiVersion: typeof PLUGIN_HUB_API_VERSION
  readonly catalogRevision: number
  readonly items: readonly PluginDiscoveryRepository[]
  readonly nextCursor?: string | undefined
  readonly stale?: boolean | undefined
}

/** Full read-only plugin description used by the Detail panel. */
export interface PluginDetail extends PluginSummary {
  readonly packagePath?: string | undefined
  readonly readme?: string | undefined
  readonly versions: readonly PluginVersionSummary[]
  readonly os?: {
    readonly declared: readonly string[]
    readonly verified: readonly string[]
  } | undefined
  readonly curation?: PluginCurationSummary | undefined
  readonly advisories?: readonly PluginAdvisorySummary[] | undefined
  readonly quarantined?: boolean | undefined
}

/** Health of one profile-local third-party dependency. */
export type InstalledPluginHealth =
  | 'ok' | 'missing-package' | 'missing-entry' | 'manifest-invalid' | 'unknown'

/** One dependency derived from the active profile rather than remote Catalog state. */
export interface InstalledPlugin {
  readonly packageName: string
  readonly version?: string | undefined
  readonly activeBundle: boolean
  readonly managed: boolean
  readonly pluginId?: PluginId | undefined
  readonly versionId?: PluginVersionId | undefined
  readonly sourceCommit?: string | undefined
  readonly artifactDigest?: string | undefined
  readonly health: InstalledPluginHealth
}

/** Exact active-profile state used by installed and plan views. */
export interface InstalledPluginSnapshot {
  readonly profileRevision: string
  readonly bundles: readonly string[]
  readonly plugins: readonly InstalledPlugin[]
}

/** Typed profile mutation represented by a detached plan. */
export type PluginChangeOperation = 'install' | 'update' | 'remove'

/** Descriptor facts shown before a user confirms an install or update. */
export interface PluginChangeTarget {
  readonly pluginId: PluginId
  readonly versionId: PluginVersionId
  readonly packageName: string
  readonly version: string
  readonly sourceCommit: string
  readonly artifactSizeBytes: number
  readonly artifactDigest: string
  readonly dshRange: string
  readonly validationLevel: string
  readonly lifecycleScripts: readonly string[]
}

/** Detached, expiring profile plan that contains no executable or local artifact path. */
export interface PluginChangePlan {
  readonly id: PluginChangePlanId
  readonly operation: PluginChangeOperation
  readonly profileRevision: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly packageName: string
  readonly target?: PluginChangeTarget | undefined
  readonly before: InstalledPluginSnapshot
  readonly afterBundles: readonly string[]
  readonly restartRequired: true
  readonly risks: readonly string[]
}

/** Successfully prepared staging generation awaiting explicit activation handoff. */
export interface StagedPluginTransaction {
  readonly id: PluginTransactionId
  readonly planId: PluginChangePlanId
  readonly operation: PluginChangeOperation
  readonly packageName: string
  readonly beforeRevision: string
  readonly afterRevision: string
  readonly createdAt: string
  readonly restartRequired: true
}

/** Durable activation handoff that becomes owned by the maintenance process. */
export interface PluginMaintenanceHandoff {
  readonly transactionId: PluginTransactionId
  readonly state: 'waiting-for-old-process'
  readonly createdAt: string
}

/** Provider-neutral catalog implementation. */
export interface PluginHubProvider {
  readonly id: string
  /** Whether this provider may mutate and restart the active profile. */
  readonly profileMutations: boolean
  status(signal?: AbortSignal): Promise<PluginHubStatus>
  search(request: PluginSearchRequest, signal?: AbortSignal): Promise<PluginSearchPage>
  searchRepositories(request: PluginDiscoverySearchRequest, signal?: AbortSignal): Promise<PluginDiscoveryRepositoryPage>
  plugin(pluginId: PluginId, signal?: AbortSignal): Promise<PluginDetail>
  installed(signal?: AbortSignal): Promise<InstalledPluginSnapshot>
  planInstall(pluginId: PluginId, versionId: PluginVersionId, signal?: AbortSignal): Promise<PluginChangePlan>
  planRemove(packageName: string, signal?: AbortSignal): Promise<PluginChangePlan>
  stage(planId: PluginChangePlanId, signal?: AbortSignal): Promise<StagedPluginTransaction>
  discard(transactionId: PluginTransactionId, signal?: AbortSignal): Promise<void>
  createMaintenanceHandoff(transactionId: PluginTransactionId, signal?: AbortSignal): Promise<PluginMaintenanceHandoff>
  markMaintenanceReady(signal?: AbortSignal): Promise<void>
}

/** Safe in-process progress update; progress never enters a Session log. */
export interface PluginHubProgress {
  readonly operationId: string
  readonly phase: 'catalog' | 'download' | 'verify' | 'materialize' | 'mutate' | 'validate' | 'handoff'
  readonly message: string
  readonly completed?: number
  readonly total?: number
}
