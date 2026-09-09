/** Pure transcript, interaction, terminal-safety, and startup-failure coverage. */

import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import { Context } from '@deepseek-ai/cordis'
import { compactCheckpointSource, CompactionId } from '@deepseek-ai/dsh-compaction'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { JobId, type JobSnapshot } from '@deepseek-ai/dsh-jobs'
import { FsError } from '@deepseek-ai/dsh-fs'
import {
  ToolCallId, createAssistantMessage, createToolResultMessage, createUserMessage, ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import { SubagentRunId } from '@deepseek-ai/dsh-subagent'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  apply, cancelTuiHistorySearch, createComposerState, deleteComposerText, foldTranscript,
  navigateTuiTranscriptTurn, tuiTranscriptTurnAnchors,
  addComposerImageAttachment, insertComposerClipboard, insertComposerPasteReference, insertComposerText, isLargeComposerPaste,
  acceptTuiSuggestion, commandSuggestionState, layoutComposer, moveComposerCursor, moveTuiSuggestion,
  nextTuiHistorySearchMatch, pathSuggestionQuery, pathSuggestionState, startTuiHistorySearch,
  materializeComposerText, previousTranscriptPageAnchor, redoComposerEdit, replaceComposerText, selectTranscriptPage,
  selectTranscriptWindow, terminalMarkdownText, terminalSafe, terminalWrappedLines, toggleTuiComposerStash,
  removeComposerImageAttachment, removeLastComposerImageAttachment,
  traverseComposerHistory, tuiComposerDraft, tuiHistorySearchResult, undoComposerEdit,
  updateTuiHistorySearchQuery,
  visibleTuiSuggestions, effectiveTuiInteractionDescriptors, matchTuiInteractionAction,
  resolveTuiInteractionContext, resolveTuiInteractionRegistry,
  TUI_INTERACTION_CONTEXT_PRIORITY, TUI_INTERACTION_REGISTRY,
  normalizeTuiTranscriptSearchText, resolveTuiTranscriptSearchHit, TuiTranscriptSearchIndex,
  TuiTranscriptDetailCache, tuiTranscriptDetailText, TuiTranscriptProjectionCache, TuiTranscriptScrollController,
  TuiTranscriptViewportIndex, TuiTranscriptWheelBoundaryGuard, tuiTranscriptSearchSegments,
  toolActivityActiveText, toolActivityHeadingText, tuiToolActivityCategory, tuiToolActivityRows,
  tuiAssistantResponseParts, tuiAssistantResponseText,
  tuiContextSegmentBar, tuiFooterItems, tuiFooterStatusLine, tuiInteractionHelpLines, tuiSelectedFooterLine,
  collectTuiSchedules,
  tuiAgentModeName, tuiAgentModeOptions,
  moveTuiFooterSelection, visibleTuiFooterItems, type TuiKeypress,
  filterTuiResumeCandidates, formatTuiRelativeTime,
  resolveTuiSessionExportDirectory,
  resolveTuiOutputExportPath, tuiOutputMarkdown, writeTuiOutputMarkdown,
  sortTuiResumeCandidates, summarizeTuiResumeCandidate,
  tuiRewindCandidates,
  consumeTuiDoubleEscape, TUI_DOUBLE_ESCAPE_WINDOW_MS,
  formatTuiWorkElapsed, formatTuiWorkOwner, formatTuiWorkRoute, projectTuiWork,
  applyTuiTerminalReply, TuiAgentViewStateCache, TuiTerminalInputDecoder, tuiTerminalMouseReportKind,
  resolveTuiTheme, TUI_ACTIVITY_PREFERENCES, TUI_MOUSE_PREFERENCES, TUI_SETTINGS_SCHEMA, TUI_THEME_PREFERENCES,
} from '../src/index.ts'
import {
  inputCursorTarget, toggleTuiTranscriptFocus, tuiFooterItemsOwnPointerRow, tuiFullscreenFooterLine,
  tuiPluginHubDetailTextStyle, tuiStartupComposerFrame, tuiTranscriptDetailHeight, tuiWorkingFrame,
} from '../src/app.tsx'
import {
  resolveTuiStartupLogoVariant, TUI_STARTUP_LOGO_HEIGHT,
  TUI_STARTUP_LOGO_ROWS, TUI_STARTUP_LOGO_WIDTH,
  tuiStartupLogoCellStyle,
} from '../src/startup-logo.tsx'
import { InteractionStore, isTuiQuestionCancellation } from '../src/store.ts'
import { toolDetailLines, toolStateMark, toolSummary } from '../src/tool-card.tsx'
import { todoPanelRows } from '../src/todo-panel.tsx'
import type {
  TranscriptNode, TranscriptTextNode, TranscriptTodoNode, TranscriptToolActivityNode, TranscriptToolNode,
} from '../src/transcript.ts'
import { TerminalSession, terminalInternals, type TuiStreams } from '../src/terminal-session.ts'
import {
  externalEditorInternals, parseTuiEditorCommand, resolveTuiEditorArgv, runTuiExternalEditor,
  type TuiExternalEditorChild,
} from '../src/external-editor.ts'

const originalStreams = { ...terminalInternals }
const originalEditorSpawn = externalEditorInternals.spawn
afterEach(() => {
  Object.assign(terminalInternals, originalStreams)
  externalEditorInternals.spawn = originalEditorSpawn
})

function event<T extends SessionEvent['type']>(
  seq: number,
  type: T,
  data: Extract<SessionEvent, { type: T }>['data'],
): Extract<SessionEvent, { type: T }> {
  const surfaceOp = type === 'user/message' || type === 'assistant/message' || type === 'tool/result'
    ? { surfaceOp: 'append' as const }
    : {}
  return { seq: SessionSeq(seq), time: seq, type, data, ...surfaceOp } as Extract<SessionEvent, { type: T }>
}

describe('terminalSafe', () => {
  it('preserves layout text and neutralizes every C0/C1 terminal control', () => {
    expect(terminalSafe('ok\n\t\u001b]8;;bad\u0007x\u009by')).toBe('ok\n\t�]8;;bad�x�y')
  })
})

