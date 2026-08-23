/** Focused projections for discoverability commands added by the native TUI. */

import { describe, expect, it } from 'vitest'
import {
  tuiCommandGroup, tuiGroupedCommandHelpLines, tuiMcpStatusLines, tuiUsageTipLines,
} from '../src/command-help.ts'

describe('native TUI command discoverability', () => {
  it('groups effective commands without inventing unavailable commands', () => {
    const commands = [
      { name: 'resume', description: 'Resume work' },
      { name: 'models', description: 'Choose a model' },
      { name: 'skills', description: 'Browse skills' },
      { name: 'third-party', description: 'Extension command' },
    ]
    const lines = tuiGroupedCommandHelpLines(commands, 'en', command => command.description)
    expect(lines).toContain('Session and conversation')
    expect(lines).toContain('Models and policy')
    expect(lines).toContain('Skills, MCP, and plugins')
    expect(lines).toContain('Other commands')
    expect(lines.join('\n')).toContain('/third-party — Extension command')
    expect(lines.join('\n')).not.toContain('/provider')
    expect(tuiCommandGroup('btw')).toBe('session')
  })

  it('projects only Agent-visible MCP tools and groups them by server', () => {
    const lines = tuiMcpStatusLines([
      'read', 'mcp__github__search_code', 'mcp__github__get_file', 'mcp__browser__open',
    ], 'zh')
    expect(lines[0]).toBe('已连接 2 个 MCP server：')
    expect(lines).toContain('  github · 2 个工具')
    expect(lines.join('\n')).not.toContain('\n    read')
    expect(tuiMcpStatusLines(['read'], 'en')).toEqual([
      'The current Agent has no visible MCP tools. Check the active mode and MCP composition.',
    ])
  })

  it('keeps tips localized and points to the implemented capability surfaces', () => {
    const chinese = tuiUsageTipLines('zh').join('\n')
    expect(chinese).toContain('/workspace')
    expect(chinese).toContain('/skills')
    expect(chinese).toContain('鼠标滚轮')
    expect(tuiUsageTipLines('en')).toHaveLength(tuiUsageTipLines('zh').length)
  })
})
