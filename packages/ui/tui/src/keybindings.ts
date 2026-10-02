/** Native-TUI interaction actions, contexts, defaults, and settings overrides. */

import { z } from './host.ts'
import { tuiInteractionContextLabel, type TuiLocale } from './locale.ts'
import { terminalWrappedLines } from './viewport.ts'

/** Input ownership contexts supported by the native TUI. */
export type TuiInteractionContext =
  | 'Global'
  | 'Composer'
  | 'Suggestion'
  | 'HistorySearch'
  | 'TranscriptSearch'
  | 'Transcript'
  | 'Detail'
  | 'PluginHub'
  | 'Dialog'
  | 'Work'
  | 'Footer'
  | 'Approval'

/** Stable action identifiers consumed by input dispatch and help rendering. */
export type TuiInteractionActionId =
  | 'app.interrupt'
  | 'view.root'
  | 'composer.submit'
  | 'composer.newline'
  | 'composer.historyPrevious'
  | 'composer.historyNext'
  | 'composer.historySearch'
  | 'composer.transcriptSearch'
  | 'composer.stash'
  | 'composer.undo'
  | 'composer.redo'
  | 'composer.externalEditor'
  | 'composer.clipboardPaste'
  | 'composer.openModels'
  | 'composer.openResume'
  | 'composer.openQueue'
  | 'composer.openGoalPlan'
  | 'composer.openFooter'
  | 'composer.cancel'
  | 'composer.transcriptPreviousPage'
  | 'composer.transcriptNextPage'
  | 'composer.transcriptPreviousTurn'
  | 'composer.transcriptNextTurn'
  | 'composer.transcriptOldest'
  | 'composer.transcriptLatest'
  | 'suggestion.previous'
  | 'suggestion.next'
  | 'suggestion.accept'
  | 'suggestion.dismiss'
  | 'historySearch.next'
  | 'historySearch.accept'
  | 'historySearch.cancel'
  | 'transcriptSearch.next'
  | 'transcriptSearch.previous'
  | 'transcriptSearch.accept'
  | 'transcriptSearch.cancel'
  | 'transcript.open'
  | 'transcript.previous'
  | 'transcript.next'
  | 'transcript.previousTurn'
  | 'transcript.nextTurn'
  | 'transcript.inspect'
  | 'transcript.copy'
  | 'transcript.close'
  | 'detail.previousPage'
  | 'detail.nextPage'
  | 'detail.copy'
  | 'detail.exportMarkdown'
  | 'detail.toggleScope'
  | 'detail.feedbackPositive'
  | 'detail.feedbackNegative'
  | 'detail.feedbackNote'
  | 'detail.feedbackClear'
  | 'detail.previousItem'
  | 'detail.nextItem'
  | 'detail.copyPath'
  | 'detail.openPath'
  | 'detail.close'
  | 'pluginHub.close'
  | 'pluginHub.previous'
  | 'pluginHub.next'
  | 'pluginHub.previousPage'
  | 'pluginHub.nextPage'
  | 'pluginHub.accept'
  | 'pluginHub.toggleView'
  | 'pluginHub.search'
  | 'pluginHub.refresh'
  | 'pluginHub.sort'
  | 'pluginHub.category'
  | 'pluginHub.installable'
  | 'pluginHub.openRepository'
  | 'dialog.previous'
  | 'dialog.next'
  | 'dialog.accept'
  | 'dialog.cancel'
  | 'dialog.skipQuestion'
  | 'dialog.previousPage'
  | 'dialog.nextPage'
  | 'work.previous'
  | 'work.next'
  | 'work.cancel'
  | 'work.inspect'
  | 'work.close'
  | 'footer.previous'
  | 'footer.next'
  | 'footer.activate'
  | 'footer.close'
  | 'approval.previous'
  | 'approval.next'
  | 'approval.previousPage'
  | 'approval.nextPage'
  | 'approval.allowOnce'
  | 'approval.reject'
  | 'help.open'

/** One normalized key or command gesture attached to an interaction action. */
export interface TuiInteractionBinding {
  /** Stable lowercase sequence used by input matching. */
  readonly sequence: string
  /** User-facing sequence that preserves familiar key spelling. */
  readonly label: string
  /** Whether input dispatch or the command registry owns the gesture. */
  readonly kind: 'key' | 'command'
}

/** One immutable action shown by the interaction help panel. */
export interface TuiInteractionDescriptor {
  /** Stable package-owned action identifier. */
  readonly id: TuiInteractionActionId
  /** Input context that owns the action. */
  readonly context: TuiInteractionContext
  /** Concise user-facing action name. */
  readonly description: string
  /** Key and command gestures in this built-in or resolved descriptor. */
  readonly bindings: readonly TuiInteractionBinding[]
  /** Optional runtime capability required before help exposes the action. */
  readonly requires?: 'modelPicker' | 'resumePicker' | 'approval' | 'childView'
}

