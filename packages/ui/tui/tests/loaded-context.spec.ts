/** Structured loaded-context projection and physical-width coverage. */

import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import { projectTuiLoadedContext, tuiLoadedContextPanelLines } from '../src/loaded-context.ts'

describe('native TUI loaded context projection', () => {
  it('shows owner names and bounded model/permission facts without prompt text', () => {
    const snapshot = projectTuiLoadedContext({
      sections: ['harness:identity', 'deployment:persona'],
      contexts: ['agent-instructions:workspace'],
      tools: ['bash', 'read'],
      skills: ['review'],
      model: 'deepseek/deepseek-chat · high',
      permission: 'workspace-write',
    }, 'zh')
    expect(snapshot.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'sections', value: 'harness:identity, deployment:persona' }),
      expect.objectContaining({ id: 'tools', value: 'bash, read' }),
      expect.objectContaining({ id: 'model', label: '模型' }),
      expect.objectContaining({ id: 'permission', value: 'workspace-write' }),
    ]))
    expect(JSON.stringify(snapshot)).not.toContain('system prompt text')
  })

  it('sanitizes entries and wraps Chinese labels within narrow widths', () => {
    const snapshot = projectTuiLoadedContext({
      sections: ['section\u001b[31m'], contexts: [], tools: [], skills: [],
    }, 'zh')
    const lines = tuiLoadedContextPanelLines(snapshot, 40)
    expect(JSON.stringify(lines)).not.toContain('\u001b')
    for (const columns of [40, 56, 80, 120, 160]) {
      expect(tuiLoadedContextPanelLines(snapshot, columns).every(line => stringWidth(line.text) <= columns)).toBe(true)
    }
  })
})
