/** Grouped command and guidance projections for the native TUI. */

import type { CommandDescriptor } from './host.ts'
import type { TuiLocale } from './locale.ts'

/** Stable command groups used by `/help` and the command transcript result. */
export type TuiCommandGroup = 'session' | 'model' | 'capabilities' | 'diagnostics' | 'other'

const COMMAND_GROUPS: Readonly<Record<TuiCommandGroup, ReadonlySet<string>>> = Object.freeze({
  session: new Set([
    'new', 'clear', 'compact', 'resume', 'rename', 'rewind', 'export', 'workspace', 'btw',
    'goal', 'plan', 'feedback',
  ]),
  model: new Set(['models', 'mode', 'permission', 'provider']),
  capabilities: new Set(['plugins', 'skills', 'mcp', 'update']),
  diagnostics: new Set(['doctor', 'context', 'config', 'lang', 'tips', 'help']),
  other: new Set<string>(),
})

const GROUP_ORDER: readonly TuiCommandGroup[] = Object.freeze([
  'session', 'model', 'capabilities', 'diagnostics', 'other',
])

const GROUP_LABELS: Readonly<Record<TuiLocale, Readonly<Record<TuiCommandGroup, string>>>> = Object.freeze({
  en: Object.freeze({
    session: 'Session and conversation',
    model: 'Models and policy',
    capabilities: 'Skills, MCP, and plugins',
    diagnostics: 'Configuration and diagnostics',
    other: 'Other commands',
  }),
  zh: Object.freeze({
    session: 'Session 与对话',
    model: '模型与策略',
    capabilities: 'Skills、MCP 与插件',
    diagnostics: '配置与诊断',
    other: '其他命令',
  }),
})

/**
 * Resolve one command into the first matching stable help group.
 * @param name - effective command name without its slash prefix.
 * @returns stable grouped-help owner.
 */
export function tuiCommandGroup(name: string): TuiCommandGroup {
  for (const group of GROUP_ORDER) {
    if (group !== 'other' && COMMAND_GROUPS[group].has(name)) return group
  }
  return 'other'
}

/**
 * Project effective commands into grouped human-readable lines.
 * @param commands - effective scoped command descriptors.
 * @param locale - selected TUI locale.
 * @param describe - localized description resolver.
 * @returns group headings and command rows, omitting empty groups.
 */
export function tuiGroupedCommandHelpLines(
  commands: readonly CommandDescriptor[],
  locale: TuiLocale,
  describe: (command: CommandDescriptor) => string,
): readonly string[] {
  const grouped = new Map<TuiCommandGroup, CommandDescriptor[]>()
  for (const command of commands) {
    const group = tuiCommandGroup(command.name)
    const entries = grouped.get(group) ?? []
    entries.push(command)
    grouped.set(group, entries)
  }
  const lines: string[] = []
  for (const group of GROUP_ORDER) {
    const entries = grouped.get(group)
    if (entries === undefined || entries.length === 0) continue
    if (lines.length > 0) lines.push('')
    lines.push(GROUP_LABELS[locale][group])
    for (const command of entries) {
      lines.push(`  /${command.name}${command.input === undefined ? '' : ` ${command.input.hint}`} — ${describe(command)}`)
    }
  }
  return Object.freeze(lines)
}

/**
 * Project current MCP tool names into server-grouped status lines.
 * @param toolNames - currently visible tool schema names.
 * @param locale - selected TUI locale.
 * @returns bounded server headings and tool rows.
 */
export function tuiMcpStatusLines(toolNames: readonly string[], locale: TuiLocale): readonly string[] {
  const servers = new Map<string, string[]>()
  for (const name of toolNames) {
    const match = /^mcp__(.+?)__(.+)$/u.exec(name)
    if (match === null) continue
    const server = match[1] as string
    const tool = match[2] as string
    const tools = servers.get(server) ?? []
    tools.push(tool)
    servers.set(server, tools)
  }
  if (servers.size === 0) {
    return Object.freeze([locale === 'zh'
      ? '当前 Agent 没有可见的 MCP 工具。请检查当前模式和 MCP 组合。'
      : 'The current Agent has no visible MCP tools. Check the active mode and MCP composition.'])
  }
  const lines: string[] = [locale === 'zh'
    ? `已连接 ${servers.size} 个 MCP server：`
    : `${servers.size} MCP server${servers.size === 1 ? '' : 's'} connected:`]
  for (const [server, tools] of [...servers].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${server} · ${tools.length} ${locale === 'zh' ? '个工具' : tools.length === 1 ? 'tool' : 'tools'}`)
    for (const tool of tools.sort((a, b) => a.localeCompare(b))) lines.push(`    ${tool}`)
  }
  return Object.freeze(lines)
}

/**
 * Project concise, capability-backed usage tips.
 * @param locale - selected TUI locale.
 * @returns immutable first-party usage guidance.
 */
export function tuiUsageTipLines(locale: TuiLocale): readonly string[] {
  return locale === 'zh'
    ? Object.freeze([
      '输入 / 可搜索当前 Agent 真正注册的命令；输入 @ 可引用当前 Session 工作区文件。',
      'Agent 工作时：Enter steer，Tab follow-up，Ctrl+Enter 中断后发送。',
      'Ctrl+R 搜索已提交 prompt；Ctrl+F 搜索完整 Transcript；Ctrl+S 暂存或交换草稿。',
      'Ctrl+X 用 $VISUAL 或 $EDITOR 编辑当前草稿；Ctrl+V 读取受支持的系统剪贴板内容。',
      '鼠标滚轮浏览 Transcript；单击条目聚焦；拖选、双击或三击可复制安全文本。',
      '/resume 恢复工作，/rewind 从安全 turn 分支，/workspace 在已有工作区开始新 Session。',
      '/skills 浏览可由用户调用的 skill；/mcp 查看当前 Agent 可见的 MCP 工具。',
      '/models 选择模型或执行 provider-owned 登录；/provider 查看配置状态和修复入口。',
    ])
    : Object.freeze([
      'Type / to search commands actually registered for this Agent; type @ to reference files in the Session workspace.',
      'While the Agent works: Enter steers, Tab queues a follow-up, and Ctrl+Enter interrupts then sends.',
      'Ctrl+R searches submitted prompts; Ctrl+F searches the full transcript; Ctrl+S stashes or swaps a draft.',
      'Ctrl+X edits the draft in $VISUAL or $EDITOR; Ctrl+V reads supported system clipboard content.',
      'Use the mouse wheel to browse, click a row to focus it, and drag/double/triple-click to copy safe text.',
      '/resume restores work, /rewind branches at a safe turn, and /workspace starts a Session in an existing workspace.',
      '/skills browses user-invocable skills; /mcp lists MCP tools visible to the current Agent.',
      '/models selects a model or runs provider-owned sign-in; /provider shows configuration state and remediation.',
    ])
}