/** Ink key flags used by the pure keybinding matcher. */
export interface TuiKeypress {
  /** Ctrl modifier. */
  readonly ctrl?: boolean
  /** Shift modifier. */
  readonly shift?: boolean
  /** Alt/Meta modifier. */
  readonly meta?: boolean
  /** Return key. */
  readonly return?: boolean
  /** Escape key. */
  readonly escape?: boolean
  /** Tab key. */
  readonly tab?: boolean
  /** Up arrow. */
  readonly upArrow?: boolean
  /** Down arrow. */
  readonly downArrow?: boolean
  /** Left arrow. */
  readonly leftArrow?: boolean
  /** Right arrow. */
  readonly rightArrow?: boolean
  /** Page Up key. */
  readonly pageUp?: boolean
  /** Page Down key. */
  readonly pageDown?: boolean
  /** Home key. */
  readonly home?: boolean
  /** End key. */
  readonly end?: boolean
  /** Backspace key. */
  readonly backspace?: boolean
  /** Forward Delete key. */
  readonly delete?: boolean
  /** Bracketed-paste payload rather than a shortcut key. */
  readonly paste?: boolean
  /** Super or Command modifier reported by an enhanced keyboard protocol. */
  readonly super?: boolean
  /** Hyper modifier reported by an enhanced keyboard protocol. */
  readonly hyper?: boolean
}

/** Runtime facts that select the one non-global input owner. */
export interface TuiInteractionModeState {
  /** Approval currently owns input. */
  readonly approval: boolean
  /** Help or structured-question dialog currently owns input. */
  readonly dialog: boolean
  /** Background-work panel currently owns input. */
  readonly work: boolean
  /** A bounded transcript detail is open. */
  readonly detail: boolean
  /** The read-only Plugin Hub panel owns input. */
  readonly pluginHub?: boolean
  /** Transcript browse mode is active. */
  readonly transcript: boolean
  /** Complete-transcript search is active. */
  readonly transcriptSearch: boolean
  /** Submitted-history search is active. */
  readonly historySearch: boolean
  /** A suggestion query is active. */
  readonly suggestion: boolean
  /** Actionable footer navigation is active. */
  readonly footer: boolean
}

/** Capabilities used to remove unavailable actions from interaction help. */
export interface TuiInteractionCapabilities {
  /** The effective command registry provides the model picker. */
  readonly modelPicker: boolean
  /** The effective command registry provides the Session picker. */
  readonly resumePicker: boolean
  /** The TUI composition provides approval interaction. */
  readonly approval: boolean
  /** A child Agent transcript is the active view. */
  readonly childView: boolean
}

/** One preformatted physical row in the bounded interaction help panel. */
export interface TuiInteractionHelpLine {
  /** Stable React key. */
  readonly key: string
  /** One terminal row of help text. */
  readonly text: string
  /** Visual role used by the renderer. */
  readonly kind: 'heading' | 'binding' | 'description'
}

const key = (sequence: string, label: string): TuiInteractionBinding => Object.freeze({
  sequence, label, kind: 'key' as const,
})
const command = (sequence: string): TuiInteractionBinding => Object.freeze({
  sequence, label: sequence, kind: 'command' as const,
})
const descriptor = (
  id: TuiInteractionActionId,
  context: TuiInteractionContext,
  description: string,
  bindings: readonly TuiInteractionBinding[],
  requires?: TuiInteractionDescriptor['requires'],
): TuiInteractionDescriptor => Object.freeze({
  id, context, description, bindings: Object.freeze([...bindings]),
  ...requires === undefined ? {} : { requires },
})

/** Fixed input-priority order; Global escape actions are checked before the active modal context. */
export const TUI_INTERACTION_CONTEXT_PRIORITY: readonly TuiInteractionContext[] = Object.freeze([
  'Global', 'Approval', 'PluginHub', 'Dialog', 'Work', 'Detail', 'TranscriptSearch', 'Transcript', 'HistorySearch', 'Suggestion', 'Footer', 'Composer',
])