describe('semantic terminal themes', () => {
  it('resolves dark and light palettes at negotiated precision', () => {
    const dark = resolveTuiTheme('dark', 'truecolor')
    expect(dark).toMatchObject({
      preference: 'dark', resolvedPreference: 'dark', colorDepth: 'truecolor', dim: true,
    })
    expect(dark.tokens).toMatchObject({
      accent: '#58a6ff', success: '#3fb950', warning: '#d29922', error: '#f85149',
      permission: '#d2a8ff', diffAdd: '#3fb950', diffDelete: '#f85149',
    })

    const light = resolveTuiTheme('light', 'ansi16')
    expect(light).toMatchObject({
      preference: 'light', resolvedPreference: 'light', colorDepth: 'ansi16', dim: true,
    })
    expect(light.tokens).toMatchObject({
      accent: 'blue', warning: 'magenta', error: 'red', selection: 'blue', border: 'blue',
    })
  })

  it('uses the normalized terminal background for auto and falls back to dark', () => {
    const autoLight = resolveTuiTheme('auto', 'truecolor', 'light')
    expect(autoLight).toMatchObject({ preference: 'auto', resolvedPreference: 'light' })
    expect(autoLight.tokens).toMatchObject({ accent: '#0969da', warning: '#9a6700' })

    for (const background of ['dark', 'unknown'] as const) {
      const automatic = resolveTuiTheme('auto', 'ansi16', background)
      expect(automatic).toMatchObject({
        preference: 'auto', resolvedPreference: 'dark', colorDepth: 'ansi16', dim: true,
      })
      expect(automatic.tokens).toMatchObject({ accent: 'cyan', warning: 'yellow' })
    }
    expect(resolveTuiTheme('light', 'truecolor', 'dark').resolvedPreference).toBe('light')
  })

  it('suppresses every color and dim style for explicit or negotiated no-color output', () => {
    for (const theme of [
      resolveTuiTheme('no-color', 'truecolor', 'light'),
      resolveTuiTheme('auto', 'none', 'light'),
    ]) {
      expect(theme.colorDepth).toBe('none')
      expect(theme.resolvedPreference).toBe('no-color')
      expect(theme.dim).toBe(false)
      expect(Object.values(theme.tokens).every(color => color === undefined)).toBe(true)
    }
  })

  it('keeps Plugin Hub detail content readable without compounding muted colors with ANSI dim', () => {
    const theme = resolveTuiTheme('dark', 'truecolor')
    expect(tuiPluginHubDetailTextStyle(theme, { kind: 'field', tone: 'muted', text: 'Package' }))
      .toEqual({ color: '#8b949e' })
    expect(tuiPluginHubDetailTextStyle(theme, { kind: 'body', tone: 'default', text: 'README body' }))
      .toEqual({})
  })

  it('defaults persisted settings and rejects invalid theme or keybinding values', () => {
    expect(TUI_THEME_PREFERENCES).toEqual(['auto', 'dark', 'light', 'no-color'])
    expect(TUI_ACTIVITY_PREFERENCES).toEqual(['dots', 'pulse', 'minimal', 'off'])
    expect(TUI_MOUSE_PREFERENCES).toEqual(['auto', 'off'])
    expect(TUI_SETTINGS_SCHEMA({} as never)).toEqual({
      theme: 'auto', locale: 'en', mouse: 'auto', activity: 'dots', keybindings: {},
      sessionManager: { scope: 'workspace', archive: 'active', sort: 'updated-desc', groupByWorkspace: true },
    })
    expect(TUI_SETTINGS_SCHEMA({ theme: 'dark', mouse: 'off' } as never))
      .toEqual({
        theme: 'dark', locale: 'en', mouse: 'off', activity: 'dots', keybindings: {},
        sessionManager: { scope: 'workspace', archive: 'active', sort: 'updated-desc', groupByWorkspace: true },
      })
    expect(TUI_SETTINGS_SCHEMA({ themeFile: 'nord.json', activity: 'pulse' } as never)).toMatchObject({
      themeFile: 'nord.json', activity: 'pulse',
    })
    expect(TUI_SETTINGS_SCHEMA({ providerOnboardingVersion: 1 } as never)).toMatchObject({
      providerOnboardingVersion: 1,
    })
    expect(TUI_SETTINGS_SCHEMA({ defaultModel: {
      provider: 'lingxi-openai-codex', model: 'gpt-account', reasoningEffort: 'xhigh',
    } } as never)).toMatchObject({ defaultModel: {
      provider: 'lingxi-openai-codex', model: 'gpt-account', reasoningEffort: 'xhigh',
    } })
    expect(TUI_SETTINGS_SCHEMA({ defaultModel: null } as never).defaultModel).toBeUndefined()
    expect(() => TUI_SETTINGS_SCHEMA({ defaultModel: { provider: 'lingxi-openai-codex' } } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({ providerOnboardingVersion: 0 } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({ themeFile: '../nord.json' } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({ activity: 'spin' } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({ theme: 'solarized' } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({ locale: 'ja' } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({ mouse: 'hover' } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({
      keybindings: { 'unknown.action': ['ctrl+p'] },
    } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({
      keybindings: { 'composer.openModels': ['ctrl+enter'] },
    } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({
      keybindings: { 'composer.openModels': ['Ctrl+P'] },
    } as never)).toThrow()
    expect(() => TUI_SETTINGS_SCHEMA({
      keybindings: { 'composer.openModels': ['ctrl+r'] },
    } as never)).toThrow(/conflicts in Composer/u)
    expect(() => TUI_SETTINGS_SCHEMA({
      keybindings: { 'composer.openModels': ['ctrl+p', 'ctrl+p'] },
    } as never)).toThrow(/repeats/u)
    expect(() => TUI_SETTINGS_SCHEMA({
      keybindings: { 'app.interrupt': [] },
    } as never)).toThrow(/must retain ctrl\+c/u)
    expect(() => TUI_SETTINGS_SCHEMA({
      keybindings: { 'dialog.cancel': ['s'] },
    } as never)).toThrow(/reserved by dialog-local input/u)
  })
})

describe('terminalMarkdownText', () => {
  it('removes presentation markers while retaining readable GFM block structure', () => {
    expect(terminalMarkdownText([
      '## 一句话定位',
      '',
      '这是 **可插拔 Agent Harness**，参考 [文档](https://example.test)。',
      '',
      '- 模型',
      '- `工具`',
    ].join('\n'))).toBe([
      '一句话定位',
      '',
      '这是 可插拔 Agent Harness，参考 文档。',
      '',
      '• 模型',
      '• 工具',
    ].join('\n'))
  })

  it('labels fenced code and degrades wide tables to row fields at narrow widths', () => {
    const markdown = ['```ts', 'const value = 1', '```', '', '| Name | Value |', '| --- | --- |', '| alpha | beta |'].join('\n')
    expect(terminalMarkdownText(markdown, 80)).toContain('Code · ts\nconst value = 1')
    expect(terminalMarkdownText(markdown, 40)).toContain('Row 1\nName: alpha\nValue: beta')
  })

  it('omits raw HTML while retaining surrounding readable text and image alternatives', () => {
    expect(terminalMarkdownText([
      '<p align="center"><img src="data:image/svg+xml;base64,PHN2Zz4=" /></p>',
      '',
      'Before <span>inside</span> after. ![preview](https://example.test/image.png)',
    ].join('\n'))).toBe('Before inside after. preview')
  })

  it('recovers conservative block boundaries from flattened registry Markdown', () => {
    expect(terminalMarkdownText('# 中文标题<p>正文。</p>## 安装说明- 第一步。- 第二步')).toBe([
      '中文标题',
      '',
      '正文。',
      '',
      '安装说明',
      '',
      '• 第一步。',
      '• 第二步',
    ].join('\n'))
  })

  it('omits flattened indented HTML and embedded image payloads', () => {
    const text = terminalMarkdownText('<p align="center">    <a href="https://bad.test">        <img alt="badge" src="data:image/svg+xml;base64,PHN2Zz4=" /></a></p># Safe heading')
    expect(text).toBe('Safe heading')
    expect(text).not.toContain('<img')
    expect(text).not.toContain('data:image')
    expect(text).not.toContain('PHN2Zz4')
  })
})

describe('foldTranscript', () => {
  it('marks same-turn assistant continuations and exposes one complete response', () => {
    const first = createAssistantMessage({
      content: [{ type: 'text', text: 'Initial finding.' }], source: { provider: 'p', model: 'm' },
    })
    const second = createAssistantMessage({
      content: [{ type: 'text', text: 'Supplemental conclusion.' }], source: { provider: 'p', model: 'm' },
    })
    const nodes = foldTranscript([
      event(0, 'assistant/message', { turn: 1, step: 1, message: first }),
      event(1, 'assistant/message', { turn: 1, step: 2, message: second }),
      event(2, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    expect(nodes).toMatchObject([
      { kind: 'text', tone: 'assistant' },
      { kind: 'text', tone: 'assistant', continuation: true, closing: true },
    ])
    expect(nodes[0]).not.toHaveProperty('continuation')
    const target = nodes[1]
    if (target?.kind !== 'text') throw new Error('expected assistant continuation')
    const parts = tuiAssistantResponseParts(nodes, target)
    expect(parts).toHaveLength(2)
    expect(tuiAssistantResponseText(parts)).toBe('Initial finding.\n\n---\n\nSupplemental conclusion.')
  })

  it('shows exact completed-Turn usage only when the durable attempt lifecycle is complete', () => {
    const assistant = createAssistantMessage({
      content: [{ type: 'text', text: 'Done.' }], source: { provider: 'p', model: 'm' },
    })
    const complete = [
      event(0, 'turn/start', { turn: 1 }),
      event(1, 'step/start', { turn: 1, step: 1 }),
      event(2, 'assistant/chunk', {
        turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      }),
      event(3, 'assistant/message', {
        turn: 1, step: 1, message: assistant, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      event(4, 'step/end', { turn: 1, step: 1 }),
      event(5, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    expect(foldTranscript(complete)).toContainEqual({
      kind: 'turn-usage',
      key: 'turn-usage:1',
      turn: 1,
      usage: {
        uncachedInputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        routes: [{ provider: 'p', model: 'm' }],
      },
    })
    expect(foldTranscript(complete.filter(candidate => candidate.type !== 'step/end'))
      .some(node => node.kind === 'turn-usage')).toBe(false)
  })

  it('navigates completed Turns by durable semantic anchors instead of physical pages', () => {
    const assistant = (text: string) => createAssistantMessage({
      content: [{ type: 'text', text }], source: { provider: 'p', model: 'm' },
    })
    const nodes = foldTranscript([
      event(0, 'turn/start', { turn: 1 }),
      event(1, 'user/message', createUserMessage({ content: [{ type: 'text', text: 'one' }], source: { kind: 'user' } })),
      event(2, 'assistant/message', { turn: 1, step: 1, message: assistant('first') }),
      event(3, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      event(4, 'turn/start', { turn: 2 }),
      event(5, 'user/message', createUserMessage({ content: [{ type: 'text', text: 'two' }], source: { kind: 'user' } })),
      event(6, 'assistant/message', { turn: 2, step: 1, message: assistant('second') }),
      event(7, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ])
    const anchors = tuiTranscriptTurnAnchors(nodes)
    expect(anchors.map(anchor => ({ turn: anchor.turn, key: anchor.key }))).toEqual([
      { turn: 1, key: 'event:1' },
      { turn: 2, key: 'event:5' },
    ])
    expect(navigateTuiTranscriptTurn(anchors, nodes.length - 1, 'previous', true)?.turn).toBe(2)
    expect(navigateTuiTranscriptTurn(anchors, anchors[1]?.index ?? 0, 'previous', false)?.turn).toBe(1)
    expect(navigateTuiTranscriptTurn(anchors, anchors[0]?.index ?? 0, 'next', false)?.turn).toBe(2)
    expect(navigateTuiTranscriptTurn(anchors, anchors[1]?.index ?? 0, 'next', false)).toBeUndefined()
  })

  it('projects settled user questions as bounded history cards without exposing secret answers', () => {
    const callId = ToolCallId('question-1')
    const result = createToolResultMessage({
      callId,
      content: [{ type: 'text', text: JSON.stringify({
        answers: [
          { id: 'choice', selected: ['Proceed'] },
          { id: 'secret', selected: [], custom: 'do-not-show' },
        ],
      }) }],
      isError: false,
    })
    const nodes = foldTranscript([
      event(0, 'tool/call', {
        turn: 1, step: 1, callId, name: 'ask_user_question',
        arguments: JSON.stringify({ questions: [
          { id: 'choice', header: 'Decision', question: 'Continue?' },
          { id: 'secret', question: 'Credential?', secret: true },
        ] }),
      }),
      event(1, 'tool/result', { turn: 1, step: 1, message: result }),
    ])
    expect(nodes).toEqual([expect.objectContaining({
      kind: 'question', status: 'answered', callId: 'question-1',
      questions: [
        expect.objectContaining({ id: 'choice', answer: 'Proceed', secret: false }),
        expect.not.objectContaining({ answer: 'do-not-show' }),
      ],
    })])
    expect(JSON.stringify(nodes)).not.toContain('do-not-show')
    const question = nodes[0]
    if (question?.kind !== 'question') throw new Error('expected question history')
    expect(tuiTranscriptDetailText(question, undefined, 'zh')).toContain('状态：已回答')
    expect(tuiTranscriptDetailText(question, undefined, 'zh')).toContain('回答：[已隐藏]')
    expect(tuiTranscriptDetailText(question, undefined, 'zh')).not.toContain('do-not-show')
  })

  it('distinguishes cancelled question history from generic failures', () => {
    const callId = ToolCallId('question-cancelled')
    const result = createToolResultMessage({
      callId, content: [{ type: 'text', text: 'Error: TUI user question was cancelled' }], isError: true,
    })
    const nodes = foldTranscript([
      event(0, 'tool/call', {
        turn: 1, step: 1, callId, name: 'ask_user_question',
        arguments: JSON.stringify({ questions: [{ id: 'choice', question: 'Continue?' }] }),
      }),
      event(1, 'tool/result', {
        turn: 1, step: 1, message: result, error: { name: 'UserQuestionError', code: 'ASK_CANCELLED' },
      }),
    ])
    expect(nodes).toEqual([expect.objectContaining({ kind: 'question', status: 'cancelled' })])
  })

  it('reconciles streamed assistant text and projects user, tool, and failure facts', () => {
    const callId = ToolCallId('call-1')
    const user = createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })
    const assistant = createAssistantMessage({
      content: [{ type: 'text', text: 'complete answer' }],
      source: { provider: 'p', model: 'm' },
    })
    const result = createToolResultMessage({
      callId,
      content: [{ type: 'text', text: '\u001b[31mresult' }],
      isError: false,
    })
    const events: SessionEvent[] = [
      event(0, 'user/message', user),
      event(1, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'partial' } }),
      event(2, 'assistant/message', { turn: 1, step: 1, message: assistant }),
      event(3, 'tool/call', { turn: 1, step: 1, callId, name: 'bash', arguments: '{"cmd":"pwd"}' }),
      event(4, 'tool/result', { turn: 1, step: 1, message: result }),
      event(5, 'turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'SERVER', message: 'down' } } }),
    ]
    const bash = {
      presentCall: () => ({ card: 'terminal', title: 'pwd', cwd: '/workspace' }),
      presentResult: () => ({ card: 'terminal', output: 'result', exitCode: 0 }),
    } as unknown as ToolDefinition
    expect(foldTranscript(events, name => name === 'bash' ? bash : undefined)).toEqual([
      expect.objectContaining({ label: 'You', text: 'hello' }),
      expect.objectContaining({ label: 'Assistant', text: 'complete answer' }),
      expect.objectContaining({
        kind: 'tool-activity', closed: true, tools: [expect.objectContaining({
          callId: 'call-1', name: 'bash', args: { cmd: 'pwd' }, state: 'success',
          callView: { card: 'terminal', title: 'pwd', cwd: '/workspace' },
          resultView: { card: 'terminal', output: 'result', exitCode: 0 },
          output: '�[31mresult',
        })],
      }),
      expect.objectContaining({ label: 'Error', text: 'SERVER: down' }),
    ])
  })

  it('applies a host-owned renderer only to known committed message events', () => {
    const user = createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })
    const assistant = createAssistantMessage({
      content: [{ type: 'text', text: 'complete answer' }], source: { provider: 'p', model: 'm' },
    })
    const rendered = foldTranscript([
      event(0, 'user/message', user),
      event(1, 'assistant/message', { turn: 1, step: 1, message: assistant }),
    ], undefined, input => input.type === 'assistant/message'
      ? { label: 'Extension', text: `${input.text} · ${input.seq}`, tone: 'status' }
      : undefined)
    expect(rendered).toEqual([
      expect.objectContaining({ label: 'You', text: 'hello' }),
      expect.objectContaining({ label: 'Extension', tone: 'status', text: 'complete answer · 1' }),
    ])
  })

  it('collapses completed reasoning with durable stream elapsed time while retaining detail text', () => {
    const assistant = createAssistantMessage({
      content: [{ type: 'reasoning', text: 'considered alternatives' }, { type: 'text', text: 'answer' }],
      source: { provider: 'p', model: 'm' },
    })
    const nodes = foldTranscript([
      { ...event(1, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'considered ' } }), time: 100 },
      { ...event(2, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'alternatives' } }), time: 350 },
      { ...event(3, 'assistant/message', { turn: 1, step: 1, message: assistant }), time: 600 },
    ])
    expect(nodes[0]).toMatchObject({ tone: 'reasoning', text: 'considered alternatives', durationMs: 500 })
  })

  it('omits plugin-origin context messages from the human transcript', () => {
    const context = createUserMessage({
      content: [{ type: 'text', text: 'hidden context' }],
      source: { kind: 'plugin', plugin: 'test' },
    })
    expect(foldTranscript([event(0, 'user/message', context)])).toEqual([])
  })

  it('omits model-only surface replacements from the human transcript', () => {
    const replacement = {
      ...event(1, 'assistant/message', {
        turn: 1,
        step: 1,
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'compacted model context' }],
          source: { provider: 'p', model: 'm' },
        }),
      }),
      surfaceOp: { op: 'replace' as const, start: SessionSeq(0), end: SessionSeq(0) },
      sourceEventSeqs: [SessionSeq(0)],
    }
    expect(foldTranscript([replacement])).toEqual([])
  })

  it('folds a durable compaction boundary and absorbs its correlated command row', () => {
    const compactionId = CompactionId('compact-1')
    const commandId = CommandId('command-1')
    const original = event(0, 'user/message', createUserMessage({
      content: [{ type: 'text', text: 'Original prompt' }], source: { kind: 'user' },
    }))
    const checkpoint = {
      ...event(3, 'user/message', createUserMessage({
        content: [{ type: 'text', text: 'Model-only checkpoint' }],
        source: compactCheckpointSource(compactionId, commandId),
      })),
      surfaceOp: { op: 'replace' as const, start: SessionSeq(0), end: SessionSeq(0) },
      sourceEventSeqs: [SessionSeq(0), SessionSeq(1), SessionSeq(2)],
    }
    const nodes = foldTranscript([
      original,
      event(1, 'compaction/start', { compactionId, sourceCommandId: commandId, turn: null }),
      event(2, 'compaction/summary', {
        compactionId, sourceCommandId: commandId,
        summary: [{ type: 'text', text: 'Durable compact summary' }],
        shadowedRange: { start: SessionSeq(0), end: SessionSeq(0) },
        shadowedSeqs: [SessionSeq(0)], shadowedTokenCount: 240,
        provider: 'p', model: 'm',
      }),
      checkpoint,
      event(4, 'compaction/end', { compactionId, sourceCommandId: commandId, turn: null }),
      event(5, 'command/done', {
        commandId, kind: 'success', text: 'Compacted 1 history item.', sourceEventSeq: SessionSeq(2),
      }),
    ])
    expect(nodes).toEqual([
      expect.objectContaining({ kind: 'text', label: 'You', text: 'Original prompt' }),
      {
        kind: 'compaction', key: 'compaction:compact-1', compactionId: 'compact-1',
        sourceCommandId: 'command-1', state: 'success', summary: 'Durable compact summary',
        shadowedItemCount: 1, shadowedTokenCount: 240, shadowedRange: { start: 0, end: 0 },
      },
    ])
  })

  it('rebuilds running and failed compaction markers from incomplete durable lifecycles', () => {
    const runningId = CompactionId('compact-running')
    const failedId = CompactionId('compact-failed')
    expect(foldTranscript([
      event(0, 'compaction/start', { compactionId: runningId, turn: 1 }),
    ])).toEqual([expect.objectContaining({
      kind: 'compaction', compactionId: 'compact-running', state: 'running',
    })])
    expect(foldTranscript([
      event(0, 'compaction/start', { compactionId: runningId, turn: 1 }),
      event(1, 'compaction/summary', {
        compactionId: runningId,
        summary: [{ type: 'text', text: 'Summary awaiting close' }],
        shadowedRange: { start: SessionSeq(4), end: SessionSeq(4) },
        shadowedSeqs: [SessionSeq(4)], shadowedTokenCount: 120,
        provider: 'p', model: 'm',
      }),
    ])).toEqual([expect.objectContaining({
      kind: 'compaction', compactionId: 'compact-running', state: 'running', summary: 'Summary awaiting close',
    })])
    expect(foldTranscript([
      event(0, 'compaction/start', { compactionId: failedId, turn: null }),
      event(1, 'compaction/end', { compactionId: failedId, turn: null, error: '\u001b[31msummary failed' }),
    ])).toEqual([expect.objectContaining({
      kind: 'compaction', compactionId: 'compact-failed', state: 'failure', error: '�[31msummary failed',
    })])
  })

  it('keeps malformed calls and throwing presenters visible through generic fallbacks', () => {
    const callId = ToolCallId('call-bad')
    const result = createToolResultMessage({
      callId,
      content: [{ type: 'text', text: 'fallback output' }],
      isError: true,
    })
    const throwing = {
      presentCall: () => { throw new Error('stale call presenter') },
      presentResult: () => { throw new Error('stale result presenter') },
    } as unknown as ToolDefinition
    expect(foldTranscript([
      event(0, 'tool/call', { turn: 1, step: 1, callId, name: 'legacy', arguments: '{bad' }),
      event(1, 'tool/result', { turn: 1, step: 1, message: result, error: { name: 'Error', code: 'FAILED' } }),
    ], () => throwing)).toEqual([
      expect.objectContaining({
        kind: 'tool-activity', tools: [expect.objectContaining({
          args: '{bad', state: 'error', output: 'fallback output', errorCode: 'FAILED',
          callView: { card: 'generic', title: 'legacy', rawInput: '{bad' },
        })],
      }),
    ])
  })

  it('pins the latest standing todo snapshot and absorbs its successful tool row', () => {
    const callId = ToolCallId('todo-call')
    const result = createToolResultMessage({ callId, content: [{ type: 'text', text: 'updated' }], isError: false })
    const events: SessionEvent[] = [
      event(0, 'tool/call', { turn: 1, step: 1, callId, name: 'todo_write', arguments: JSON.stringify({
        todos: [{ content: 'Inspect UI', status: 'in_progress' }, { content: 'Ship fix', status: 'pending' }],
      }) }),
      event(1, 'tool/result', { turn: 1, step: 1, message: result }),
      event(2, 'todo/write', { todos: [
        { content: 'Inspect UI', status: 'in_progress' }, { content: 'Ship fix', status: 'pending' },
      ] }),
      event(3, 'todo/write', { todos: [{ content: 'Inspect UI', status: 'completed' }] }),
    ]
    const nodes = foldTranscript(events)
    expect(nodes).toEqual([
      { kind: 'todo', key: 'todo:latest', todos: [{ content: 'Inspect UI', status: 'completed' }] },
    ])
  })

  it('retains failed todo tools and clears the standing list on the next turn', () => {
    const callId = ToolCallId('todo-failed')
    const result = createToolResultMessage({ callId, content: [{ type: 'text', text: 'invalid list' }], isError: true })
    const events: SessionEvent[] = [
      event(0, 'turn/start', { turn: 1 }),
      event(1, 'todo/write', { todos: [{ content: 'Valid task', status: 'in_progress' }] }),
      event(2, 'tool/call', { turn: 1, step: 1, callId, name: 'todo_write', arguments: '{}' }),
      event(3, 'tool/result', {
        turn: 1, step: 1, message: result, error: { name: 'Error', code: 'INVALID_TODO' },
      }),
      event(4, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    const nodes = foldTranscript(events)
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toEqual({
      kind: 'todo', key: 'todo:latest', todos: [{ content: 'Valid task', status: 'in_progress' }],
    })
    expect(nodes[1]).toMatchObject({
      kind: 'tool-activity', tools: [{ name: 'todo_write', state: 'error' }],
    })
    expect(foldTranscript([...events, event(5, 'turn/start', { turn: 2 })])).toHaveLength(1)
  })

  it('groups consecutive read and search calls without swallowing unrelated tools', () => {
    const read = {
      presentCall: (args: unknown) => ({
        card: 'generic', title: `Read ${(args as { path: string }).path}`, kind: 'read',
      }),
    } as unknown as ToolDefinition
    const search = {
      presentCall: () => ({ card: 'generic', title: 'Glob src/**', kind: 'search' }),
    } as unknown as ToolDefinition
    const events: SessionEvent[] = [
      event(0, 'tool/call', { turn: 1, step: 1, callId: ToolCallId('read-1'), name: 'read', arguments: '{"path":"a.ts"}' }),
      event(1, 'tool/call', { turn: 1, step: 1, callId: ToolCallId('glob-1'), name: 'glob', arguments: '{}' }),
      event(2, 'tool/call', { turn: 1, step: 1, callId: ToolCallId('bash-1'), name: 'bash', arguments: '{}' }),
    ]
    const nodes = foldTranscript(events, name => name === 'read' ? read : name === 'glob' ? search : undefined)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      kind: 'tool-activity', tools: [{ name: 'read' }, { name: 'glob' }, { name: 'bash' }],
    })
  })

  it('keeps consecutive tool activity from different scheduler turns separate', () => {
    const nodes = foldTranscript([
      event(0, 'tool/call', { turn: 1, step: 1, callId: ToolCallId('turn-1'), name: 'read', arguments: '{}' }),
      event(1, 'tool/call', { turn: 2, step: 1, callId: ToolCallId('turn-2'), name: 'read', arguments: '{}' }),
    ])
    expect(nodes).toMatchObject([
      { kind: 'tool-activity', turn: 1, tools: [{ callId: 'turn-1' }] },
      { kind: 'tool-activity', turn: 2, tools: [{ callId: 'turn-2' }] },
    ])
  })

  it('folds authoritative scheduler groups with stable model order and exclusive boundaries', () => {
    const calls = [
      { callId: ToolCallId('read-1'), name: 'read', arguments: '{}' },
      { callId: ToolCallId('delegate-1'), name: 'subagent', arguments: '{}' },
    ]
    const nodes = foldTranscript([
      event(0, 'tool/execution-group', { turn: 1, step: 1, group: 0, mode: 'parallel', members: calls, closed: false }),
      event(1, 'tool/call', { turn: 1, step: 1, ...calls[1]! }),
      event(2, 'tool/call', { turn: 1, step: 1, ...calls[0]! }),
      event(3, 'tool/execution-group', { turn: 1, step: 1, group: 0, mode: 'parallel', members: calls, closed: true }),
      event(4, 'tool/execution-group', {
        turn: 1, step: 1, group: 1, mode: 'exclusive',
        members: [{ callId: ToolCallId('write-1'), name: 'write', arguments: '{}' }], closed: true,
      }),
    ])
    expect(nodes).toMatchObject([{
      kind: 'tool-activity', key: 'tool-activity:1:read-1', closed: false,
      tools: [
        { callId: 'read-1', state: 'running' },
        { callId: 'delegate-1', state: 'running' },
        { callId: 'write-1', state: 'queued' },
      ],
    }])
  })

  it('applies a closing scheduler snapshot to the existing group identity', () => {
    const candidates = [
      { callId: ToolCallId('one'), name: 'read', arguments: '{}' },
      { callId: ToolCallId('barrier'), name: 'write', arguments: '{}' },
    ]
    const nodes = foldTranscript([
      event(0, 'tool/execution-group', {
        turn: 1, step: 1, group: 0, mode: 'parallel', members: candidates, closed: false,
      }),
      event(1, 'tool/execution-group', {
        turn: 1, step: 1, group: 0, mode: 'parallel', members: candidates.slice(0, 1), closed: true,
      }),
    ])
    expect(nodes).toMatchObject([{
      key: 'tool-activity:1:one', closed: false, tools: [{ callId: 'one' }],
    }])
  })

  it('replays one structured delegation activity without duplicating its tool row', () => {
    const callId = ToolCallId('delegate-1')
    const result = createToolResultMessage({ callId, content: [{ type: 'text', text: 'child accepted' }], isError: false })
    const nodes = foldTranscript([
      event(0, 'tool/execution-group', {
        turn: 1, step: 1, group: 0, mode: 'parallel',
        members: [{ callId, name: 'subagent', arguments: '{}' }], closed: true,
      }),
      event(1, 'tool/call', { turn: 1, step: 1, callId, name: 'subagent', arguments: '{}' }),
      event(2, 'subagent/delegation-start', {
        runId: 'run-1' as never, callId, childId: 'child-1' as never,
        provider: 'spawn', label: 'Inspect scheduler', local: true,
      }),
      event(3, 'tool/result', { turn: 1, step: 1, message: result }),
      event(4, 'subagent/delegation-end', {
        runId: 'run-1' as never, stopReason: 'completed',
        lastAssistantMessage: [{ type: 'text', text: 'Scheduler facts found' }],
      }),
    ])
    expect(nodes).toHaveLength(1)
    const group = nodes[0]
    expect(group).toMatchObject({
      kind: 'tool-activity',
      tools: [{
        callId: 'delegate-1', state: 'success',
        delegation: {
          runId: 'run-1', childId: 'child-1', provider: 'spawn', label: 'Inspect scheduler',
          stopReason: 'completed', outcome: 'Scheduler facts found',
        },
      }],
    })
    if (group?.kind !== 'tool-activity') throw new Error('expected activity')
    expect(toolDetailLines(group.tools[0]!)).toContain('Child: child-1')
    expect(toolStateMark(group.tools[0]!)).toBe('✓')
  })

  it('keeps an owning tool failure authoritative over a completed delegation', () => {
    const callId = ToolCallId('delegate-failed-disposal')
    const result = createToolResultMessage({
      callId, content: [{ type: 'text', text: 'dispose failed' }], isError: true,
    })
    const nodes = foldTranscript([
      event(0, 'tool/call', { turn: 1, step: 1, callId, name: 'subagent', arguments: '{}' }),
      event(1, 'subagent/delegation-start', {
        runId: 'run-failed' as never, callId, childId: 'child-failed' as never,
        provider: 'spawn', local: true,
      }),
      event(2, 'subagent/delegation-end', { runId: 'run-failed' as never, stopReason: 'completed' }),
      event(3, 'tool/result', {
        turn: 1, step: 1, message: result, error: { name: 'Error', code: 'DISPOSAL_FAILED' },
      }),
    ])
    const activity = nodes[0]
    if (activity?.kind !== 'tool-activity') throw new Error('expected activity')
    expect(toolStateMark(activity.tools[0]!)).toBe('✕')
  })
})

describe('TuiTranscriptProjectionCache', () => {
  it('matches a fresh full fold after every streaming, tool, delegation, group, and Tasks append', () => {
    const callId = ToolCallId('incremental-tool')
    const members = [{ callId, name: 'subagent', arguments: '{}' }]
    const events: SessionEvent[] = [
      event(0, 'user/message', createUserMessage({
        content: [{ type: 'text', text: 'Incremental prompt' }], source: { kind: 'user' },
      })),
      event(1, 'assistant/chunk', {
        turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'Think ' },
      }),
      event(2, 'assistant/chunk', {
        turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'partial' },
      }),
      event(3, 'assistant/message', {
        turn: 1, step: 1,
        message: createAssistantMessage({
          content: [{ type: 'reasoning', text: 'Thought' }, { type: 'text', text: 'Complete' }],
          source: { provider: 'fixture', model: 'incremental' },
        }),
      }),
      event(4, 'tool/execution-group', {
        turn: 1, step: 2, group: 0, mode: 'parallel', members, closed: false,
      }),
      event(5, 'tool/call', { turn: 1, step: 2, ...members[0]! }),
      event(6, 'subagent/delegation-start', {
        runId: 'incremental-run' as never, callId, childId: 'incremental-child' as never,
        provider: 'spawn', label: 'Inspect incrementally', local: true,
      }),
      event(7, 'tool/result', {
        turn: 1, step: 2,
        message: createToolResultMessage({
          callId, content: [{ type: 'text', text: 'tool settled' }], isError: false,
        }),
      }),
      event(8, 'subagent/delegation-end', {
        runId: 'incremental-run' as never, stopReason: 'completed',
        lastAssistantMessage: [{ type: 'text', text: 'delegation settled' }],
      }),
      event(9, 'tool/execution-group', {
        turn: 1, step: 2, group: 0, mode: 'parallel', members, closed: true,
      }),
      event(10, 'todo/write', { todos: [{ content: 'First task', status: 'in_progress' }] }),
      event(11, 'todo/write', { todos: [{ content: 'First task', status: 'completed' }] }),
      event(12, 'turn/start', { turn: 2 }),
    ]
    const cache = new TuiTranscriptProjectionCache()
    const prefix: SessionEvent[] = []
    for (const item of events) {
      prefix.push(item)
      expect(cache.update(prefix)).toEqual(foldTranscript(prefix))
    }
  })

  it('preserves unchanged node identity and replaces only an updated streaming block', () => {
    const user = event(0, 'user/message', createUserMessage({
      content: [{ type: 'text', text: 'Stable user' }], source: { kind: 'user' },
    }))
    const firstChunk = event(1, 'assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'first' },
    })
    const secondChunk = event(2, 'assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: ' second' },
    })
    const cache = new TuiTranscriptProjectionCache()
    const first = cache.update([user, firstChunk])
    expect(cache.update([user, firstChunk])).toBe(first)
    const second = cache.update([user, firstChunk, secondChunk])
    expect(second[0]).toBe(first[0])
    expect(second[1]).not.toBe(first[1])
    expect(second[1]).toMatchObject({ key: 'stream:1:1:assistant', text: 'first second' })
  })

  it('fully resets for a non-prefix snapshot and a compaction lifecycle', () => {
    const original = event(0, 'user/message', createUserMessage({
      content: [{ type: 'text', text: 'Original' }], source: { kind: 'user' },
    }))
    const replacement = event(0, 'user/message', createUserMessage({
      content: [{ type: 'text', text: 'Replacement' }], source: { kind: 'user' },
    }))
    const cache = new TuiTranscriptProjectionCache()
    const originalProjection = cache.update([original])
    expect(cache.update([replacement])).toEqual(foldTranscript([replacement]))

    const compaction = event(1, 'compaction/start', {
      compactionId: CompactionId('incremental-reset'), turn: 1,
    })
    const compacted = cache.update([replacement, compaction])
    expect(compacted).toEqual(foldTranscript([replacement, compaction]))
    expect(compacted[0]).not.toBe(originalProjection[0])
  })

  it('restores a known call as an independent row after its group releases ownership', () => {
    const callId = ToolCallId('released-call')
    const member = { callId, name: 'read', arguments: '{}' }
    const events: SessionEvent[] = [
      event(0, 'tool/execution-group', {
        turn: 1, step: 1, group: 0, mode: 'parallel', members: [member], closed: false,
      }),
      event(1, 'tool/execution-group', {
        turn: 1, step: 1, group: 0, mode: 'parallel', members: [], closed: true,
      }),
      event(2, 'tool/call', { turn: 1, step: 1, ...member }),
    ]
    const cache = new TuiTranscriptProjectionCache()
    expect(cache.update(events)).toEqual(foldTranscript(events))
    expect(cache.update(events)).toMatchObject([
      { kind: 'tool-activity', tools: [{ callId: 'released-call', state: 'running' }] },
    ])
  })
})

function toolNode(resultView: TranscriptToolNode['resultView']): TranscriptToolNode {
  return {
    kind: 'tool', key: 'tool:summary', callId: 'summary', name: 'fixture', args: {}, rawArguments: '{}',
    state: 'success', callView: { card: 'generic', title: 'Fixture' }, resultView,
  }
}

describe('selectTranscriptWindow', () => {
  it('budgets compact tool cards as one physical row instead of one transcript node per viewport row', () => {
    const tools = Array.from({ length: 20 }, (_, index): TranscriptToolNode => ({
      ...toolNode({ card: 'generic', content: [{ type: 'text', text: `result ${index}` }] }),
      key: `tool:${index}`,
      callId: String(index),
    }))
    expect(selectTranscriptWindow(tools, 6, 80).map(entry => entry.node.key)).toEqual([
      'tool:14', 'tool:15', 'tool:16', 'tool:17', 'tool:18', 'tool:19',
    ])
  })

  it('keeps an oversized assistant label and a marked tail within its row budget', () => {
    const assistant = {
      kind: 'text', key: 'assistant', tone: 'assistant', label: 'Assistant',
      text: `## Summary\n\n${'中文内容'.repeat(20)}\n\n**final answer**`,
    } as const
    const [entry] = selectTranscriptWindow([assistant], 5, 12)
    expect(entry?.node).toBe(assistant)
    expect(entry?.text).toContain('… earlier content')
    expect(entry?.text).toContain('final answer')
    expect(entry?.text).not.toContain('**')
  })

  it('budgets checklist rows instead of flattening a todo snapshot to one row', () => {
    const todo: TranscriptTodoNode = { kind: 'todo', key: 'todo:latest', todos: [
      { content: 'one', status: 'pending' as const },
      { content: 'two', status: 'in_progress' as const },
    ] }
    expect(selectTranscriptWindow([todo], 3, 80)).toEqual([{ node: todo }])
    expect(selectTranscriptWindow([todo], 2, 80)).toEqual([])
  })

  it('budgets grouped exploration as its heading plus each child operation', () => {
    const one = { ...toolNode(undefined), key: 'one', callId: 'one' }
    const two = { ...toolNode(undefined), key: 'two', callId: 'two' }
    const group = { kind: 'tool-group', key: 'group', tools: [one, two], activity: 'explore', closed: true } as const
    expect(selectTranscriptWindow([group], 3, 80)).toEqual([{ node: group }])
    expect(selectTranscriptWindow([group], 2, 80)).toEqual([])
  })

  it('collapses completed tool activity to one row and active activity to two rows', () => {
    const read = {
      ...toolNode(undefined), key: 'tool:read', callId: 'read',
      callView: { card: 'generic' as const, title: 'Read src/index.ts', kind: 'read' as const },
    }
    const terminal = {
      ...toolNode(undefined), key: 'tool:terminal', callId: 'terminal', state: 'running' as const,
      callView: { card: 'terminal' as const, title: 'pnpm test', cwd: '/workspace' },
    }
    const active: TranscriptToolActivityNode = {
      kind: 'tool-activity', key: 'activity:active', turn: 1, tools: [read, terminal], closed: false,
    }
    expect(tuiToolActivityRows(active)).toBe(2)
    expect(toolActivityHeadingText(active, 'en')).toBe('◌ 2 operations · 1 complete · 1 running')
    expect(toolActivityActiveText(active, 'zh', '/workspace')).toContain('正在执行：')
    expect(tuiToolActivityCategory(read)).toBe('read')
    expect(tuiToolActivityCategory(terminal)).toBe('terminal')
    expect(selectTranscriptWindow([active], 2, 80)).toEqual([{ node: active }])
    expect(selectTranscriptWindow([active], 1, 80)).toEqual([])

    const completed: TranscriptToolActivityNode = {
      ...active, key: 'activity:completed',
      tools: [read, { ...terminal, state: 'success' }], closed: true,
    }
    expect(tuiToolActivityRows(completed)).toBe(1)
    expect(toolActivityHeadingText(completed, 'zh')).toBe('✓ 2 项操作 · 读取 1 · 终端 1')
    expect(selectTranscriptWindow([completed], 1, 80)).toEqual([{ node: completed }])

    const failed: TranscriptToolActivityNode = {
      ...completed, key: 'activity:failed',
      tools: [{ ...read, state: 'error' }, { ...terminal, state: 'cancelled' }],
    }
    expect(toolActivityHeadingText(failed, 'en'))
      .toBe('✕ 2 operations · 1 failed · 1 cancelled · 1 read · 1 terminal')
  })

  it('caps structured child rows and budgets an omission marker', () => {
    const tools = Array.from({ length: 10 }, (_, index) => ({
      ...toolNode(undefined), key: `tool:${index}`, callId: String(index),
    }))
    const group = { kind: 'tool-group', key: 'large-group', tools, activity: 'parallel', closed: true } as const
    const todo = { kind: 'todo', key: 'todo:latest', todos: Array.from({ length: 10 }, (_, index) => ({
      content: `task ${index}`, status: 'pending' as const,
    })) } as const
    expect(selectTranscriptWindow([group], 8, 80)).toEqual([{ node: group }])
    expect(selectTranscriptWindow([todo], 8, 80)).toEqual([{ node: todo }])
    expect(selectTranscriptWindow([group], 7, 80)).toEqual([])
  })

  it('budgets compacted history markers by their visible status and summary rows', () => {
    const running = {
      kind: 'compaction', key: 'compaction:running', compactionId: 'running', state: 'running',
      shadowedItemCount: 0, shadowedTokenCount: 0,
    } as const
    const completed = {
      ...running, key: 'compaction:completed', state: 'success', summary: 'Retained decisions',
      shadowedItemCount: 4, shadowedTokenCount: 800,
    } as const
    const failedAfterSummary = {
      ...completed, key: 'compaction:failed', state: 'failure', error: 'checkpoint failed',
    } as const
    expect(selectTranscriptWindow([running], 1, 80)).toEqual([{ node: running }])
    expect(selectTranscriptWindow([completed], 1, 80)).toEqual([])
    expect(selectTranscriptWindow([completed], 2, 80)).toEqual([{ node: completed }])
    expect(selectTranscriptWindow([failedAfterSummary], 2, 80)).toEqual([])
    expect(selectTranscriptWindow([failedAfterSummary], 3, 80)).toEqual([{ node: failedAfterSummary }])
  })
})

describe('todoPanelRows', () => {
  it('hides empty state, bounds active lists, and collapses completed lists', () => {
    const node = (todos: TranscriptTodoNode['todos']): TranscriptTodoNode => ({
      kind: 'todo', key: 'todo:latest', todos,
    })
    expect(todoPanelRows(undefined)).toBe(0)
    expect(todoPanelRows(node([]))).toBe(0)
    expect(todoPanelRows(node([{ content: 'done', status: 'completed' }]))).toBe(1)
    expect(todoPanelRows(node(Array.from({ length: 10 }, (_, index) => ({
      content: `task ${index}`, status: 'pending' as const,
    }))))).toBe(8)
  })
})

describe('transcript navigation', () => {
  const tools = Array.from({ length: 20 }, (_, index): TranscriptToolNode => ({
    ...toolNode(undefined), key: `tool:${index}`, callId: String(index),
  }))

  it('pages backward and forward from stable semantic anchors', () => {
    const tail = selectTranscriptPage(tools, 6, 80)
    expect(tail.entries.map(item => item.node.key)).toEqual([
      'tool:14', 'tool:15', 'tool:16', 'tool:17', 'tool:18', 'tool:19',
    ])
    expect(tail).toMatchObject({ startIndex: 14, endIndex: 19, hasOlder: true, hasNewer: false })

    const previousKey = previousTranscriptPageAnchor(tools, tail.startIndex, 6, 80)
    expect(previousKey).toBe('tool:8')
    const previous = selectTranscriptPage(tools, 6, 80, previousKey)
    expect(previous.entries.map(item => item.node.key)).toEqual([
      'tool:8', 'tool:9', 'tool:10', 'tool:11', 'tool:12', 'tool:13',
    ])
    expect(previous).toMatchObject({ startIndex: 8, endIndex: 13, hasOlder: true, hasNewer: true })
    expect(selectTranscriptPage(tools, 6, 80, tools[previous.endIndex + 1]?.key).entries.map(item => item.node.key))
      .toEqual(tail.entries.map(item => item.node.key))
  })

  it('keeps a historical anchor stable while new nodes arrive and the terminal resizes', () => {
    const anchored = selectTranscriptPage(tools, 5, 80, 'tool:8')
    const appended = [...tools, { ...toolNode(undefined), key: 'tool:20', callId: '20' }]
    expect(selectTranscriptPage(appended, 5, 80, 'tool:8').entries.map(item => item.node.key))
      .toEqual(anchored.entries.map(item => item.node.key))
    expect(selectTranscriptPage(appended, 3, 40, 'tool:8')).toMatchObject({
      startIndex: 8, endIndex: 10, hasNewer: true,
    })
  })

  it('retains the nearest semantic position when a streaming node is replaced', () => {
    const streaming = { kind: 'text', key: 'stream:1', tone: 'assistant', label: 'Assistant', text: 'partial' } as const
    const completed = { ...streaming, key: 'event:4:assistant', text: 'complete' }
    const before = [tools[0]!, streaming, tools[1]!]
    const after = [tools[0]!, completed, tools[1]!]
    expect(selectTranscriptPage(before, 4, 80, streaming.key, 1).startIndex).toBe(1)
    const replaced = selectTranscriptPage(after, 4, 80, streaming.key, 1)
    expect(replaced.startIndex).toBe(1)
    expect(replaced.entries[0]?.node.key).toBe(completed.key)
  })

  it('shows the beginning of an oversized text block when anchored at its top', () => {
    const text = {
      kind: 'text', key: 'long', tone: 'assistant', label: 'Assistant',
      text: `${'start '.repeat(20)}\n${'end '.repeat(20)}`,
    } as const
    const page = selectTranscriptPage([text, ...tools], 4, 12, 'long')
    expect(page.entries[0]?.text).toContain('start')
    expect(page.entries[0]?.text).toContain('… later content')
    expect(page).toMatchObject({ startIndex: 0, endIndex: 0, hasOlder: false, hasNewer: true })
  })
})

describe('virtual transcript viewport', () => {
  const tools = Array.from({ length: 20 }, (_, index): TranscriptToolNode => ({
    ...toolNode(undefined), key: `virtual:${index}`, callId: String(index),
  }))

  it('matches the complete helper while mounting bounded neighboring overscan', () => {
    const viewport = new TuiTranscriptViewportIndex()
    for (const width of [40, 80, 160]) {
      viewport.update(tools, width)
      for (const anchor of [undefined, { key: 'virtual:0', index: 0 }, { key: 'virtual:8', index: 8 }]) {
        const actual = viewport.page(6, anchor)
        const expected = selectTranscriptPage(tools, 6, width, anchor?.key, anchor?.index)
        expect(actual.entries).toEqual(expected.entries)
        expect(actual).toMatchObject({
          startIndex: expected.startIndex,
          endIndex: expected.endIndex,
          hasOlder: expected.hasOlder,
          hasNewer: expected.hasNewer,
        })
      }
    }

    viewport.update(tools, 80)
    const historical = viewport.page(6, { key: 'virtual:8', index: 8 })
    expect(historical.overscanBefore.map(item => item.node.key)).toEqual(['virtual:6', 'virtual:7'])
    expect(historical.overscanAfter.map(item => item.node.key)).toEqual(['virtual:14', 'virtual:15'])
    expect(historical).toMatchObject({ mountedStartIndex: 6, mountedEndIndex: 15 })
  })

  it('uses one scroll controller for paging, boundaries, replacement, and reveal', () => {
    const viewport = new TuiTranscriptViewportIndex()
    const scroll = new TuiTranscriptScrollController(viewport)
    viewport.update(tools, 80)
    const tail = viewport.page(6)
    const previousAnchor = scroll.previous(tail, 6)
    expect(previousAnchor).toEqual({ key: 'virtual:8', index: 8 })
    const previous = viewport.page(6, previousAnchor)
    expect(scroll.next(previous, 6)).toBeUndefined()
    expect(scroll.oldest()).toEqual({ key: 'virtual:0', index: 0 })
    expect(scroll.latest()).toBeUndefined()
    expect(scroll.ensureVisible(previousAnchor, previous, 'virtual:10', 10)).toBe(previousAnchor)
    expect(scroll.ensureVisible(previousAnchor, previous, 'virtual:18', 18)).toEqual({ key: 'virtual:18', index: 18 })

    const replaced = [...tools.slice(0, 8), { ...tools[8]!, key: 'virtual:replacement' }, ...tools.slice(9)]
    viewport.update(replaced, 80)
    expect(scroll.reveal('virtual:8', 8)).toEqual({ key: 'virtual:replacement', index: 8 })
  })

  it('moves mouse-style navigation by small physical-row deltas while paging stays separate', () => {
    const viewport = new TuiTranscriptViewportIndex()
    const scroll = new TuiTranscriptScrollController(viewport)
    viewport.update(tools, 80)
    const tail = viewport.page(6)
    const threeRowsOlder = scroll.byRows(tail, -3, 6)
    expect(threeRowsOlder).toEqual({ key: 'virtual:11', index: 11 })
    const historical = viewport.page(6, threeRowsOlder)
    expect(historical.entries.map(entry => entry.node.key)).toEqual([
      'virtual:11', 'virtual:12', 'virtual:13', 'virtual:14', 'virtual:15', 'virtual:16',
    ])
    expect(scroll.byRows(historical, 3, 6)).toBeUndefined()
  })

  it('moves a dense text and compact-activity tail without falling back to the same live frame', () => {
    const history = Array.from({ length: 11 }, (_, index): TranscriptTextNode => ({
      kind: 'text', key: `history:${index}`, tone: 'user', label: 'You', text: `Historical prompt ${index}`,
    }))
    const assistant: TranscriptTextNode = {
      kind: 'text', key: 'history:assistant', tone: 'assistant', label: 'Assistant',
      text: 'Summary\n\nfinal answer\n\n- first\n- second',
    }
    const activity: TranscriptToolActivityNode = {
      kind: 'tool-activity', key: 'history:activity', turn: 1,
      tools: [{ ...toolNode(undefined), key: 'history:tool', callId: 'history:tool' }], closed: true,
    }
    const nodes: readonly TranscriptNode[] = [...history, assistant, activity]
    const viewport = new TuiTranscriptViewportIndex()
    const scroll = new TuiTranscriptScrollController(viewport)
    viewport.update(nodes, 76)
    const tail = viewport.page(20)
    const previous = scroll.byRows(tail, -3, 20)
    expect(previous).toBeDefined()
    expect(viewport.page(20, previous).startIndex).toBeLessThan(tail.startIndex)
  })

  it('enters a following long answer at its beginning when the mouse wheel crosses the block boundary', () => {
    const activity: TranscriptToolActivityNode = {
      kind: 'tool-activity', key: 'wheel:activity', turn: 1,
      tools: [{ ...toolNode(undefined), key: 'wheel:tool', callId: 'wheel:tool' }], closed: true,
    }
    const answer: TranscriptTextNode = {
      kind: 'text', key: 'wheel:answer', tone: 'assistant', label: 'Assistant', closing: true,
      text: Array.from({ length: 7 }, (_, index) => `answer line ${index}`).join('\n'),
    }
    const viewport = new TuiTranscriptViewportIndex()
    const scroll = new TuiTranscriptScrollController(viewport)
    viewport.update([activity, answer], 80)

    const activityPage = viewport.page(8, { key: activity.key, index: 0 })
    expect(activityPage.entries.map(entry => entry.node.key)).toEqual([activity.key])
    const wheelAnchor = scroll.byRows(activityPage, 3, 8)
    expect(wheelAnchor).toEqual({ key: answer.key, index: 1 })
    expect(viewport.page(8, wheelAnchor).entries[0]).toMatchObject({
      node: answer,
      textRange: { start: 0 },
    })
    expect(scroll.next(activityPage, 8)).toEqual({ key: answer.key, index: 1 })
  })

  it('holds same-direction wheel inertia until a crossed text boundary becomes quiet', () => {
    const guard = new TuiTranscriptWheelBoundaryGuard()
    guard.start(1, 1_000)
    expect(guard.consume(1, 1_100)).toBe(true)
    expect(guard.consume(1, 1_250)).toBe(true)
    expect(guard.consume(1, 1_431)).toBe(false)
    guard.start(1, 2_000)
    expect(guard.consume(-1, 2_010)).toBe(false)
  })

  it('indexes physical rows while measuring only the viewport neighborhood', () => {
    const nodes = Array.from({ length: 10_000 }, (_, index): TranscriptToolNode => ({
      ...toolNode(undefined), key: `large:${index}`, callId: String(index),
    }))
    const viewport = new TuiTranscriptViewportIndex()
    viewport.update(nodes, 80)
    const tail = viewport.page(16)
    expect(tail).toMatchObject({ startIndex: 9_984, endIndex: 9_999 })
    expect(tail.mountedEndIndex - tail.mountedStartIndex + 1).toBe(18)
    expect(viewport.stats()).toMatchObject({ measuredBlocks: 17, estimatedBlocks: 9_983, indexedRows: 10_000 })
    expect(viewport.physicalRowAt(5_000)).toBe(5_000)
    expect(viewport.indexAtPhysicalRow(5_000)).toBe(5_000)

    const middle = viewport.page(16, { key: 'large:5000', index: 5_000 })
    expect(middle).toMatchObject({ startIndex: 5_000, endIndex: 5_015, mountedStartIndex: 4_998, mountedEndIndex: 5_017 })
    expect(viewport.stats().measuredBlocks).toBe(34)
    viewport.update(nodes, 40)
    expect(viewport.page(16, { key: 'large:5000', index: 5_000 }).startIndex).toBe(5_000)
    expect(viewport.stats().measuredBlocks).toBe(34)
  })

  it('keeps oversized head and tail behavior differential with the complete helper', () => {
    const long = {
      kind: 'text', key: 'virtual:long', tone: 'assistant', label: 'Assistant',
      text: `${'start '.repeat(20)}\n${'end '.repeat(20)}`,
    } as const
    const viewport = new TuiTranscriptViewportIndex()
    viewport.update([long], 12)
    expect(viewport.page(4).entries).toEqual(selectTranscriptPage([long], 4, 12).entries)
    expect(viewport.page(4, { key: long.key, index: 0 }).entries)
      .toEqual(selectTranscriptPage([long], 4, 12, long.key, 0).entries)
  })

  it('pages within one oversized assistant answer before reaching earlier tool calls', () => {
    const before = { ...toolNode(undefined), key: 'before-long-answer', callId: 'before-long-answer' }
    const answer = {
      kind: 'text', key: 'long-answer', tone: 'assistant', label: 'Assistant',
      text: Array.from({ length: 30 }, (_, index) => `answer line ${String(index).padStart(2, '0')}`).join('\n'),
    } as const
    const viewport = new TuiTranscriptViewportIndex()
    const scroll = new TuiTranscriptScrollController(viewport)
    viewport.update([before, answer], 80)

    const tail = viewport.page(8)
    expect(tail.entries[0]).toMatchObject({
      node: answer,
      textRange: { start: 25, end: 30, total: 30 },
    })
    const previousAnchor = scroll.previous(tail, 8)
    expect(previousAnchor).toEqual({ key: answer.key, index: 1, rowOffset: 21 })
    const previous = viewport.page(8, previousAnchor)
    expect(previous.entries).toHaveLength(1)
    expect(previous.entries[0]).toMatchObject({
      node: answer,
      textRange: { start: 21, end: 25, total: 30 },
    })
    expect(previous.entries[0]?.text).toContain('answer line 21')
    expect(previous.entries[0]?.text).not.toContain('before-long-answer')
    expect(scroll.next(previous, 8)).toEqual({ key: answer.key, index: 1, rowOffset: 25 })
    expect(scroll.byRows(tail, -3, 8)).toEqual({ key: answer.key, index: 1, rowOffset: 22 })
    expect(scroll.byRows(viewport.page(8, { key: answer.key, index: 1, rowOffset: 22 }), 3, 8))
      .toBeUndefined()
  })
})

describe('TuiTerminalInputDecoder', () => {
  const decode = (sequence: string): readonly unknown[] => new TuiTerminalInputDecoder().push(sequence)

  it('infers Shift from one legacy-terminal uppercase key', () => {
    expect(decode('S')).toEqual([{ kind: 'input', input: 'S', key: { shift: true } }])
  })

  it('separates controls from committed text in one transport chunk', () => {
    expect(decode('\u007fexports')).toEqual([
      { kind: 'input', input: '', key: { backspace: true } },
      { kind: 'input', input: 'exports', key: {} },
    ])
    expect(decode('before\u0003after')).toEqual([
      { kind: 'input', input: 'before', key: {} },
      { kind: 'input', input: 'c', key: { ctrl: true } },
      { kind: 'input', input: 'after', key: {} },
    ])
  })

  it.each([
    ['xterm arrow', '\u001b[A', { kind: 'input', input: '', key: { upArrow: true } }],
    ['xterm modified arrow', '\u001b[1;3D', { kind: 'input', input: '', key: { leftArrow: true, meta: true } }],
    ['xterm Home', '\u001b[7~', { kind: 'input', input: '', key: { home: true } }],
    ['xterm End', '\u001bOF', { kind: 'input', input: '', key: { end: true } }],
    ['xterm forward delete', '\u001b[3~', { kind: 'input', input: '', key: { delete: true } }],
    ['xterm shift tab', '\u001b[Z', { kind: 'input', input: '', key: { tab: true, shift: true } }],
    ['Option word left', '\u001bb', { kind: 'input', input: '', key: { leftArrow: true, meta: true } }],
    ['Option word right', '\u001bf', { kind: 'input', input: '', key: { rightArrow: true, meta: true } }],
    ['Kitty shift enter', '\u001b[13;2u', { kind: 'input', input: '', key: { return: true, shift: true } }],
    ['Kitty repeat', '\u001b[102;3:2u', { kind: 'input', input: 'f', key: { meta: true } }],
    ['Kitty ctrl super', '\u001b[99;13u', { kind: 'input', input: 'c', key: { ctrl: true, super: true } }],
    ['Kitty shifted text', '\u001b[97;2;65u', { kind: 'input', input: 'A', key: { shift: true } }],
    ['Kitty base-layout shortcut', '\u001b[1089::99;5u', { kind: 'input', input: 'c', key: { ctrl: true } }],
    ['Kitty IME text', '\u001b[0;1;20320:22909u', { kind: 'input', input: '你好', key: {} }],
    ['Kitty keypad digit', '\u001b[57399u', { kind: 'input', input: '0', key: {} }],
    ['modifyOtherKeys', '\u001b[27;6;13~', { kind: 'input', input: '', key: { return: true, shift: true, ctrl: true } }],
    ['application keypad digit', '\u001bOp', { kind: 'input', input: '0', key: {} }],
    ['application keypad enter', '\u001bOM', { kind: 'input', input: '', key: { return: true } }],
  ])('normalizes %s at every split position', (_name, sequence, expected) => {
    for (let split = 0; split <= sequence.length; split += 1) {
      const decoder = new TuiTerminalInputDecoder()
      expect([...decoder.push(sequence.slice(0, split)), ...decoder.push(sequence.slice(split))]).toEqual([expected])
    }
  })

  it('preserves UTF-8 committed text across byte splits', () => {
    const bytes = Buffer.from('A你好🙂Z')
    for (let split = 0; split <= bytes.length; split += 1) {
      const decoder = new TuiTerminalInputDecoder()
      const events = [...decoder.push(bytes.subarray(0, split)), ...decoder.push(bytes.subarray(split))]
      expect(events.every(event => event.kind === 'input')).toBe(true)
      expect(events.flatMap(event => event.kind === 'input' ? event.input : []).join('')).toBe('A你好🙂Z')
    }
  })

  it('tokenizes mouse, focus, paste, and terminal replies without text leakage', () => {
    const decoder = new TuiTerminalInputDecoder()
    expect(decoder.push('\u001b[<64;12;4M\u001b[I\u001b[?1;2c')).toEqual([
      { kind: 'mouse', button: 64, column: 12, row: 4, release: false },
      { kind: 'focus', focused: true },
      { kind: 'reply', sequence: '\u001b[?1;2c' },
    ])
    expect(decoder.push('\u001b[200~line 1\n')).toEqual([])
    expect(decoder.push('line 2\u001b[201~')).toEqual([
      { kind: 'input', input: 'line 1\nline 2', key: { paste: true } },
    ])
    expect(tuiTerminalMouseReportKind(0, false)).toBe('press')
    expect(tuiTerminalMouseReportKind(0, true)).toBe('release')
    expect(tuiTerminalMouseReportKind(32, false)).toBe('motion')
    expect(tuiTerminalMouseReportKind(64, false)).toBe('wheel')
  })

  it.each([
    ['mouse', '\u001b[<68;12;4M', { kind: 'mouse', button: 68, column: 12, row: 4, release: false }],
    ['focus out', '\u001b[O', { kind: 'focus', focused: false }],
    ['device attributes', '\u001b[>41;331;0c', { kind: 'reply', sequence: '\u001b[>41;331;0c' }],
    ['cursor position', '\u001b[12;40R', { kind: 'reply', sequence: '\u001b[12;40R' }],
    ['OSC reply', '\u001b]11;rgb:ffff/ffff/ffff\u001b\\', {
      kind: 'reply', sequence: '\u001b]11;rgb:ffff/ffff/ffff\u001b\\',
    }],
  ])('retains %s semantics at every split position', (_name, sequence, expected) => {
    for (let split = 0; split <= sequence.length; split += 1) {
      const decoder = new TuiTerminalInputDecoder()
      expect([...decoder.push(sequence.slice(0, split)), ...decoder.push(sequence.slice(split))]).toEqual([expected])
    }
  })

  it('retains bracketed paste content at every transport split', () => {
    const sequence = '\u001b[200~line 1\n你好\u001b[201~'
    for (let split = 0; split <= sequence.length; split += 1) {
      const decoder = new TuiTerminalInputDecoder()
      expect([...decoder.push(sequence.slice(0, split)), ...decoder.push(sequence.slice(split))]).toEqual([
        { kind: 'input', input: 'line 1\n你好', key: { paste: true } },
      ])
    }
  })

  it('drops unknown function keys and incomplete CSI while timing out standalone Escape', () => {
    expect(decode([
      '\u001b[25~', '\u001b[26~', '\u001b[28~', '\u001b[29~', '\u001b[31~', '\u001b[32~', '\u001b[33~', '\u001b[34~',
      '\u001b[1;2P', '\u001b[1;2Q', '\u001b[1;2S', '\u001b[57376u', '\u001b[57398u',
      '\u001b[57428u', '\u001b[999z', '\u001b[97;1:3u',
    ].join(''))).toEqual([])
    expect(decode('\u001b[1;2R')).toEqual([{ kind: 'reply', sequence: '\u001b[1;2R' }])
    const incomplete = new TuiTerminalInputDecoder()
    expect(incomplete.push('\u001b[<64;12')).toEqual([])
    expect(incomplete.flush()).toEqual([])
    const incompleteUtf8 = new TuiTerminalInputDecoder()
    expect(incompleteUtf8.push(Buffer.from([0xe4, 0xbd]))).toEqual([])
    expect(incompleteUtf8.flush()).toEqual([])
    const overlong = new TuiTerminalInputDecoder()
    expect(overlong.push(`\u001b[${'1'.repeat(300)}`)).toEqual([])
    expect(overlong.waiting).toBeUndefined()
    const escape = new TuiTerminalInputDecoder()
    expect(escape.push('\u001b')).toEqual([])
    expect(escape.waiting).toBe('escape')
    expect(escape.flush()).toEqual([{ kind: 'input', input: '', key: { escape: true } }])
  })
})

describe('focused details', () => {
  it('retains complete logical tool output for bounded detail navigation', () => {
    const terminal = toolNode({ card: 'terminal', output: Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n') })
    expect(toolDetailLines(terminal)).toEqual([
      'workspace', '$ Fixture', ...Array.from({ length: 20 }, (_, index) => `line ${index + 1}`),
    ])
    expect(toolDetailLines(toolNode({ card: 'read', path: 'a.ts', offset: 4, totalLines: 10, lines: [
      { number: 4, text: 'const value = 1' }, { number: 5, text: 'value += 1' },
    ] }))).toEqual(['a.ts (text)', '4 | const value = 1', '5 | value += 1'])
    expect(toolDetailLines(toolNode({ card: 'search', shape: 'paths', paths: ['a.ts', 'b.ts'], total: 2, truncated: false })))
      .toEqual(['· a.ts', '· b.ts'])
    expect(toolDetailLines(toolNode({ card: 'diff', diffs: [
      { path: 'a.ts', oldText: 'old\nline', newText: 'new\nline' },
    ] }))).toEqual(['a.ts', '- old', '+ new', '  line'])
    expect(toolDetailLines(toolNode({ card: 'search', shape: 'matches', files: [
      { path: 'a.ts', matches: [{ lineNumber: 3, line: 'const match = true' }] },
    ], total: 1, truncated: false }))).toEqual(['a.ts', '3 const match = true'])
    expect(toolDetailLines(toolNode({
      card: 'web', kind: 'search', answer: 'answer', sources: [
        { url: 'https://example.test', title: 'Example', snippet: 'snippet' },
      ], truncated: false,
    }))).toEqual(['answer', 'Example', 'https://example.test', 'snippet'])
    expect(toolDetailLines({
      ...toolNode({ card: 'web', kind: 'fetch', url: 'https://example.test', statusCode: 200, truncated: false }),
      output: 'body',
    })).toEqual(['https://example.test', 'body'])
    expect(toolDetailLines(toolNode({
      card: 'generic', content: [{ type: 'text', text: 'first\nsecond' }],
    }))).toEqual(['first', 'second'])
  })

  it('wraps long detail lines by Unicode display cells', () => {
    expect(terminalWrappedLines('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
    expect(terminalWrappedLines('ab中文cd', 4)).toEqual(['ab中', '文cd'])
    expect(terminalWrappedLines('e\u0301e\u0301e\u0301', 2)).toEqual(['e\u0301e\u0301', 'e\u0301'])
  })

  it('caches detail rows independently by node identity and terminal width', () => {
    const cache = new TuiTranscriptDetailCache()
    const node = toolNode({ card: 'generic', content: [{ type: 'text', text: 'abcdefghij' }] })
    const wide = cache.lines(node, 8)
    expect(wide).toEqual(['abcdefgh', 'ij'])
    expect(tuiTranscriptDetailText(node)).toBe('abcdefghij')
    expect(cache.lines(node, 8)).toBe(wide)
    expect(cache.lines(node, 4)).toEqual(['abcd', 'efgh', 'ij'])

    const changed = {
      ...node,
      resultView: { card: 'generic' as const, content: [{ type: 'text' as const, text: 'changed' }] },
    }
    expect(cache.lines(changed, 8)).toEqual(['changed'])
    expect(cache.lines(changed, 8)).not.toBe(wide)
  })
})

describe('toolSummary', () => {
  it('summarizes every structured result card without repeating full output', () => {
    expect(toolSummary(toolNode({ card: 'terminal', output: 'first\nsecond', exitCode: 2 }))).toBe('exit 2 · first')
    expect(toolSummary(toolNode({ card: 'terminal', signal: 'SIGTERM' }))).toBe('SIGTERM')
    expect(toolSummary(toolNode({ card: 'diff', diffs: [{ path: 'a', oldText: 'x', newText: 'y' }] }))).toBe('1 file changed · +1/-1')
    expect(toolSummary(toolNode({ card: 'search', shape: 'matches', files: [], total: 42, truncated: true }))).toBe('42 matches · capped')
    expect(toolSummary(toolNode({ card: 'search', shape: 'paths', paths: ['a'], total: 1, truncated: false }))).toBe('1 paths')
    expect(toolSummary(toolNode({ card: 'read', path: 'src/a.ts', offset: 4, lines: [{ number: 4, text: 'x' }], totalLines: 20 }))).toBe('src/a.ts:4 · 1/20 lines')
    expect(toolSummary(toolNode({ card: 'web', kind: 'fetch', url: 'https://a.test', statusCode: 200, truncated: true }))).toBe('a.test · 200 · capped')
    expect(toolSummary(toolNode({ card: 'web', kind: 'search', sources: [], truncated: false }))).toBe('0 sources')
    expect(toolSummary(toolNode({ card: 'generic', content: [{ type: 'text', text: 'done\nmore' }] }))).toBe('done')
    expect(toolSummary({ ...toolNode(undefined), name: 'todo_write', args: {
      todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }],
    } })).toBe('1/2 done · 1 active')
    expect(toolSummary({
      ...toolNode(undefined),
      callView: { card: 'generic', title: 'Read /workspace/src/a.ts', rawInput: { file_path: '/workspace/src/a.ts' } },
    }, '/workspace')).toBe('src/a.ts')
    expect(toolSummary({
      ...toolNode(undefined), callView: { card: 'generic', title: 'fixture', rawInput: {} },
    })).toBe('structured input')
  })
})

describe('InteractionStore', () => {
  it('serializes approval and question waits FIFO and settles structured answers', async () => {
    const store = new InteractionStore()
    const agent = { id: 'session-a' } as never
    const approval = store.askApproval({ agent, toolName: 'bash' })
    const question = store.askQuestion({
      agent,
      questions: [{ id: 'q1', question: 'Choose', options: [{ label: 'A' }] }],
    })
    expect(store.getSnapshot()).toMatchObject({ kind: 'approval', request: { toolName: 'bash' } })
    store.answerApproval('allowed-once')
    await expect(approval).resolves.toBe('allowed-once')
    expect(store.getSnapshot()).toMatchObject({ kind: 'question' })
    store.answerQuestion({ answers: [{ id: 'q1', selected: ['A'] }] })
    await expect(question).resolves.toEqual({ answers: [{ id: 'q1', selected: ['A'] }] })
    expect(store.getSnapshot()).toBeUndefined()
  })

  it('cancels aborted and disposed waits without leaving a current interaction', async () => {
    const store = new InteractionStore()
    const controller = new AbortController()
    const question = store.askQuestion({
      agent: { id: 'session-a' } as never,
      signal: controller.signal,
      questions: [{ id: 'q', question: 'Q' }],
    })
    controller.abort()
    await expect(question).rejects.toMatchObject({ code: 'ASK_ABORTED' })
    const approval = store.askApproval({ agent: { id: 'session-a' } as never, toolName: 'bash' })
    store.dispose()
    await expect(approval).resolves.toBe('cancelled')
    expect(store.getSnapshot()).toBeUndefined()
  })

  it('distinguishes explicit human dismissal from owner abort', async () => {
    const store = new InteractionStore()
    const question = store.askQuestion({
      agent: { id: 'session-a' } as never,
      questions: [{ id: 'q', question: 'Q' }],
    })
    store.cancelCurrent()
    const error = await question.catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code: 'ASK_CANCELLED' })
    expect(isTuiQuestionCancellation(error)).toBe(true)
    expect(store.getSnapshot()).toBeUndefined()
  })
})

describe('TerminalSession', () => {
  it('refuses non-TTY streams before writing and restores a transaction once', () => {
    let output = ''
    let raw = true
    const streams = {
      stdin: { isTTY: true, isRaw: true, setRawMode: (value: boolean) => { raw = value } },
      stdout: { isTTY: true, write: (chunk: string) => { output += chunk; return true } },
      stderr: { write: () => true },
    } as unknown as TuiStreams
    const terminal = new TerminalSession(streams)
    terminal.enter()
    terminal.restore()
    terminal.restore()
    expect(output).toContain('\u001b[?1049h')
    expect(output).toContain('\u001b[?1007l\u001b[?1000h\u001b[?1006h')
    expect(output).toContain('\u001b[?1006h')
    expect(output).toContain('\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1006l\u001b[?1007h')
    expect(output.match(/\u001b\[\?1049l/g)).toHaveLength(1)
    expect(raw).toBe(false)

    const notTty = new TerminalSession({
      ...streams,
      stdout: { isTTY: false, write: () => true } as never,
    })
    expect(() => { notTty.enter() }).toThrow('requires interactive stdin and stdout TTYs')
  })

  it('enables only button-motion selection reports and restores them across handoff', () => {
    let output = ''
    const terminal = new TerminalSession({
      stdin: { isTTY: true, isRaw: false, setRawMode: () => undefined },
      stdout: { isTTY: true, write: (chunk: string) => { output += chunk; return true } },
      stderr: { write: () => true },
    } as unknown as TuiStreams)
    terminal.enter()
    expect(terminal.setSelectionMouseMode(true)).toBe(true)
    expect(terminal.setSelectionMouseMode(true)).toBe(true)
    expect(output.match(/\u001b\[\?1002h/gu)).toHaveLength(1)
    expect(output).not.toContain('\u001b[?1003h')
    const handoff = terminal.handoff()
    handoff.resume()
    expect(output.match(/\u001b\[\?1002h/gu)).toHaveLength(2)
    expect(terminal.setSelectionMouseMode(false)).toBe(true)
    expect(output.match(/\u001b\[\?1002l/gu)).toHaveLength(2)
    expect(output).toContain('\u001b[?1002l\u001b[?1000h\u001b[?1006h')
    terminal.restore()
    expect(terminal.setSelectionMouseMode(true)).toBe(false)
  })

  it('returns pointer ownership to the terminal and preserves mouse off across handoff', () => {
    let output = ''
    const terminal = new TerminalSession({
      stdin: { isTTY: true, isRaw: false, setRawMode: () => undefined },
      stdout: { isTTY: true, write: (chunk: string) => { output += chunk; return true } },
      stderr: { write: () => true },
    } as unknown as TuiStreams)
    terminal.enter()
    expect(terminal.setSelectionMouseMode(true)).toBe(true)
    expect(terminal.setMouseMode(false)).toBe(true)
    expect(output).toContain('\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1006l\u001b[?1007h')
    expect(terminal.setSelectionMouseMode(true)).toBe(false)
    const handoff = terminal.handoff()
    handoff.resume()
    expect(output.match(/\u001b\[\?1000h/gu)).toHaveLength(2)
    expect(output.match(/\u001b\[\?1000l/gu)).toHaveLength(2)
    expect(terminal.setMouseMode(true)).toBe(true)
    expect(output).toContain('\u001b[?1007l\u001b[?1000h\u001b[?1006h')
    expect(output.match(/\u001b\[\?1000h/gu)).toHaveLength(3)
    terminal.restore()
  })

  it('releases and reacquires one terminal transaction through an idempotent handoff', () => {
    let output = ''
    const terminal = new TerminalSession({
      stdin: { isTTY: true, isRaw: false, setRawMode: () => undefined },
      stdout: { isTTY: true, write: (chunk: string) => { output += chunk; return true } },
      stderr: { write: () => true },
    } as unknown as TuiStreams)
    terminal.enter()
    const handoff = terminal.handoff()
    handoff.resume()
    handoff.resume()
    handoff.cancel()
    expect(output.match(/\u001b\[\?1049h/gu)).toHaveLength(2)
    expect(output.match(/\u001b\[\?1049l/gu)).toHaveLength(1)

    const cancelled = terminal.handoff()
    cancelled.cancel()
    cancelled.resume()
    expect(output.match(/\u001b\[\?1049h/gu)).toHaveLength(2)
    terminal.restore()
  })

  it('anchors the real cursor for IME preedit and suppresses Ink cursor hiding', () => {
    let output = ''
    const streams = {
      stdin: { isTTY: true, isRaw: false, setRawMode: () => undefined },
      stdout: {
        isTTY: true,
        rows: 24,
        columns: 80,
        write: (chunk: string | Uint8Array) => { output += chunk.toString(); return true },
      },
      stderr: { write: () => true },
    } as unknown as TuiStreams
    const terminal = new TerminalSession(streams)
    terminal.enter()
    terminal.setInputCursor({ row: 22, column: 16 })
    terminal.rendererOutput.write('\u001b[?25l')
    terminal.rendererOutput.write('frame\n')

    expect(output).not.toContain('\u001b[?25l')
    expect(output).toContain('\u001b[22;16H\u001b[?25h')
    expect(() => { terminal.setInputCursor({ row: 0, column: 1 }) }).toThrow('positive integer cells')
    output = ''
    terminal.setInputCursor(undefined)
    terminal.rendererOutput.write('\u001b[?25l')
    expect(output).toBe('\u001b[?25l')
  })

  it('negotiates split replies, preserves interleaved input, and enables only confirmed modes', async () => {
    const input = new EventEmitter() as EventEmitter & {
      isTTY: true
      isRaw: boolean
      setRawMode(value: boolean): void
    }
    input.isTTY = true
    input.isRaw = false
    input.setRawMode = (value) => { input.isRaw = value }
    let output = ''
    const streams = {
      stdin: input,
      stdout: {
        isTTY: true,
        getColorDepth: () => 24,
        write: (chunk: string) => { output += chunk; return true },
      },
      stderr: { write: () => true },
    } as unknown as TuiStreams
    const terminal = new TerminalSession(streams)
    const capabilitiesPromise = terminal.negotiate({
      timeoutMs: 20,
      environment: { TMUX: 'tmux', TMUX_PANE: '%1', SSH_CONNECTION: 'ssh' },
    })
    input.emit('data', 'x\u001b[?1;')
    input.emit('data', '2c\u001b[?1u\u001b]10;rgb:ffff/ffff/ffff\u001b\\')
    input.emit('data', '\u001b]11;rgb:ffff/ffff/ffff\u001b\\')
    const capabilities = await capabilitiesPromise
    expect(capabilities).toMatchObject({
      colorDepth: 'truecolor', background: 'light', keyboardProtocol: 'kitty', mouse: 'sgr', focus: true,
      bracketedPaste: true, osc: true, outer: { tmux: true, ssh: true },
    })
    expect(terminal.takeBufferedInput()).toEqual([{ kind: 'input', input: 'x', key: {} }])
    terminal.enter(capabilities)
    expect(output).toContain('\u001b[?1007l\u001b[?1000h\u001b[?1006h')
    expect(output).toContain('\u001b[?1000h\u001b[?1006h')
    expect(output).toContain('\u001b[?1004h')
    expect(output).toContain('\u001b[>1u')
    terminal.restore()
    terminal.restore()
    expect(output.match(/\u001b\[\?1004l/g)).toHaveLength(1)
    expect(output.match(/\u001b\[<u/g)).toHaveLength(1)
    expect(output).toContain('\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1006l\u001b[?1007h')
    expect(input.isRaw).toBe(false)
  })

  it('starts on the deadline and degrades enhanced modes when no reply arrives', async () => {
    const input = new EventEmitter() as EventEmitter & {
      isTTY: true
      isRaw: boolean
      setRawMode(value: boolean): void
    }
    input.isTTY = true
    input.isRaw = false
    input.setRawMode = (value) => { input.isRaw = value }
    let output = ''
    const terminal = new TerminalSession({
      stdin: input,
      stdout: { isTTY: true, write: (chunk: string) => { output += chunk; return true } },
      stderr: { write: () => true },
    } as unknown as TuiStreams)
    const started = Date.now()
    const capabilities = await terminal.negotiate({ timeoutMs: 5, environment: { TERM: 'xterm-kitty' } })
    expect(Date.now() - started).toBeLessThan(100)
    expect(capabilities).toMatchObject({
      background: 'unknown', keyboardProtocol: 'legacy', mouse: 'none', focus: false, bracketedPaste: false,
    })
    expect(output).toContain('\u001b[c\u001b[?u\u001b]10;?\u0007\u001b]11;?\u0007')
    terminal.enter(capabilities)
    expect(output).not.toContain('\u001b[?1000h')
    expect(output).not.toContain('\u001b[?1007l')
    expect(output).not.toContain('\u001b[?2004h')
    terminal.restore()
    expect(input.isRaw).toBe(false)
  })

  it('carries color depth and reply semantics through pure capability folding', () => {
    const initial = {
      colorDepth: 'ansi16' as const,
      background: 'unknown' as const,
      keyboardProtocol: 'legacy' as const,
      mouse: 'none' as const,
      focus: false,
      bracketedPaste: false,
      osc: false,
      synchronizedOutput: false,
      outer: { tmux: false, ssh: false },
    }
    expect(applyTuiTerminalReply(initial, '\u001b[?1;2c')).toMatchObject({ mouse: 'sgr', focus: true })
    expect(applyTuiTerminalReply(initial, '\u001b[?1u')).toMatchObject({ keyboardProtocol: 'kitty' })
    expect(applyTuiTerminalReply(initial, '\u001b]11;rgb:0000/0000/0000\u0007'))
      .toMatchObject({ osc: true, background: 'dark' })
    expect(applyTuiTerminalReply(initial, '\u001b]11;#f5f5f5\u001b\\'))
      .toMatchObject({ osc: true, background: 'light' })
    expect(applyTuiTerminalReply(initial, '\u001b]11;rgb:not-a-color\u0007'))
      .toMatchObject({ osc: true, background: 'unknown' })
    expect(applyTuiTerminalReply(initial, '\u001b]10;rgb:ffff/ffff/ffff\u0007'))
      .toMatchObject({ osc: true, background: 'unknown' })
    expect(applyTuiTerminalReply(initial, '\u001b[?2026h')).toEqual(initial)
  })

  it('copies bounded text through negotiated OSC 52 and degrades without support', () => {
    let output = ''
    const terminal = new TerminalSession({
      stdin: { isTTY: true, isRaw: false, setRawMode: () => undefined },
      stdout: { isTTY: true, write: (chunk: string) => { output += chunk; return true } },
      stderr: { write: () => true },
    } as unknown as TuiStreams)
    terminal.enter({
      colorDepth: 'ansi16', background: 'unknown', keyboardProtocol: 'legacy', mouse: 'none', focus: false,
      bracketedPaste: false, osc: true, synchronizedOutput: false,
      outer: { tmux: true, ssh: false },
    })
    expect(terminal.copyToClipboard('copy \u4e2d')).toEqual({ ok: true, method: 'tmux-buffer' })
    expect(output).toContain(`\u001b]52;c;${Buffer.from('copy \u4e2d').toString('base64')}\u0007`)
    expect(terminal.copyToClipboard('x'.repeat(100_001))).toMatchObject({ ok: false, reason: 'too-large' })
    terminal.restore()
    expect(terminal.copyToClipboard('after')).toMatchObject({ ok: false, reason: 'inactive' })

    const unsupported = new TerminalSession({
      stdin: { isTTY: true, isRaw: false, setRawMode: () => undefined },
      stdout: { isTTY: true, write: () => true },
      stderr: { write: () => true },
    } as unknown as TuiStreams)
    unsupported.enter({
      colorDepth: 'none', background: 'unknown', keyboardProtocol: 'legacy', mouse: 'none', focus: false,
      bracketedPaste: false, osc: false, synchronizedOutput: false,
      outer: { tmux: false, ssh: true },
    })
    expect(unsupported.copyToClipboard('copy')).toMatchObject({ ok: false, reason: 'unsupported' })
  })
})

describe('external editor handoff', () => {
  it('resolves VISUAL before EDITOR and parses quoted argv without shell expansion', () => {
    expect(parseTuiEditorCommand('"editor with spaces" --wait \'file name\' plain\\ value')).toEqual([
      'editor with spaces', '--wait', 'file name', 'plain value',
    ])
    expect(resolveTuiEditorArgv({ VISUAL: 'visual --wait', EDITOR: 'editor' }, 'linux')).toEqual(['visual', '--wait'])
    expect(resolveTuiEditorArgv({ EDITOR: 'editor' }, 'win32')).toEqual(['editor'])
    expect(resolveTuiEditorArgv({}, 'win32')).toEqual(['notepad.exe'])
    expect(resolveTuiEditorArgv({}, 'darwin')).toEqual(['open', '-W', '-t'])
    expect(resolveTuiEditorArgv({}, 'linux')).toEqual(['vi'])
    expect(() => { parseTuiEditorCommand('unterminated"') }).toThrow('unterminated quote')
    expect(() => { parseTuiEditorCommand('') }).toThrow('must name an executable')
  })

  it('accepts bounded UTF-8 editor output and preserves the draft on failures', async () => {
    const edited = new EventEmitter() as EventEmitter & TuiExternalEditorChild
    externalEditorInternals.spawn = (argv) => {
      void writeFile(argv.at(-1) as string, 'edited\r\n文本').then(() => { edited.emit('close', 0, null) })
      return edited
    }
    await expect(runTuiExternalEditor({ draft: 'original', cwd: process.cwd(), environment: { EDITOR: 'stub' } }))
      .resolves.toEqual({ ok: true, text: 'edited\n文本' })

    const invalid = new EventEmitter() as EventEmitter & TuiExternalEditorChild
    externalEditorInternals.spawn = (argv) => {
      void writeFile(argv.at(-1) as string, Buffer.from([0xff])).then(() => { invalid.emit('close', 0, null) })
      return invalid
    }
    const invalidResult = await runTuiExternalEditor({
      draft: 'original', cwd: process.cwd(), environment: { EDITOR: 'stub' },
    })
    expect(invalidResult.ok).toBe(false)
    if (!invalidResult.ok) expect(invalidResult.message).toContain('valid UTF-8')

    const oversized = new EventEmitter() as EventEmitter & TuiExternalEditorChild
    externalEditorInternals.spawn = (argv) => {
      void writeFile(argv.at(-1) as string, Buffer.alloc(1_000_001, 0x61))
        .then(() => { oversized.emit('close', 0, null) })
      return oversized
    }
    const oversizedResult = await runTuiExternalEditor({
      draft: 'original', cwd: process.cwd(), environment: { EDITOR: 'stub' },
    })
    expect(oversizedResult.ok).toBe(false)
    if (!oversizedResult.ok) expect(oversizedResult.message).toContain('1 MB limit')

    const failed = new EventEmitter() as EventEmitter & TuiExternalEditorChild
    externalEditorInternals.spawn = () => {
      queueMicrotask(() => { failed.emit('close', 9, null) })
      return failed
    }
    const failedResult = await runTuiExternalEditor({
      draft: 'original', cwd: process.cwd(), environment: { EDITOR: 'stub' },
    })
    expect(failedResult.ok).toBe(false)
    if (!failedResult.ok) expect(failedResult.message).toContain('exit code 9')
  })

  it('reports spawn failure and aborts the exact child while retaining the draft', async () => {
    externalEditorInternals.spawn = () => { throw new Error('missing editor') }
    const spawnResult = await runTuiExternalEditor({
      draft: 'original', cwd: process.cwd(), environment: { EDITOR: 'stub' },
    })
    expect(spawnResult.ok).toBe(false)
    if (!spawnResult.ok) expect(spawnResult.message).toContain('missing editor')

    const child = new EventEmitter() as EventEmitter & TuiExternalEditorChild
    let killed: NodeJS.Signals | undefined
    child.kill = (signal) => {
      killed = signal
      queueMicrotask(() => { child.emit('close', null, signal ?? 'SIGTERM') })
      return true
    }
    externalEditorInternals.spawn = () => child
    const controller = new AbortController()
    const result = runTuiExternalEditor({
      draft: 'original', cwd: process.cwd(), environment: { EDITOR: 'stub' }, signal: controller.signal,
    })
    controller.abort()
    const cancelledResult = await result
    expect(cancelledResult.ok).toBe(false)
    if (!cancelledResult.ok) expect(cancelledResult.message).toContain('cancelled')
    expect(killed).toBe('SIGTERM')
  })
})

describe('inputCursorTarget', () => {
  it('counts CJK display cells and keeps the insertion point inside the composer', () => {
    const layout = layoutComposer(createComposerState('你好'), 76)
    expect(inputCursorTarget({ rows: 24, columns: 80 }, 'prompt › ', layout)).toEqual({
      row: 22,
      column: 16,
    })
    expect(inputCursorTarget({ rows: 24, columns: 80 }, '输入 › ', layout)).toEqual({
      row: 22,
      column: 14,
    })
  })

  it('keeps menu and attachment composers above their trailing frame rows', () => {
    const layout = layoutComposer(createComposerState('answer'), 76)
    expect(inputCursorTarget({ rows: 24, columns: 80 }, '> ', layout, undefined, 3)).toEqual({
      row: 21,
      column: 11,
    })
    expect(inputCursorTarget({ rows: 24, columns: 80 }, '> ', layout, undefined, 4)).toEqual({
      row: 20,
      column: 11,
    })
  })

  it('centers the startup composer and preserves multiline CJK cursor cells', () => {
    const startupPrefix = 'prompt › '
    const singleLine = layoutComposer(
      createComposerState('你好'),
      tuiStartupComposerFrame({ rows: 24, columns: 80 }, 1).width - 4,
      5,
      stringWidth(startupPrefix),
    )
    const singleFrame = tuiStartupComposerFrame({ rows: 24, columns: 80 }, singleLine.lines.length)
    expect(singleFrame).toEqual({ width: 57, leftColumn: 12, firstInputRow: 16, logo: 'primary' })
    expect(inputCursorTarget({ rows: 24, columns: 80 }, 'prompt › ', singleLine, singleFrame)).toEqual({
      row: 16,
      column: 28,
    })
    expect(inputCursorTarget({ rows: 24, columns: 80 }, '输入 › ', singleLine, singleFrame)).toEqual({
      row: 16,
      column: 26,
    })

    const multiline = layoutComposer(
      createComposerState('before\n你好'), singleFrame.width - 4, 5, stringWidth(startupPrefix),
    )
    const suggestedFrame = tuiStartupComposerFrame({ rows: 24, columns: 80 }, multiline.lines.length, 3)
    expect(suggestedFrame).toEqual({ width: 57, leftColumn: 12, firstInputRow: 17, logo: 'primary' })
    expect(inputCursorTarget({ rows: 24, columns: 80 }, startupPrefix, multiline, suggestedFrame)).toEqual({
      row: 18,
      column: 28,
    })
    expect(tuiStartupComposerFrame({ rows: 25, columns: 80 }, 1)).toEqual({
      width: 57,
      leftColumn: 12,
      firstInputRow: 17,
      logo: 'primary',
    })
    expect(tuiStartupComposerFrame({ rows: 25, columns: 80 }, 1, 0, 1)).toEqual({
      width: 57,
      leftColumn: 12,
      firstInputRow: 16,
      logo: 'primary',
    })
    expect(tuiStartupComposerFrame({ rows: 18, columns: 40 }, 1)).toEqual({
      width: 33,
      leftColumn: 4,
      firstInputRow: 10,
      logo: 'compact',
    })
    expect(tuiStartupComposerFrame({ rows: 12, columns: 20 }, 1)).toEqual({
      width: 20,
      leftColumn: 0,
      firstInputRow: 7,
      logo: 'compact',
    })
    expect(tuiStartupComposerFrame({ rows: 12, columns: 23 }, 1)).toEqual({
      width: 23,
      leftColumn: 0,
      firstInputRow: 7,
      logo: 'compact',
    })
    expect(tuiStartupComposerFrame({ rows: 12, columns: 24 }, 1)).toEqual({
      width: 24,
      leftColumn: 0,
      firstInputRow: 7,
      logo: 'compact',
    })
  })

  it('keeps long references, wrapped CJK input, and the cursor in one fixed gutter layout', () => {
    const prefix = '输入 › '
    const width = 32
    const text = '请阅读文档 @GA与维护共用基础设施--图演示.html 分析这个流程，评价其'
    const layout = layoutComposer(createComposerState(text), width, 20, stringWidth(prefix))

    expect(layout.lines.length).toBeGreaterThan(1)
    expect(layout.lines.join('')).toBe(text)
    expect(layout.lines.every(line => stringWidth(prefix) + stringWidth(line) <= width)).toBe(true)
    expect(inputCursorTarget({ rows: 24, columns: 80 }, prefix, layout)).toEqual({
      row: 22,
      column: 3 + stringWidth(prefix) + layout.cursorColumn,
    })
  })
})

describe('supplied ANSI startup logo', () => {
  it('preserves the supplied geometry without embedded terminal controls', () => {
    expect(TUI_STARTUP_LOGO_ROWS).toHaveLength(TUI_STARTUP_LOGO_HEIGHT)
    expect(TUI_STARTUP_LOGO_ROWS.every(
      row => stringWidth(row) === TUI_STARTUP_LOGO_WIDTH,
    )).toBe(true)
    expect(TUI_STARTUP_LOGO_ROWS.join('\n')).not.toMatch(/\u001B/u)
  })

  it('preserves the supplied palette in truecolor and maps it for ANSI16/no-color output', () => {
    expect(tuiStartupLogoCellStyle(resolveTuiTheme('dark', 'truecolor'), 0)).toEqual({
      color: '#ffffff', backgroundColor: '#0000aa',
    })
    expect(tuiStartupLogoCellStyle(resolveTuiTheme('dark', 'ansi16'), 0)).toEqual({
      color: 'white', backgroundColor: 'blue',
    })
    expect(tuiStartupLogoCellStyle(resolveTuiTheme('dark', 'none'), 0)).toEqual({})
    expect(tuiStartupLogoCellStyle(resolveTuiTheme('dark', 'truecolor'), 99)).toEqual({})
  })

  it('falls back when either dimension or mounted suggestions cannot fit the full workspace', () => {
    expect(resolveTuiStartupLogoVariant({ rows: 14, columns: 69 }, 1)).toBe('primary')
    expect(resolveTuiStartupLogoVariant({ rows: 24, columns: 68 }, 1)).toBe('compact')
    expect(resolveTuiStartupLogoVariant({ rows: 13, columns: 80 }, 1)).toBe('compact')
    expect(resolveTuiStartupLogoVariant({ rows: 16, columns: 80 }, 1, 3)).toBe('compact')
  })
})

describe('TUI working indicator', () => {
  it('cycles deterministic fixed-width frames without changing layout', () => {
    const frames = Array.from({ length: 12 }, (_, tick) => tuiWorkingFrame(tick))
    expect(frames.slice(0, 6)).toEqual(['.  ', '.. ', '...', ' ..', '  .', ' ..'])
    expect(frames.slice(6)).toEqual(frames.slice(0, 6))
    expect(frames.every(frame => stringWidth(frame) === 3)).toBe(true)
  })

  it('offers bounded pulse, minimal, and disabled variants', () => {
    expect(Array.from({ length: 4 }, (_, tick) => tuiWorkingFrame(tick, 'pulse')))
      .toEqual(['·  ', '∙  ', '●  ', '∙  '])
    expect(tuiWorkingFrame(5, 'minimal')).toBe('›  ')
    expect(tuiWorkingFrame(5, 'off')).toBe('')
  })
})

describe('TUI global footer pointer ownership', () => {
  it('publishes footer-item hit targets only while their status row is rendered', () => {
    const visible = {
      workOpen: false,
      footerDetail: false,
      footerSelection: false,
      notice: false,
      externalNotice: false,
      runningDeliveryHint: false,
      rewindBrowsing: false,
      helpVisible: false,
      transcriptSearch: false,
      historySearch: false,
      focus: false,
    }
    expect(tuiFooterItemsOwnPointerRow(visible)).toBe(true)
    for (const key of Object.keys(visible) as (keyof typeof visible)[]) {
      expect(tuiFooterItemsOwnPointerRow({ ...visible, [key]: true }), key).toBe(false)
    }
  })

  it('retains extension fullscreen hints while exposing exactly one Host close label', () => {
    expect(tuiFullscreenFooterLine(undefined, 'Esc close')).toBe('Esc close')
    expect(tuiFullscreenFooterLine('  ', 'Esc close')).toBe('Esc close')
    expect(tuiFullscreenFooterLine('Arrows navigate', 'Esc close'))
      .toBe('Arrows navigate · Esc close')
    expect(tuiFullscreenFooterLine('Arrows navigate · Esc close', 'Esc close'))
      .toBe('Arrows navigate · Esc close')
  })
})

describe('TUI transcript pointer focus', () => {
  it('gives transcript details a readable majority of the terminal height', () => {
    expect(tuiTranscriptDetailHeight(40)).toBe(31)
    expect(tuiTranscriptDetailHeight(24)).toBe(18)
    expect(tuiTranscriptDetailHeight(30, 3)).toBe(22)
    expect(tuiTranscriptDetailHeight(24, 3)).toBe(16)
    expect(tuiTranscriptDetailHeight(8)).toBe(7)
  })

  it('opens a clicked row directly and closes the same row on a second click', () => {
    const detail = toggleTuiTranscriptFocus(undefined, 'event:4', 3)
    expect(detail).toEqual({
      mode: 'detail', focusedKey: 'event:4', focusedIndex: 3, detailOffset: 0, returnToComposer: true,
    })
    expect(toggleTuiTranscriptFocus(detail, 'event:4', 3))
      .toEqual({ mode: 'browse', focusedKey: 'event:4', focusedIndex: 3 })
    expect(toggleTuiTranscriptFocus(detail, 'event:5', 4))
      .toEqual({
        mode: 'detail', focusedKey: 'event:5', focusedIndex: 4, detailOffset: 0, returnToComposer: true,
      })
  })
})

describe('assistant output export', () => {
  it('preserves Markdown and resolves collision suffixes inside the Session workspace', () => {
    expect(tuiOutputMarkdown('## Result\n\n- one\n\n')).toBe('## Result\n\n- one\n')
    expect(resolveTuiOutputExportPath('/workspace', Date.UTC(2026, 7, 26, 1, 2, 3, 4)))
      .toBe(resolve('/workspace', 'dsh-output-20260826T010203004Z.md'))
    expect(resolveTuiOutputExportPath('/workspace', Date.UTC(2026, 7, 26, 1, 2, 3, 4), 1))
      .toBe(resolve('/workspace', 'dsh-output-20260826T010203004Z-2.md'))
    expect(resolveTuiOutputExportPath('/workspace', Date.UTC(2026, 7, 26, 1, 2, 3, 4), 0, 'response'))
      .toBe(resolve('/workspace', 'dsh-response-20260826T010203004Z.md'))
  })

  it('creates the standalone Markdown through the Host filesystem owner', async () => {
    let resolvedPath = ''
    let writtenText = ''
    let writeIntent: unknown
    const fs = {
      resolve: async (path: string) => {
        resolvedPath = path
        return { targetKey: path }
      },
      writeText: async (_target: unknown, text: string, intent: unknown) => {
        writtenText = text
        writeIntent = intent
        return { operation: 'create', version: 'v1', before: null, after: text }
      },
    }
    const result = await writeTuiOutputMarkdown(
      fs as never, '/workspace', '# Complete answer', Date.UTC(2026, 7, 26, 1, 2, 3, 4),
    )

    expect(result).toEqual({ ok: true, path: resolve('/workspace', 'dsh-output-20260826T010203004Z.md') })
    expect(resolvedPath).toBe(result.ok ? result.path : '')
    expect(writtenText).toBe('# Complete answer\n')
    expect(writeIntent).toEqual({ kind: 'createIfAbsent' })
  })

  it('preserves an existing export and retries with a unique suffix', async () => {
    const resolvedPaths: string[] = []
    let attempts = 0
    const fs = {
      resolve: async (path: string) => {
        resolvedPaths.push(path)
        return { targetKey: path }
      },
      writeText: async () => {
        attempts += 1
        if (attempts === 1) throw new FsError('already exists', 'FS_NOT_OBSERVED')
        return { operation: 'create', version: 'v1', before: null, after: '# Answer\n' }
      },
    }
    const result = await writeTuiOutputMarkdown(
      fs as never, '/workspace', '# Answer', Date.UTC(2026, 7, 26, 1, 2, 3, 4),
    )

    expect(result).toEqual({ ok: true, path: resolve('/workspace', 'dsh-output-20260826T010203004Z-2.md') })
    expect(resolvedPaths).toEqual([
      resolve('/workspace', 'dsh-output-20260826T010203004Z.md'),
      resolve('/workspace', 'dsh-output-20260826T010203004Z-2.md'),
    ])
  })
})

describe('composer editor', () => {
  it('moves and deletes complete grapheme clusters around the insertion point', () => {
    const initial = createComposerState('Ae\u0301👩‍💻中')
    const beforeCjk = moveComposerCursor(initial, 'left')
    expect(beforeCjk.cursor).toBe('Ae\u0301👩‍💻'.length)
    const beforeEmoji = moveComposerCursor(beforeCjk, 'left')
    expect(beforeEmoji.cursor).toBe('Ae\u0301'.length)
    expect(deleteComposerText(beforeCjk, 'backward').text).toBe('Ae\u0301中')
    expect(deleteComposerText(beforeEmoji, 'forward').text).toBe('Ae\u0301中')
  })

  it('supports raw terminal backspace values after committed IME text', () => {
    const state = createComposerState('拼音')
    expect(deleteComposerText(state, 'backward').text).toBe('拼')
    expect(deleteComposerText(createComposerState('a'), 'backward').text).toBe('')
  })

  it('supports logical line bounds, word movement, deletion, and middle insertion', () => {
    let state = createComposerState('alpha beta\n中文')
    state = moveComposerCursor(state, 'home')
    expect(state.cursor).toBe('alpha beta\n'.length)
    state = moveComposerCursor(state, 'buffer-home')
    state = moveComposerCursor(state, 'word-right')
    expect(state.cursor).toBe(6)
    state = insertComposerText(state, 'new ')
    expect(state.text).toBe('alpha new beta\n中文')
    expect(deleteComposerText(state, 'word-backward').text).toBe('alpha beta\n中文')
  })

  it('restores the unsent multiline draft after submitted-history traversal', () => {
    const draft = createComposerState('unsent\n中文')
    const older = traverseComposerHistory(draft, ['first', 'second\nline'], 'older')
    expect(older.text).toBe('second\nline')
    const oldest = traverseComposerHistory(older, ['first', 'second\nline'], 'older')
    expect(oldest.text).toBe('first')
    const newer = traverseComposerHistory(oldest, ['first', 'second\nline'], 'newer')
    expect(traverseComposerHistory(newer, ['first', 'second\nline'], 'newer').text).toBe('unsent\n中文')
  })

  it('normalizes pasted lines, sanitizes controls, and windows wrapped cursor rows', () => {
    const pasted = insertComposerText(createComposerState(), 'ab\r\n中文\u001b[31m')
    expect(pasted.text).toBe('ab\n中文�[31m')
    const layout = layoutComposer(pasted, 4, 2)
    expect(layout.lines).toEqual(['�[31', 'm'])
    expect(layout).toMatchObject({ cursorRow: 1, cursorColumn: 1 })
    expect(inputCursorTarget({ rows: 12, columns: 8 }, '', layout)).toEqual({ row: 10, column: 4 })
  })

  it('keeps large paste payloads behind bounded placeholders through delete, undo, stash, and history', () => {
    const payload = Array.from({ length: 9 }, (_, index) => `line ${index + 1} \u4e2d`).join('\n')
    expect(isLargeComposerPaste(Array.from({ length: 7 }, () => 'line').join('\n'))).toBe(false)
    expect(isLargeComposerPaste(Array.from({ length: 8 }, () => 'line').join('\n'))).toBe(true)
    expect(isLargeComposerPaste('x'.repeat(4_095))).toBe(false)
    expect(isLargeComposerPaste('x'.repeat(4_096))).toBe(true)

    const referenced = insertComposerPasteReference(createComposerState(), payload, 1_000)
    expect(referenced.text).toMatch(/^\[Pasted text #1: 9 lines, /u)
    expect(referenced.text).not.toContain('line 1')
    expect(materializeComposerText(referenced)).toBe(payload)
    expect(layoutComposer(referenced, 18, 2).lines).toHaveLength(2)

    const deleted = deleteComposerText(referenced, 'backward', 1_100)
    expect(deleted).toMatchObject({ text: '', cursor: 0 })
    expect(deleted.references).toBeUndefined()
    const restored = undoComposerEdit(deleted)
    expect(materializeComposerText(restored)).toBe(payload)
    expect(materializeComposerText(redoComposerEdit(restored))).toBe('')

    const stashed = toggleTuiComposerStash(referenced, undefined)
    const unstashed = toggleTuiComposerStash(stashed.composer, stashed.stash)
    expect(materializeComposerText(unstashed.composer)).toBe(payload)
    const recalled = traverseComposerHistory(createComposerState('draft'), [tuiComposerDraft(referenced)], 'older')
    expect(materializeComposerText(recalled)).toBe(payload)
    expect(materializeComposerText(traverseComposerHistory(recalled, [tuiComposerDraft(referenced)], 'newer')))
      .toBe('draft')
  })

  it('keeps typed image references durable, deduplicated, and draft-local', () => {
    const first = {
      attachmentId: AttachmentId('sha256:first'), mediaType: 'image/png' as const,
      bytes: 128, width: 1, height: 1, name: 'red.png',
    }
    const second = {
      attachmentId: AttachmentId('sha256:second'), mediaType: 'image/jpeg' as const,
      bytes: 256, width: 2, height: 2,
    }
    let state = addComposerImageAttachment(createComposerState(), first, 1_000)
    state = addComposerImageAttachment(state, first, 1_100)
    expect(state.attachments).toHaveLength(1)
    state = addComposerImageAttachment(state, second, 1_200)
    expect(state.attachments?.map(item => item.ref.attachmentId)).toEqual([
      'sha256:first', 'sha256:second',
    ])
    expect(undoComposerEdit(state).attachments?.map(item => item.ref.attachmentId)).toEqual(['sha256:first'])
    expect(redoComposerEdit(undoComposerEdit(state)).attachments?.map(item => item.ref.attachmentId)).toEqual([
      'sha256:first', 'sha256:second',
    ])
    const stashed = toggleTuiComposerStash(state, undefined)
    expect(stashed.stash?.attachments).toHaveLength(2)
    expect(toggleTuiComposerStash(stashed.composer, stashed.stash).composer.attachments).toHaveLength(2)
    const recalled = traverseComposerHistory(createComposerState('draft'), [tuiComposerDraft(state)], 'older')
    expect(recalled.attachments).toHaveLength(2)
    expect(removeLastComposerImageAttachment(recalled).attachments).toHaveLength(1)
    expect(removeComposerImageAttachment(recalled, AttachmentId('sha256:first')).attachments?.[0]?.ref.attachmentId)
      .toBe('sha256:second')
    const clipboard = insertComposerClipboard(createComposerState('draft'), ' pasted', [first], 1_300)
    expect(clipboard.text).toBe('draft pasted')
    expect(clipboard.attachments?.map(item => item.ref.attachmentId)).toEqual(['sha256:first'])
    const undoneClipboard = undoComposerEdit(clipboard)
    expect(undoneClipboard.text).toBe('draft')
    expect(undoneClipboard.attachments).toBeUndefined()
    expect(redoComposerEdit(undoneClipboard).attachments?.[0]?.ref.attachmentId).toBe('sha256:first')

    const largeClipboard = insertComposerClipboard(
      createComposerState(),
      Array.from({ length: 8 }, (_, index) => `clipboard ${index + 1}`).join('\n'),
      [first],
      1_400,
    )
    expect(largeClipboard.text).toMatch(/^\[Pasted text #1: 8 lines, /u)
    expect(materializeComposerText(largeClipboard)).toContain('clipboard 8')
    const largeUndo = undoComposerEdit(largeClipboard)
    expect(largeUndo.text).toBe('')
    expect(largeUndo.attachments).toBeUndefined()
    expect(materializeComposerText(redoComposerEdit(largeUndo))).toContain('clipboard 1')
    expect(redoComposerEdit(largeUndo).attachments?.[0]?.ref.attachmentId).toBe('sha256:first')
  })

  it('coalesces rapid grapheme typing and restores exact cursors through undo and redo', () => {
    let state = createComposerState()
    state = insertComposerText(state, 'A', 1_000)
    state = insertComposerText(state, 'e\u0301', 1_100)
    state = insertComposerText(state, '\u4e2d', 1_200)
    expect(state.text).toBe('Ae\u0301\u4e2d')
    const undone = undoComposerEdit(state)
    expect(undone).toMatchObject({ text: '', cursor: 0 })
    expect(redoComposerEdit(undone)).toMatchObject({ text: 'Ae\u0301\u4e2d', cursor: 'Ae\u0301\u4e2d'.length })
  })

  it('breaks typing coalescing after cursor movement and keeps the moved insertion point', () => {
    let state = insertComposerText(createComposerState(), 'a', 1_000)
    state = insertComposerText(state, 'b', 1_100)
    state = moveComposerCursor(state, 'left')
    state = insertComposerText(state, '\u4e2d', 1_200)
    expect(state.text).toBe('a\u4e2db')
    const undone = undoComposerEdit(state)
    expect(undone).toMatchObject({ text: 'ab', cursor: 1 })
    expect(redoComposerEdit(undone)).toMatchObject({ text: 'a\u4e2db', cursor: 2 })
  })

  it('keeps deletion, paste, newline, suggestion, and submitted history as distinct units', () => {
    let deleted = createComposerState('A\u4e2d\ud83d\udc69\u200d\ud83d\udcbb')
    deleted = deleteComposerText(deleted, 'backward', 1_000)
    deleted = deleteComposerText(deleted, 'backward', 1_100)
    expect(undoComposerEdit(deleted)).toMatchObject({ text: 'A\u4e2d\ud83d\udc69\u200d\ud83d\udcbb' })

    let state = insertComposerText(createComposerState(), 'pasted text', 2_000)
    state = insertComposerText(state, '\n', 2_100)
    state = replaceComposerText(state, `${state.text}/models `, state.text.length + 8, 'suggestion', 2_200)
    expect(undoComposerEdit(state).text).toBe('pasted text\n')
    state = undoComposerEdit(undoComposerEdit(undoComposerEdit(state)))
    expect(state.text).toBe('')

    const recalled = traverseComposerHistory(createComposerState('draft'), ['old prompt'], 'older', 3_000)
    expect(undoComposerEdit(recalled)).toMatchObject({ text: 'draft', cursor: 5 })
  })

  it('clears redo after a new edit and bounds retained independent snapshots', () => {
    let state = replaceComposerText(createComposerState(), 'one', 3, 'paste', 1_000)
    state = replaceComposerText(state, 'two', 3, 'paste', 2_000)
    state = undoComposerEdit(state)
    state = insertComposerText(state, '!', 3_000)
    expect(redoComposerEdit(state)).toBe(state)

    let bounded = createComposerState()
    for (let index = 1; index <= 105; index += 1) {
      const text = String(index)
      bounded = replaceComposerText(bounded, text, text.length, 'paste', index)
    }
    for (let index = 0; index < 100; index += 1) bounded = undoComposerEdit(bounded)
    expect(bounded.text).toBe('5')
    expect(undoComposerEdit(bounded)).toBe(bounded)
  })

  it('retains each draft edit history across stash restore and swap', () => {
    const edited = insertComposerText(createComposerState(), '\u4f60', 1_000)
    const stashed = toggleTuiComposerStash(edited, undefined)
    const restored = toggleTuiComposerStash(stashed.composer, stashed.stash)
    expect(undoComposerEdit(restored.composer)).toMatchObject({ text: '', cursor: 0 })

    const other = insertComposerText(createComposerState(), '\ud83e\uddea', 2_000)
    const swapped = toggleTuiComposerStash(other, {
      text: restored.composer.text,
      cursor: restored.composer.cursor,
      editHistory: restored.composer.editHistory,
    })
    expect(undoComposerEdit(swapped.composer)).toMatchObject({ text: '', cursor: 0 })
    expect(undoComposerEdit(toggleTuiComposerStash(swapped.composer, swapped.stash).composer)).toMatchObject({
      text: '', cursor: 0,
    })
  })
})

describe('TUI suggestions', () => {
  const commands = [
    { name: 'help', description: 'List commands' },
    { name: 'models', description: 'Select model' },
    { name: 'mode', description: 'Select mode', input: { hint: '<name>' } },
  ]

  it('resolves command-only queries and represents empty results', () => {
    expect(commandSuggestionState('/', 1, commands)?.items.map(item => item.label)).toEqual(['/help', '/mode', '/models'])
    expect(commandSuggestionState('/mo', 3, commands)?.items.map(item => item.label)).toEqual(['/mode', '/models'])
    expect(commandSuggestionState('/unknown', 8, commands)).toMatchObject({ status: 'empty', items: [] })
    expect(commandSuggestionState('/help ', 6, commands)).toBeUndefined()
    expect(commandSuggestionState('/mo value', 9, commands)).toBeUndefined()
    expect(commandSuggestionState('prompt', 6, commands)).toBeUndefined()
    expect(commandSuggestionState('/mo', 2, commands)).toBeUndefined()
  })

  it('includes both TUI exit aliases in command suggestions', () => {
    const state = commandSuggestionState('/', 1, [
      ...commands,
      { name: 'quit', description: 'Exit the TUI' },
      { name: 'exit', description: 'Exit the TUI' },
    ])
    expect(state?.items.map(item => item.label)).toEqual(['/exit', '/help', '/mode', '/models', '/quit'])
  })

  it('localizes official rc.8 command summaries without changing same-name third-party commands', () => {
    const state = commandSuggestionState('/', 1, [
      { name: 'compact', description: 'Compact older conversation history' },
      { name: 'feedback', description: 'record feedback about this session' },
      { name: 'goal', description: 'set or view the goal for a long-running task' },
      { name: 'permission', description: 'Switch the permission preset (sandbox mode + approval policy)' },
      { name: 'plan', description: 'Enter or leave plan mode' },
      { name: 'third-party', description: 'Third-party command' },
    ], 'zh')
    expect(state?.items.map(item => item.description)).toEqual([
      '压缩较早的对话历史',
      '记录对当前 Session 的反馈',
      '设置或查看长期任务目标',
      '切换权限预设',
      '进入或退出计划模式',
      'Third-party command',
    ])
  })

  it('moves selection inside a bounded mounted window', () => {
    const initial = commandSuggestionState('/', 1, commands)
    expect(initial).toBeDefined()
    const second = moveTuiSuggestion(initial!, 'next', 2)
    const third = moveTuiSuggestion(second, 'next', 2)
    expect(second).toMatchObject({ selectedIndex: 1, visibleStart: 0 })
    expect(third).toMatchObject({ selectedIndex: 2, visibleStart: 1 })
    expect(visibleTuiSuggestions(third, 2).map(item => item.label)).toEqual(['/mode', '/models'])
    expect(moveTuiSuggestion(third, 'next', 2)).toEqual(third)
  })

  it('accepts the selected item through its declared query range', () => {
    const state = commandSuggestionState('/mo', 3, commands)
    expect(state).toBeDefined()
    const selected = moveTuiSuggestion(state!, 'next', 6)
    expect(acceptTuiSuggestion('/mo', selected)).toEqual({ text: '/models ', cursor: 8 })
    expect(acceptTuiSuggestion('/unknown', commandSuggestionState('/unknown', 8, commands)!)).toBeUndefined()
  })

  it('completes canonical nested paths and aliases without creating a shadow executor', () => {
    const nested = [
      {
        name: 'goal', description: 'Manage goals', completion: {
          aliases: ['g'], descriptions: { zh: '管理目标' }, children: [
            { name: 'edit', aliases: ['e'], description: 'Edit objective', input: { hint: '<text>' } },
            { name: 'clear', description: 'Clear goal', disabledReason: 'No active goal' },
          ],
        }, input: { hint: '[objective]', images: true },
      },
    ]
    expect(commandSuggestionState('/', 1, nested)?.items.map(item => item.label)).toEqual(['/goal'])
    expect(commandSuggestionState('/g ', 3, nested, 'zh')?.items).toMatchObject([
      { label: '/goal clear', description: 'Clear goal', disabledReason: 'No active goal' },
      { label: '/goal edit', description: 'Edit objective', detail: '<text>' },
    ])
    const state = commandSuggestionState('/g e', 4, nested)
    expect(state?.items[0]).toMatchObject({ label: '/goal edit', commandPath: ['goal', 'edit'] })
    expect(acceptTuiSuggestion('/g e', state!)).toEqual({ text: '/goal edit ', cursor: 11 })
  })

  it('skips disabled completion rows and refuses to accept them', () => {
    const state = commandSuggestionState('/goal ', 6, [{
      name: 'goal', description: 'Manage goals', completion: { children: [
        { name: 'clear', description: 'Clear', disabledReason: 'Unavailable' },
        { name: 'edit', description: 'Edit' },
      ] },
    }])!
    expect(state.selectedIndex).toBe(1)
    expect(moveTuiSuggestion(state, 'previous', 4).selectedIndex).toBe(1)
    expect(acceptTuiSuggestion('/goal ', { ...state, selectedIndex: 0 })).toBeUndefined()
  })

  it('recognizes only workspace path tokens at whitespace boundaries', () => {
    expect(pathSuggestionQuery('@src/fi', 7)).toEqual({ queryStart: 0, queryEnd: 7, query: 'src/fi' })
    expect(pathSuggestionQuery('open @src/file.ts now', 10)).toEqual({
      queryStart: 5, queryEnd: 17, query: 'src/file.ts',
    })
    expect(pathSuggestionQuery('email@src/file.ts', 17)).toBeUndefined()
    expect(pathSuggestionQuery('open @src/file.ts now', 5)).toEqual({
      queryStart: 5, queryEnd: 17, query: 'src/file.ts',
    })
  })

  it('keeps directory slashes and appends a space only for files', () => {
    const query = { queryStart: 0, queryEnd: 4, query: 'src' }
    const state = pathSuggestionState(query, {
      entries: [
        { path: 'src/', type: 'directory' },
        { path: 'src/index.ts', type: 'file' },
      ],
      truncated: true,
    })
    expect(state).toMatchObject({ kind: 'path', status: 'truncated' })
    expect(acceptTuiSuggestion('@src', state)).toEqual({ text: '@src/', cursor: 5 })
    const file = moveTuiSuggestion(state, 'next', 6)
    expect(acceptTuiSuggestion('@src', file)).toEqual({ text: '@src/index.ts ', cursor: 14 })
    expect(pathSuggestionState(query, undefined).status).toBe('loading')
    expect(pathSuggestionState(query, { entries: [], truncated: false }).status).toBe('empty')
    expect(pathSuggestionState(query, { entries: [], truncated: true }).status).toBe('truncated')
  })
})

describe('TUI submitted-history search', () => {
  const history = ['first prompt', 'Fix Unicode e\u0301', 'duplicate', 'second prompt', 'duplicate']

  it('starts from the newest unique case-insensitive match and advances without wrapping', () => {
    const initial = startTuiHistorySearch(createComposerState('PROMPT'), history)
    expect(tuiHistorySearchResult(initial, history)).toEqual({
      match: 'second prompt', draft: { text: 'second prompt', cursor: 13 }, position: 1, count: 2,
    })
    const older = nextTuiHistorySearchMatch(initial, history)
    expect(tuiHistorySearchResult(older, history)).toEqual({
      match: 'first prompt', draft: { text: 'first prompt', cursor: 12 }, position: 2, count: 2,
    })
    expect(nextTuiHistorySearchMatch(older, history)).toEqual(older)
    expect(tuiHistorySearchResult(startTuiHistorySearch(createComposerState('dupl'), history), history)).toEqual({
      match: 'duplicate', draft: { text: 'duplicate', cursor: 9 }, position: 1, count: 1,
    })
  })

  it('normalizes Unicode queries, restarts from the newest match, and represents no match', () => {
    const initial = startTuiHistorySearch(createComposerState(), history)
    const normalized = updateTuiHistorySearchQuery(initial, 'UNICODE \u00c9', history)
    expect(tuiHistorySearchResult(normalized, history)).toEqual({
      match: 'Fix Unicode e\u0301', draft: { text: 'Fix Unicode e\u0301', cursor: 14 }, position: 1, count: 1,
    })
    const missing = updateTuiHistorySearchQuery(normalized, 'absent', history)
    expect(tuiHistorySearchResult(missing, history)).toEqual({ position: 0, count: 0 })
    expect(nextTuiHistorySearchMatch(missing, history)).toMatchObject({ matchIndex: -1 })
  })

  it('restores the exact multiline draft and insertion point after cancellation', () => {
    const composer = { ...createComposerState('before\n\u4f60\u597d\ud83d\udc4d\ud83c\udffdafter'), cursor: 9 }
    const search = startTuiHistorySearch(composer, history)
    expect(cancelTuiHistorySearch(updateTuiHistorySearchQuery(search, 'changed', history))).toEqual({
      text: 'before\n\u4f60\u597d\ud83d\udc4d\ud83c\udffdafter', cursor: 9, historyIndex: -1,
    })
  })
})

describe('TUI complete-transcript search', () => {
  const textNode = (
    key: string,
    label: string,
    text: string,
    tone: TranscriptTextNode['tone'] = 'assistant',
  ): TranscriptTextNode => ({ kind: 'text', key, label, text, tone })

  it('searches every semantic block, including command results and complete tool detail', () => {
    const tool = {
      ...toolNode({
        card: 'read', path: 'src/large.ts', offset: 1, totalLines: 200,
        lines: [{ number: 199, text: 'deep tool needle' }],
      }),
      key: 'tool:read-large',
      callId: 'read-large',
    }
    const nodes: TranscriptNode[] = [
      textNode('event:1', 'You', 'first Needle', 'user'),
      textNode('event:2', 'Assistant', 'second needle'),
      textNode('event:3', 'Thinking', 'reasoning only', 'reasoning'),
      textNode('event:4', 'Command', 'command result needle', 'status'),
      tool,
      {
        kind: 'compaction', key: 'compaction:search', compactionId: 'search', state: 'success',
        summary: 'durable summary needle', shadowedItemCount: 12, shadowedTokenCount: 2_400,
      },
      { kind: 'todo', key: 'todo:latest', todos: [{ content: 'pending ship task', status: 'in_progress' }] },
    ]
    const index = new TuiTranscriptSearchIndex()
    index.update(nodes)
    expect(index.search('NEEDLE').map(hit => hit.key)).toEqual([
      'event:1', 'event:2', 'event:4', 'tool:read-large', 'compaction:search',
    ])
    expect(index.search('reasoning only')).toMatchObject([{ key: 'event:3', nodeIndex: 2 }])
    expect(index.search('pending ship')).toMatchObject([{ key: 'todo:latest', nodeIndex: 6 }])
    expect(index.search('missing')).toEqual([])
    expect(normalizeTuiTranscriptSearchText('  Unicode e\u0301\nText ')).toBe('unicode é text')
  })

  it('retains the selected stable key when streaming adds or changes matches', () => {
    const index = new TuiTranscriptSearchIndex()
    index.update([
      textNode('event:1', 'Assistant', 'needle one'),
      textNode('stream:1:1:assistant', 'Assistant', 'needle two'),
    ])
    const selected = resolveTuiTranscriptSearchHit(index.search('needle'), 'stream:1:1:assistant')
    expect(selected?.key).toBe('stream:1:1:assistant')

    index.update([
      textNode('event:1', 'Assistant', 'needle one'),
      textNode('stream:1:1:assistant', 'Assistant', 'needle two extended'),
      textNode('stream:1:2:assistant', 'Assistant', 'new needle three'),
    ])
    expect(resolveTuiTranscriptSearchHit(index.search('needle'), selected?.key)?.key)
      .toBe('stream:1:1:assistant')
    expect(resolveTuiTranscriptSearchHit(index.search('extended'), selected?.key)?.nodeIndex).toBe(1)
  })

  it('keeps highlighting local and bounds a 1,000-block query cost', () => {
    expect(tuiTranscriptSearchSegments('Before NEEDLE after', 'needle')).toEqual([
      { text: 'Before ', match: false },
      { text: 'NEEDLE', match: true },
      { text: ' after', match: false },
    ])
    expect(tuiTranscriptSearchSegments('Unicode e\u0301', 'é')).toEqual([
      { text: 'Unicode e\u0301', match: true },
    ])

    const blocks = Array.from({ length: 1_000 }, (_, index) => textNode(
      `event:${index}`, 'Assistant', index % 100 === 0 ? `block ${index} needle` : `block ${index}`,
    ))
    const index = new TuiTranscriptSearchIndex()
    const started = performance.now()
    index.update(blocks)
    const hits = index.search('needle')
    const elapsed = performance.now() - started
    expect(hits).toHaveLength(10)
    expect(elapsed).toBeLessThan(250)
  })
})

describe('TUI composer stash', () => {
  it('stashes, restores, and swaps non-empty drafts without changing their cursors', () => {
    const first = { ...createComposerState('line one\n\u4f60\u597d'), cursor: 5 }
    const stashed = toggleTuiComposerStash(first, undefined)
    expect(stashed).toEqual({
      composer: createComposerState(), stash: { text: 'line one\n\u4f60\u597d', cursor: 5 }, action: 'stashed',
    })
    expect(toggleTuiComposerStash(stashed.composer, stashed.stash)).toEqual({
      composer: first, action: 'restored',
    })

    const active = { ...createComposerState('\ud83e\uddea second'), cursor: 2 }
    const swapped = toggleTuiComposerStash(active, stashed.stash)
    expect(swapped).toEqual({
      composer: first,
      stash: { text: '\ud83e\uddea second', cursor: 2 },
      action: 'swapped',
    })
    expect(toggleTuiComposerStash(swapped.composer, swapped.stash)).toEqual({
      composer: active,
      stash: { text: 'line one\n\u4f60\u597d', cursor: 5 },
      action: 'swapped',
    })
  })

  it('leaves an empty editor unchanged when no draft is retained', () => {
    const empty = createComposerState()
    expect(toggleTuiComposerStash(empty, undefined)).toEqual({ composer: empty, action: 'unchanged' })
  })
})

describe('TUI Session rewind boundaries', () => {
  it('projects completed human turns newest-first with exact retained and parent-only counts', () => {
    const first = createUserMessage({
      content: [{ type: 'text', text: 'first prompt' }], source: { kind: 'user' },
    })
    const second = createUserMessage({
      content: [{ type: 'text', text: 'second\u001b prompt' }], source: { kind: 'user' },
    })
    const open = createUserMessage({
      content: [{ type: 'text', text: 'open prompt' }], source: { kind: 'user' },
    })
    const plugin = createUserMessage({
      content: [{ type: 'text', text: 'hidden plugin context' }], source: { kind: 'plugin', plugin: 'test' },
    })
    const events: SessionEvent[] = [
      event(0, 'turn/start', { turn: 1 }),
      event(1, 'user/message', first),
      event(2, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      event(3, 'command/done', { commandId: CommandId('old-audit'), kind: 'success', text: 'done' }),
      event(4, 'turn/start', { turn: 2 }),
      event(5, 'user/message', second),
      event(6, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
      event(7, 'command/done', { commandId: CommandId('rewind-audit'), kind: 'success', text: 'opened' }),
      event(8, 'turn/start', { turn: 3 }),
      event(9, 'user/message', open),
      event(10, 'user/message', plugin),
    ]

    expect(tuiRewindCandidates(events)).toEqual([
      {
        eventSeq: 5,
        promptText: 'second� prompt',
        retainedEventCount: 8,
        hiddenEventCount: 3,
      },
      {
        eventSeq: 1,
        promptText: 'first prompt',
        retainedEventCount: 4,
        hiddenEventCount: 7,
      },
    ])
  })

  it('excludes model-only replacements and plugin-origin messages', () => {
    const original = createUserMessage({
      content: [{ type: 'text', text: 'human prompt' }], source: { kind: 'user' },
    })
    const replacement = {
      ...event(3, 'user/message', createUserMessage({
        content: [{ type: 'text', text: 'model-only summary' }], source: { kind: 'user' },
      })),
      surfaceOp: { op: 'replace' as const, start: SessionSeq(1), end: SessionSeq(1) },
      sourceEventSeqs: [SessionSeq(1)],
    }
    const plugin = createUserMessage({
      content: [{ type: 'text', text: 'plugin context' }], source: { kind: 'plugin', plugin: 'test' },
    })
    const candidates = tuiRewindCandidates([
      event(0, 'turn/start', { turn: 1 }),
      event(1, 'user/message', original),
      event(2, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      replacement,
      event(4, 'turn/start', { turn: 2 }),
      event(5, 'user/message', plugin),
      event(6, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ])

    expect(candidates).toEqual([{
      eventSeq: 1,
      promptText: 'human prompt',
      retainedEventCount: 4,
      hiddenEventCount: 3,
    }])
  })
})

describe('TUI double Escape rewind gesture', () => {
  it('arms once, fires inside the bounded interval, and rearms after expiry or clock reversal', () => {
    expect(consumeTuiDoubleEscape(1_000, undefined)).toEqual({
      triggered: false, lastEscapeAt: 1_000,
    })
    expect(consumeTuiDoubleEscape(1_000 + TUI_DOUBLE_ESCAPE_WINDOW_MS, 1_000)).toEqual({
      triggered: true,
    })
    expect(consumeTuiDoubleEscape(1_000 + TUI_DOUBLE_ESCAPE_WINDOW_MS + 1, 1_000)).toEqual({
      triggered: false, lastEscapeAt: 1_000 + TUI_DOUBLE_ESCAPE_WINDOW_MS + 1,
    })
    expect(consumeTuiDoubleEscape(900, 1_000)).toEqual({ triggered: false, lastEscapeAt: 900 })
  })
})

describe('TUI Session resume picker', () => {
  const record = (
    id: string,
    createdAt: number,
    options: Partial<SessionRecord['header']> & Pick<SessionRecord, 'live' | 'persisted'> & { omitCwd?: true },
  ): SessionRecord => {
    const { live, persisted, omitCwd, ...header } = options
    return {
      header: {
        version: 0,
        id: SessionId(id),
        createdAt,
        delegationDepth: 0,
        ...omitCwd === true ? {} : { cwd: '/workspace/current' },
        ...header,
        isSeeded: header.isSeeded ?? false,
      },
      live,
      persisted,
    }
  }

  it('summarizes compatibility without reading a Session log', () => {
    const currentId = SessionId('current')
    const standard = { id: 'standard', label: 'Standard', trust: 'system' as const }
    const summarize = (value: SessionRecord) => summarizeTuiResumeCandidate(
      value, undefined, undefined, currentId, '/workspace/current', [], false, undefined, standard,
    )
    expect(summarize(record('eligible', 10, { live: false, persisted: true }))).toMatchObject({
      title: 'Untitled session', updatedAt: 10, currentWorkspace: true,
    })
    expect(summarize(record('current', 1, { live: true, persisted: true })).disabledReason).toBe('current session')
    expect(summarize(record('live', 1, { live: true, persisted: true })).disabledReason)
      .toBe('session is already live in this runtime')
    expect(summarize(record('memory', 1, { live: false, persisted: false })).disabledReason)
      .toBe('session is not persisted')
    expect(summarize(record('format', 1, { live: false, persisted: true, version: 99 })).disabledReason)
      .toBe('session format is incompatible')
    expect(summarize(record('child', 1, { live: false, persisted: true, origin: 'subagent' })).disabledReason)
      .toBe('subagent-owned session')
    expect(summarizeTuiResumeCandidate(
      record('legacy', 1, { live: false, persisted: true }),
      undefined, undefined, currentId, '/workspace/current',
    ).disabledReason).toBe('legacy rosterless session')
    expect(summarize(record('no-cwd', 1, { live: false, persisted: true, omitCwd: true })).disabledReason)
      .toBe('session has no recorded workspace')
    expect(summarizeTuiResumeCandidate(
      record('preview', 1, { live: false, persisted: true }),
      'Preview', 2, currentId, '/workspace/current',
      [{ seq: 1, kind: 'human', text: 'hello' }], true, 'backend unavailable', standard,
    )).toMatchObject({
      preview: [{ seq: 1, kind: 'human', text: 'hello' }],
      previewTruncated: true,
      previewError: 'backend unavailable',
    })
    expect(summarizeTuiResumeCandidate(
      record('preview', 1, { live: false, persisted: true }),
      'Preview', 2, currentId, '/workspace/current', [], false, 'backend unavailable', standard,
    ).disabledReason).toBeUndefined()
  })

  it('sorts by activity and filters normalized title, id, and visible workspace', () => {
    const currentId = SessionId('current')
    const standard = { id: 'standard', label: 'Standard', trust: 'system' as const }
    const candidates = sortTuiResumeCandidates([
      summarizeTuiResumeCandidate(
        record('z-id', 1, { live: false, persisted: true, cwd: '/workspace/other' }),
        'Unicode e\u0301', 20, currentId, '/workspace/current', [], false, undefined, standard,
      ),
      summarizeTuiResumeCandidate(
        record('a-id', 1, { live: false, persisted: true }),
        'Current work', 20, currentId, '/workspace/current', [], false, undefined, standard,
      ),
      summarizeTuiResumeCandidate(
        record('older-id', 1, { live: false, persisted: true }),
        'Older', 10, currentId, '/workspace/current', [], false, undefined, standard,
      ),
    ])
    expect(candidates.map(candidate => candidate.record.header.id)).toEqual([
      SessionId('a-id'), SessionId('z-id'), SessionId('older-id'),
    ])
    expect(filterTuiResumeCandidates(candidates, 'workspace', '')).toHaveLength(2)
    expect(filterTuiResumeCandidates(candidates, 'all', '').map(candidate => candidate.record.header.id))
      .toEqual([SessionId('a-id'), SessionId('older-id'), SessionId('z-id')])
    expect(filterTuiResumeCandidates(candidates, 'workspace', 'OTHER')).toEqual([])
    expect(filterTuiResumeCandidates(candidates, 'all', 'OTHER').map(candidate => candidate.record.header.id))
      .toEqual([SessionId('z-id')])
    expect(filterTuiResumeCandidates(candidates, 'all', '\u00e9').map(candidate => candidate.record.header.id))
      .toEqual([SessionId('z-id')])
    expect(filterTuiResumeCandidates(candidates, 'all', 'OLDER-ID')).toHaveLength(1)
  })

  it('formats stable relative-time buckets and clamps future timestamps', () => {
    const now = 2_000_000_000
    expect(formatTuiRelativeTime(now + 1_000, now)).toBe('now')
    expect(formatTuiRelativeTime(now - 59_999, now)).toBe('now')
    expect(formatTuiRelativeTime(now - 60_000, now)).toBe('1m ago')
    expect(formatTuiRelativeTime(now - 3_600_000, now)).toBe('1h ago')
    expect(formatTuiRelativeTime(now - 86_400_000, now)).toBe('1d ago')
    expect(formatTuiRelativeTime(now - 30 * 86_400_000, now)).toBe('1mo ago')
    expect(formatTuiRelativeTime(now - 365 * 86_400_000, now)).toBe('1y ago')
  })
})

describe('TUI interaction bindings', () => {
  const eventFor = (sequence: string): { input: string; key: TuiKeypress } => {
    const events: Record<string, { input: string; key: TuiKeypress }> = {
      'ctrl+c': { input: '\u0003', key: {} },
      'ctrl+g': { input: '\u0007', key: {} },
      'ctrl+o': { input: 'o', key: { ctrl: true } },
      enter: { input: '', key: { return: true } },
      'ctrl+j': { input: '\n', key: {} },
      up: { input: '', key: { upArrow: true } },
      down: { input: '', key: { downArrow: true } },
      'ctrl+up': { input: '', key: { upArrow: true, ctrl: true } },
      'ctrl+down': { input: '', key: { downArrow: true, ctrl: true } },
      'shift+up': { input: '', key: { upArrow: true, shift: true } },
      'shift+down': { input: '', key: { downArrow: true, shift: true } },
      left: { input: '', key: { leftArrow: true } },
      right: { input: '', key: { rightArrow: true } },
      'ctrl+f': { input: '\u0006', key: {} },
      'ctrl+r': { input: '\u0012', key: {} },
      'ctrl+s': { input: '\u0013', key: {} },
      'ctrl+_': { input: '\u001f', key: {} },
      'ctrl+shift+-': { input: '-', key: { ctrl: true, shift: true } },
      'ctrl+y': { input: '\u0019', key: {} },
      'ctrl+x': { input: '\u0018', key: {} },
      'ctrl+v': { input: '\u0016', key: {} },
      'ctrl+k': { input: 'k', key: { ctrl: true } },
      'ctrl+p': { input: 'p', key: { ctrl: true } },
      'ctrl+q': { input: '\u0011', key: {} },
      'ctrl+space': { input: ' ', key: { ctrl: true } },
      'ctrl+t': { input: 't', key: { ctrl: true } },
      r: { input: 'r', key: {} },
      l: { input: 'l', key: {} },
      'meta+p': { input: 'p', key: { meta: true } },
      'meta+g': { input: 'g', key: { meta: true } },
      'meta+r': { input: 'r', key: { meta: true } },
      'shift+s': { input: 'S', key: { shift: true } },
      'shift+c': { input: 'C', key: { shift: true } },
      'shift+i': { input: 'I', key: { shift: true } },
      'shift+o': { input: 'O', key: { shift: true } },
      pageup: { input: '', key: { pageUp: true } },
      pagedown: { input: '', key: { pageDown: true } },
      home: { input: '\u001b[H', key: {} },
      end: { input: '\u001b[F', key: {} },
      escape: { input: '', key: { escape: true } },
      'shift+tab': { input: '', key: { tab: true, shift: true } },
      'shift+enter': { input: '', key: { return: true, shift: true } },
      tab: { input: '', key: { tab: true } },
      y: { input: 'y', key: {} },
      n: { input: 'n', key: {} },
      x: { input: 'x', key: {} },
    }
    const event = events[sequence] ?? (/^[a-z]$/u.test(sequence)
      ? { input: sequence, key: {} }
      : undefined)
    if (event === undefined) throw new Error(`No test keypress for ${sequence}`)
    return event
  }

  it('keeps the registry deeply immutable and every displayed key dispatchable', () => {
    expect(Object.isFrozen(TUI_INTERACTION_REGISTRY)).toBe(true)
    for (const descriptor of TUI_INTERACTION_REGISTRY) {
      expect(Object.isFrozen(descriptor)).toBe(true)
      expect(Object.isFrozen(descriptor.bindings)).toBe(true)
      for (const binding of descriptor.bindings) {
        expect(Object.isFrozen(binding)).toBe(true)
        if (binding.kind === 'command') continue
        const event = eventFor(binding.sequence)
        expect(matchTuiInteractionAction(descriptor.context, event.input, event.key)).toBe(descriptor.id)
      }
    }
  })

  it('selects one modal owner in the documented priority order', () => {
    expect(TUI_INTERACTION_CONTEXT_PRIORITY).toEqual([
      'Global', 'Approval', 'PluginHub', 'Dialog', 'Work', 'Detail', 'TranscriptSearch', 'Transcript', 'HistorySearch', 'Suggestion', 'Footer', 'Composer',
    ])
    const state = {
      approval: true, dialog: true, work: true, detail: true, transcriptSearch: true,
      transcript: true, historySearch: true, suggestion: true, footer: true,
    }
    expect(resolveTuiInteractionContext(state)).toBe('Approval')
    expect(resolveTuiInteractionContext({ ...state, approval: false })).toBe('Dialog')
    expect(resolveTuiInteractionContext({ ...state, approval: false, dialog: false })).toBe('Work')
    expect(resolveTuiInteractionContext({ ...state, approval: false, dialog: false, work: false })).toBe('Detail')
    expect(resolveTuiInteractionContext({
      ...state, approval: false, dialog: false, work: false, detail: false,
    })).toBe('TranscriptSearch')
    expect(resolveTuiInteractionContext({
      ...state, approval: false, dialog: false, work: false, detail: false, transcriptSearch: false,
    })).toBe('Transcript')
    expect(resolveTuiInteractionContext({
      ...state, approval: false, dialog: false, work: false, detail: false, transcriptSearch: false, transcript: false,
    })).toBe('HistorySearch')
    expect(resolveTuiInteractionContext({
      ...state, approval: false, dialog: false, work: false, detail: false,
      transcriptSearch: false, transcript: false, historySearch: false,
    })).toBe('Suggestion')
    expect(resolveTuiInteractionContext({
      ...state, approval: false, dialog: false, work: false, detail: false,
      transcriptSearch: false, transcript: false, historySearch: false, suggestion: false,
    })).toBe('Footer')
    expect(resolveTuiInteractionContext({
      approval: false, dialog: false, work: false, detail: false, transcriptSearch: false, transcript: false,
      historySearch: false, suggestion: false, footer: false,
    })).toBe('Composer')
  })

  it('normalizes modified Enter protocols for reverse transcript search', () => {
    expect(matchTuiInteractionAction('TranscriptSearch', '[13;2u', {}))
      .toBe('transcriptSearch.previous')
    expect(matchTuiInteractionAction('TranscriptSearch', '[27;2;13~', {}))
      .toBe('transcriptSearch.previous')
    expect(matchTuiInteractionAction('TranscriptSearch', '\u001b[13;2u', {}))
      .toBe('transcriptSearch.previous')
    expect(matchTuiInteractionAction('TranscriptSearch', '\u001b[27;2;13~', {}))
      .toBe('transcriptSearch.previous')
  })

  it('keeps Escape bound to the running-Agent cancel action', () => {
    expect(matchTuiInteractionAction('Composer', '', { escape: true })).toBe('composer.cancel')
  })

  it('keeps Plugin Hub letter search distinct from shifted catalog actions', () => {
    expect(matchTuiInteractionAction('PluginHub', 's', {})).toBeUndefined()
    expect(matchTuiInteractionAction('PluginHub', 'c', {})).toBeUndefined()
    expect(matchTuiInteractionAction('PluginHub', 'i', {})).toBeUndefined()
    expect(matchTuiInteractionAction('PluginHub', 'o', {})).toBeUndefined()
    expect(matchTuiInteractionAction('PluginHub', 'S', { shift: true })).toBe('pluginHub.sort')
    expect(matchTuiInteractionAction('PluginHub', 'C', { shift: true })).toBe('pluginHub.category')
    expect(matchTuiInteractionAction('PluginHub', 'I', { shift: true })).toBe('pluginHub.installable')
    expect(matchTuiInteractionAction('PluginHub', 'O', { shift: true })).toBe('pluginHub.openRepository')
    expect(TUI_SETTINGS_SCHEMA({ keybindings: { 'pluginHub.sort': ['shift+s'] } } as never))
      .toMatchObject({ keybindings: { 'pluginHub.sort': ['shift+s'] } })
  })

  it('uses one effective registry for custom dispatch and help', () => {
    const registry = resolveTuiInteractionRegistry({
      'composer.openModels': ['ctrl+p'],
      'composer.historySearch': ['ctrl+k'],
      'composer.transcriptSearch': ['ctrl+t'],
    })
    for (const [sequence, action] of [
      ['ctrl+p', 'composer.openModels'],
      ['ctrl+k', 'composer.historySearch'],
      ['ctrl+t', 'composer.transcriptSearch'],
    ] as const) {
      const event = eventFor(sequence)
      expect(matchTuiInteractionAction('Composer', event.input, event.key, registry)).toBe(action)
    }
    expect(matchTuiInteractionAction('Composer', 'p', { meta: true }, registry)).toBeUndefined()

    const spaceRegistry = resolveTuiInteractionRegistry({ 'composer.openModels': ['ctrl+space'] })
    const space = eventFor('ctrl+space')
    expect(matchTuiInteractionAction('Composer', space.input, space.key, spaceRegistry))
      .toBe('composer.openModels')

    const unbound = resolveTuiInteractionRegistry({ 'composer.openModels': [] })
    expect(unbound.find(descriptor => descriptor.id === 'composer.openModels')).toMatchObject({
      bindings: [{ sequence: '/models', kind: 'command' }],
    })

    const help = tuiInteractionHelpLines(effectiveTuiInteractionDescriptors({
      modelPicker: true, resumePicker: true, approval: true, childView: false,
    }, registry), 80)
    expect(help.some(line => line.text.includes('Ctrl+P / /models') && line.text.includes('Open model picker'))).toBe(true)
    expect(help.some(line => line.text.includes('Ctrl+K') && line.text.includes('Search submitted prompts'))).toBe(true)
    expect(help.some(line => line.text.includes('Ctrl+T') && line.text.includes('Search complete transcript'))).toBe(true)
  })

  it('allows cross-context reuse without leaking modal input to Composer', () => {
    const registry = resolveTuiInteractionRegistry({ 'composer.openModels': ['y'] })
    expect(matchTuiInteractionAction('Approval', 'y', {}, registry)).toBe('approval.allowOnce')
    expect(matchTuiInteractionAction('Composer', 'y', {}, registry)).toBe('composer.openModels')
    expect(resolveTuiInteractionContext({
      approval: true, dialog: false, work: false, detail: false, transcriptSearch: false,
      transcript: false, historySearch: false, suggestion: false, footer: false,
    })).toBe('Approval')
  })

  it('omits unavailable capabilities and projects bounded narrow help without clipping keys', () => {
    const unavailable = effectiveTuiInteractionDescriptors({
      modelPicker: false, resumePicker: false, approval: false, childView: false,
    })
    expect(unavailable.some(descriptor => descriptor.id === 'composer.openModels')).toBe(false)
    expect(unavailable.some(descriptor => descriptor.id === 'composer.openResume')).toBe(false)
    expect(unavailable.some(descriptor => descriptor.context === 'Approval')).toBe(false)
    expect(unavailable.some(descriptor => descriptor.id === 'view.root')).toBe(false)

    const effective = effectiveTuiInteractionDescriptors({
      modelPicker: true, resumePicker: true, approval: true, childView: true,
    })
    const narrow = tuiInteractionHelpLines(effective, 36)
    const wide = tuiInteractionHelpLines(effective, 80)
    expect(narrow.some(line => line.text.includes('Ctrl+_ / Ctrl+Shift+-'))).toBe(true)
    expect(narrow.filter(line => line.kind === 'binding').every(line => line.text.length <= 36)).toBe(true)
    expect(wide.length).toBeLessThan(narrow.length)
    expect(wide.some(line => line.text.includes('Alt+P / /models') && line.text.includes('Open model picker'))).toBe(true)
    expect(wide.some(line => line.text.includes('Alt+R / /resume') && line.text.includes('Open Session picker'))).toBe(true)
    expect(wide.some(line => line.text.includes('Ctrl+G') && line.text.includes('Return to root Agent'))).toBe(true)
    expect(effective.some(descriptor => descriptor.id === 'transcript.copy')).toBe(true)
    expect(effective.some(descriptor => descriptor.id === 'detail.copy')).toBe(true)
    expect(effective.some(descriptor => descriptor.id === 'detail.exportMarkdown')).toBe(true)
    expect(effective.some(descriptor => descriptor.context === 'Approval'
      && descriptor.description.toLowerCase().includes('copy'))).toBe(false)
    expect(matchTuiInteractionAction('Composer', 'r', { meta: true })).toBe('composer.openResume')
  })
})

describe('TUI actionable footer', () => {
  const sources = {
    modelSelection: { provider: 'mock', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('high') },
    modelSelectionKind: 'next request' as const,
    permissions: {
      currentValue: 'workspace-write',
      options: [
        { value: 'read-only', name: 'Read only' },
        { value: 'workspace-write', name: 'Workspace write', description: 'Writes stay inside the workspace.' },
      ],
    },
    context: { projectedTokens: 8_000, pressureTokens: 7_000, contextWindow: 32_000 },
    tokenUsage: {
      uncachedInputTokens: 5_000,
      outputTokens: 2_000,
      cacheReadTokens: 2_000,
      cacheWriteTokens: 100,
    },
    contextBreakdown: { systemTokens: 1_000, toolsTokens: 500, messageTokens: 6_500 },
    sessionStats: {
      turns: 1,
      steps: 2,
      llmMs: 4_000,
      toolMs: 500,
      ttftMs: 800,
      ttftSteps: 2,
      decodeMs: 3_000,
      decodeTokens: 60,
    },
    speed: { tokensPerSecond: 20, approximate: false, trend: '▁▃▆█', tokens: 60, elapsedMs: 3_000 },
    workspace: '/workspace/DSH',
    transcript: { startIndex: 4, endIndex: 8, total: 12, hasOlder: true, hasNewer: true },
  }

  it('projects authoritative items and omits context without a provider sample', () => {
    const items = tuiFooterItems(sources)
    expect(items.map(item => item.id)).toEqual(['model', 'permission', 'speed', 'context', 'workspace', 'transcript'])
    expect(items.find(item => item.id === 'model')?.detailLines).toContain('Selection: next request')
    expect(items.find(item => item.id === 'speed')).toMatchObject({ value: '20.0 ▁▃▆█', action: 'detail' })
    expect(items.find(item => item.id === 'context')).toMatchObject({ value: '~25% [STMMMMMM]', action: 'detail' })
    expect(tuiContextSegmentBar(sources.contextBreakdown)).toBe('[STMMMMMM]')
    expect(items.find(item => item.id === 'context')?.detailLines).toContain('Approximate remaining: 24,000 tokens')
    expect(items.find(item => item.id === 'context')?.detailLines).toContain(
      'Approximate composition: system ~1,000 · tools ~500 · messages ~6,500',
    )
    expect(items.find(item => item.id === 'context')?.detailLines).toContain('Usage: input 5,000 · output 2,000')
    expect(items.find(item => item.id === 'context')?.detailLines).toContain(
      'Approximate cache hit: 2,000/7,100 prompt tokens (~28%)',
    )
    expect(items.find(item => item.id === 'context')?.detailLines).toContain(
      'Settled TTFT: 400 ms average (2 steps)',
    )
    expect(items.find(item => item.id === 'context')?.detailLines).toContain(
      'Decode throughput: 20.0 tokens/s (60 output tokens)',
    )
    expect(items.find(item => item.id === 'transcript')).toMatchObject({ value: '↑5-9/12↓3', action: 'bottom' })

    const withoutSample = tuiFooterItems({ ...sources, context: { contextWindow: 32_000 } })
    expect(withoutSample.some(item => item.id === 'context')).toBe(false)

    const chinese = tuiFooterItems(sources, 'zh')
    expect(chinese.map(item => item.label)).toEqual(['模型', '权限', 'TPS', '上下文', '目录', '视图'])
    expect(chinese.find(item => item.id === 'model')?.detailLines).toContain('选择：下次请求')
    expect(chinese.find(item => item.id === 'context')?.detailLines).toContain(
      '估算组成：系统 ~1,000 · 工具 ~500 · 消息 ~6,500',
    )
    expect(chinese.find(item => item.id === 'context')?.detailLines).toContain('用量：输入 5,000 · 输出 2,000')
  })

  it('projects the current Agent mode as a localized high-priority action', () => {
    const preset = {
      id: 'minimal', trust: 'system' as const, path: '/private/preset/minimal/agent.cordis.yml',
      name: '极简模式', description: '仅提供两个工具。', order: 3,
    }
    const items = tuiFooterItems({ ...sources, agentPreset: preset })
    expect(items.map(item => item.id)).toEqual([
      'model', 'mode', 'permission', 'speed', 'context', 'workspace', 'transcript',
    ])
    expect(items.find(item => item.id === 'mode')).toMatchObject({
      label: 'mode', value: 'Minimal', action: 'modes',
    })
    expect(items.find(item => item.id === 'mode')?.detailLines.join('\n')).not.toContain('/private/preset')
    expect(tuiFooterItems({ ...sources, agentPreset: preset }, 'zh').find(item => item.id === 'mode'))
      .toMatchObject({ label: '模式', value: '极简模式' })
  })

  it('does not invent cache percentages when the provider reports no prompt denominator', () => {
    const items = tuiFooterItems({
      ...sources,
      tokenUsage: { uncachedInputTokens: 0, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
    const context = items.find(item => item.id === 'context')
    expect(context?.detailLines).toContain('Usage: input 0 · output 100')
    expect(context?.detailLines.some(line => line.includes('cache hit'))).toBe(false)
  })

  it('hides timing detail until a valid token boundary or decode sample settles', () => {
    const items = tuiFooterItems({
      ...sources,
      sessionStats: {
        turns: 1,
        steps: 1,
        llmMs: 0,
        toolMs: 0,
        ttftMs: 0,
        ttftSteps: 0,
        decodeMs: 0,
        decodeTokens: 0,
      },
    })
    const detailLines = items.find(item => item.id === 'context')?.detailLines ?? []
    expect(detailLines.some(line => line.includes('Settled TTFT'))).toBe(false)
    expect(detailLines.some(line => line.includes('Decode throughput'))).toBe(false)
  })

  it('exposes non-empty work counters as a high-priority action', () => {
    const items = tuiFooterItems({
      ...sources,
      work: { running: 2, queued: 0, failed: 1, total: 4 },
    })
    expect(items.map(item => item.id)).toEqual([
      'model', 'permission', 'work', 'speed', 'context', 'workspace', 'transcript',
    ])
    expect(items.find(item => item.id === 'work')).toMatchObject({
      value: '2r/0q/1f', action: 'work',
    })
    expect(visibleTuiFooterItems(items, 40).map(item => item.id)).toContain('work')
  })

  it('shows only ready non-empty Schedule projections as an actionable item', () => {
    const schedules = collectTuiSchedules([{
      id: 'daily' as never,
      kind: 'every',
      prompt: 'Review the build',
      everySeconds: 86_400,
      scheduledAt: '2026-08-31T00:00:00.000Z',
    }], Date.parse('2026-08-31T01:00:00.000Z'))
    const items = tuiFooterItems({ ...sources, schedules })
    expect(items.find(item => item.id === 'schedules')).toMatchObject({
      label: 'plans', value: '1/1 overdue', action: 'schedules',
    })
    expect(tuiFooterItems({ ...sources, schedules: collectTuiSchedules([]) })
      .some(item => item.id === 'schedules')).toBe(false)
    expect(tuiFooterItems({ ...sources, schedules: collectTuiSchedules(undefined) })
      .some(item => item.id === 'schedules')).toBe(false)
  })

  it('keeps high-priority narrow items bounded and navigates only mounted items', () => {
    const items = tuiFooterItems(sources)
    const narrow = visibleTuiFooterItems(items, 38)
    expect(narrow.map(item => item.id)).toEqual(['model', 'permission'])
    expect(moveTuiFooterSelection(narrow, 'model', 'previous')).toBe('permission')
    expect(moveTuiFooterSelection(narrow, 'permission', 'next')).toBe('model')
    expect(moveTuiFooterSelection(narrow, 'context', 'next')).toBe('permission')

    const status = tuiFooterStatusLine(narrow, 38)
    expect(stringWidth(status)).toBeLessThanOrEqual(38)
    expect(status).toContain('model')
    expect(status).toContain('perm')
    expect(stringWidth(tuiSelectedFooterLine(narrow, 'permission', 38))).toBeLessThanOrEqual(38)

    const wide = tuiFooterStatusLine(items, 78)
    expect(wide).toContain('TPS 20.0')
    expect(wide).toContain('view ↑5-9/12↓3')
  })
})

describe('TUI Agent mode roster projection', () => {
  const presets = [
    { id: 'minimal', trust: 'system' as const, path: '/system/minimal', name: '极简模式', order: 3 },
    { id: 'mine', trust: 'user' as const, path: '/user/mine', name: 'My mode', description: 'Local tools.' },
    { id: 'broken', trust: 'user' as const, path: '/user/broken', broken: 'invalid composition' },
    { id: 'standard', trust: 'system' as const, path: '/system/standard', name: '标准模式', order: 1 },
  ]

  it('localizes official names while retaining user metadata and unavailable state', () => {
    expect(tuiAgentModeName(presets[0]!, 'en')).toBe('Minimal')
    expect(tuiAgentModeName(presets[0]!, 'zh')).toBe('极简模式')
    const options = tuiAgentModeOptions(presets, 'standard', 'en')
    expect(options.map(option => option.preset.id)).toEqual(['standard', 'minimal', 'broken', 'mine'])
    expect(options[0]?.label).toContain('current')
    expect(options.find(option => option.preset.id === 'mine')?.description).toContain('user')
    expect(options.find(option => option.preset.id === 'broken')?.description)
      .toContain('unavailable · invalid composition')
    expect(options.every(option => !option.description.includes(option.preset.path))).toBe(true)
  })
})

describe('TUI background work', () => {
  const rootId = SessionId('root')
  const childId = SessionId('child')

  it('deduplicates job-managed one-shot children and retains authoritative live states', () => {
    const job: JobSnapshot = {
      id: JobId('subagent-1'),
      kind: 'subagent',
      label: 'one-shot research',
      ownerSession: rootId,
      status: 'running',
      startedAt: 1_000,
      reported: false,
    }
    const snapshot = projectTuiWork({
      jobs: [job],
      subagents: [
        {
          kind: 'child', id: SessionId('one-shot-child'), mode: 'one-shot', activity: 'running',
          hasChildren: false, parentId: rootId, depth: 1,
        },
        {
          kind: 'child', id: childId, mode: 'continuable', label: 'reviewer', activity: 'running',
          hasChildren: false, parentId: rootId, depth: 1,
        },
      ],
      liveAgents: new Map([[
        childId,
        {
          status: 'running',
          route: { provider: 'mock', model: 'child-model', reasoningEffort: 'high', maxTokens: 4096, source: 'live-agent' },
          timing: { settledMs: 500, active: { since: 2_000, through: 2_500 } },
        },
      ]]),
      remoteRuns: [{
        info: { runId: SubagentRunId('remote-1'), provider: 'acp', id: SessionId('remote'), local: false },
        observedAt: 1_500,
        outcome: {
          runId: SubagentRunId('remote-1'), provider: 'acp', id: SessionId('remote'), local: false,
          stopReason: 'error',
        },
        finishedAt: 3_000,
      }],
    })
    expect(snapshot.items.map(item => item.key)).toEqual([
      'job:subagent-1', 'subagent:child', 'remote-subagent:remote-1',
    ])
    expect(snapshot.items[1]).toMatchObject({
      label: 'reviewer', ownerSession: rootId, state: 'running', action: 'interrupt-subagent', inspectable: true,
    })
    expect(snapshot.items[2]).toMatchObject({
      state: 'failed', action: 'none', inspectable: false,
    })
    expect(snapshot.summary).toEqual({ running: 2, queued: 0, failed: 1, total: 3 })
    expect(snapshot.items[1] === undefined ? undefined : formatTuiWorkOwner(snapshot.items[1])).toBe('owner root')
    expect(snapshot.items[2] === undefined ? undefined : formatTuiWorkOwner(snapshot.items[2])).toBe('owner not exposed')
    expect(snapshot.items[1] === undefined ? undefined : formatTuiWorkRoute(snapshot.items[1])).toBe(
      'provider mock · model child-model · reasoning high · max output 4096 · source resolved live Agent options',
    )
    expect(snapshot.items[2] === undefined ? undefined : formatTuiWorkRoute(snapshot.items[2], 'zh')).toBe(
      '提供方 acp · 模型 不可用 · 思考强度 不可用 · 最大输出 不可用 · 来源 远端生命周期摘要',
    )
  })

  it('uses waiting and inactive states without inventing queued work', () => {
    const waiting = projectTuiWork({
      jobs: [],
      subagents: [{
        kind: 'child', id: childId, mode: 'continuable', label: 'reviewer', activity: 'running',
        hasChildren: false, parentId: rootId, depth: 1,
      }],
      liveAgents: new Map([[childId, { status: 'idle', route: { source: 'live-agent' } }]]),
      remoteRuns: [],
    })
    expect(waiting.items[0]).toMatchObject({ state: 'waiting', action: 'none', inspectable: true })
    expect(waiting.summary.queued).toBe(0)

    const inactive = projectTuiWork({
      jobs: [],
      subagents: [{
        kind: 'child', id: childId, mode: 'continuable', label: 'reviewer', activity: 'inactive',
        hasChildren: false, parentId: rootId, depth: 1,
      }],
      liveAgents: new Map(),
      remoteRuns: [],
    })
    expect(inactive.items[0]).toMatchObject({
      state: 'inactive', action: 'none', inspectable: false,
      readOnlyReason: 'The local child Agent is not live; its durable summary remains available.',
    })
    expect(inactive.items[0] === undefined ? undefined : formatTuiWorkRoute(inactive.items[0])).toContain(
      'source durable catalog (route not exposed)',
    )
  })

  it('formats frozen job duration and durable open-turn timing', () => {
    const frozen = projectTuiWork({
      jobs: [{
        id: JobId('bash-1'), kind: 'bash', label: 'build', status: 'completed',
        startedAt: 1_000, finishedAt: 66_000, reported: true,
      }],
      subagents: [], liveAgents: new Map(), remoteRuns: [],
    }).items[0]
    expect(frozen === undefined ? undefined : formatTuiWorkElapsed(frozen, 90_000)).toBe('1m 5s')

    const active = projectTuiWork({
      jobs: [],
      subagents: [{
        kind: 'child', id: childId, mode: 'continuable', label: 'reviewer', activity: 'running',
        hasChildren: false, parentId: rootId, depth: 1,
      }],
      liveAgents: new Map([[
        childId,
        {
          status: 'running', route: { source: 'live-agent' },
          timing: { settledMs: 2_000, active: { since: 10_000, through: 11_000 } },
        },
      ]]),
      remoteRuns: [],
    }).items[0]
    expect(active === undefined ? undefined : formatTuiWorkElapsed(active, 14_000)).toBe('6s')
  })
})

describe('TUI Agent view state', () => {
  it('restores independent disposable state for root and child views', () => {
    const cache = new TuiAgentViewStateCache<{ draft: string; anchor: string | undefined }>()
    const rootId = SessionId('root-view')
    const childId = SessionId('child-view')
    cache.set(rootId, { draft: 'root draft', anchor: 'root-anchor' })
    cache.set(childId, { draft: 'child draft', anchor: undefined })

    expect(cache.get(childId, () => ({ draft: '', anchor: undefined }))).toEqual({
      draft: 'child draft', anchor: undefined,
    })
    expect(cache.get(rootId, () => ({ draft: '', anchor: undefined }))).toEqual({
      draft: 'root draft', anchor: 'root-anchor',
    })
    expect(cache.get(SessionId('new-view'), () => ({ draft: '', anchor: undefined }))).toEqual({
      draft: '', anchor: undefined,
    })
  })
})

describe('TUI Session export directory', () => {
  it('resolves blank and relative input from the Session workspace and preserves absolute input', () => {
    const workspace = resolve(process.cwd(), 'workspace-root')
    const absolute = resolve(process.cwd(), 'archive-output')
    expect(resolveTuiSessionExportDirectory(workspace, '')).toBe(workspace)
    expect(resolveTuiSessionExportDirectory(workspace, ' exports ')).toBe(resolve(workspace, 'exports'))
    expect(resolveTuiSessionExportDirectory(workspace, absolute)).toBe(absolute)
  })
})

describe('TUI activation', () => {
  it('fails through appExit on non-TTY streams without requiring Agent services', async () => {
    let err = ''
    Object.assign(terminalInternals, {
      stdin: { isTTY: false } as never,
      stdout: { isTTY: false, write: () => true } as never,
      stderr: { write: (chunk: string) => { err += chunk; return true } } as never,
    })
    const ctx = new Context()
    const exited = new Promise<number>((resolve) => { ctx.provide('appExit', resolve) })
    await ctx.plugin((pluginCtx) => { apply(pluginCtx, {}) })
    await expect(exited).resolves.toBe(1)
    expect(err).toContain('TUI requires interactive stdin and stdout TTYs')
    await ctx.fiber.dispose()
  })
})
