import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import {
  PluginChangePlanId, PluginId, PluginVersionId,
  type InstalledPluginSnapshot, type PluginChangePlan, type PluginDetail,
  type PluginDiscoveryRepositoryPage, type PluginSearchPage,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import {
  formatTuiPluginHubRelativeTime, formatTuiPluginHubStars, tuiPluginHubCardHeight,
  tuiPluginHubAvailableCategories, tuiPluginHubCardLayout, tuiPluginHubCatalogLine, tuiPluginHubCategoryLabel, tuiPluginHubDetailLines,
  tuiPluginHubDiscoveryDetailLines, tuiPluginHubDiscoveryRows, tuiPluginHubDiscoveryUrl,
  tuiPluginHubInstallableLabel, tuiPluginHubInstalledRows, tuiPluginHubLoadMoreFailure,
  tuiPluginHubNextCategory, tuiPluginHubNextSort, tuiPluginHubPlanLines,
  tuiPluginHubQueryCursor, tuiPluginHubRows, tuiPluginHubSortLabel, tuiPluginHubViewportRows,
} from '../src/plugin-hub.ts'

function physicalText(lines: readonly { readonly text: string }[]): string {
  return lines.map(line => line.text).join('\n')
}

const summary = {
  id: PluginId('plg_tui'), packageName: '@example/dsh-超长插件', displayName: '终端插件', summary: 'catalog summary',
  repository: { provider: 'github', fullName: 'example/dsh-plugin', url: 'https://github.com/example/dsh-plugin', primaryLanguage: 'TypeScript' },
  categories: ['communication' as const], categorySource: 'author' as const, kind: 'plugin' as const, kindSource: 'author' as const,
  surfaces: { declared: ['tui'], verified: [] }, compatibility: { dsh: '>=0.1.0', match: 'compatible' as const },
  verification: { level: 'manifest-valid' as const, status: 'passed' as const },
  latestVersion: { id: PluginVersionId('ver_tui'), version: '1.0.0', installable: true },
}

describe('Plugin Hub TUI projection', () => {
  it('reserves exact page chrome for searchable and non-searchable views', () => {
    expect(tuiPluginHubViewportRows(24, true)).toBe(15)
    expect(tuiPluginHubViewportRows(24, false)).toBe(18)
    expect(tuiPluginHubViewportRows(Number.NaN, true)).toBe(15)
  })

  it('cycles provider-neutral catalog sort labels', () => {
    expect(tuiPluginHubSortLabel('relevance')).toBe('Relevance')
    expect(tuiPluginHubNextSort('relevance')).toBe('stars')
    expect(tuiPluginHubNextSort('stars')).toBe('updated')
    expect(tuiPluginHubNextSort('updated')).toBe('newest')
    expect(tuiPluginHubNextSort('newest')).toBe('relevance')
  })

  it('cycles Registry-owned categories without treating the all-categories state as a filter', () => {
    const categories = tuiPluginHubAvailableCategories({
      apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1,
      items: [summary, { ...summary, categories: ['vision', 'communication'] }],
    })
    expect(tuiPluginHubCategoryLabel(undefined)).toBe('All categories')
    expect(tuiPluginHubCategoryLabel('communication')).toBe('Communication')
    expect(categories).toEqual(['communication', 'vision'])
    expect(tuiPluginHubNextCategory(undefined, categories)).toBe('communication')
    expect(tuiPluginHubNextCategory('communication', categories)).toBe('vision')
    expect(tuiPluginHubNextCategory('vision', categories)).toBeNull()
    expect(tuiPluginHubNextCategory(undefined, tuiPluginHubAvailableCategories(undefined))).toBeNull()
  })
  it('anchors the Registry query cursor and clamps long suffixes inside the field', () => {
    expect(tuiPluginHubQueryCursor('', 80)).toEqual({ row: 6, column: 11 })
    expect(tuiPluginHubQueryCursor('插件', 80)).toEqual({ row: 6, column: 15 })
    expect(tuiPluginHubQueryCursor('x'.repeat(100), 80)).toEqual({ row: 6, column: 78 })
    expect(tuiPluginHubQueryCursor('x', 8)).toEqual({ row: 6, column: 8 })
  })

  it('projects responsive three-line and two-line catalog cards', () => {
    const page: PluginSearchPage = {
      apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1,
      items: [{ ...summary, stars: 60, updatedAt: '2026-08-18T00:00:00.000Z',
        summary: '回合结束后发送桌面通知，支持关键词包含和排除规则' }],
    }
    const [card] = tuiPluginHubRows(page, 0, 120)
    expect(card).toMatchObject({
      displayName: '终端插件', packageName: '@example/dsh-超长插件', version: '1.0.0',
      stars: 60, surfaces: ['tui'], installable: true, verificationLevel: 'manifest-valid', selected: true,
    })
    const wide = tuiPluginHubCardLayout(card!, 120, Date.parse('2026-08-19T00:00:00.000Z'))
    expect(wide.height).toBe(3)
    expect(wide.badges).toContain('★60')
    expect(wide.badges).toContain('[TUI]')
    expect(wide.badges).toContain('[Installable]')
    expect(wide.summary).toContain('回合结束后发送桌面通知')
    expect(wide.metadata).toContain('communication · plugin · TypeScript · @example/dsh-超长插件 · v1.0.0 · 1d ago')

    const standard = tuiPluginHubCardLayout(card!, 80, Date.parse('2026-08-19T00:00:00.000Z'))
    expect(standard.height).toBe(2)
    expect(standard.badges).toBe('★60 [TUI]')
    expect(standard.metadata).toBeUndefined()
    expect(standard.summary).toContain('回合结束后发送桌面通知')
  })

  it('projects discovery repositories as non-installable status rows', () => {
    const page: PluginDiscoveryRepositoryPage = {
      apiVersion: 'dsh.plugin-hub/v1' as const, catalogRevision: 7,
      items: [{
        id: 'repo_1', repository: { provider: 'github', fullName: 'example/discovery', url: 'https://github.com/example/discovery', primaryLanguage: 'TypeScript' },
        stars: 900, forks: 2, topics: ['dsh-plugin'], catalogState: 'candidate' as const, stateReason: null, observedAt: '2026-08-19T00:01:00.000Z', installable: false,
        sync: { headSha: 'a'.repeat(40), lastSeenAt: '2026-08-19T00:00:00.000Z', lastSyncedAt: '2026-08-19T00:00:00.000Z' },
        scan: { status: 'failed' as const, scannerVersion: 'scanner/2', sourceCommit: 'b'.repeat(40), packageCount: 0, updatedAt: '2026-08-19T00:00:00.000Z', errorCode: 'JOB_FAILED', errorSummary: 'bounded failure', rejectionCodes: ['RUNTIME_ENTRY_MISSING'] },
        packages: { total: 1, active: 0, rejected: 1 }, published: { projectionCount: 0, installableCount: 0, revision: null },
      }],
    }
    const [row] = tuiPluginHubDiscoveryRows(page, 0)
    expect(row).toMatchObject({ kind: 'discovery', displayName: 'example/discovery', repositoryUrl: 'https://github.com/example/discovery', installable: false, selected: true })
    expect(row?.summary).toContain('failed')
    expect(row?.summary).toContain('JOB_FAILED')
    expect(row?.summary).toContain('RUNTIME_ENTRY_MISSING')
    expect(row?.summary).toContain('packages 0/1 active')
    expect(row?.summary).toContain('published 0')
    expect(tuiPluginHubCardLayout(row!, 80).badges).toContain('[Repository]')
    const chineseRow = tuiPluginHubDiscoveryRows(page, 0, 'zh')[0]
    expect(chineseRow?.summary).toContain('扫描失败')
    expect(chineseRow?.summary).toContain('包 0/1 个有效')
    expect(tuiPluginHubCardLayout(chineseRow!, 80, Date.now(), 'zh').badges).toContain('[仓库]')
    const discoveryDetailLines = tuiPluginHubDiscoveryDetailLines(page.items[0], 100,
      Date.parse('2026-08-20T00:00:00.000Z'), 'zh')
    const discoveryDetail = physicalText(discoveryDetailLines)
    expect(discoveryDetailLines.find(line => line.text.includes('https://github.com/example/discovery')))
      .toMatchObject({ kind: 'link', tone: 'accent' })
    expect(discoveryDetailLines.find(line => line.text.includes('当前 SHA')))
      .toMatchObject({ kind: 'field', tone: 'muted' })
    expect(discoveryDetail).toContain(`当前 SHA：${'a'.repeat(40)}`)
    expect(discoveryDetail).toContain('错误 JOB_FAILED：bounded failure')
    expect(discoveryDetail).toContain('拒绝代码：RUNTIME_ENTRY_MISSING')
    expect(discoveryDetail).toContain('包：共 1 个 · 0 个有效 · 1 个拒绝')
    expect(discoveryDetail).toContain('Registry 投影：0 个 · 0 个可安装')
    const secondPage = { ...page, items: [page.items[0]!, { ...page.items[0]!, id: 'repo_2', repository: { ...page.items[0]!.repository, fullName: 'example/second', url: 'https://github.com/example/second' } }] }
    const rows = tuiPluginHubDiscoveryRows(secondPage, 0)
    expect(tuiPluginHubDiscoveryUrl(rows, 1)).toBe('https://github.com/example/second')
  })

  it('closes discovery pagination loading state on request failure', () => {
    const snapshot = {
      generation: 1, phase: 'browse' as const, view: 'discovery' as const, initialQuery: '', sort: 'stars' as const,
      loadingMore: true, discoveryPage: { apiVersion: 'dsh.plugin-hub/v1' as const, catalogRevision: 1, items: [], nextCursor: 'cursor' },
    }
    const failure = tuiPluginHubLoadMoreFailure(snapshot, new Error('network down'), 'zh')
    expect(failure).toMatchObject({ phase: 'error', loadingMore: false })
    expect(failure.error).toContain('Plugin Hub 目录不可用')
  })

  it('keeps CJK, emoji, long names, and every physical card line within narrow cells', () => {
    const page: PluginSearchPage = { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, items: [{
      ...summary,
      displayName: `通知插件🧭${'很长'.repeat(40)}${String.fromCharCode(27)}[31m`,
      packageName: `@example/${'long-package-'.repeat(20)}`,
      summary: `状态完成后发送提醒✨${'内容'.repeat(40)}`,
      stars: 1_200,
      surfaces: { declared: ['tui', 'headless', 'web'], verified: [] },
    }] }
    const [card] = tuiPluginHubRows(page, 0, 40)
    const layout = tuiPluginHubCardLayout(card!, 40, Date.parse('2026-08-19T00:00:00.000Z'))
    expect(layout.height).toBe(2)
    expect(layout.badges).toBe('★1.2k')
    expect(layout.summary).toContain('状态完成后发送提醒')
    expect(layout.physicalLines).toHaveLength(2)
    expect(layout.physicalLines.every(line => stringWidth(line) <= 36)).toBe(true)
    expect(layout.physicalLines.join('')).not.toContain(String.fromCharCode(27))
  })

  it('formats Star and activity boundaries without invalid output', () => {
    expect(formatTuiPluginHubStars(undefined)).toBeUndefined()
    expect(formatTuiPluginHubStars(Number.NaN)).toBeUndefined()
    expect(formatTuiPluginHubStars(0)).toBe('0')
    expect(formatTuiPluginHubStars(999)).toBe('999')
    expect(formatTuiPluginHubStars(1_000)).toBe('1k')
    expect(formatTuiPluginHubStars(999_999)).toBe('999k')
    expect(formatTuiPluginHubStars(1_300_000)).toBe('1.3m')
    const now = Date.parse('2026-08-19T12:00:00.000Z')
    expect(formatTuiPluginHubRelativeTime('2026-08-19T00:00:00.000Z', now)).toBe('today')
    expect(formatTuiPluginHubRelativeTime('2026-08-16T12:00:00.000Z', now)).toBe('3d ago')
    expect(formatTuiPluginHubRelativeTime('2026-08-16T12:00:00.000Z', now, 'zh')).toBe('3 天前')
    expect(formatTuiPluginHubRelativeTime('invalid', now)).toBeUndefined()
    expect(formatTuiPluginHubRelativeTime('2026-08-20T00:00:00.000Z', now)).toBeUndefined()
  })

  it('keeps selected and unselected cards at the shared responsive height', () => {
    const page: PluginSearchPage = { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, items: [
      { ...summary, stars: undefined, updatedAt: undefined },
      { ...summary, id: PluginId('plg_curated'), stars: 999, verification: { level: 'curated', status: 'passed' } },
    ] }
    const rows = tuiPluginHubRows(page, 1, 120)
    expect(tuiPluginHubCardHeight(120)).toBe(3)
    expect(tuiPluginHubCardHeight(80)).toBe(2)
    expect(tuiPluginHubCardHeight(20)).toBe(2)
    expect(rows.map(row => tuiPluginHubCardLayout(row, 120).physicalLines.length)).toEqual([3, 3])
    expect(tuiPluginHubCardLayout(rows[0]!, 120).physicalLines.join('')).not.toContain('NaN')
    expect(tuiPluginHubCardLayout(rows[1]!, 120).badges).toContain('[Curated]')
  })

  it('projects managed and unmanaged installed truth within narrow terminal cells', () => {
    const installed: InstalledPluginSnapshot = {
      profileRevision: 'revision-1',
      bundles: ['@deepseek-ai/dsh-base', '@example/dsh-managed'],
      plugins: [
        { packageName: '@example/dsh-managed', version: '1.2.3', activeBundle: true, managed: true, health: 'ok' },
        {
          packageName: '@example/dsh-unmanaged-with-a-long-name', version: '4.5.6',
          activeBundle: false, managed: false, health: 'missing-entry',
        },
      ],
    }
    const rows = tuiPluginHubInstalledRows(installed, 1, 40)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.summary).toContain('Hub managed · active bundle · ok')
    expect(rows[1]?.selected).toBe(true)
    expect(rows[1]?.summary).toContain('unmanaged · dependency only')
    expect(rows.every(row => tuiPluginHubCardLayout(row, 40).physicalLines.every(line => stringWidth(line) <= 36))).toBe(true)
    expect(tuiPluginHubInstalledRows(installed, 0, 80, 'zh')[0]?.summary)
      .toContain('由 Hub 管理 · 活动 bundle · ok')
  })

  it('shows exact signed install facts and runtime risk before confirmation', () => {
    const before: InstalledPluginSnapshot = {
      profileRevision: 'revision-1', bundles: ['@deepseek-ai/dsh-base'], plugins: [],
    }
    const plan: PluginChangePlan = {
      id: PluginChangePlanId('plan-1'), operation: 'install', profileRevision: before.profileRevision,
      createdAt: '2026-08-18T00:00:00.000Z', expiresAt: '2026-08-18T00:05:00.000Z',
      packageName: '@example/dsh-fixture',
      target: {
        pluginId: summary.id, versionId: summary.latestVersion.id, packageName: '@example/dsh-fixture',
        version: '1.2.3', sourceCommit: 'abc123', artifactSizeBytes: 1536,
        artifactDigest: `sha512:${'a'.repeat(88)}`, dshRange: '^0.1.0-rc.5',
        validationLevel: 'manifest-valid', lifecycleScripts: ['postinstall'],
      },
      before, afterBundles: ['@deepseek-ai/dsh-base', '@example/dsh-fixture'],
      restartRequired: true, risks: ['Plugins run with DSH Host process permissions.'],
    }
    const lines = tuiPluginHubPlanLines(plan, {
      ...summary, versions: [summary.latestVersion], advisories: [{
        id: 'adv_1', severity: 'moderate', reason: 'Review publisher ownership.',
      }],
      verification: { level: 'discovered', status: 'unknown' },
    }, 80)
    const text = physicalText(lines)
    expect(text).toContain('Install @example/dsh-fixture')
    expect(text).toContain('Source commit: abc123')
    expect(text).toContain('Artifact: 1.5 KiB · sha512:')
    expect(text).toContain('DSH compatibility: ^0.1.0-rc.5 · compatible')
    expect(text).toContain('Lifecycle scripts: postinstall')
    expect(text).toContain('Verification: manifest-valid (signed descriptor)')
    expect(text).not.toContain('Verification: discovered')
    expect(text).toContain('Runtime verification: not established by manifest validation')
    expect(text).toContain('Runtime access: DSH Host process permissions')
    expect(text).toContain('[MODERATE] Review publisher ownership.')
    expect(text).toContain('Risks and advisories')
    expect(text).toContain('Before bundles: @deepseek-ai/dsh-base')
    expect(text).toContain('After bundles: @deepseek-ai/dsh-base, @example/dsh-fixture')
    expect(text).toContain('Restart: required')
    expect(lines.every(line => stringWidth(line.text) <= 76)).toBe(true)
    expect(lines.filter(line => line.kind === 'section').map(line => line.text)).toEqual([
      'Install target', 'Compatibility and trust', 'Risks and advisories', 'Profile changes',
    ])
    const chinese = physicalText(tuiPluginHubPlanLines(plan, undefined, 80, 'zh'))
    expect(chinese).toContain('安装 @example/dsh-fixture')
    expect(chinese).toContain('兼容性与信任')
    expect(chinese).toContain('重启：必需')
  })

  it('neutralizes README terminal controls before rendering detail', () => {
    const detail: PluginDetail = { ...summary, versions: [summary.latestVersion], readme: 'safe\u001b]8;;https://bad\u0007link' }
    const text = physicalText(tuiPluginHubDetailLines(detail, 80))
    expect(text).not.toContain('\u001b')
    expect(text).not.toContain('\u0007')
    expect(text).toContain('safe�]8;;https://bad�link')
  })

  it('projects README Markdown without raw HTML, link targets, or image payloads', () => {
    const detail: PluginDetail = {
      ...summary,
      versions: [summary.latestVersion],
      readme: [
        '<p align="center">',
        '<a href="https://example.test"><img src="data:image/svg+xml;base64,PHN2Zz4=" /></a>',
        '</p>',
        '',
        '## Install',
        '',
        'Use **the package** with [the guide](https://example.test/guide).',
        '',
        '![terminal preview](data:image/svg+xml;base64,PHN2Zz4=)',
      ].join('\n'),
    }
    const text = physicalText(tuiPluginHubDetailLines(detail, 80))
    expect(text).toContain('Install')
    expect(text).toContain('Use the package with the guide.')
    expect(text).toContain('terminal preview')
    expect(text).not.toContain('<p')
    expect(text).not.toContain('<img')
    expect(text).not.toContain('data:image')
    expect(text).not.toContain('PHN2Zz4')
    expect(text).not.toContain('**')
    expect(text).not.toContain('https://example.test/guide')
  })

  it('projects detail sections, registry metadata, and advisory tones in priority order', () => {
    const detail: PluginDetail = {
      ...summary,
      stars: 60,
      updatedAt: '2026-08-18T00:00:00.000Z',
      repository: { ...summary.repository, archived: true },
      os: { declared: ['macos', 'linux'], verified: ['linux'] },
      curation: { policyRevision: 'policy-2026-08', notes: 'Maintainer reviewed.', curatedAt: '2026-08-17T00:00:00.000Z' },
      advisories: [
        { id: 'low', severity: 'low', reason: 'Minor note.' },
        { id: 'critical', severity: 'critical', reason: 'Unsafe default.', recommendedAction: 'Upgrade before use.' },
      ],
      versions: [summary.latestVersion],
      readme: '## Readme\n\nBody',
    }
    const lines = tuiPluginHubDetailLines(detail, 80, Date.parse('2026-08-19T00:00:00.000Z'))
    const text = physicalText(lines)
    const sectionNames = lines.filter(line => line.kind === 'section').map(line => line.text)
    expect(sectionNames).toEqual(['Overview', 'Compatibility and trust', 'Risks and advisories', 'Versions', 'README'])
    expect(text).toContain('Stars: 60')
    expect(text).toContain('Updated: 2026-08-18 · 1d ago')
    expect(text).toContain('Categories: communication · source: author')
    expect(text).toContain('Package kind: plugin · source: author')
    expect(text).toContain('Primary language: TypeScript')
    expect(text).toContain('Discovery metadata; not a security or installability signal.')
    expect(text).toContain('OS: declared macos, linux · verified linux')
    expect(text).toContain('Curation: policy-2026-08')
    expect(text).not.toContain('Quarantined')
    expect(text).toContain('[CRITICAL] Unsafe default.')
    expect(text).toContain('Recommended action: Upgrade before use.')
    expect(lines.some(line => line.text.includes('[CRITICAL]') && line.tone === 'error')).toBe(true)
    expect(lines.some(line => line.text.includes('[LOW]') && line.tone === 'muted')).toBe(true)
    expect(lines.every(line => stringWidth(line.text) <= 76)).toBe(true)
    expect(text.indexOf('Versions')).toBeLessThan(text.indexOf('README'))
    const chinese = physicalText(tuiPluginHubDetailLines(
      detail, 80, Date.parse('2026-08-19T00:00:00.000Z'), 'zh',
    ))
    expect(chinese).toContain('概览')
    expect(chinese).toContain('更新时间：2026-08-18 · 1 天前')
    expect(chinese).toContain('风险与安全建议')
  })

  it('keeps Versions before a long README and marks the README truncation', () => {
    const detail: PluginDetail = {
      ...summary,
      versions: [{ ...summary.latestVersion, installable: false, reason: 'requires a verified artifact' }],
      readme: '## README\n\n' + '一段很长的内容。'.repeat(2_000),
    }
    const lines = tuiPluginHubDetailLines(detail, 80)
    const versionsIndex = lines.findIndex(line => line.text === 'Versions')
    const readmeIndex = lines.findIndex(line => line.text === 'README')
    expect(versionsIndex).toBeGreaterThanOrEqual(0)
    expect(readmeIndex).toBeGreaterThan(versionsIndex)
    expect(physicalText(lines)).toContain('1.0.0 · not installable · requires a verified artifact')
    expect(lines.some(line => line.text === '… README truncated')).toBe(true)
    expect(lines.length).toBeLessThanOrEqual(256)
  })

  it('reports a stale search page when the parallel status request failed', () => {
    const page: PluginSearchPage = { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, items: [summary], stale: true }
    expect(tuiPluginHubCatalogLine({
      generation: 1, phase: 'browse', view: 'discover', initialQuery: '', sort: 'stars', page,
    })).toBe('Offline · last-good Registry · All Registry entries · All categories · Sort: Stars')
  })

  it('labels catalog-only providers as external-CLI mutation mode', () => {
    expect(tuiPluginHubCatalogLine({
      generation: 1, phase: 'browse', view: 'discover', initialQuery: '', sort: 'stars',
      profileMutations: false,
      page: { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 7, items: [summary] },
    })).toBe('Registry r7 · All Registry entries · All categories · Sort: Stars · Changes: external CLI')
    expect(tuiPluginHubInstallableLabel(true, 'zh')).toBe('仅可安装')
    expect(tuiPluginHubCatalogLine({
      generation: 1, phase: 'browse', view: 'discover', initialQuery: '', sort: 'stars', installableOnly: true,
      page: { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 7, items: [summary] },
    }, 'zh')).toBe('Registry r7 · 仅可安装 · 全部分类 · 排序：Stars')
  })
})