/** Built-in bindings used by dispatch and help when settings do not override an action. */
export const TUI_INTERACTION_REGISTRY: readonly TuiInteractionDescriptor[] = Object.freeze([
  descriptor('app.interrupt', 'Global', 'Interrupt, cancel, or exit', [key('ctrl+c', 'Ctrl+C')]),
  descriptor('view.root', 'Global', 'Return to root Agent', [key('ctrl+g', 'Ctrl+G')], 'childView'),
  descriptor('help.open', 'Global', 'Open interaction help', [command('/help')]),
  descriptor('transcript.open', 'Global', 'Browse transcript blocks', [key('ctrl+o', 'Ctrl+O')]),

  descriptor('composer.submit', 'Composer', 'Send prompt', [key('enter', 'Enter')]),
  descriptor('composer.newline', 'Composer', 'Insert newline', [key('ctrl+j', 'Ctrl+J')]),
  descriptor('composer.historyPrevious', 'Composer', 'Previous submitted prompt', [key('up', 'Up')]),
  descriptor('composer.historyNext', 'Composer', 'Next submitted prompt', [key('down', 'Down')]),
  descriptor('composer.historySearch', 'Composer', 'Search submitted prompts', [key('ctrl+r', 'Ctrl+R')]),
  descriptor('composer.transcriptSearch', 'Composer', 'Search complete transcript', [key('ctrl+f', 'Ctrl+F')]),
  descriptor('composer.stash', 'Composer', 'Stash, restore, or swap draft', [key('ctrl+s', 'Ctrl+S')]),
  descriptor('composer.undo', 'Composer', 'Undo composer edit', [
    key('ctrl+_', 'Ctrl+_'), key('ctrl+shift+-', 'Ctrl+Shift+-'),
  ]),
  descriptor('composer.redo', 'Composer', 'Redo composer edit', [key('ctrl+y', 'Ctrl+Y')]),
  descriptor('composer.externalEditor', 'Composer', 'Open draft in external editor', [key('ctrl+x', 'Ctrl+X')]),
  descriptor('composer.clipboardPaste', 'Composer', 'Paste from system clipboard', [key('ctrl+v', 'Ctrl+V')]),
  descriptor('composer.openModels', 'Composer', 'Open model picker', [
    key('meta+p', 'Alt+P'), command('/models'),
  ], 'modelPicker'),
  descriptor('composer.openResume', 'Composer', 'Open Session picker', [
    key('meta+r', 'Alt+R'), command('/resume'),
  ], 'resumePicker'),
  descriptor('composer.openQueue', 'Composer', 'Open pending input queue', [key('ctrl+q', 'Ctrl+Q')]),
  descriptor('composer.openGoalPlan', 'Composer', 'Open Goal and Plan controls', [key('meta+g', 'Alt+G')]),
  descriptor('composer.openFooter', 'Composer', 'Focus status footer', [key('tab', 'Tab')]),
  descriptor('composer.transcriptPreviousPage', 'Composer', 'Previous transcript page', [key('pageup', 'PageUp')]),
  descriptor('composer.transcriptNextPage', 'Composer', 'Next transcript page', [key('pagedown', 'PageDown')]),
  descriptor('composer.transcriptPreviousTurn', 'Composer', 'Previous completed Turn', [key('ctrl+up', 'Ctrl+Up')]),
  descriptor('composer.transcriptNextTurn', 'Composer', 'Next completed Turn', [key('ctrl+down', 'Ctrl+Down')]),
  descriptor('composer.transcriptOldest', 'Composer', 'Oldest transcript block when prompt is empty', [key('home', 'Home')]),
  descriptor('composer.transcriptLatest', 'Composer', 'Latest transcript block when prompt is empty', [key('end', 'End')]),
  descriptor('composer.cancel', 'Composer', 'Cancel running Agent', [key('escape', 'Escape')]),

  descriptor('suggestion.previous', 'Suggestion', 'Previous suggestion', [
    key('up', 'Up'), key('shift+tab', 'Shift+Tab'),
  ]),
  descriptor('suggestion.next', 'Suggestion', 'Next suggestion', [key('down', 'Down')]),
  descriptor('suggestion.accept', 'Suggestion', 'Accept selected suggestion', [
    key('tab', 'Tab'), key('enter', 'Enter'),
  ]),
  descriptor('suggestion.dismiss', 'Suggestion', 'Close suggestions', [key('escape', 'Escape')]),

  descriptor('historySearch.next', 'HistorySearch', 'Select an older match', [key('ctrl+r', 'Ctrl+R')]),
  descriptor('historySearch.accept', 'HistorySearch', 'Accept current match', [key('enter', 'Enter')]),
  descriptor('historySearch.cancel', 'HistorySearch', 'Restore original draft', [key('escape', 'Escape')]),

  descriptor('transcriptSearch.next', 'TranscriptSearch', 'Select next transcript match', [key('enter', 'Enter')]),
  descriptor('transcriptSearch.previous', 'TranscriptSearch', 'Select previous transcript match', [
    key('shift+enter', 'Shift+Enter'),
  ]),
  descriptor('transcriptSearch.accept', 'TranscriptSearch', 'Keep selected transcript position', [
    key('ctrl+f', 'Ctrl+F'),
  ]),
  descriptor('transcriptSearch.cancel', 'TranscriptSearch', 'Restore previous transcript position', [
    key('escape', 'Escape'),
  ]),

  descriptor('transcript.previous', 'Transcript', 'Previous transcript block', [key('up', 'Up')]),
  descriptor('transcript.next', 'Transcript', 'Next transcript block', [key('down', 'Down')]),
  descriptor('transcript.previousTurn', 'Transcript', 'Previous completed Turn', [key('shift+up', 'Shift+Up')]),
  descriptor('transcript.nextTurn', 'Transcript', 'Next completed Turn', [key('shift+down', 'Shift+Down')]),
  descriptor('transcript.inspect', 'Transcript', 'Open focused detail', [key('enter', 'Enter')]),
  descriptor('transcript.copy', 'Transcript', 'Copy focused transcript block', [key('y', 'Y')]),
  descriptor('transcript.close', 'Transcript', 'Return to composer', [key('escape', 'Escape')]),

  descriptor('detail.previousPage', 'Detail', 'Previous detail page', [key('pageup', 'PageUp')]),
  descriptor('detail.nextPage', 'Detail', 'Next detail page', [key('pagedown', 'PageDown')]),
  descriptor('detail.copy', 'Detail', 'Copy complete output or detail', [key('y', 'Y')]),
  descriptor('detail.exportMarkdown', 'Detail', 'Export assistant output to Markdown', [key('m', 'M')]),
  descriptor('detail.toggleScope', 'Detail', 'Toggle current segment or complete response', [key('tab', 'Tab')]),
  descriptor('detail.feedbackPositive', 'Detail', 'Like assistant message', [key('l', 'L')]),
  descriptor('detail.feedbackNegative', 'Detail', 'Dislike assistant message', [key('d', 'D')]),
  descriptor('detail.feedbackNote', 'Detail', 'Edit feedback note', [key('n', 'N')]),
  descriptor('detail.feedbackClear', 'Detail', 'Clear message feedback', [key('x', 'X')]),
  descriptor('detail.previousItem', 'Detail', 'Select previous detail item', [key('up', 'Up')]),
  descriptor('detail.nextItem', 'Detail', 'Select next detail item', [key('down', 'Down')]),
  descriptor('detail.copyPath', 'Detail', 'Copy selected path', [key('c', 'C')]),
  descriptor('detail.openPath', 'Detail', 'Open selected path on the Host', [key('o', 'O')]),
  descriptor('detail.close', 'Detail', 'Close detail', [key('enter', 'Enter'), key('escape', 'Escape')]),

  descriptor('pluginHub.close', 'PluginHub', 'Close Plugin Hub', [key('escape', 'Escape')]),
  descriptor('pluginHub.previous', 'PluginHub', 'Previous plugin', [key('up', 'Up')]),
  descriptor('pluginHub.next', 'PluginHub', 'Next plugin', [key('down', 'Down')]),
  descriptor('pluginHub.previousPage', 'PluginHub', 'Previous plugin page', [key('pageup', 'PageUp')]),
  descriptor('pluginHub.nextPage', 'PluginHub', 'Next plugin page', [key('pagedown', 'PageDown')]),
  descriptor('pluginHub.accept', 'PluginHub', 'Open or confirm selected plugin action', [key('enter', 'Enter')]),
  descriptor('pluginHub.toggleView', 'PluginHub', 'Switch Plugin Hub view', [key('tab', 'Tab')]),
  descriptor('pluginHub.search', 'PluginHub', 'Search Plugin Hub', [key('ctrl+f', 'Ctrl+F')]),
  descriptor('pluginHub.refresh', 'PluginHub', 'Refresh Plugin Hub', [key('r', 'R')]),
  descriptor('pluginHub.sort', 'PluginHub', 'Change catalog sort', [key('shift+s', 'Shift+S')]),
  descriptor('pluginHub.category', 'PluginHub', 'Change catalog category', [key('shift+c', 'Shift+C')]),
  descriptor('pluginHub.installable', 'PluginHub', 'Toggle installable Registry entries', [key('shift+i', 'Shift+I')]),
  descriptor('pluginHub.openRepository', 'PluginHub', 'Open selected GitHub repository', [key('shift+o', 'Shift+O')]),

  descriptor('dialog.previous', 'Dialog', 'Previous option or help row', [key('up', 'Up')]),
  descriptor('dialog.next', 'Dialog', 'Next option or help row', [key('down', 'Down')]),
  descriptor('dialog.previousPage', 'Dialog', 'Previous help page', [key('pageup', 'PageUp')]),
  descriptor('dialog.nextPage', 'Dialog', 'Next help page', [key('pagedown', 'PageDown')]),
  descriptor('dialog.accept', 'Dialog', 'Accept selected option', [key('enter', 'Enter')]),
  descriptor('dialog.cancel', 'Dialog', 'Close or cancel dialog', [key('escape', 'Escape')]),
  descriptor('dialog.skipQuestion', 'Dialog', 'Submit an empty timed-question item', [key('ctrl+s', 'Ctrl+S')]),

  descriptor('work.previous', 'Work', 'Select previous work item', [key('up', 'Up')]),
  descriptor('work.next', 'Work', 'Select next work item', [key('down', 'Down')]),
  descriptor('work.cancel', 'Work', 'Stop selected live work', [key('x', 'X')]),
  descriptor('work.inspect', 'Work', 'Open selected Agent transcript', [key('enter', 'Enter')]),
  descriptor('work.close', 'Work', 'Close work panel', [key('escape', 'Escape')]),

  descriptor('footer.previous', 'Footer', 'Previous status item', [
    key('left', 'Left'), key('shift+tab', 'Shift+Tab'),
  ]),
  descriptor('footer.next', 'Footer', 'Next status item', [
    key('right', 'Right'), key('tab', 'Tab'),
  ]),
  descriptor('footer.activate', 'Footer', 'Open selected status item', [key('enter', 'Enter')]),
  descriptor('footer.close', 'Footer', 'Return to composer', [key('escape', 'Escape')]),

  descriptor('approval.previous', 'Approval', 'Scroll approval detail up', [key('up', 'Up')], 'approval'),
  descriptor('approval.next', 'Approval', 'Scroll approval detail down', [key('down', 'Down')], 'approval'),
  descriptor('approval.previousPage', 'Approval', 'Previous approval detail page', [key('pageup', 'PageUp')], 'approval'),
  descriptor('approval.nextPage', 'Approval', 'Next approval detail page', [key('pagedown', 'PageDown')], 'approval'),
  descriptor('approval.allowOnce', 'Approval', 'Allow this request once', [key('y', 'Y')], 'approval'),
  descriptor('approval.reject', 'Approval', 'Reject this request', [
    key('n', 'N'), key('escape', 'Escape'),
  ], 'approval'),
])

