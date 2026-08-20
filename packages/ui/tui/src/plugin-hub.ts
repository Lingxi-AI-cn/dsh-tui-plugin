/** Pure Plugin Hub panel state and bounded text projections for the native TUI. */

import type {
  InstalledPluginSnapshot, PluginAdvisorySummary, PluginCatalogSort, PluginChangePlan,
  PluginCategory, PluginDetail, PluginHubProgress, PluginHubStatus, PluginSearchPage, PluginVerification,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import stringWidth from 'string-width'
import { terminalMarkdownText } from './markdown.ts'
import { terminalSafe } from './sanitize.ts'
import type { InputCursorTarget } from './terminal-session.ts'

const MAX_DETAIL_LINES = 256
const MAX_VERSIONS = 64

/** Plugin Hub panel snapshot across remote discovery and local profile lifecycle views. */
export interface TuiPluginHubDialogSnapshot {
  readonly generation: number
  /** False when profile changes must be performed by the external DSH CLI. */
  readonly profileMutations?: boolean | undefined
  readonly phase:
    | 'loading' | 'browse' | 'detail-loading' | 'detail'
    | 'planning' | 'confirm' | 'staging' | 'handoff' | 'error'
  readonly view: 'discover' | 'installed'
  readonly initialQuery: string
  readonly sort: PluginCatalogSort
  readonly category?: PluginCategory | undefined
  readonly page?: PluginSearchPage | undefined
  readonly installed?: InstalledPluginSnapshot | undefined
  readonly detail?: PluginDetail | undefined
  readonly plan?: PluginChangePlan | undefined
  readonly status?: PluginHubStatus | undefined
  readonly progress?: PluginHubProgress | undefined
  readonly loadingMore?: boolean | undefined
  readonly error?: string | undefined
}

/** Stable sort cycle exposed by the human Plugin Hub catalog. */
const TUI_PLUGIN_HUB_SORTS: readonly PluginCatalogSort[] = Object.freeze([
  'relevance', 'stars', 'updated', 'newest',
])

/** Stable category cycle used by the human Plugin Hub catalog. */
const TUI_PLUGIN_HUB_CATEGORIES: readonly PluginCategory[] = Object.freeze([
  'communication', 'vision', 'browser', 'interface', 'agent', 'development',
  'data', 'automation', 'integration', 'theme', 'other',
])

/**
 * Format one provider-neutral catalog ordering for the TUI status line.
 * @param sort - catalog ordering to label.
 * @returns human-readable ordering label.
 */
export function tuiPluginHubSortLabel(sort: PluginCatalogSort): string {
  return sort === 'stars' ? 'Stars' : sort === 'updated' ? 'Updated' : sort === 'newest' ? 'Newest' : 'Relevance'
}

/**
 * Advance the catalog ordering without exposing provider cursor internals.
 * @param sort - current catalog ordering.
 * @returns next ordering in the stable TUI cycle.
 */
export function tuiPluginHubNextSort(sort: PluginCatalogSort): PluginCatalogSort {
  const index = TUI_PLUGIN_HUB_SORTS.indexOf(sort)
  return TUI_PLUGIN_HUB_SORTS[(index < 0 ? 0 : index + 1) % TUI_PLUGIN_HUB_SORTS.length] ?? 'relevance'
}

/**
 * Format the selected Registry-owned category for the TUI status line.
 * @param category - selected Registry category, or undefined for all categories.
 * @returns user-facing category label.
 */
export function tuiPluginHubCategoryLabel(category: PluginCategory | undefined): string {
  if (category === undefined) return 'All categories'
  return `${category.slice(0, 1).toLocaleUpperCase()}${category.slice(1)}`
}

/**
 * Advance the category filter, returning null to clear it after the final category.
 * @param category - current category, or undefined for all categories.
 * @returns next category, or null when the filter should be cleared.
 */
export function tuiPluginHubNextCategory(category: PluginCategory | undefined): PluginCategory | null {
  if (category === undefined) return TUI_PLUGIN_HUB_CATEGORIES[0] ?? null
  const index = TUI_PLUGIN_HUB_CATEGORIES.indexOf(category)
  return TUI_PLUGIN_HUB_CATEGORIES[index + 1] ?? null
}

/**
 * Project catalog freshness without hiding a stale search fallback behind a failed status request.
 * @param snapshot - current controller-owned panel state.
 * @returns sanitized one-line catalog status.
 */
export function tuiPluginHubCatalogLine(snapshot: TuiPluginHubDialogSnapshot): string {
  const mutationMode = snapshot.profileMutations === false ? ' · Changes: external CLI' : ''
  if (snapshot.status?.stale === true || snapshot.page?.stale === true) {
    return `Offline · last-good catalog · ${tuiPluginHubCategoryLabel(snapshot.category)} · Sort: ${tuiPluginHubSortLabel(snapshot.sort)}${mutationMode}`
  }
  const revision = snapshot.page?.catalogRevision ?? snapshot.status?.catalogRevision ?? 'unknown'
  return `Catalog r${revision} · ${tuiPluginHubCategoryLabel(snapshot.category)} · Sort: ${tuiPluginHubSortLabel(snapshot.sort)}${mutationMode}`
}

/** One sanitized structured Plugin Hub card projected for Ink. */
export interface TuiPluginHubCard {
  readonly id: string
  readonly kind: 'catalog' | 'installed'
  readonly displayName: string
  readonly packageName: string
  readonly summary: string
  readonly version?: string | undefined
  readonly categories: readonly string[]
  readonly categorySource?: string | undefined
  readonly packageKind?: string | undefined
  readonly kindSource?: string | undefined
  readonly primaryLanguage?: string | undefined
  readonly surfaces: readonly string[]
  readonly stars?: number | undefined
  readonly updatedAt?: string | undefined
  readonly installable: boolean
  readonly verificationLevel: PluginVerification['level']
  readonly selected: boolean
}

/** Backward-compatible export name for the structured card. */
export type TuiPluginHubRow = TuiPluginHubCard

/** Responsive strings consumed by the Ink card renderer. */
export interface TuiPluginHubCardLayout {
  readonly height: 2 | 3
  readonly displayName: string
  readonly badges: string
  readonly summary: string
  readonly metadata?: string | undefined
  readonly physicalLines: readonly string[]
}

/** Semantic tone used by one bounded Plugin Hub detail physical line. */
export type TuiPluginHubLineTone = 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'error'

/** One physical line projected from a semantic Plugin Hub detail or confirmation entry. */
export interface TuiPluginHubDetailLine {
  readonly kind: 'title' | 'summary' | 'section' | 'field' | 'warning' | 'body' | 'blank'
  readonly tone: TuiPluginHubLineTone
  readonly text: string
}

/**
 * Resolve the fixed physical height shared by catalog windowing and rendering.
 * @param columns - active terminal columns.
 * @returns three rows for wide terminals and two rows otherwise.
 */
export function tuiPluginHubCardHeight(columns: number): 2 | 3 {
  return columns >= 96 ? 3 : 2
}

/**
 * Format a finite non-negative Star count for compact catalog display.
 * @param stars - Registry Star count.
 * @returns compact count, or undefined for unusable input.
 */
export function formatTuiPluginHubStars(stars: number | undefined): string | undefined {
  if (stars === undefined || !Number.isFinite(stars) || stars < 0) return undefined
  const value = Math.floor(stars)
  if (value < 1_000) return String(value)
  if (value < 10_000) return `${trimDecimal(value / 1_000)}k`
  if (value < 1_000_000) return `${Math.floor(value / 1_000)}k`
  if (value < 10_000_000) return `${trimDecimal(value / 1_000_000)}m`
  return `${Math.floor(value / 1_000_000)}m`
}

/**
 * Format catalog activity relative to a fixed caller clock.
 * @param value - Registry timestamp.
 * @param now - comparison clock in milliseconds.
 * @returns bounded relative label, or undefined for invalid/future values.
 */
export function formatTuiPluginHubRelativeTime(
  value: string | undefined,
  now = Date.now(),
): string | undefined {
  if (value === undefined) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp > now) return undefined
  const days = Math.floor((now - timestamp) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 60) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/**
 * Resolve the real terminal cursor cell for the fixed-height Discover query editor.
 * @param query - append-only process-local search query.
 * @param columns - active terminal columns.
 * @returns one-based terminal cell after the visible query suffix.
 */
export function tuiPluginHubQueryCursor(query: string, columns: number): InputCursorTarget {
  const terminalColumns = Math.max(1, columns)
  const availableQueryCells = Math.max(0, terminalColumns - 13)
  const queryCells = Math.min(stringWidth(terminalSafe(query)), availableQueryCells)
  return { row: 6, column: Math.min(terminalColumns, 11 + queryCells) }
}

/**
 * Project catalog rows without allowing third-party control sequences through.
 * @param page - current provider page.
 * @param selectedIndex - zero-based selected row.
 * @param columns - available terminal columns.
 * @returns immutable fixed-height rows.
 */
export function tuiPluginHubRows(
  page: PluginSearchPage | undefined,
  selectedIndex: number,
  columns: number,
): readonly TuiPluginHubRow[] {
  void columns
  return (page?.items ?? []).map((item, index) => Object.freeze({
    id: String(item.id),
    kind: 'catalog' as const,
    displayName: singleLine(item.displayName, 512),
    packageName: singleLine(item.packageName, 512),
    summary: singleLine(item.summary, 4096),
    ...(item.latestVersion?.version === undefined ? {} : { version: singleLine(item.latestVersion.version, 128) }),
    categories: Object.freeze((item.categories ?? []).slice(0, 11).map(category => singleLine(category, 64))),
    ...(item.categorySource === undefined ? {} : { categorySource: singleLine(item.categorySource, 64) }),
    ...(item.kind === undefined ? {} : { packageKind: singleLine(item.kind, 64) }),
    ...(item.kindSource === undefined ? {} : { kindSource: singleLine(item.kindSource, 64) }),
    ...(item.repository.primaryLanguage === undefined ? {} : { primaryLanguage: singleLine(item.repository.primaryLanguage, 128) }),
    surfaces: Object.freeze(item.surfaces.declared.slice(0, 4).map(surface => singleLine(surface, 64))),
    ...(item.stars === undefined || !Number.isFinite(item.stars) || item.stars < 0 ? {} : { stars: Math.floor(item.stars) }),
    ...(item.updatedAt === undefined ? {} : { updatedAt: singleLine(item.updatedAt, 128) }),
    installable: item.latestVersion?.installable === true,
    verificationLevel: item.verification.level,
    selected: index === selectedIndex,
  }))
}

/**
 * Project active-profile installed truth into fixed-height terminal rows.
 * @param snapshot - active profile manifest, lockfile, resolved package, bundle, and receipt truth.
 * @param selectedIndex - zero-based selected package.
 * @param columns - available terminal columns.
 * @returns immutable installed rows.
 */
export function tuiPluginHubInstalledRows(
  snapshot: InstalledPluginSnapshot | undefined,
  selectedIndex: number,
  columns: number,
): readonly TuiPluginHubRow[] {
  void columns
  return (snapshot?.plugins ?? []).map((plugin, index) => Object.freeze({
    id: plugin.packageName,
    kind: 'installed' as const,
    displayName: singleLine(plugin.packageName, 512),
    packageName: singleLine(plugin.packageName, 512),
    summary: singleLine([
      plugin.managed ? 'Hub managed' : 'unmanaged',
      plugin.activeBundle ? 'active bundle' : 'dependency only',
      plugin.health,
    ].join(' · '), 1024),
    ...(plugin.version === undefined ? {} : { version: singleLine(plugin.version, 128) }),
    categories: Object.freeze([]),
    surfaces: Object.freeze([]),
    installable: false,
    verificationLevel: 'discovered' as const,
    selected: index === selectedIndex,
  }))
}

/**
 * Resolve bounded card strings for one terminal width.
 * @param card - sanitized structured card.
 * @param columns - active terminal columns.
 * @param now - fixed activity clock used by deterministic callers.
 * @returns fixed-height strings and renderer fields.
 */
export function tuiPluginHubCardLayout(
  card: TuiPluginHubCard,
  columns: number,
  now = Date.now(),
): TuiPluginHubCardLayout {
  const height = tuiPluginHubCardHeight(columns)
  const width = Math.max(1, columns - 4)
  const contentWidth = Math.max(1, width - 2)
  const badges = card.kind === 'catalog' ? catalogBadges(card, columns, contentWidth) : ''
  const badgeGap = badges === '' ? 0 : 1
  const displayName = trimForTerminal(card.displayName, Math.max(1, contentWidth - stringWidth(badges) - badgeGap))
  const summary = trimForTerminal(card.summary === '' ? 'No summary provided.' : card.summary, contentWidth)
  const relative = formatTuiPluginHubRelativeTime(card.updatedAt, now)
  const metadataParts = [
    card.categories.length === 0 ? undefined : card.categories[0],
    card.packageKind,
    card.primaryLanguage,
    card.packageName,
    card.version === undefined ? undefined : `v${card.version}`,
    relative,
  ]
    .filter((part): part is string => part !== undefined && part !== '')
  const metadata = height === 3 ? trimForTerminal(metadataParts.join(' · '), contentWidth) : undefined
  const prefix = card.selected ? '› ' : '  '
  const headline = trimForTerminal(`${prefix}${displayName}${badges === '' ? '' : ` ${badges}`}`, width)
  const physicalLines = Object.freeze([
    headline,
    trimForTerminal(`  ${summary}`, width),
    ...(metadata === undefined ? [] : [trimForTerminal(`  ${metadata}`, width)]),
  ])
  return Object.freeze({ height, displayName, badges, summary, metadata, physicalLines })
}

/**
 * Project one exact trusted mutation plan into bounded confirmation lines.
 * @param plan - detached plan produced from active-profile truth and a verified descriptor.
 * @param detail - optional catalog detail retained only for advisory and verification display.
 * @param columns - available terminal columns.
 * @returns sanitized confirmation lines.
 */
export function tuiPluginHubPlanLines(
  plan: PluginChangePlan | undefined,
  detail: PluginDetail | undefined,
  columns: number,
): readonly TuiPluginHubDetailLine[] {
  if (plan === undefined) return []
  const width = Math.max(1, columns - 4)
  const target = plan.target
  const current = plan.before.plugins.find(plugin => plugin.packageName === plan.packageName)
  const advisories = detail?.advisories ?? []
  const operation = plan.operation === 'remove' ? 'Remove' : plan.operation === 'update' ? 'Update' : 'Install'
  const lines: TuiPluginHubDetailLine[] = [
    detailLine('title', `${operation} ${plan.packageName}`, 'accent'),
    detailLine('blank', ''),
    detailLine('section', 'Install target', 'accent'),
  ]
  lines.push(...wrappedDetail('field', `  Package: ${plan.packageName}`, width, 'muted', 2))
  lines.push(...wrappedDetail('field', `  Version: ${target?.version ?? current?.version ?? 'unknown'}`, width, 'default', 2))
  if (target !== undefined) {
    lines.push(...wrappedDetail('field', `  Source commit: ${target.sourceCommit}`, width, 'muted', 2))
    lines.push(...wrappedDetail('field', `  Artifact: ${formatBytes(target.artifactSizeBytes)} · ${digestPrefix(target.artifactDigest)}`, width, 'muted', 3))
  }
  lines.push(detailLine('blank', ''))
  lines.push(detailLine('section', 'Compatibility and trust', 'accent'))
  if (target === undefined) {
    lines.push(...wrappedDetail('field', '  Validation: active-profile installed truth', width, 'muted', 2))
  } else {
    lines.push(...wrappedDetail('field', `  DSH compatibility: ${target.dshRange} · compatible`, width, 'default', 2))
    lines.push(...wrappedDetail('field', `  Verification: ${target.validationLevel} (signed descriptor)`, width, 'success', 2))
    lines.push(...wrappedDetail('field', '  Runtime verification: not established by manifest validation', width, 'warning', 3))
    lines.push(...wrappedDetail('field', '  Lifecycle scripts: ' + (target.lifecycleScripts.length === 0 ? 'none' : target.lifecycleScripts.join(', ')), width,
      target.lifecycleScripts.length === 0 ? 'muted' : 'warning', 3))
  }
  lines.push(...wrappedDetail('field', '  Runtime access: DSH Host process permissions', width, 'warning', 3))
  lines.push(detailLine('blank', ''))
  lines.push(detailLine('section', 'Risks and advisories', 'accent'))
  lines.push(...planAdvisoryLines(advisories, width))
  for (const risk of plan.risks) lines.push(...wrappedDetail('warning', `  ${risk}`, width, 'warning', 4))
  lines.push(detailLine('blank', ''))
  lines.push(detailLine('section', 'Profile changes', 'accent'))
  lines.push(...wrappedDetail('field', `  Before bundles: ${plan.before.bundles.join(', ') || 'none'}`, width, 'muted', 4))
  lines.push(...wrappedDetail('field', `  After bundles: ${plan.afterBundles.join(', ') || 'none'}`, width, 'muted', 4))
  lines.push(...wrappedDetail('field', '  Restart: required', width, 'warning', 2))
  return Object.freeze(lines.slice(0, MAX_DETAIL_LINES))
}

/**
 * Project one detail page into bounded sanitized terminal lines.
 * @param detail - current provider detail.
 * @param columns - available terminal columns.
 * @param now - fixed comparison clock for relative activity labels.
 * @returns bounded sanitized physical lines.
 */
export function tuiPluginHubDetailLines(
  detail: PluginDetail | undefined,
  columns: number,
  now = Date.now(),
): readonly TuiPluginHubDetailLine[] {
  if (detail === undefined) return []
  const width = Math.max(1, columns - 4)
  const metadata: TuiPluginHubDetailLine[] = [
    detailLine('title', detail.displayName, 'accent'),
    ...wrappedDetail('summary', detail.summary === '' ? 'No summary provided.' : detail.summary, width, 'default', 4, '… summary truncated'),
    detailLine('blank', ''),
    detailLine('section', 'Overview', 'accent'),
  ]
  metadata.push(...wrappedDetail('field', `  Package: ${detail.packageName}`, width, 'muted', 2))
  metadata.push(...wrappedDetail('field', `  Repository: ${detail.repository.fullName}${detail.repository.archived === true ? ' · archived' : ''}`, width,
    detail.repository.archived === true ? 'warning' : 'muted', 3))
  metadata.push(...wrappedDetail('field', `  Surface: declared ${detail.surfaces.declared.join(', ') || 'none'} · verified ${detail.surfaces.verified.join(', ') || 'none'}`, width, 'default', 3))
  if (detail.os !== undefined) {
    metadata.push(...wrappedDetail('field', `  OS: declared ${detail.os.declared.join(', ') || 'none'} · verified ${detail.os.verified.join(', ') || 'none'}`, width, 'default', 3))
  }
  if (detail.stars !== undefined && Number.isFinite(detail.stars) && detail.stars >= 0) {
    metadata.push(...wrappedDetail('field', `  Stars: ${Math.floor(detail.stars)}`, width, 'muted', 2))
  }
  const updated = formatTuiPluginHubAbsoluteDate(detail.updatedAt, now)
  if (updated !== undefined) metadata.push(...wrappedDetail('field', `  Updated: ${updated}`, width, 'muted', 2))
  if (detail.license !== undefined) metadata.push(...wrappedDetail('field', `  License: ${detail.license}`, width, 'muted', 2))
  if (detail.categories !== undefined && detail.categories.length > 0) {
    const source = detail.categorySource === undefined ? '' : ` · source: ${detail.categorySource}`
    metadata.push(...wrappedDetail('field', `  Categories: ${detail.categories.join(', ')}${source}`, width, 'muted', 3))
  }
  if (detail.kind !== undefined) {
    const source = detail.kindSource === undefined ? '' : ` · source: ${detail.kindSource}`
    metadata.push(...wrappedDetail('field', `  Package kind: ${detail.kind}${source}`, width, 'muted', 2))
  }
  if (detail.repository.primaryLanguage !== undefined) {
    metadata.push(...wrappedDetail('field', `  Primary language: ${detail.repository.primaryLanguage}`, width, 'muted', 2))
  }
  if (detail.categories !== undefined || detail.kind !== undefined || detail.repository.primaryLanguage !== undefined) {
    metadata.push(...wrappedDetail('field', '  Discovery metadata; not a security or installability signal.', width, 'muted', 2))
  }
  metadata.push(detailLine('blank', ''), detailLine('section', 'Compatibility and trust', 'accent'))
  const latest = detail.latestVersion
  metadata.push(...wrappedDetail('field', `  Current version: ${latest?.version ?? 'unknown'}`, width, 'default', 2))
  metadata.push(...wrappedDetail('field', `  Install status: ${latest === undefined ? 'unknown' : latest.installable ? 'installable' : 'not installable'}`, width,
    latest?.installable === true ? 'success' : 'warning', 2))
  metadata.push(...wrappedDetail('field', `  DSH: ${detail.compatibility.dsh ?? 'unknown'} · ${detail.compatibility.match}`, width,
    detail.compatibility.match === 'compatible' ? 'success' : 'warning', 3))
  metadata.push(...wrappedDetail('field', `  Verification: ${detail.verification.level} (${detail.verification.status})`, width,
    detail.verification.status === 'failed' ? 'error' : detail.verification.level === 'curated' ? 'accent' : 'default', 2))
  metadata.push(...wrappedDetail('field', '  Runtime verification: not established', width, 'warning', 2))
  metadata.push(...wrappedDetail('field', '  Runtime access: Plugins run with DSH Host process permissions', width, 'warning', 3))
  if (detail.curation !== undefined) {
    metadata.push(...wrappedDetail('field', `  Curation: ${detail.curation.policyRevision}${formatTuiPluginHubAbsoluteDate(detail.curation.curatedAt, now) === undefined ? '' : ` · ${formatTuiPluginHubAbsoluteDate(detail.curation.curatedAt, now)}`}`, width, 'accent', 3))
    if (detail.curation.notes !== undefined) metadata.push(...wrappedDetail('body', `  Curation notes: ${detail.curation.notes}`, width, 'muted', 4, '… curation notes truncated'))
  }
  metadata.push(detailLine('blank', ''), detailLine('section', 'Risks and advisories', 'accent'))
  if (detail.quarantined === true) metadata.push(...wrappedDetail('warning', '  Quarantined: new installation is blocked.', width, 'error', 3))
  metadata.push(...planAdvisoryLines(detail.advisories ?? [], width))
  if ((detail.advisories ?? []).length === 0 && detail.quarantined !== true) metadata.push(...wrappedDetail('field', '  Advisories: none reported', width, 'muted', 2))
  metadata.push(detailLine('blank', ''), detailLine('section', 'Versions', 'accent'))
  if (detail.versions.length === 0) {
    metadata.push(...wrappedDetail('field', '  none reported', width, 'muted', 2))
  } else {
    for (const version of detail.versions.slice(0, MAX_VERSIONS)) {
      metadata.push(...wrappedDetail('field', `  ${version.version ?? 'unversioned'} · ${version.installable ? 'installable' : 'not installable'}${version.reason === undefined ? '' : ` · ${version.reason}`}`, width,
        version.installable ? 'success' : 'warning', 3))
    }
    if (detail.versions.length > MAX_VERSIONS) metadata.push(...wrappedDetail('body', `  … ${detail.versions.length - MAX_VERSIONS} more versions`, width, 'muted', 2))
  }
  const readme = detail.readme === undefined ? [] : terminalMarkdownText(detail.readme, width)
    .split('\n')
    .flatMap(line => wrapSafe(line, width))
  const readmeHeader = readme.length === 0 ? [] : [detailLine('blank', ''), detailLine('section', 'README', 'accent')]
  const metadataBudget = Math.max(0, MAX_DETAIL_LINES - readmeHeader.length - (readme.length === 0 ? 0 : 1))
  const metadataShown = metadata.length > metadataBudget
    ? fitDetailLines(metadata, metadataBudget, width, '… detail truncated')
    : metadata
  const readmeBudget = Math.max(0, MAX_DETAIL_LINES - metadataShown.length - readmeHeader.length)
  const readmeShown = readme.length > readmeBudget
    ? fitDetailLines(readme.map(line => detailLine('body', line)), readmeBudget, width, '… README truncated')
    : readme.slice(0, readmeBudget).map(line => detailLine('body', line))
  const lines: TuiPluginHubDetailLine[] = [
    ...metadataShown,
    ...readmeHeader,
    ...readmeShown,
  ]
  return Object.freeze(lines.slice(0, MAX_DETAIL_LINES).map(line => Object.freeze(line)))
}

function detailLine(
  kind: TuiPluginHubDetailLine['kind'],
  text: string,
  tone: TuiPluginHubLineTone = 'default',
): TuiPluginHubDetailLine {
  return Object.freeze({ kind, tone, text: terminalSafe(text) })
}

function wrappedDetail(
  kind: TuiPluginHubDetailLine['kind'],
  text: string,
  width: number,
  tone: TuiPluginHubLineTone,
  maxLines: number,
  marker?: string,
): readonly TuiPluginHubDetailLine[] {
  const lines = wrapSafe(text, width)
  const bounded = lines.length > maxLines
    ? fitLines(lines, maxLines, trimForTerminal(marker ?? '…', width))
    : lines
  return bounded.map(line => detailLine(kind, line, tone))
}

function fitDetailLines(
  lines: readonly TuiPluginHubDetailLine[],
  budget: number,
  width: number,
  marker: string,
): readonly TuiPluginHubDetailLine[] {
  if (lines.length <= budget) return lines
  if (budget <= 0) return []
  if (budget === 1) return [detailLine('body', trimForTerminal(marker, width), 'muted')]
  return [...lines.slice(0, budget - 1), detailLine('body', trimForTerminal(marker, width), 'muted')]
}

function planAdvisoryLines(
  advisories: readonly PluginAdvisorySummary[],
  width: number,
): readonly TuiPluginHubDetailLine[] {
  if (advisories.length === 0) return [detailLine('field', '  Advisories: none reported', 'muted')]
  const lines: TuiPluginHubDetailLine[] = []
  for (const advisory of [...advisories].sort(compareAdvisories)) {
    const tone = advisoryTone(advisory.severity)
    lines.push(...wrappedDetail('warning', `  [${advisory.severity.toUpperCase()}] ${advisory.reason}`, width, tone, 4))
    if (advisory.recommendedAction !== undefined) {
      lines.push(...wrappedDetail('body', `    Recommended action: ${advisory.recommendedAction}`, width, tone, 3))
    }
  }
  return lines
}

function compareAdvisories(left: PluginAdvisorySummary, right: PluginAdvisorySummary): number {
  return advisoryRank(right.severity) - advisoryRank(left.severity)
}

function advisoryRank(severity: PluginAdvisorySummary['severity']): number {
  return severity === 'critical' ? 4 : severity === 'high' ? 3 : severity === 'moderate' ? 2 : 1
}

function advisoryTone(severity: PluginAdvisorySummary['severity']): TuiPluginHubLineTone {
  return severity === 'critical' || severity === 'high' ? 'error' : severity === 'moderate' ? 'warning' : 'muted'
}

function formatTuiPluginHubAbsoluteDate(value: string | undefined, now: number): string | undefined {
  if (value === undefined) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp > now) return undefined
  const iso = new Date(timestamp).toISOString()
  const relative = formatTuiPluginHubRelativeTime(value, now)
  return relative === undefined ? iso.slice(0, 10) : `${iso.slice(0, 10)} · ${relative}`
}

