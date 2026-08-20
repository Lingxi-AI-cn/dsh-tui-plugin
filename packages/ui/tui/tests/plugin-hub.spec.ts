import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import {
  PluginChangePlanId, PluginId, PluginVersionId,
  type InstalledPluginSnapshot, type PluginChangePlan, type PluginDetail, type PluginSearchPage,
} from '@lingxi-ai-cn/dsh-plugin-hub'
import {
  formatTuiPluginHubRelativeTime, formatTuiPluginHubStars, tuiPluginHubCardHeight,
  tuiPluginHubCardLayout, tuiPluginHubCatalogLine, tuiPluginHubCategoryLabel, tuiPluginHubDetailLines,
  tuiPluginHubInstalledRows, tuiPluginHubNextCategory, tuiPluginHubNextSort, tuiPluginHubPlanLines,
  tuiPluginHubQueryCursor, tuiPluginHubRows, tuiPluginHubSortLabel,
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
  it('cycles provider-neutral catalog sort labels', () => {
    expect(tuiPluginHubSortLabel('relevance')).toBe('Relevance')
    expect(tuiPluginHubNextSort('relevance')).toBe('stars')
    expect(tuiPluginHubNextSort('stars')).toBe('updated')
    expect(tuiPluginHubNextSort('updated')).toBe('newest')
    expect(tuiPluginHubNextSort('newest')).toBe('relevance')
  })

  it('cycles Registry-owned categories without treating the all-categories state as a filter', () => {
    expect(tuiPluginHubCategoryLabel(undefined)).toBe('All categories')
    expect(tuiPluginHubCategoryLabel('communication')).toBe('Communication')
    expect(tuiPluginHubNextCategory(undefined)).toBe('communication')
    expect(tuiPluginHubNextCategory('communication')).toBe('vision')
    expect(tuiPluginHubNextCategory('other')).toBeNull()
  })
  it('anchors the Discover query cursor and clamps long suffixes inside the field', () => {
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
    })).toBe('Offline · last-good catalog · All categories · Sort: Stars')
  })

  it('labels catalog-only providers as external-CLI mutation mode', () => {
    expect(tuiPluginHubCatalogLine({
      generation: 1, phase: 'browse', view: 'discover', initialQuery: '', sort: 'stars',
      profileMutations: false,
      page: { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 7, items: [summary] },
    })).toBe('Catalog r7 · All categories · Sort: Stars · Changes: external CLI')
  })
})