const TUI_INTERACTION_DESCRIPTIONS_ZH: Readonly<Record<TuiInteractionActionId, string>> = Object.freeze({
  'app.interrupt': '中断、取消或退出',
  'view.root': '返回根 Agent',
  'help.open': '打开交互帮助',
  'transcript.open': '浏览 Transcript 块',
  'composer.submit': '发送提示词',
  'composer.newline': '插入换行',
  'composer.historyPrevious': '上一条已提交提示词',
  'composer.historyNext': '下一条已提交提示词',
  'composer.historySearch': '搜索已提交提示词',
  'composer.transcriptSearch': '搜索完整 Transcript',
  'composer.stash': '暂存、恢复或交换草稿',
  'composer.undo': '撤销输入编辑',
  'composer.redo': '重做输入编辑',
  'composer.externalEditor': '在外部编辑器中打开草稿',
  'composer.clipboardPaste': '从系统剪贴板粘贴',
  'composer.openModels': '打开模型选择器',
  'composer.openResume': '打开 Session 选择器',
  'composer.openQueue': '打开待处理输入队列',
  'composer.openGoalPlan': '打开 Goal 与 Plan 控制',
  'composer.openFooter': '聚焦状态栏',
  'composer.transcriptPreviousPage': '上一页 Transcript',
  'composer.transcriptNextPage': '下一页 Transcript',
  'composer.transcriptPreviousTurn': '上一个已完成 Turn',
  'composer.transcriptNextTurn': '下一个已完成 Turn',
  'composer.transcriptOldest': '输入为空时跳到最早 Transcript 块',
  'composer.transcriptLatest': '输入为空时跳到最新 Transcript 块',
  'composer.cancel': '取消运行中的 Agent',
  'suggestion.previous': '上一条建议',
  'suggestion.next': '下一条建议',
  'suggestion.accept': '接受当前建议',
  'suggestion.dismiss': '关闭建议',
  'historySearch.next': '选择更早的匹配项',
  'historySearch.accept': '接受当前匹配项',
  'historySearch.cancel': '恢复原始草稿',
  'transcriptSearch.next': '选择下一个 Transcript 匹配项',
  'transcriptSearch.previous': '选择上一个 Transcript 匹配项',
  'transcriptSearch.accept': '保留当前 Transcript 位置',
  'transcriptSearch.cancel': '恢复之前的 Transcript 位置',
  'transcript.previous': '上一个 Transcript 块',
  'transcript.next': '下一个 Transcript 块',
  'transcript.previousTurn': '上一个已完成 Turn',
  'transcript.nextTurn': '下一个已完成 Turn',
  'transcript.inspect': '打开聚焦项详情',
  'transcript.copy': '复制聚焦的 Transcript 块',
  'transcript.close': '返回输入框',
  'detail.previousPage': '详情上一页',
  'detail.nextPage': '详情下一页',
  'detail.copy': '复制完整输出或详情',
  'detail.exportMarkdown': '将助手输出导出为 Markdown',
  'detail.toggleScope': '切换当前片段或完整回答',
  'detail.feedbackPositive': '赞当前助手消息',
  'detail.feedbackNegative': '踩当前助手消息',
  'detail.feedbackNote': '编辑反馈备注',
  'detail.feedbackClear': '清除消息反馈',
  'detail.previousItem': '选择上一条详情项',
  'detail.nextItem': '选择下一条详情项',
  'detail.copyPath': '复制所选路径',
  'detail.openPath': '在 Host 打开所选路径',
  'detail.close': '关闭详情',
  'pluginHub.close': '关闭 Plugin Hub',
  'pluginHub.previous': '上一个插件',
  'pluginHub.next': '下一个插件',
  'pluginHub.previousPage': '插件列表上一页',
  'pluginHub.nextPage': '插件列表下一页',
  'pluginHub.accept': '打开或确认所选插件操作',
  'pluginHub.toggleView': '切换 Plugin Hub 视图',
  'pluginHub.search': '搜索 Plugin Hub',
  'pluginHub.refresh': '刷新 Plugin Hub',
  'pluginHub.sort': '切换目录排序',
  'pluginHub.category': '切换目录分类',
  'pluginHub.installable': '切换可安装收录过滤',
  'pluginHub.openRepository': '打开所选 GitHub 仓库',
  'dialog.previous': '上一个选项或帮助行',
  'dialog.next': '下一个选项或帮助行',
  'dialog.previousPage': '帮助上一页',
  'dialog.nextPage': '帮助下一页',
  'dialog.accept': '接受当前选项',
  'dialog.cancel': '关闭或取消对话框',
  'dialog.skipQuestion': '提交空的限时问答项',
  'work.previous': '选择上一个工作项',
  'work.next': '选择下一个工作项',
  'work.cancel': '停止所选运行中工作',
  'work.inspect': '打开所选 Agent Transcript',
  'work.close': '关闭工作面板',
  'footer.previous': '上一个状态项',
  'footer.next': '下一个状态项',
  'footer.activate': '打开所选状态项',
  'footer.close': '返回输入框',
  'approval.previous': '向上滚动审批详情',
  'approval.next': '向下滚动审批详情',
  'approval.previousPage': '审批详情上一页',
  'approval.nextPage': '审批详情下一页',
  'approval.allowOnce': '仅允许本次请求',
  'approval.reject': '拒绝本次请求',
})