function catalogBadges(card: TuiPluginHubCard, columns: number, contentWidth: number): string {
  const stars = formatTuiPluginHubStars(card.stars)
  const star = stars === undefined ? undefined : `★${stars}`
  const surfaces = card.surfaces.map(surface => `[${surface.toLocaleUpperCase()}]`)
  const status = card.verificationLevel === 'curated'
    ? '[Curated]'
    : card.installable ? '[Installable]' : '[Unavailable]'
  const parts = columns < 48
    ? [star]
    : columns < 96
      ? [star, surfaces[0]]
      : [star, ...surfaces, status]
  const fitted = parts.filter((part): part is string => part !== undefined && part !== '')
  const minimumNameCells = columns < 48 ? 4 : 12
  const maximum = Math.max(0, contentWidth - minimumNameCells - 1)
  while (fitted.length > 0 && stringWidth(fitted.join(' ')) > maximum) fitted.pop()
  return fitted.join(' ')
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/u, '')
}

function singleLine(value: string, maxCharacters: number): string {
  return Array.from(terminalSafe(value).replace(/[\r\n\t]+/gu, ' ').replace(/\s{2,}/gu, ' ').trim())
    .slice(0, maxCharacters)
    .join('')
}

function digestPrefix(value: string): string {
  const safe = terminalSafe(value)
  return safe.length <= 32 ? safe : `${safe.slice(0, 32)}…`
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

function fitLines(lines: readonly string[], budget: number, marker: string): readonly string[] {
  if (lines.length <= budget) return lines
  if (budget <= 0) return []
  if (budget === 1) return [marker]
  return [...lines.slice(0, budget - 1), marker]
}

function wrapSafe(value: string, width: number): readonly string[] {
  const safe = terminalSafe(value)
  if (safe.length === 0) return ['']
  const output: string[] = []
  for (const line of safe.split('\n')) {
    if (line.length === 0) { output.push(''); continue }
    let chunk = ''
    for (const character of line) {
      if (chunk !== '' && stringWidth(chunk + character) > width) { output.push(chunk); chunk = '' }
      chunk += character
    }
    if (chunk !== '') output.push(chunk)
  }
  return output
}

function trimForTerminal(value: string, width: number): string {
  const safe = terminalSafe(value).replace(/[\r\n\t]/gu, ' ')
  if (stringWidth(safe) <= width) return safe
  let output = ''
  for (const character of safe) {
    if (stringWidth(output + character) > width - 1) break
    output += character
  }
  return `${output}…`
}
