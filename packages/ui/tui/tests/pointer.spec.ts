import { describe, expect, it } from 'vitest'
import { tuiFooterPointerTargets } from '../src/footer.ts'
import {
  TuiPointerRegionRegistry, tuiApprovalPointerRegions, tuiFooterPointerRegions, tuiModalClosePointerRegions,
  tuiPluginHubPointerRegions, tuiQuestionPointerRegions, tuiResumePointerRegions, tuiSuggestionPointerRegions,
  tuiWorkPointerRegions, type TuiPointerRegion,
} from '../src/pointer.ts'

const action = { id: 'transcript.focus' as const, key: 'text', index: 0 }
const pluginHubTabs = {
  line: 'Installed · Registry · GitHub repositories',
  installedLabel: 'Installed', registryLabel: 'Registry', repositoriesLabel: 'GitHub repositories',
} as const

function region(overrides: Partial<TuiPointerRegion> = {}): TuiPointerRegion {
  return {
    id: 'transcript:text',
    rect: { left: 1, top: 1, right: 20, bottom: 3 },
    context: 'Transcript',
    priority: 10,
    action,
    ...overrides,
  }
}

describe('TUI pointer region registry', () => {
  it('atomically replaces generations and picks the more specific overlap', () => {
    const registry = new TuiPointerRegionRegistry()
    expect(registry.replace([region()])).toBe(1)
    const broad = region({ id: 'transcript:broad', rect: { left: 1, top: 1, right: 80, bottom: 24 }, priority: 5 })
    const narrow = region({ id: 'transcript:narrow', rect: { left: 5, top: 2, right: 12, bottom: 2 }, priority: 20 })
    const generation = registry.replace([broad, narrow])
    expect(registry.hitTest({ column: 8, row: 2 })?.region.id).toBe('transcript:narrow')
    expect(registry.hitTest({ column: 40, row: 10 })?.region.id).toBe('transcript:broad')
    expect(registry.hitTest({ column: 8, row: 2 })?.generation).toBe(generation)
    expect(registry.snapshot()).toHaveLength(2)
  })

  it('uses context as an optional filter and ignores blank or invalid regions', () => {
    const registry = new TuiPointerRegionRegistry()
    registry.replace([
      region({ id: 'dialog', context: 'Dialog', priority: 50 }),
      region({ id: 'invalid', rect: { left: 5, top: 4, right: 3, bottom: 4 } }),
      region({ id: 'blank', rect: { left: 0, top: 0, right: 0, bottom: 0 } }),
    ])
    expect(registry.hitTest({ column: 2, row: 2 }, 'Transcript')).toBeUndefined()
    expect(registry.hitTest({ column: 2, row: 2 }, 'Dialog')?.region.id).toBe('dialog')
    expect(registry.hitTest({ column: 40, row: 20 })).toBeUndefined()
    expect(registry.hitTest({ column: 0, row: 1 })).toBeUndefined()
    expect(registry.snapshot().map(candidate => candidate.id)).toEqual(['dialog'])
  })

  it('retains disabled facts without dispatching them as actions', () => {
    const registry = new TuiPointerRegionRegistry()
    registry.replace([region({ disabledReason: 'busy' })])
    expect(registry.hitTest({ column: 2, row: 2 })?.region.disabledReason).toBe('busy')
    expect(registry.clear()).toBe(2)
    expect(registry.hitTest({ column: 2, row: 2 })).toBeUndefined()
  })

  it('maps footer labels to rendered content cells and activates the matching item', () => {
    const items = [
      { id: 'model' as const, label: 'model', value: 'fast', action: 'models' as const, detailLines: [] },
      { id: 'permission' as const, label: 'perm', value: 'write', action: 'permissions' as const, detailLines: [] },
    ]
    const targets = tuiFooterPointerTargets(items, 40)
    expect(targets).toEqual([
      { itemId: 'model', left: 0, right: 9 },
      { itemId: 'permission', left: 13, right: 22 },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(tuiFooterPointerRegions(items, 42, 24, 'Composer'))
    expect(registry.hitTest({ column: 2, row: 24 }, 'Composer')?.region.action).toEqual({
      id: 'footer.activate', itemId: 'model',
    })
    expect(registry.hitTest({ column: 15, row: 24 }, 'Composer')?.region.action).toEqual({
      id: 'footer.activate', itemId: 'permission',
    })
    expect(registry.hitTest({ column: 12, row: 24 }, 'Composer')).toBeUndefined()
  })

  it('maps only visible work rows and preserves the centered selection window', () => {
    const regions = tuiWorkPointerRegions(10, 5, 8, 80, 'Work')
    expect(regions.map(region => region.action)).toEqual([
      { id: 'work.select', index: 3 },
      { id: 'work.select', index: 4 },
      { id: 'work.select', index: 5 },
      { id: 'work.select', index: 6 },
    ])
    expect(regions.map(region => region.rect)).toEqual([
      { left: 2, top: 2, right: 78, bottom: 2 },
      { left: 2, top: 3, right: 78, bottom: 3 },
      { left: 2, top: 4, right: 78, bottom: 4 },
      { left: 2, top: 5, right: 78, bottom: 5 },
    ])
  })

  it('maps Plugin Hub tabs, card rows, and explicit detail or confirmation footer actions', () => {
    const browse = tuiPluginHubPointerRegions({
      columns: 100,
      rows: 30,
      searchVisible: true,
      detail: false,
      confirmation: false,
      view: 'discover',
      phase: 'browse',
      tabs: pluginHubTabs,
      catalog: {
        line: 'Registry r7 · All Registry entries · All categories · Sort: Stars',
        installableLabel: 'All Registry entries',
        categoryLabel: 'All categories',
        sortLabel: 'Stars',
      },
      visibleStart: 4,
      rowHeights: [4, 5],
      context: 'PluginHub',
    })
    expect(browse.map(region => region.action)).toEqual([
      { id: 'pluginHub.toggleView', targetView: 'installed' },
      { id: 'pluginHub.toggleView', targetView: 'discover' },
      { id: 'pluginHub.toggleView', targetView: 'discovery' },
      { id: 'pluginHub.installable' },
      { id: 'pluginHub.category' },
      { id: 'pluginHub.sort' },
      { id: 'pluginHub.accept', index: 4 },
      { id: 'pluginHub.accept', index: 5 },
    ])
    expect(browse[3]?.rect).toEqual({ left: 17, top: 4, right: 36, bottom: 4 })
    expect(browse[4]?.rect).toEqual({ left: 40, top: 4, right: 53, bottom: 4 })
    expect(browse[5]?.rect).toEqual({ left: 63, top: 4, right: 67, bottom: 4 })
    expect(browse[6]?.rect).toEqual({ left: 3, top: 8, right: 98, bottom: 11 })
    expect(browse[7]?.rect).toEqual({ left: 3, top: 12, right: 98, bottom: 16 })

    const chineseCatalog = tuiPluginHubPointerRegions({
      columns: 80,
      rows: 24,
      searchVisible: true,
      detail: false,
      confirmation: false,
      view: 'discover',
      phase: 'browse',
      tabs: {
        line: '已安装 · Registry 收录 · GitHub 仓库',
        installedLabel: '已安装', registryLabel: 'Registry 收录', repositoriesLabel: 'GitHub 仓库',
      },
      catalog: {
        line: 'Registry r7 · 全部收录 · 全部分类 · 排序：最近更新 · 变更方式：外部 CLI',
        installableLabel: '全部收录',
        categoryLabel: '全部分类',
        sortLabel: '最近更新',
      },
      visibleStart: 0,
      rowHeights: [],
      context: 'PluginHub',
    })
    expect(chineseCatalog[3]?.action).toEqual({ id: 'pluginHub.installable' })
    expect(chineseCatalog[4]?.action).toEqual({ id: 'pluginHub.category' })
    expect(chineseCatalog[5]?.action).toEqual({ id: 'pluginHub.sort' })

    const noCategories = tuiPluginHubPointerRegions({
      columns: 80,
      rows: 24,
      searchVisible: true,
      detail: false,
      confirmation: false,
      view: 'discover',
      phase: 'browse',
      tabs: pluginHubTabs,
      catalog: {
        line: 'Registry r7 · All Registry entries · All categories · Sort: Stars',
        installableLabel: 'All Registry entries',
        sortLabel: 'Stars',
      },
      visibleStart: 0,
      rowHeights: [],
      context: 'PluginHub',
    })
    expect(noCategories.map(region => region.action)).toEqual([
      { id: 'pluginHub.toggleView', targetView: 'installed' },
      { id: 'pluginHub.toggleView', targetView: 'discover' },
      { id: 'pluginHub.toggleView', targetView: 'discovery' },
      { id: 'pluginHub.installable' },
      { id: 'pluginHub.sort' },
    ])

    const discovery = tuiPluginHubPointerRegions({
      columns: 80, rows: 24, searchVisible: true, detail: false, confirmation: false,
      view: 'discovery', phase: 'browse', tabs: pluginHubTabs,
      visibleStart: 0, rowHeights: [2], context: 'PluginHub',
    })
    expect(discovery.at(-1)?.action).toEqual({ id: 'pluginHub.accept', index: 0 })

    const detail = tuiPluginHubPointerRegions({
      columns: 80,
      rows: 24,
      searchVisible: false,
      detail: true,
      confirmation: false,
      view: 'installed',
      phase: 'detail',
      tabs: pluginHubTabs,
      visibleStart: 0,
      rowHeights: [],
      context: 'PluginHub',
    })
    expect(detail.at(-1)?.action).toEqual({ id: 'pluginHub.close' })
    expect(detail.at(-1)?.rect).toEqual({ left: 1, top: 24, right: 80, bottom: 24 })

    const discoveryDetail = tuiPluginHubPointerRegions({
      columns: 80, rows: 24, searchVisible: false, detail: true, confirmation: false,
      view: 'discovery', phase: 'detail', tabs: pluginHubTabs,
      detailLinks: [{ rowOffset: 4, text: '  Repository: https://github.com/example/discovery' }],
      visibleStart: 0, rowHeights: [], context: 'PluginHub',
    })
    expect(discoveryDetail.find(region => region.id === 'pluginHub:detail-link:0')).toMatchObject({
      rect: { left: 3, top: 8, right: 52, bottom: 8 },
      action: { id: 'pluginHub.openRepository' },
    })
    expect(discoveryDetail.at(-1)?.action).toEqual({ id: 'pluginHub.openRepository' })

    const confirmation = tuiPluginHubPointerRegions({
      columns: 80,
      rows: 24,
      searchVisible: false,
      detail: false,
      confirmation: true,
      view: 'discover',
      phase: 'confirm',
      tabs: pluginHubTabs,
      visibleStart: 0,
      rowHeights: [],
      context: 'PluginHub',
    })
    expect(confirmation).toHaveLength(1)
    expect(confirmation[0]?.action).toEqual({ id: 'pluginHub.accept' })
  })

  it('maps Resume scope tabs, bounded rows, preview, and the existing accept action', () => {
    const regions = tuiResumePointerRegions({
      columns: 120,
      rows: 32,
      narrow: false,
      previewVisible: true,
      listVisible: true,
      phase: 'ready',
      confirmation: false,
      visibleStart: 2,
      visibleCount: 2,
      rowHeight: 4,
      context: 'Dialog',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'resume.scope', scope: 'workspace' },
      { id: 'resume.scope', scope: 'all' },
      { id: 'resume.accept', index: 2 },
      { id: 'resume.accept', index: 3 },
      { id: 'resume.accept' },
      { id: 'resume.accept' },
    ])
    expect(regions[2]?.rect).toEqual({ left: 3, top: 9, right: 65, bottom: 12 })
    expect(regions[4]?.rect).toEqual({ left: 66, top: 9, right: 118, bottom: 30 })
    expect(regions.at(-1)?.rect).toEqual({ left: 1, top: 32, right: 120, bottom: 32 })

    expect(tuiResumePointerRegions({
      columns: 80,
      rows: 24,
      narrow: true,
      previewVisible: true,
      listVisible: false,
      phase: 'ready',
      confirmation: true,
      visibleStart: 0,
      visibleCount: 1,
      rowHeight: 4,
      context: 'Dialog',
    })).toEqual([])
  })

  it('maps question options and the answer submit row to dialog-owned actions', () => {
    const regions = tuiQuestionPointerRegions({
      columns: 90,
      optionTop: 12,
      optionStart: 3,
      visibleCount: 2,
      rowHeight: 2,
      acceptRow: 22,
      context: 'Dialog',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'dialog.option', index: 3 },
      { id: 'dialog.option', index: 4 },
      { id: 'dialog.accept' },
    ])
    expect(regions[1]?.rect).toEqual({ left: 2, top: 14, right: 89, bottom: 15 })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 12, row: 15 }, 'Dialog')?.region.action).toEqual({
      id: 'dialog.option', index: 4,
    })
    expect(registry.hitTest({ column: 12, row: 22 }, 'Dialog')?.region.action).toEqual({ id: 'dialog.accept' })
  })

  it('maps Approval decisions, modal close, and suggestion acceptance', () => {
    const approval = tuiApprovalPointerRegions({ columns: 80, actionRow: 21, context: 'Approval' })
    expect(approval[0]?.rect).toEqual({ left: 1, top: 21, right: 40, bottom: 21 })
    expect(approval[1]?.action).toEqual({ id: 'approval.reject' })
    const visibleLabels = tuiApprovalPointerRegions({
      columns: 80,
      actionRow: 21,
      allowRange: { left: 22, right: 28 },
      rejectRange: { left: 32, right: 39 },
      context: 'Approval',
    })
    expect(visibleLabels.map(region => region.rect)).toEqual([
      { left: 22, top: 21, right: 28, bottom: 21 },
      { left: 32, top: 21, right: 39, bottom: 21 },
    ])
    const close = tuiModalClosePointerRegions({
      columns: 80, row: 24, context: 'Detail', id: 'detail:close', action: 'detail.close',
    })
    expect(close[0]?.action).toEqual({ id: 'detail.close' })
    const suggestions = tuiSuggestionPointerRegions({
      columns: 70, top: 16, visibleStart: 2, visibleCount: 2, context: 'Composer',
    })
    expect(suggestions.map(region => region.action)).toEqual([
      { id: 'suggestion.accept', index: 2 },
      { id: 'suggestion.accept', index: 3 },
    ])
  })
})