/**
 * Resolve one built-in interaction description in the active TUI locale.
 * @param action - built-in or effective interaction descriptor.
 * @param locale - active TUI locale.
 * @returns localized first-party description with the descriptor text as the English source.
 */
export function tuiInteractionDescription(
  action: Pick<TuiInteractionDescriptor, 'id' | 'description'>,
  locale: TuiLocale,
): string {
  return locale === 'zh' ? TUI_INTERACTION_DESCRIPTIONS_ZH[action.id] : action.description
}

/** Per-action key replacements; command gestures remain attached to their action. */
export type TuiKeybindingOverrides = Readonly<Partial<Record<TuiInteractionActionId, readonly string[]>>>

/** Stable action ids accepted as keys in {@link TuiKeybindingOverrides}. */
export const TUI_INTERACTION_ACTION_IDS: readonly TuiInteractionActionId[] = Object.freeze(
  TUI_INTERACTION_REGISTRY.map(candidate => candidate.id),
)

// Each accepted sequence must be producible by normalizeKeypress(). Text keys are
// one printable ASCII character; modified text also admits canonical `space`.
const TUI_KEYBINDING_SEQUENCE_PATTERN = new RegExp([
  '^(?!.*[A-Z])(?:',
  'enter|escape|tab|shift\\+tab|shift\\+enter|up|down|left|right|pageup|pagedown|home|end|ctrl\\+shift\\+-|',
  'shift\\+(?:space|[!-~])|',
  '(?:ctrl\\+(?:meta|super)\\+|ctrl\\+|meta\\+|super\\+|hyper\\+)(?:space|[!-~])|',
  '[!-~])$',
].join(''), 'u')
const RESERVED_CONTEXT_SEQUENCES: Readonly<Partial<Record<TuiInteractionContext, ReadonlySet<string>>>> = Object.freeze({
  Dialog: new Set(['tab', 'y', 'n', 's', 'd']),
})

