/** Capability-aware first-run guidance over non-secret runtime facts. */

import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import {
  inspectTuiStartupProvider,
  projectTuiStartupGuidance,
  type TuiStartupGuidanceSnapshot,
} from '../src/index.ts'

function snapshot(overrides: Partial<TuiStartupGuidanceSnapshot> = {}): TuiStartupGuidanceSnapshot {
  return {
    host: 'compatible',
    provider: { state: 'configured', id: 'deepseek-official', name: 'DeepSeek', modelCount: 2 },
    pluginHub: true,
    ...overrides,
  }
}

describe('native TUI first-run guidance', () => {
  it('collects configured and unconfigured provider facts through public reads', async () => {
    let modelReads = 0
    await expect(inspectTuiStartupProvider({ id: 'p', name: 'Provider' }, {
      authentication: () => Promise.resolve({ configured: true, methods: [] }),
      listModels: () => { modelReads += 1; return Promise.resolve([{}, {}]) },
    })).resolves.toEqual({ state: 'configured', id: 'p', name: 'Provider', modelCount: 2 })
    expect(modelReads).toBe(1)

    await expect(inspectTuiStartupProvider({ id: 'p', name: 'Provider' }, {
      authentication: () => Promise.resolve({ configured: false, methods: [{ name: 'Provider login' }] }),
      listModels: () => { throw new Error('unconfigured providers must not read models') },
    })).resolves.toEqual({
      state: 'unconfigured', id: 'p', name: 'Provider', method: 'Provider login',
    })
  })

  it('contains provider failures without retaining their messages and preserves cancellation', async () => {
    const secret = 'secret-provider-message'
    await expect(inspectTuiStartupProvider({ id: 'p', name: 'Provider' }, {
      authentication: () => Promise.reject(new Error(secret)),
      listModels: () => Promise.resolve([]),
    })).resolves.toEqual({ state: 'failed', id: 'p', name: 'Provider' })

    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(inspectTuiStartupProvider({ id: 'p', name: 'Provider' }, {
      authentication: () => Promise.resolve({ configured: true, methods: [] }),
      listModels: () => Promise.resolve([]),
    }, controller.signal)).rejects.toThrow('cancelled')
  })

  it('retains the selected model and exposes secondary model, plugin, and help actions', () => {
    expect(projectTuiStartupGuidance(snapshot(), 'deepseek-v4-flash · thinking: high', 57)).toEqual([
      { key: 'primary', text: 'deepseek-v4-flash · thinking: high', tone: 'success' },
      { key: 'actions', text: '/models change model · /plugins browse · /help commands', tone: 'secondary' },
    ])
  })

  it('uses provider-owned authentication labels without exposing credentials', () => {
    const lines = projectTuiStartupGuidance(snapshot({
      provider: {
        state: 'unconfigured', id: 'openai-codex', name: 'OpenAI Codex', method: 'Sign in with ChatGPT',
      },
    }), 'gpt-5', 76)
    expect(lines[0]).toEqual({
      key: 'primary', text: 'OpenAI Codex is not configured · Run /models', tone: 'warning',
    })
    expect(lines[1]?.text).toContain('/models Sign in with ChatGPT')
    expect(JSON.stringify(lines)).not.toContain('credential')
  })

  it('distinguishes an empty picker catalog from provider inspection failure', () => {
    expect(projectTuiStartupGuidance(snapshot({
      provider: { state: 'configured', id: 'custom', name: 'Custom', modelCount: 0 },
    }), 'custom-model', 76)[0]).toEqual({
      key: 'primary', text: 'Custom has no models in the picker · Retry /models', tone: 'warning',
    })
    expect(projectTuiStartupGuidance(snapshot({
      provider: { state: 'failed', id: 'custom', name: 'Custom' },
    }), 'custom-model', 76)[0]).toEqual({
      key: 'primary', text: 'Custom setup check failed · Run /doctor', tone: 'warning',
    })
  })

  it('prioritizes a missing Host snapshot over model and Plugin Hub actions', () => {
    const lines = projectTuiStartupGuidance(snapshot({ host: 'unavailable' }), 'deepseek-v4-flash', 76)
    expect(lines[0]).toEqual({
      key: 'primary', text: 'Host status unavailable · Run /doctor', tone: 'warning',
    })
  })

  it('mounts only the highest-priority executable line in a narrow workspace', () => {
    const healthy = projectTuiStartupGuidance(snapshot(), 'deepseek-v4-flash', 33)
    expect(healthy).toHaveLength(1)
    expect(healthy[0]?.text).toContain('/help commands')
    expect(healthy[0]?.text).not.toContain('/plugins')

    const unconfigured = projectTuiStartupGuidance(snapshot({
      provider: { state: 'unconfigured', id: 'p', name: 'Provider', method: 'Login' },
    }), 'model', 33)
    expect(unconfigured).toHaveLength(1)
    expect(unconfigured[0]?.text).toContain('/models')
  })

  it('sanitizes controls and bounds every projected line by Unicode display cells', () => {
    const lines = projectTuiStartupGuidance(snapshot({
      provider: { state: 'failed', id: '坏', name: '提供方\u001B]52;c;secret\u0007' },
    }), '模型🙂', 24)
    expect(lines.map(line => line.text).join('\n')).not.toContain('\u001B')
    expect(lines.every(line => stringWidth(line.text) <= 24)).toBe(true)
  })
})

it.each(['authentication', 'listModels'] as const)('cancels a stuck %s read without waiting for the provider', async (stage) => {
  const controller = new AbortController()
  let started!: () => void
  const entered = new Promise<void>((resolve) => { started = resolve })
  let rejectRead!: (error: Error) => void
  const stuck = () => { started(); return new Promise<never>((_resolve, reject) => { rejectRead = reject }) }
  const pending = inspectTuiStartupProvider({ id: 'p', name: 'Provider' }, {
    authentication: stage === 'authentication' ? stuck : async () => ({ configured: true, methods: [] }),
    listModels: stage === 'listModels' ? stuck : async () => [],
  }, controller.signal)
  await entered
  controller.abort(new Error('quit'))
  await expect(pending).rejects.toThrow('quit')
  // A late transport rejection must still be observed after cancellation wins.
  rejectRead(new Error('late network failure'))
})
