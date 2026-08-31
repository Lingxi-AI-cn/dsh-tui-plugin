import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import { tuiFooterPointerTargets } from '../src/footer.ts'
import {
  TuiPointerRegionRegistry, tuiApprovalPointerRegions, tuiFooterPointerRegions, tuiModalClosePointerRegions,
  tuiPluginHubPointerRegions, tuiProviderPointerRegions, tuiQuestionPointerRegions, tuiQueuePointerRegions,
  tuiResumePointerRegions, tuiSessionManagerPointerRegions, tuiSuggestionPointerRegions,
  tuiActivityPointerRegions, tuiAttachmentRailPointerRegions, tuiDeliverableActionPointerRegions, tuiDeliverableInlinePointerRegions,
  tuiAssistantOutputPointerRegions,
  tuiDeliverablesPointerRegions,
  tuiFeedbackPointerRegions,
  tuiDialogFooterPointerRegions,
  tuiRewindCandidatePointerRegions,
  tuiHostPluginCenterPointerRegions, tuiPresetManagerPointerRegions, tuiSchedulePointerRegions,
  tuiTrajectoryPointerRegions,
  tuiWorkPointerRegions, type TuiPointerRegion,
} from '../src/pointer.ts'
import { projectTuiScreenMap } from '../src/screen-map.ts'

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
  it('maps assistant view, copy, and export labels to independent cells', () => {
    const line = '点击查看 · 点击复制 · 点击导出'
    const regions = tuiAssistantOutputPointerRegions({
      columns: 80,
      row: 18,
      lineLeft: 4,
      line,
      labels: { open: '点击查看', copy: '点击复制', exportMarkdown: '点击导出' },
      key: 'assistant:1',
      index: 3,
      context: 'Composer',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'transcript.output', key: 'assistant:1', index: 3, operation: 'open' },
      { id: 'transcript.output', key: 'assistant:1', index: 3, operation: 'copy' },
      { id: 'transcript.output', key: 'assistant:1', index: 3, operation: 'export' },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 15, row: 18 }, 'Composer')?.region.action)
      .toEqual({ id: 'transcript.output', key: 'assistant:1', index: 3, operation: 'copy' })
  })

  it('maps visible activity rows directly to tool drill-down', () => {
    const regions = tuiActivityPointerRegions({
      columns: 80, startRow: 9, visibleStart: 2, visibleCount: 3, total: 8, context: 'Detail',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'activity.open', index: 2 },
      { id: 'activity.open', index: 3 },
      { id: 'activity.open', index: 4 },
    ])
    expect(regions.map(region => region.rect.top)).toEqual([9, 10, 11])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 12, row: 10 }, 'Detail')?.region.action)
      .toEqual({ id: 'activity.open', index: 3 })
  })

  it('maps feedback detail actions to the exact assistant message identity', () => {
    const regions = tuiFeedbackPointerRegions({
      columns: 80,
      row: 12,
      hasFeedback: true,
      messageId: 'assistant-1',
      labels: { like: 'Like (L)', dislike: 'Dislike (D)', note: 'Note (N)', clear: 'Clear (X)' },
      context: 'Detail',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'feedback.like', messageId: 'assistant-1' },
      { id: 'feedback.dislike', messageId: 'assistant-1' },
      { id: 'feedback.note', messageId: 'assistant-1' },
      { id: 'feedback.clear', messageId: 'assistant-1' },
    ])
    expect(regions.every(region => region.rect.top === 12 && region.rect.bottom === 12)).toBe(true)
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 3, row: 12 }, 'Detail')?.region.action)
      .toEqual({ id: 'feedback.like', messageId: 'assistant-1' })
    expect(registry.hitTest({ column: 3, row: 13 }, 'Detail')).toBeUndefined()
  })

  it('maps a verified inline deliverable across soft wraps without claiming adjacent prose', () => {
    const map = projectTuiScreenMap([
      { semanticBlockKey: 'event:closing', gutter: '   ', text: 'Assistant', selectable: false },
      { semanticBlockKey: 'event:closing', gutter: '   ', text: 'Done src/output.ts now', selectable: true },
    ], { columns: 12, bidi: 'visual' })
    const regions = tuiDeliverableInlinePointerRegions({
      map,
      topRow: 5,
      references: [{
        semanticBlockKey: 'event:closing', text: 'src/output.ts', path: 'src/output.ts', itemIndex: 0,
      }],
      openerAvailable: true,
      context: 'Transcript',
    })
    expect(regions).toHaveLength(2)
    expect(regions.map(region => region.action)).toEqual([
      { id: 'deliverables.inline', path: 'src/output.ts', mode: 'open' },
      { id: 'deliverables.inline', path: 'src/output.ts', mode: 'open' },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 4, row: 6 }, 'Transcript')).toBeUndefined()
    expect(regions.every(region => region.rect.top >= 6 && region.rect.bottom === region.rect.top)).toBe(true)

    const copy = tuiDeliverableInlinePointerRegions({
      map,
      topRow: 5,
      references: [{
        semanticBlockKey: 'event:closing', text: 'src/output.ts', path: 'src/output.ts', itemIndex: 0,
      }],
      openerAvailable: false,
      context: 'Composer',
    })
    expect(copy[0]?.action).toEqual({ id: 'deliverables.inline', path: 'src/output.ts', mode: 'copy' })
  })

  it('maps only visible deliverable paths to their complete item indexes', () => {
    const regions = tuiDeliverablesPointerRegions({
      columns: 60, startRow: 8, visibleStart: 2, visibleCount: 3, total: 6, context: 'Detail',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'deliverables.open', index: 2 },
      { id: 'deliverables.open', index: 3 },
      { id: 'deliverables.open', index: 4 },
    ])
    expect(regions.map(region => region.rect.top)).toEqual([8, 9, 10])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 5, row: 10 }, 'Detail')?.region.action)
      .toEqual({ id: 'deliverables.open', index: 4 })
    expect(registry.hitTest({ column: 5, row: 11 }, 'Detail')).toBeUndefined()

    const line = 'Up/Down select · C copy path · O open on Host'
    const actions = tuiDeliverableActionPointerRegions({
      columns: 60,
      row: 12,
      line,
      copyLabel: 'C copy path',
      openLabel: 'O open on Host',
      context: 'Detail',
    })
    expect(actions.map(region => ({ rect: region.rect, action: region.action }))).toEqual([
      { rect: { left: 20, top: 12, right: 30, bottom: 12 }, action: { id: 'deliverables.copy' } },
      { rect: { left: 34, top: 12, right: 47, bottom: 12 }, action: { id: 'deliverables.open' } },
    ])
    registry.replace(actions)
    expect(registry.hitTest({ column: 15, row: 12 }, 'Detail')).toBeUndefined()
    expect(registry.hitTest({ column: 20, row: 12 }, 'Detail')?.region.action)
      .toEqual({ id: 'deliverables.copy' })
  })

  it('maps every attachment remove control to its physical rail row and bounded right edge', () => {
    const regions = tuiAttachmentRailPointerRegions({
      columns: 100, startRow: 18, count: 2, left: 20, right: 80, context: 'Composer',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'attachment.remove', index: 0 },
      { id: 'attachment.remove', index: 1 },
    ])
    expect(regions.map(region => region.rect)).toEqual([
      { left: 76, top: 18, right: 80, bottom: 18 },
      { left: 76, top: 19, right: 80, bottom: 19 },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 75, row: 18 }, 'Composer')).toBeUndefined()
    expect(registry.hitTest({ column: 78, row: 19 }, 'Composer')?.region.action)
      .toEqual({ id: 'attachment.remove', index: 1 })
    expect(registry.hitTest({ column: 78, row: 20 }, 'Composer')).toBeUndefined()
  })

  it('keeps Preset, Host Plugin, and Trajectory list hit boxes on their rendered row blocks', () => {
    const builders = [
      tuiPresetManagerPointerRegions,
      tuiHostPluginCenterPointerRegions,
      tuiSchedulePointerRegions,
      tuiTrajectoryPointerRegions,
    ] as const
    for (const build of builders) {
      const regions = build({
        columns: 80,
        rows: 24,
        listVisible: true,
        visibleStart: 4,
        visibleCount: 2,
        rowHeight: 2,
        footerActions: [],
        context: 'Dialog',
      })
      const registry = new TuiPointerRegionRegistry()
      registry.replace(regions)
      expect(registry.hitTest({ column: 10, row: 8 }, 'Dialog')?.region.action)
        .toMatchObject({ index: 4 })
      expect(registry.hitTest({ column: 10, row: 9 }, 'Dialog')?.region.action)
        .toMatchObject({ index: 5 })
      expect(registry.hitTest({ column: 10, row: 10 }, 'Dialog')?.region.action)
        .toMatchObject({ index: 5 })
      expect(registry.hitTest({ column: 10, row: 11 }, 'Dialog')).toBeUndefined()
      expect(registry.hitTest({ column: 10, row: 24 }, 'Dialog')?.region.action.id).toMatch(/\.close$/u)
    }
  })

  it('maps localized Host Plugin tabs and the shifted list to their exact physical cells', () => {
    const regions = tuiHostPluginCenterPointerRegions({
      columns: 80,
      rows: 24,
      listVisible: true,
      visibleStart: 0,
      visibleCount: 1,
      rowHeight: 2,
      listTop: 9,
      tabs: { row: 4, left: 3, labels: { plugins: '已加载', presets: 'Preset', settings: '配置' } },
      footerActions: [],
      context: 'Dialog',
    })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 3, row: 4 }, 'Dialog')?.region.action)
      .toEqual({ id: 'hostPlugins.tab', tab: 'plugins' })
    expect(registry.hitTest({ column: 12, row: 4 }, 'Dialog')?.region.action)
      .toEqual({ id: 'hostPlugins.tab', tab: 'presets' })
    expect(registry.hitTest({ column: 21, row: 4 }, 'Dialog')?.region.action)
      .toEqual({ id: 'hostPlugins.tab', tab: 'settings' })
    expect(registry.hitTest({ column: 9, row: 4 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 3, row: 5 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 10, row: 9 }, 'Dialog')?.region.action)
      .toEqual({ id: 'hostPlugins.accept', index: 0 })
    expect(registry.hitTest({ column: 10, row: 8 }, 'Dialog')).toBeUndefined()
  })

  it('maps Host Settings fields and every visible editor action', () => {
    const regions = tuiHostPluginCenterPointerRegions({
      columns: 90,
      rows: 28,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      settingsFields: { rowTop: 10, count: 2, rowHeight: 2 },
      footerActions: [
        { id: 'hostPlugins.edit' }, { id: 'hostPlugins.cycle' }, { id: 'hostPlugins.save' },
        { id: 'hostPlugins.discard' }, { id: 'hostPlugins.reset' }, { id: 'hostPlugins.close' },
      ],
      context: 'Dialog',
    })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 10, row: 10 }, 'Dialog')?.region.action)
      .toEqual({ id: 'hostPlugins.field', index: 0 })
    expect(registry.hitTest({ column: 10, row: 13 }, 'Dialog')?.region.action)
      .toEqual({ id: 'hostPlugins.field', index: 1 })
    expect(registry.hitTest({ column: 10, row: 14 }, 'Dialog')).toBeUndefined()
    expect(regions.slice(-6).map(region => region.action.id)).toEqual([
      'hostPlugins.edit', 'hostPlugins.cycle', 'hostPlugins.save',
      'hostPlugins.discard', 'hostPlugins.reset', 'hostPlugins.close',
    ])
  })

  it('anchors sparse footer actions to their actual rendered labels', () => {
    const line = 'Enter Detail · F Filter · R Retry · Esc Close'
    const regions = tuiHostPluginCenterPointerRegions({
      columns: 80,
      rows: 24,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      footerActions: [
        { action: { id: 'hostPlugins.filter' }, label: 'F Filter' },
        { action: { id: 'hostPlugins.refresh' }, label: 'R Retry' },
        { action: { id: 'hostPlugins.close' }, label: 'Esc Close' },
      ],
      footerLine: line,
      context: 'Dialog',
    })
    expect(regions.map(region => region.rect)).toEqual([
      { left: 18, top: 24, right: 25, bottom: 24 },
      { left: 29, top: 24, right: 35, bottom: 24 },
      { left: 39, top: 24, right: 47, bottom: 24 },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 4, row: 24 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 19, row: 24 }, 'Dialog')?.region.action)
      .toEqual({ id: 'hostPlugins.filter' })
  })

  it('maps Host Plugin list footer detail actions for both tabs without claiming separators', () => {
    const cases = [
      {
        line: 'Enter Detail · F Filter · R Retry · Esc Close',
        actions: [
          { action: { id: 'hostPlugins.accept' as const }, label: 'Enter Detail' },
          { action: { id: 'hostPlugins.filter' as const }, label: 'F Filter' },
          { action: { id: 'hostPlugins.refresh' as const }, label: 'R Retry' },
          { action: { id: 'hostPlugins.close' as const }, label: 'Esc Close' },
        ],
      },
      {
        line: 'Enter 详情 · R 重试 · Esc 关闭',
        actions: [
          { action: { id: 'hostPlugins.accept' as const }, label: 'Enter 详情' },
          { action: { id: 'hostPlugins.refresh' as const }, label: 'R 重试' },
          { action: { id: 'hostPlugins.close' as const }, label: 'Esc 关闭' },
        ],
      },
    ] as const
    for (const candidate of cases) {
      const regions = tuiHostPluginCenterPointerRegions({
        columns: 80,
        rows: 24,
        listVisible: false,
        visibleStart: 0,
        visibleCount: 0,
        rowHeight: 2,
        footerActions: candidate.actions,
        footerLine: candidate.line,
        context: 'Dialog',
      })
      const registry = new TuiPointerRegionRegistry()
      registry.replace(regions)
      expect(registry.hitTest({ column: 3, row: 24 }, 'Dialog')?.region.action)
        .toEqual({ id: 'hostPlugins.accept' })
      expect(registry.hitTest({
        column: 3 + stringWidth(candidate.line.slice(0, candidate.line.indexOf(' · '))),
        row: 24,
      }, 'Dialog')).toBeUndefined()
      expect(registry.hitTest({ column: 3, row: 23 }, 'Dialog')).toBeUndefined()
    }
  })

  it('anchors dialog actions from the rendered line start across CJK text', () => {
    const line = '回退 1/3 · 上/下选择人类 turn · Enter 检查 · Esc 关闭'
    const regions = tuiDialogFooterPointerRegions({
      id: 'rewind',
      columns: 80,
      row: 24,
      lineLeft: 2,
      line,
      actions: [
        { action: { id: 'rewind.accept' }, label: 'Enter 检查' },
        { action: { id: 'rewind.close' }, label: 'Esc 关闭' },
      ],
    })
    expect(regions.map(region => region.rect)).toEqual([
      { left: 34, top: 24, right: 43, bottom: 24 },
      { left: 47, top: 24, right: 54, bottom: 24 },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 31, row: 24 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 47, row: 24 }, 'Dialog')?.region.action)
      .toEqual({ id: 'rewind.close' })
  })

  it('keeps navigation hints inert while mapping only the exact modal close label', () => {
    const helpLine = '帮助 上/下 · PgUp/PgDn · Esc 关闭'
    const help = tuiDialogFooterPointerRegions({
      id: 'help', columns: 80, row: 24, lineLeft: 2, line: helpLine,
      actions: [{ action: { id: 'dialog.close' }, label: 'Esc 关闭' }],
    })
    const helpRegistry = new TuiPointerRegionRegistry()
    helpRegistry.replace(help)
    expect(helpRegistry.hitTest({ column: 3, row: 24 }, 'Dialog')).toBeUndefined()
    expect(helpRegistry.hitTest({
      column: 2 + stringWidth(helpLine.slice(0, helpLine.indexOf('PgUp/PgDn'))), row: 24,
    }, 'Dialog')).toBeUndefined()
    expect(helpRegistry.hitTest({
      column: 2 + stringWidth(helpLine.slice(0, helpLine.indexOf('Esc 关闭'))), row: 24,
    }, 'Dialog')?.region.action).toEqual({ id: 'dialog.close' })

    const detailLine = 'Detail PgUp/Dn · Enter/Esc close'
    const detail = tuiDialogFooterPointerRegions({
      id: 'detail', columns: 80, row: 24, lineLeft: 2, line: detailLine,
      actions: [{ action: { id: 'detail.close' }, label: 'Enter/Esc close' }],
      context: 'Detail',
    })
    const detailRegistry = new TuiPointerRegionRegistry()
    detailRegistry.replace(detail)
    expect(detailRegistry.hitTest({ column: 3, row: 24 }, 'Detail')).toBeUndefined()
    expect(detailRegistry.hitTest({
      column: 2 + stringWidth(detailLine.slice(0, detailLine.indexOf('Enter/Esc close'))), row: 24,
    }, 'Detail')?.region.action).toEqual({ id: 'detail.close' })
    expect(detailRegistry.hitTest({ column: 30, row: 24 }, 'Dialog')).toBeUndefined()
    expect(detailRegistry.hitTest({ column: 30, row: 23 }, 'Detail')).toBeUndefined()

    const outputLine = 'Y Copy output · M Export Markdown · PgUp/PgDn · Enter/Esc close'
    const output = tuiDialogFooterPointerRegions({
      id: 'output', columns: 80, row: 24, lineLeft: 2, line: outputLine,
      actions: [
        { action: { id: 'detail.copy' }, label: 'Y Copy output' },
        { action: { id: 'detail.exportMarkdown' }, label: 'M Export Markdown' },
        { action: { id: 'detail.close' }, label: 'Enter/Esc close' },
      ],
      context: 'Detail',
    })
    expect(output.map(region => region.action)).toEqual([
      { id: 'detail.copy' }, { id: 'detail.exportMarkdown' }, { id: 'detail.close' },
    ])
  })

  it('does not invent a pointer region when an exact footer label is absent', () => {
    const regions = tuiDialogFooterPointerRegions({
      id: 'strict', columns: 80, row: 24, line: 'Enter open · Esc close',
      actions: [
        { action: { id: 'dialog.accept' }, label: 'Enter open' },
        { action: { id: 'dialog.close' }, label: 'R refresh' },
        { action: { id: 'dialog.close' }, label: 'Esc close' },
      ],
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'dialog.accept' },
      { id: 'dialog.close' },
    ])
    expect(regions[1]?.rect).toEqual({ left: 16, top: 24, right: 24, bottom: 24 })
  })

  it('maps transcript browse Open and Composer actions without claiming navigation hints', () => {
    const line = '浏览 ↑/↓ · Enter 查看详情 · Esc 返回输入框'
    const regions = tuiDialogFooterPointerRegions({
      id: 'transcript:browse', columns: 80, row: 24, lineLeft: 2, line,
      actions: [
        { action: { id: 'transcript.openFocused' }, label: 'Enter 查看详情' },
        { action: { id: 'transcript.closeBrowse' }, label: 'Esc 返回输入框' },
      ],
      context: 'Transcript',
    })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 3, row: 24 }, 'Transcript')).toBeUndefined()
    expect(registry.hitTest({
      column: 2 + stringWidth(line.slice(0, line.indexOf('Enter 查看详情'))), row: 24,
    }, 'Transcript')?.region.action).toEqual({ id: 'transcript.openFocused' })
    expect(registry.hitTest({
      column: 2 + stringWidth(line.slice(0, line.indexOf('Esc 返回输入框'))), row: 24,
    }, 'Transcript')?.region.action).toEqual({ id: 'transcript.closeBrowse' })
    expect(registry.hitTest({ column: 30, row: 23 }, 'Transcript')).toBeUndefined()
  })

  it('maps only durable rewind candidate rows into the Dialog frame', () => {
    const regions = tuiRewindCandidatePointerRegions([
      region({
        id: 'transcript:event:11',
        rect: { left: 1, top: 5, right: 30, bottom: 6 },
        action: { id: 'transcript.focus', key: 'event:11', index: 3 },
      }),
      region({
        id: 'transcript:tool:12',
        rect: { left: 1, top: 7, right: 30, bottom: 7 },
        action: { id: 'transcript.focus', key: 'tool:12', index: 4 },
      }),
      region({
        id: 'transcript:event:7',
        rect: { left: 1, top: 8, right: 30, bottom: 9 },
        action: { id: 'transcript.focus', key: 'event:7', index: 1 },
      }),
    ], ['event:7', 'event:11'])
    expect(regions.map(candidate => ({
      id: candidate.id, rect: candidate.rect, context: candidate.context, action: candidate.action,
    }))).toEqual([
      {
        id: 'rewind:select:1', rect: { left: 1, top: 5, right: 30, bottom: 6 },
        context: 'Dialog', action: { id: 'rewind.select', index: 1 },
      },
      {
        id: 'rewind:select:0', rect: { left: 1, top: 8, right: 30, bottom: 9 },
        context: 'Dialog', action: { id: 'rewind.select', index: 0 },
      },
    ])
  })

  it('maps every Trajectory inspector tab without claiming separators or the next row', () => {
    const regions = tuiTrajectoryPointerRegions({
      columns: 80,
      rows: 24,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      inspectorTabs: {
        row: 8,
        left: 5,
        labels: { summary: 'Summary', input: 'Input', output: 'Output', timing: 'Timing' },
      },
      footerActions: [],
      context: 'Dialog',
    })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 5, row: 8 }, 'Dialog')?.region.action)
      .toEqual({ id: 'trajectory.tab', tab: 'summary' })
    expect(registry.hitTest({ column: 15, row: 8 }, 'Dialog')?.region.action)
      .toEqual({ id: 'trajectory.tab', tab: 'input' })
    expect(registry.hitTest({ column: 23, row: 8 }, 'Dialog')?.region.action)
      .toEqual({ id: 'trajectory.tab', tab: 'output' })
    expect(registry.hitTest({ column: 32, row: 8 }, 'Dialog')?.region.action)
      .toEqual({ id: 'trajectory.tab', tab: 'timing' })
    expect(registry.hitTest({ column: 12, row: 8 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 5, row: 9 }, 'Dialog')).toBeUndefined()
  })

  it('maps Trajectory list and inspector footer actions to their rendered labels', () => {
    const listLine = 'Enter Detail · F Fold · / Search · L Older · T Tail · Esc Close'
    const list = tuiTrajectoryPointerRegions({
      columns: 90,
      rows: 26,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      footerActions: [
        { action: { id: 'trajectory.accept' }, label: 'Enter Detail' },
        { action: { id: 'trajectory.fold' }, label: 'F Fold' },
        { action: { id: 'trajectory.search' }, label: '/ Search' },
        { action: { id: 'trajectory.older' }, label: 'L Older' },
        { action: { id: 'trajectory.tail' }, label: 'T Tail' },
        { action: { id: 'trajectory.close' }, label: 'Esc Close' },
      ],
      footerLine: listLine,
      context: 'Dialog',
    })
    const listRegistry = new TuiPointerRegionRegistry()
    listRegistry.replace(list)
    expect(listRegistry.hitTest({ column: 3, row: 26 }, 'Dialog')?.region.action)
      .toEqual({ id: 'trajectory.accept' })
    expect(listRegistry.hitTest({
      column: 3 + stringWidth(listLine.slice(0, listLine.indexOf(' · '))), row: 26,
    }, 'Dialog'))
      .toBeUndefined()
    expect(listRegistry.hitTest({ column: 3, row: 25 }, 'Dialog')).toBeUndefined()

    const detailLine = 'Tab 切换检查器 · Esc 返回'
    const detail = tuiTrajectoryPointerRegions({
      columns: 90,
      rows: 26,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      footerActions: [
        { action: { id: 'trajectory.cycleTab' }, label: 'Tab 切换检查器' },
        { action: { id: 'trajectory.close' }, label: 'Esc 返回' },
      ],
      footerLine: detailLine,
      context: 'Dialog',
    })
    const detailRegistry = new TuiPointerRegionRegistry()
    detailRegistry.replace(detail)
    expect(detailRegistry.hitTest({ column: 3, row: 26 }, 'Dialog')?.region.action)
      .toEqual({ id: 'trajectory.cycleTab' })
    expect(detailRegistry.hitTest({
      column: 3 + stringWidth(detailLine.slice(0, detailLine.indexOf('Esc 返回'))),
      row: 26,
    }, 'Dialog')?.region.action).toEqual({ id: 'trajectory.close' })
    expect(detailRegistry.hitTest({
      column: 3 + stringWidth(detailLine.slice(0, detailLine.indexOf(' · '))), row: 26,
    }, 'Dialog'))
      .toBeUndefined()
  })

  it('atomically restores the main pointer frame after a detail modal closes', () => {
    const registry = new TuiPointerRegionRegistry()
    const footer = tuiFooterPointerRegions([
      { id: 'model', label: 'model', value: 'fast', action: 'models', detailLines: [] },
    ], 40, 24, 'Composer')
    registry.replace(footer)
    expect(registry.hitTest({ column: 2, row: 24 }, 'Composer')?.region.action.id).toBe('footer.activate')

    registry.replace(tuiModalClosePointerRegions({
      columns: 40, row: 24, context: 'Detail', id: 'detail:close', action: 'detail.close',
    }))
    expect(registry.hitTest({ column: 2, row: 24 }, 'Composer')).toBeUndefined()
    expect(registry.hitTest({ column: 2, row: 24 }, 'Detail')?.region.action.id).toBe('detail.close')

    registry.replace(footer)
    expect(registry.hitTest({ column: 2, row: 24 }, 'Detail')).toBeUndefined()
    expect(registry.hitTest({ column: 2, row: 24 }, 'Composer')?.region.action.id).toBe('footer.activate')
  })

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
      { id: 'work.select', index: 4 },
      { id: 'work.select', index: 5 },
      { id: 'work.select', index: 6 },
    ])
    expect(regions.map(region => region.rect)).toEqual([
      { left: 2, top: 2, right: 78, bottom: 2 },
      { left: 2, top: 3, right: 78, bottom: 3 },
      { left: 2, top: 4, right: 78, bottom: 4 },
    ])
  })

  it('maps only capability-backed Work footer actions and leaves selection hints inert', () => {
    const line = '工作 3/5 · 上/下选择 · Enter 打开 · X 停止 · Esc 关闭'
    const regions = tuiWorkPointerRegions(5, 2, 8, 80, 'Work', {
      row: 24,
      line,
      lineLeft: 2,
      actions: [
        { action: { id: 'work.open' }, label: 'Enter 打开' },
        { action: { id: 'work.stop' }, label: 'X 停止' },
        { action: { id: 'work.close' }, label: 'Esc 关闭' },
      ],
    })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 3, row: 24 }, 'Work')).toBeUndefined()
    expect(registry.hitTest({
      column: 2 + stringWidth(line.slice(0, line.indexOf('上/下选择'))), row: 24,
    }, 'Work')).toBeUndefined()
    expect(registry.hitTest({
      column: 2 + stringWidth(line.slice(0, line.indexOf('Enter 打开'))), row: 24,
    }, 'Work')?.region.action).toEqual({ id: 'work.open' })
    expect(registry.hitTest({
      column: 2 + stringWidth(line.slice(0, line.indexOf('X 停止'))), row: 24,
    }, 'Work')?.region.action).toEqual({ id: 'work.stop' })
    expect(registry.hitTest({
      column: 2 + stringWidth(line.slice(0, line.indexOf('Esc 关闭'))), row: 24,
    }, 'Work')?.region.action).toEqual({ id: 'work.close' })
    expect(registry.hitTest({ column: 3, row: 23 }, 'Work')).toBeUndefined()
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

  it('maps only exact Plugin Hub footer labels and leaves instructions or separators inert', () => {
    const browseLine = 'Tab Installed · Shift+S sort · Type to search · Enter status · Shift+O open GitHub · R refresh · Esc close'
    const browse = tuiPluginHubPointerRegions({
      columns: 120,
      rows: 30,
      searchVisible: true,
      detail: false,
      confirmation: false,
      view: 'discovery',
      phase: 'browse',
      tabs: pluginHubTabs,
      visibleStart: 0,
      rowHeights: [],
      footerLine: browseLine,
      footerActions: [
        { action: { id: 'pluginHub.toggleView', targetView: 'installed' }, label: 'Tab Installed' },
        { action: { id: 'pluginHub.sort' }, label: 'Shift+S sort' },
        { action: { id: 'pluginHub.accept' }, label: 'Enter status' },
        { action: { id: 'pluginHub.openRepository' }, label: 'Shift+O open GitHub' },
        { action: { id: 'pluginHub.refresh' }, label: 'R refresh' },
        { action: { id: 'pluginHub.close' }, label: 'Esc close' },
      ],
      context: 'PluginHub',
    })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(browse)
    expect(registry.hitTest({ column: 3, row: 30 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.toggleView', targetView: 'installed' })
    expect(registry.hitTest({ column: 19, row: 30 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.sort' })
    expect(registry.hitTest({ column: 36, row: 30 }, 'PluginHub')).toBeUndefined()
    expect(registry.hitTest({ column: 53, row: 30 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.accept' })
    expect(registry.hitTest({ column: 68, row: 30 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.openRepository' })
    expect(registry.hitTest({ column: 90, row: 30 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.refresh' })
    expect(registry.hitTest({ column: 103, row: 30 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.close' })
    expect(registry.hitTest({ column: 3, row: 29 }, 'PluginHub')).toBeUndefined()

    const detailLine = 'Enter plan install · PgUp/PgDn scroll · Tab Installed · Esc back'
    const detail = tuiPluginHubPointerRegions({
      columns: 80,
      rows: 24,
      searchVisible: false,
      detail: true,
      confirmation: false,
      view: 'discover',
      phase: 'detail',
      tabs: pluginHubTabs,
      visibleStart: 0,
      rowHeights: [],
      footerLine: detailLine,
      footerActions: [
        { action: { id: 'pluginHub.accept' }, label: 'Enter plan install' },
        { action: { id: 'pluginHub.toggleView', targetView: 'installed' }, label: 'Tab Installed' },
        { action: { id: 'pluginHub.close' }, label: 'Esc back' },
      ],
      context: 'PluginHub',
    })
    registry.replace(detail)
    expect(registry.hitTest({ column: 3, row: 24 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.accept' })
    expect(registry.hitTest({ column: 25, row: 24 }, 'PluginHub')).toBeUndefined()
    expect(registry.hitTest({ column: 43, row: 24 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.toggleView', targetView: 'installed' })
    expect(registry.hitTest({ column: 59, row: 24 }, 'PluginHub')?.region.action)
      .toEqual({ id: 'pluginHub.close' })
  })

  it('maps Provider Center rows and detail authentication to their rendered physical lines', () => {
    const list = tuiProviderPointerRegions({
      columns: 80,
      rows: 24,
      detail: false,
      wizard: false,
      picker: false,
      canAdd: false,
      canAuthenticate: false,
      visibleStart: 3,
      visibleCount: 2,
      rowHeight: 2,
      candidateStart: 0,
      candidateCount: 0,
      context: 'Dialog',
    })
    expect(list.map(region => region.action)).toEqual([
      { id: 'provider.accept', index: 3 },
      { id: 'provider.accept', index: 4 },
      { id: 'provider.close' },
    ])
    expect(list[0]?.rect).toEqual({ left: 2, top: 4, right: 79, bottom: 5 })
    expect(list[1]?.rect).toEqual({ left: 2, top: 6, right: 79, bottom: 7 })
    expect(list[2]?.rect).toEqual({ left: 1, top: 24, right: 80, bottom: 24 })

    const detail = tuiProviderPointerRegions({
      columns: 80,
      rows: 24,
      detail: true,
      wizard: false,
      picker: false,
      canAdd: false,
      canAuthenticate: true,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      candidateStart: 0,
      candidateCount: 0,
      context: 'Dialog',
    })
    expect(detail).toHaveLength(1)
    expect(detail[0]?.action).toEqual({ id: 'provider.authenticate' })
    expect(detail[0]?.rect).toEqual({ left: 1, top: 24, right: 80, bottom: 24 })

    const detailedActions = tuiProviderPointerRegions({
      columns: 80,
      rows: 24,
      detail: true,
      wizard: false,
      picker: false,
      canAdd: false,
      canAuthenticate: false,
      detailActions: [
        { id: 'provider.editProfile', label: 'P profile' },
        { id: 'provider.close', label: 'Esc back' },
      ],
      profileFields: [
        { field: 'displayName', top: 5, bottom: 5 },
        { field: 'models', top: 6, bottom: 8 },
      ],
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      candidateStart: 0,
      candidateCount: 0,
      context: 'Dialog',
    })
    expect(detailedActions.map(region => region.action)).toEqual([
      { id: 'provider.profileField', field: 'displayName' },
      { id: 'provider.profileField', field: 'models' },
      { id: 'provider.editProfile' },
      { id: 'provider.close' },
    ])
    expect(detailedActions.map(region => region.rect)).toEqual([
      { left: 4, top: 5, right: 77, bottom: 5 },
      { left: 4, top: 6, right: 77, bottom: 8 },
      { left: 3, top: 24, right: 11, bottom: 24 },
      { left: 15, top: 24, right: 22, bottom: 24 },
    ])

    const wizard = tuiProviderPointerRegions({
      columns: 80,
      rows: 24,
      detail: false,
      wizard: true,
      picker: true,
      canAdd: true,
      canAuthenticate: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      candidateStart: 4,
      candidateCount: 2,
      context: 'Dialog',
    })
    expect(wizard.map(region => region.action)).toEqual([
      { id: 'provider.wizardToggle', index: 4 },
      { id: 'provider.wizardToggle', index: 5 },
      { id: 'provider.wizardAccept' },
      { id: 'provider.wizardBack' },
    ])
    expect(wizard[1]?.rect).toEqual({ left: 2, top: 6, right: 79, bottom: 6 })

    const protocol = tuiProviderPointerRegions({
      columns: 80,
      rows: 24,
      detail: false,
      wizard: true,
      picker: false,
      wizardListKind: 'protocol',
      canAdd: true,
      canAuthenticate: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      candidateStart: 0,
      candidateCount: 2,
      candidateTop: 5,
      context: 'Dialog',
    })
    expect(protocol.slice(0, 2).map(region => region.action)).toEqual([
      { id: 'provider.wizardSelect', index: 0 },
      { id: 'provider.wizardSelect', index: 1 },
    ])
    expect(protocol[1]?.rect).toEqual({ left: 2, top: 6, right: 79, bottom: 6 })

    const wizardFooterLine = 'Enter review · Ctrl-F fetch models · Esc back'
    const wizardFooter = tuiProviderPointerRegions({
      columns: 80,
      rows: 24,
      detail: false,
      wizard: true,
      picker: false,
      canAdd: true,
      canAuthenticate: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      candidateStart: 0,
      candidateCount: 0,
      footerActions: [
        { action: { id: 'provider.wizardAccept' }, label: 'Enter review' },
        { action: { id: 'provider.wizardDiscover' }, label: 'Ctrl-F fetch models' },
        { action: { id: 'provider.wizardBack' }, label: 'Esc back' },
      ],
      footerLine: wizardFooterLine,
      context: 'Dialog',
    })
    expect(wizardFooter.map(region => region.rect)).toEqual([
      { left: 3, top: 24, right: 14, bottom: 24 },
      { left: 18, top: 24, right: 36, bottom: 24 },
      { left: 40, top: 24, right: 47, bottom: 24 },
    ])
    const wizardRegistry = new TuiPointerRegionRegistry()
    wizardRegistry.replace(wizardFooter)
    expect(wizardRegistry.hitTest({ column: 15, row: 24 }, 'Dialog')).toBeUndefined()
    expect(wizardRegistry.hitTest({ column: 20, row: 24 }, 'Dialog')?.region.action)
      .toEqual({ id: 'provider.wizardDiscover' })

    const chineseListLine = '上下键选择 · Enter 查看详情 · A 添加自定义提供方 · R 刷新 · Esc 关闭'
    const chineseList = tuiProviderPointerRegions({
      columns: 80,
      rows: 24,
      detail: false,
      wizard: false,
      picker: false,
      canAdd: true,
      canAuthenticate: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      candidateStart: 0,
      candidateCount: 0,
      footerActions: [
        { action: { id: 'provider.accept' }, label: 'Enter 查看详情' },
        { action: { id: 'provider.add' }, label: 'A 添加自定义提供方' },
        { action: { id: 'provider.refresh' }, label: 'R 刷新' },
        { action: { id: 'provider.close' }, label: 'Esc 关闭' },
      ],
      footerLine: chineseListLine,
      context: 'Dialog',
    })
    expect(chineseList.map(region => region.rect)).toEqual([
      { left: 16, top: 24, right: 29, bottom: 24 },
      { left: 33, top: 24, right: 50, bottom: 24 },
      { left: 54, top: 24, right: 59, bottom: 24 },
      { left: 63, top: 24, right: 70, bottom: 24 },
    ])
    const listRegistry = new TuiPointerRegionRegistry()
    listRegistry.replace(chineseList)
    expect(listRegistry.hitTest({ column: 13, row: 24 }, 'Dialog')).toBeUndefined()
    expect(listRegistry.hitTest({ column: 54, row: 24 }, 'Dialog')?.region.action)
      .toEqual({ id: 'provider.refresh' })
  })

  it('maps the collapsed Queue card and full-screen queue actions to rendered rows', () => {
    expect(tuiQueuePointerRegions({
      columns: 80,
      rows: 24,
      open: false,
      detail: false,
      editing: false,
      confirmingDelete: false,
      canEdit: false,
      canDelete: false,
      collapsedRow: 19,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 1,
      context: 'Transcript',
    })).toEqual([expect.objectContaining({
      rect: { left: 1, top: 19, right: 80, bottom: 19 },
      action: { id: 'queue.open' },
    })])

    const list = tuiQueuePointerRegions({
      columns: 80,
      rows: 24,
      open: true,
      detail: false,
      editing: false,
      confirmingDelete: false,
      canEdit: true,
      canDelete: true,
      visibleStart: 3,
      visibleCount: 2,
      rowHeight: 2,
      context: 'Dialog',
    })
    expect(list.map(region => region.action)).toEqual([
      { id: 'queue.accept', index: 3 },
      { id: 'queue.accept', index: 4 },
      { id: 'queue.close' },
    ])
    expect(list[0]?.rect).toEqual({ left: 2, top: 4, right: 79, bottom: 5 })
    expect(list[1]?.rect).toEqual({ left: 2, top: 6, right: 79, bottom: 7 })

    const detail = tuiQueuePointerRegions({
      columns: 81,
      rows: 24,
      open: true,
      detail: true,
      editing: false,
      confirmingDelete: false,
      canEdit: true,
      canDelete: true,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      context: 'Dialog',
    })
    expect(detail.map(region => region.action)).toEqual([
      { id: 'queue.edit' },
      { id: 'queue.delete' },
      { id: 'queue.close' },
    ])
    expect(detail.map(region => region.rect)).toEqual([
      { left: 1, top: 24, right: 27, bottom: 24 },
      { left: 28, top: 24, right: 54, bottom: 24 },
      { left: 55, top: 24, right: 81, bottom: 24 },
    ])
  })

  it('anchors Queue actions to visible footer labels without claiming hints or separators', () => {
    const line = 'Up/Down select · Enter details · E edit · D delete · Esc close'
    const regions = tuiQueuePointerRegions({
      columns: 80,
      rows: 24,
      open: true,
      detail: false,
      editing: false,
      confirmingDelete: false,
      canEdit: true,
      canDelete: true,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 2,
      footerActions: [
        { action: { id: 'queue.accept' }, label: 'Enter details' },
        { action: { id: 'queue.edit' }, label: 'E edit' },
        { action: { id: 'queue.delete' }, label: 'D delete' },
        { action: { id: 'queue.close' }, label: 'Esc close' },
      ],
      footerLine: line,
      context: 'Dialog',
    })
    expect(regions.map(region => region.rect)).toEqual([
      { left: 20, top: 24, right: 32, bottom: 24 },
      { left: 36, top: 24, right: 41, bottom: 24 },
      { left: 45, top: 24, right: 52, bottom: 24 },
      { left: 56, top: 24, right: 64, bottom: 24 },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 4, row: 24 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 33, row: 24 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 45, row: 24 }, 'Dialog')?.region.action)
      .toEqual({ id: 'queue.delete' })
  })

  it('maps Session Manager tabs, visible rows, and detail actions without adjacent-row drift', () => {
    const list = tuiSessionManagerPointerRegions({
      columns: 90,
      rows: 28,
      listVisible: true,
      visibleStart: 5,
      visibleCount: 2,
      rowHeight: 3,
      tabs: { row: 4, left: 3, labels: { sessions: '会话', workspaces: '工作区' } },
      footerActions: [{ id: 'sessionManager.close' }],
      context: 'Dialog',
    })
    expect(list.map(region => region.action)).toEqual([
      { id: 'sessionManager.tab', tab: 'sessions' },
      { id: 'sessionManager.tab', tab: 'workspaces' },
      { id: 'sessionManager.accept', index: 5 },
      { id: 'sessionManager.accept', index: 6 },
      { id: 'sessionManager.close' },
    ])
    expect(list[2]?.rect).toEqual({ left: 2, top: 9, right: 89, bottom: 11 })
    expect(list[3]?.rect).toEqual({ left: 2, top: 12, right: 89, bottom: 14 })
    const registry = new TuiPointerRegionRegistry()
    registry.replace(list)
    expect(registry.hitTest({ column: 20, row: 11 }, 'Dialog')?.region.action)
      .toEqual({ id: 'sessionManager.accept', index: 5 })
    expect(registry.hitTest({ column: 20, row: 12 }, 'Dialog')?.region.action)
      .toEqual({ id: 'sessionManager.accept', index: 6 })
    expect(registry.hitTest({ column: 3, row: 4 }, 'Dialog')?.region.action)
      .toEqual({ id: 'sessionManager.tab', tab: 'sessions' })
    expect(registry.hitTest({ column: 10, row: 4 }, 'Dialog')?.region.action)
      .toEqual({ id: 'sessionManager.tab', tab: 'workspaces' })
    expect(registry.hitTest({ column: 7, row: 4 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: 3, row: 5 }, 'Dialog')).toBeUndefined()

    const browser = tuiSessionManagerPointerRegions({
      columns: 90,
      rows: 28,
      listVisible: true,
      visibleStart: 7,
      visibleCount: 2,
      rowHeight: 1,
      showTabs: false,
      footerActions: [{ id: 'sessionManager.accept' }, { id: 'sessionManager.close' }],
      context: 'Dialog',
    })
    expect(browser.map(region => region.action)).toEqual([
      { id: 'sessionManager.accept', index: 7 },
      { id: 'sessionManager.accept', index: 8 },
      { id: 'sessionManager.accept' },
      { id: 'sessionManager.close' },
    ])
    expect(browser[0]?.rect).toEqual({ left: 2, top: 9, right: 89, bottom: 9 })
    expect(browser[1]?.rect).toEqual({ left: 2, top: 10, right: 89, bottom: 10 })

    const detail = tuiSessionManagerPointerRegions({
      columns: 100,
      rows: 30,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 3,
      footerActions: [
        { id: 'sessionManager.rename' },
        { id: 'sessionManager.moveUp' },
        { id: 'sessionManager.moveDown' },
        { id: 'sessionManager.delete' },
        { id: 'sessionManager.close' },
      ],
      context: 'Dialog',
    })
    expect(detail.slice(-5).map(region => region.rect)).toEqual([
      { left: 1, top: 30, right: 20, bottom: 30 },
      { left: 21, top: 30, right: 40, bottom: 30 },
      { left: 41, top: 30, right: 60, bottom: 30 },
      { left: 61, top: 30, right: 80, bottom: 30 },
      { left: 81, top: 30, right: 100, bottom: 30 },
    ])

    const sessionDetail = tuiSessionManagerPointerRegions({
      columns: 90,
      rows: 28,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 3,
      footerActions: [
        { id: 'sessionManager.resume' },
        { id: 'sessionManager.fork' },
        { id: 'sessionManager.rename' },
        { id: 'sessionManager.archive' },
        { id: 'sessionManager.close' },
      ],
      context: 'Dialog',
    })
    const sessionRegistry = new TuiPointerRegionRegistry()
    sessionRegistry.replace(sessionDetail)
    expect(sessionRegistry.hitTest({ column: 25, row: 28 }, 'Dialog')?.region.action)
      .toEqual({ id: 'sessionManager.fork' })
  })

  it('maps every actionable Directory Browser footer label without claiming navigation hints', () => {
    const line = 'Up/Down select · Enter open/use · Left parent · ~ home · . hidden · R retry · Esc back'
    const regions = tuiSessionManagerPointerRegions({
      columns: 100,
      rows: 28,
      listVisible: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 1,
      showTabs: false,
      footerLine: line,
      footerActions: [
        { action: { id: 'sessionManager.accept' }, label: 'Enter open/use' },
        { action: { id: 'sessionManager.directoryParent' }, label: 'Left parent' },
        { action: { id: 'sessionManager.directoryHome' }, label: '~ home' },
        { action: { id: 'sessionManager.directoryHidden' }, label: '. hidden' },
        { action: { id: 'sessionManager.directoryRefresh' }, label: 'R retry' },
        { action: { id: 'sessionManager.close' }, label: 'Esc back' },
      ],
      context: 'Dialog',
    })
    expect(regions.map(region => region.action)).toEqual([
      { id: 'sessionManager.accept' },
      { id: 'sessionManager.directoryParent' },
      { id: 'sessionManager.directoryHome' },
      { id: 'sessionManager.directoryHidden' },
      { id: 'sessionManager.directoryRefresh' },
      { id: 'sessionManager.close' },
    ])
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 4, row: 28 }, 'Dialog')).toBeUndefined()
    expect(registry.hitTest({ column: line.indexOf('~ home') + 3, row: 28 }, 'Dialog')?.region.action)
      .toEqual({ id: 'sessionManager.directoryHome' })
    expect(registry.hitTest({ column: line.indexOf('R retry') + 3, row: 28 }, 'Dialog')?.region.action)
      .toEqual({ id: 'sessionManager.directoryRefresh' })
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
      scopeTabs: {
        row: 4, left: 2, workspaceLabel: '[当前工作区]', allLabel: ' 所有工作区 ', gap: ' ',
      },
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
    const registry = new TuiPointerRegionRegistry()
    registry.replace(regions)
    expect(registry.hitTest({ column: 2, row: 4 }, 'Dialog')?.region.action)
      .toEqual({ id: 'resume.scope', scope: 'workspace' })
    expect(registry.hitTest({ column: 17, row: 4 }, 'Dialog')?.region.action)
      .toEqual({ id: 'resume.scope', scope: 'all' })
    expect(registry.hitTest({ column: 14, row: 4 }, 'Dialog')).toBeUndefined()

    const footerLine = 'Type to search · Up/Down move · Tab scope · Enter resume · Shift+R resume and rename · Esc clear/close'
    const exact = tuiResumePointerRegions({
      columns: 120,
      rows: 32,
      narrow: false,
      previewVisible: false,
      listVisible: false,
      phase: 'ready',
      confirmation: false,
      visibleStart: 0,
      visibleCount: 0,
      rowHeight: 4,
      footerActions: [
        { action: { id: 'resume.scope', scope: 'all' }, label: 'Tab scope' },
        { action: { id: 'resume.accept' }, label: 'Enter resume' },
        { action: { id: 'resume.rename' }, label: 'Shift+R resume and rename' },
        { action: { id: 'resume.close' }, label: 'Esc clear/close' },
      ],
      footerLine,
      context: 'Dialog',
    })
    expect(exact.map(region => region.rect)).toEqual([
      { left: 3, top: 4, right: 16, bottom: 4 },
      { left: 18, top: 4, right: 31, bottom: 4 },
      { left: 35, top: 32, right: 43, bottom: 32 },
      { left: 47, top: 32, right: 58, bottom: 32 },
      { left: 62, top: 32, right: 86, bottom: 32 },
      { left: 90, top: 32, right: 104, bottom: 32 },
    ])
    const exactRegistry = new TuiPointerRegionRegistry()
    exactRegistry.replace(exact)
    expect(exactRegistry.hitTest({ column: 5, row: 32 }, 'Dialog')).toBeUndefined()
    expect(exactRegistry.hitTest({ column: 62, row: 32 }, 'Dialog')?.region.action)
      .toEqual({ id: 'resume.rename' })

    const confirmationLine = 's stash and resume · d discard and resume · Esc cancel'
    const confirmation = tuiResumePointerRegions({
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
      footerActions: [
        { action: { id: 'resume.stash' }, label: 's stash and resume' },
        { action: { id: 'resume.discard' }, label: 'd discard and resume' },
        { action: { id: 'resume.close' }, label: 'Esc cancel' },
      ],
      footerLine: confirmationLine,
      context: 'Dialog',
    })
    expect(confirmation.map(region => region.action)).toEqual([
      { id: 'resume.stash' }, { id: 'resume.discard' }, { id: 'resume.close' },
    ])

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