/** Schema for canonical lowercase key sequences keyed by known action id. */
export const TUI_KEYBINDING_OVERRIDES_SCHEMA = z.dict(
  z.array(z.string().min(1).max(32).pattern(TUI_KEYBINDING_SEQUENCE_PATTERN)).max(8),
  z.union(TUI_INTERACTION_ACTION_IDS),
) as unknown as z<TuiKeybindingOverrides>

/**
 * Reject ambiguous or unsafe effective bindings that the structural schema cannot express.
 * @param overrides - schema-validated per-action key replacements.
 * @throws when one action repeats a key, two actions in one context share a key, or Ctrl+C could be removed.
 */
export function validateTuiKeybindingOverrides(overrides: TuiKeybindingOverrides): void {
  const interrupt = overrides['app.interrupt']
  if (interrupt !== undefined && !interrupt.includes('ctrl+c')) {
    throw new Error('tui.keybindings: app.interrupt must retain ctrl+c for cancellation and terminal restoration')
  }
  const occupied = new Map<string, TuiInteractionActionId>()
  for (const candidate of TUI_INTERACTION_REGISTRY) {
    const sequences = overrides[candidate.id]
      ?? candidate.bindings.filter(binding => binding.kind === 'key').map(binding => binding.sequence)
    const local = new Set<string>()
    for (const sequence of sequences) {
      if (RESERVED_CONTEXT_SEQUENCES[candidate.context]?.has(sequence) === true) {
        throw new Error(`tui.keybindings: ${JSON.stringify(sequence)} is reserved by dialog-local input`)
      }
      if (local.has(sequence)) {
        throw new Error(`tui.keybindings: ${candidate.id} repeats ${JSON.stringify(sequence)}`)
      }
      local.add(sequence)
      const key = `${candidate.context}\0${sequence}`
      const previous = occupied.get(key)
      if (previous !== undefined) {
        throw new Error(`tui.keybindings: ${JSON.stringify(sequence)} conflicts in ${candidate.context} between ${previous} and ${candidate.id}`)
      }
      occupied.set(key, candidate.id)
    }
  }
}

/**
 * Replace configured key gestures while retaining command gestures and descriptor metadata.
 * @param overrides - schema-validated per-action key replacements.
 * @returns one deeply immutable registry consumed by both dispatch and help.
 * @throws when the effective registry is ambiguous or removes the Ctrl+C safety path.
 */
