/** Runtime catalog, locale validation, and Unicode-width coverage. */

import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import {
  TUI_LOCALE_CATALOG, TUI_LOCALE_CATALOG_VERSION, TUI_LOCALES,
  tuiCommandDescription, tuiInteractionContextLabel, tuiLocaleLabel, tuiMessage,
} from '../src/locale.ts'
import { DEFAULT_TUI_TERMINAL_CAPABILITIES, projectTuiDiagnostics, tuiDiagnosticPanelLines } from '../src/index.ts'
import {
  effectiveTuiInteractionDescriptors, tuiInteractionDescription, tuiInteractionHelpLines,
} from '../src/keybindings.ts'

describe('native TUI runtime locale catalog', () => {
  it('ships a versioned English and Chinese catalog with the English fallback', () => {
    expect(TUI_LOCALE_CATALOG_VERSION).toBe(18)
    expect(TUI_LOCALES).toEqual(['en', 'zh'])
    const keys = Object.keys(TUI_LOCALE_CATALOG.en).toSorted()
    expect(Object.keys(TUI_LOCALE_CATALOG.zh).toSorted()).toEqual(keys)
    expect(tuiMessage('zh', 'language.updated', { language: tuiLocaleLabel('zh') })).toBe('语言已切换为中文。')
    expect(tuiMessage('en', 'language.updated', { language: tuiLocaleLabel('en') })).toBe('Language set to English.')
    expect(tuiInteractionContextLabel('Composer', 'zh')).toBe('输入框')
    expect(tuiInteractionContextLabel('future-owner', 'zh')).toBe('future-owner')
    expect(tuiMessage('zh', 'config.question')).toBe('选择一项 TUI 设置：')
  })

  it('sanitizes parameters while retaining CJK cell-width safety for bounded callers', () => {
    const message = tuiMessage('zh', 'startup.provider.unconfigured', {
      name: '提供方🙂\u001b[31m',
    })
    expect(message).not.toContain('\u001b')
    expect(stringWidth(message)).toBeGreaterThan(0)
    expect(stringWidth(tuiMessage('zh', 'startup.narrow.models', { name: '提供方' }))).toBeLessThan(64)
  })

  it('uses provider-owned localized descriptions and stable English fallback', () => {
    const command = {
      name: 'example',
      description: 'Fallback description',
      completion: { descriptions: { zh: '中文描述' } },
    }
    expect(tuiCommandDescription(command, 'zh')).toBe('中文描述')
    expect(tuiCommandDescription(command, 'en')).toBe('Fallback description')
    expect(tuiCommandDescription({
      name: 'compact', description: 'Compact older conversation history',
    }, 'zh')).toBe('压缩较早的对话历史')
    expect(tuiCommandDescription({
      name: 'compact', description: 'Third-party compact behavior',
    }, 'zh')).toBe('Third-party compact behavior')
  })

  it('keeps localized diagnostic rows within every supported terminal width', () => {
    const input = {
      terminal: DEFAULT_TUI_TERMINAL_CAPABILITIES,
      providers: [{ id: 'deepseek', name: 'DeepSeek', configured: false, authenticationSource: 'OAuth' }],
      pluginHub: { state: 'unavailable' as const },
      capabilities: { settings: false, sessionProjection: true, pluginHub: false, jobs: true, subagents: false },
    }
    for (const locale of TUI_LOCALES) {
      const snapshot = projectTuiDiagnostics(input, locale)
      for (const columns of [40, 56, 80, 120, 160]) {
        const lines = tuiDiagnosticPanelLines(snapshot, columns, locale)
        expect(lines.length, `${locale} at ${columns} columns`).toBeGreaterThan(0)
        expect(lines.every(line => stringWidth(line.text) <= columns), `${locale} at ${columns} columns`).toBe(true)
      }
    }
  })

  it('keeps localized interaction headings within every supported terminal width', () => {
    const descriptors = effectiveTuiInteractionDescriptors({
      modelPicker: true, resumePicker: true, approval: true, childView: true,
    })
    for (const locale of TUI_LOCALES) {
      for (const columns of [40, 56, 80, 120, 160]) {
        const lines = tuiInteractionHelpLines(descriptors, columns, locale)
        expect(lines.every(line => stringWidth(line.text) <= columns), `${locale} at ${columns} columns`).toBe(true)
      }
    }
    expect(descriptors.every(descriptor => tuiInteractionDescription(descriptor, 'zh').length > 0)).toBe(true)
    expect(tuiInteractionDescription(descriptors[0]!, 'zh')).not.toBe(descriptors[0]!.description)
    expect(tuiInteractionHelpLines(descriptors, 80, 'zh').some(line => line.text.includes('打开模型选择器'))).toBe(true)
  })
})