export function resolveTuiInteractionRegistry(
  overrides: TuiKeybindingOverrides,
): readonly TuiInteractionDescriptor[] {
  validateTuiKeybindingOverrides(overrides)
  return Object.freeze(TUI_INTERACTION_REGISTRY.map((candidate) => {
    const sequences = overrides[candidate.id]
    if (sequences === undefined) return candidate
    const commands = candidate.bindings.filter(binding => binding.kind === 'command')
    return descriptor(candidate.id, candidate.context, candidate.description, [
      ...sequences.map(sequence => key(sequence, tuiKeybindingLabel(sequence))),
      ...commands,
    ], candidate.requires)
  }))
}

const helpContextOrder: readonly TuiInteractionContext[] = Object.freeze([
  'Global', 'Composer', 'Suggestion', 'HistorySearch', 'TranscriptSearch', 'Transcript', 'Detail', 'PluginHub', 'Dialog', 'Work', 'Footer', 'Approval',
])

const controlSequences: Readonly<Record<string, string>> = Object.freeze({
  '\u0003': 'ctrl+c',
  '\u0006': 'ctrl+f',
  '\u0007': 'ctrl+g',
  '\n': 'ctrl+j',
  '\u0012': 'ctrl+r',
  '\u0011': 'ctrl+q',
  '\u0013': 'ctrl+s',
  '\u0019': 'ctrl+y',
  '\u0018': 'ctrl+x',
  '\u0016': 'ctrl+v',
  '\u001f': 'ctrl+_',
})

const terminalSequences: Readonly<Record<string, string>> = Object.freeze({
  '[13;2u': 'shift+enter',
  '[27;2;13~': 'shift+enter',
  '\u001b[13;2u': 'shift+enter',
  '\u001b[27;2;13~': 'shift+enter',
  '\u001b[H': 'home',
  '\u001bOH': 'home',
  '\u001b[1~': 'home',
  '\u001b[7~': 'home',
  '\u001b[F': 'end',
  '\u001bOF': 'end',
  '\u001b[4~': 'end',
  '\u001b[8~': 'end',
  '\u001b[D': 'left',
  '\u001b[C': 'right',
})

/**
 * Resolve the highest-priority non-global input owner.
 * @param state - active local and modal modes.
 * @returns the one context allowed to consume ordinary input.
 */
export function resolveTuiInteractionContext(state: TuiInteractionModeState): Exclude<TuiInteractionContext, 'Global'> {
  for (const context of TUI_INTERACTION_CONTEXT_PRIORITY) {
    if (context !== 'Global' && context !== 'Composer' && tuiInteractionContextActive(context, state)) return context
  }
  return 'Composer'
}

/**
 * Match an Ink key event against one effective registry for one context.
 * @param context - current input owner.
 * @param input - Ink input text or terminal control sequence.
 * @param keypress - Ink key flags.
 * @param registry - effective bindings; defaults to the built-in registry.
 * @returns the matching action id, or `undefined` for ordinary text and unbound keys.
 */
export function matchTuiInteractionAction(
  context: TuiInteractionContext,
  input: string,
  keypress: TuiKeypress,
  registry: readonly TuiInteractionDescriptor[] = TUI_INTERACTION_REGISTRY,
): TuiInteractionActionId | undefined {
  const sequence = normalizeKeypress(input, keypress)
  if (sequence === undefined) return undefined
  return registry.find(candidate => candidate.context === context
    && candidate.bindings.some(binding => binding.kind === 'key' && binding.sequence === sequence))?.id
}

/**
 * Filter interaction help to actions supported by the current composition.
 * @param capabilities - effective model-picker, Session-picker, and approval availability.
 * @param registry - effective bindings; defaults to the built-in registry.
 * @returns immutable descriptors in stable context and registry order.
 */
export function effectiveTuiInteractionDescriptors(
  capabilities: TuiInteractionCapabilities,
  registry: readonly TuiInteractionDescriptor[] = TUI_INTERACTION_REGISTRY,
): readonly TuiInteractionDescriptor[] {
  return Object.freeze(registry.filter((candidate) => {
    if (candidate.requires === 'modelPicker') return capabilities.modelPicker
    if (candidate.requires === 'resumePicker') return capabilities.resumePicker
    if (candidate.requires === 'approval') return capabilities.approval
    if (candidate.requires === 'childView') return capabilities.childView
    return true
  }))
}

/**
 * Project effective descriptors into fixed physical rows for a bounded panel.
 * @param descriptors - effective immutable action descriptors.
 * @param columns - available panel columns.
 * @param locale - target locale for interaction headings.
 * @returns stable heading, binding, and description rows.
 */
export function tuiInteractionHelpLines(
  descriptors: readonly TuiInteractionDescriptor[],
  columns: number,
  locale: TuiLocale = 'en',
): readonly TuiInteractionHelpLine[] {
  const wide = columns >= 72
  const lines: TuiInteractionHelpLine[] = []
  for (const context of helpContextOrder) {
    const actions = descriptors.filter(candidate => candidate.context === context)
    if (actions.length === 0) continue
    lines.push({
      key: `heading:${context}`,
      text: tuiInteractionContextLabel(context, locale),
      kind: 'heading',
    })
    const bindingWidth = wide
      ? Math.max(...actions.map(action => bindingLabel(action).length))
      : 0
    for (const action of actions) {
      const bindings = bindingLabel(action)
      const description = tuiInteractionDescription(action, locale)
      if (wide) {
        lines.push({
          key: `action:${action.id}`,
          text: `  ${bindings.padEnd(bindingWidth)}  ${description}`,
          kind: 'binding',
        })
      } else {
        lines.push({ key: `binding:${action.id}`, text: `  ${bindings}`, kind: 'binding' })
        for (const [index, wrappedDescription] of terminalWrappedLines(description, Math.max(1, columns - 4)).entries()) {
          lines.push({
            key: `description:${action.id}:${index}`,
            text: `    ${wrappedDescription}`,
            kind: 'description',
          })
        }
      }
    }
  }
  return Object.freeze(lines.map(line => Object.freeze(line)))
}

function bindingLabel(action: TuiInteractionDescriptor): string {
  return action.bindings.length === 0 ? 'Unbound' : action.bindings.map(binding => binding.label).join(' / ')
}

function tuiKeybindingLabel(sequence: string): string {
  const named: Readonly<Record<string, string>> = {
    enter: 'Enter', escape: 'Escape', tab: 'Tab', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
    pageup: 'PageUp', pagedown: 'PageDown', home: 'Home', end: 'End', space: 'Space',
  }
  return sequence.split('+').map((part) => {
    if (part === 'ctrl') return 'Ctrl'
    if (part === 'meta') return 'Alt'
    if (part === 'super') return 'Super'
    if (part === 'hyper') return 'Hyper'
    if (part === 'shift') return 'Shift'
    return named[part] ?? part.toLocaleUpperCase()
  }).join('+')
}

function modifiedNamedKey(value: string, keypress: TuiKeypress): string {
  if (value.includes('+')) return value
  const modifiers = [
    keypress.ctrl === true ? 'ctrl' : undefined,
    keypress.meta === true ? 'meta' : undefined,
    keypress.super === true ? 'super' : undefined,
    keypress.hyper === true ? 'hyper' : undefined,
    keypress.shift === true ? 'shift' : undefined,
  ].filter((part): part is string => part !== undefined)
  return modifiers.length === 0 ? value : `${modifiers.join('+')}+${value}`
}

function normalizeKeypress(input: string, keypress: TuiKeypress): string | undefined {
  if (keypress.paste === true) return undefined
  const control = controlSequences[input]
  if (control !== undefined) return control
  const terminal = terminalSequences[input]
  if (terminal !== undefined) return modifiedNamedKey(terminal, keypress)
  if (keypress.pageUp === true) return modifiedNamedKey('pageup', keypress)
  if (keypress.pageDown === true) return modifiedNamedKey('pagedown', keypress)
  if (keypress.home === true) return modifiedNamedKey('home', keypress)
  if (keypress.end === true) return modifiedNamedKey('end', keypress)
  if (keypress.return === true) return keypress.shift === true ? 'shift+enter' : 'enter'
  if (keypress.escape === true) return 'escape'
  if (keypress.tab === true) return keypress.shift === true ? 'shift+tab' : 'tab'
  if (keypress.upArrow === true) return modifiedNamedKey('up', keypress)
  if (keypress.downArrow === true) return modifiedNamedKey('down', keypress)
  if (keypress.leftArrow === true) return modifiedNamedKey('left', keypress)
  if (keypress.rightArrow === true) return modifiedNamedKey('right', keypress)
  if (input === '' || input.includes('\u001b')) return undefined
  const value = input === ' ' ? 'space' : input.toLocaleLowerCase()
  if (keypress.ctrl === true && keypress.shift === true && (value === '-' || value === '_')) return 'ctrl+shift+-'
  if (keypress.ctrl === true && keypress.meta === true) return `ctrl+meta+${value}`
  if (keypress.ctrl === true && keypress.super === true) return `ctrl+super+${value}`
  if (keypress.ctrl === true) return `ctrl+${value}`
  if (keypress.super === true) return `super+${value}`
  if (keypress.hyper === true) return `hyper+${value}`
  if (keypress.meta === true) return `meta+${value}`
  if (keypress.shift === true) return `shift+${value}`
  return value
}

function tuiInteractionContextActive(
  context: Exclude<TuiInteractionContext, 'Global' | 'Composer'>,
  state: TuiInteractionModeState,
): boolean {
  if (context === 'Approval') return state.approval
  if (context === 'Dialog') return state.dialog
  if (context === 'PluginHub') return state.pluginHub === true
  if (context === 'Work') return state.work
  if (context === 'Detail') return state.detail
  if (context === 'TranscriptSearch') return state.transcriptSearch
  if (context === 'Transcript') return state.transcript
  if (context === 'HistorySearch') return state.historySearch
  if (context === 'Suggestion') return state.suggestion
  return state.footer
}
