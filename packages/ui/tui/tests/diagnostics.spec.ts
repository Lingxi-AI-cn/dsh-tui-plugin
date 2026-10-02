/** Bounded, non-secret native TUI runtime diagnostics. */

import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import {
  DEFAULT_TUI_TERMINAL_CAPABILITIES,
  projectTuiDiagnostics,
  tuiDiagnosticPanelLines,
  tuiHostDiagnosticsFromStartup,
  type TuiDiagnosticInput,
  type TuiHostDiagnosticSnapshot,
} from '../src/index.ts'

const host: TuiHostDiagnosticSnapshot = Object.freeze({
  compatibility: 'compatible',
  dshVersion: '0.2.0-rc.2',
  supportedDshVersion: '0.2.0-rc.2',
  tuiVersion: '0.1.13-rc.2',
  profile: 'tui',
  nodeVersion: '24.7.0',
  platform: 'darwin',
  architecture: 'arm64',
  packages: Object.freeze([Object.freeze({
    name: '@deepseek-ai/dsh-app-boot',
    version: '0.2.0-rc.2',
    manifestPath: '/opt/dsh/node_modules/@deepseek-ai/dsh-app-boot/package.json',
  })]),
  agentPresetIds: Object.freeze(['standard', 'ptc', 'minimal', 'cordis']),
  recoveryCommand: 'dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.13-rc.2',
})

function input(overrides: Partial<TuiDiagnosticInput> = {}): TuiDiagnosticInput {
  return {
    host,
    terminal: DEFAULT_TUI_TERMINAL_CAPABILITIES,
    providers: [{ id: 'deepseek', name: 'DeepSeek', configured: true, modelCount: 2 }],
    pluginHub: {
      state: 'available', source: 'registry', stale: false, installedCount: 6, profileMutations: false,
    },
    storage: {
      state: 'available', backend: 'session-persistence-jsonl', currentFormat: 0, expectedFormat: 0,
      compatibleSessions: 12, incompatibleSessions: 0, supportsRawArtifacts: true,
    },
    capabilities: {
      settings: true, sessionProjection: true, pluginHub: true, jobs: true, subagents: true,
    },
    ...overrides,
  }
}

describe('native TUI runtime diagnostics', () => {
  it('accepts only the bundle-owned startup snapshot shape', () => {
    expect(tuiHostDiagnosticsFromStartup({ diagnostics: host })).toBe(host)
    expect(tuiHostDiagnosticsFromStartup({ diagnostics: { ...host, compatibility: 'unknown' } })).toBeUndefined()
    expect(tuiHostDiagnosticsFromStartup(undefined)).toBeUndefined()
  })

  it('projects compatible Host, terminal, provider, Plugin Hub, and service facts', () => {
    const snapshot = projectTuiDiagnostics(input())
    expect(snapshot.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'host-compatibility', severity: 'pass' }),
      expect.objectContaining({ id: 'plugin-hub', severity: 'pass' }),
      expect.objectContaining({ id: 'session-storage', severity: 'pass' }),
      expect.objectContaining({ id: 'runtime-capabilities', summary: '5/5 optional TUI capabilities mounted.' }),
    ]))
    expect(snapshot.rows.find(row => row.id === 'terminal')?.summary).toContain('mouse sgr')
    expect(snapshot.rows.find(row => row.id === 'terminal')?.detail).toContain('background unknown')
    expect(snapshot.rows.find(row => row.id === 'provider:deepseek')?.summary).toContain('2 selectable models')
  })

  it('fails closed when persisted Session metadata belongs to another format', () => {
    const snapshot = projectTuiDiagnostics(input({
      storage: {
        state: 'available', backend: 'session-persistence-jsonl', currentFormat: 0, expectedFormat: 0,
        compatibleSessions: 10, incompatibleSessions: 2, supportsRawArtifacts: true,
      },
    }))
    const row = snapshot.rows.find(row => row.id === 'session-storage')
    expect(row?.severity).toBe('warning')
    expect(row?.remediation).toContain('Back up')
  })

  it('contains provider and Plugin Hub failures while removing terminal controls', () => {
    const snapshot = projectTuiDiagnostics(input({
      providers: [{
        id: 'broken', name: 'Broken\u001B]52;c;secret\u0007', configured: false,
        error: 'token\u001B[31m leaked\nsecond line',
      }],
      pluginHub: { state: 'failed', error: 'registry\nfailed', profileMutations: false },
    }))
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('\u001B')
    expect(serialized).not.toContain('\nsecond line')
    expect(snapshot.rows.find(row => row.id === 'provider:broken')).toMatchObject({ severity: 'warning' })
    expect(snapshot.rows.find(row => row.id === 'plugin-hub')).toMatchObject({ severity: 'warning' })
  })

  it('reports degraded terminal capabilities and bounds provider rows', () => {
    const providers = Array.from({ length: 10 }, (_, index) => ({
      id: `provider-${index}`,
      name: `Provider ${index}`,
      configured: false,
    }))
    const snapshot = projectTuiDiagnostics(input({
      terminal: {
        ...DEFAULT_TUI_TERMINAL_CAPABILITIES,
        mouse: 'none', bracketedPaste: false, osc: false,
      },
      providers,
      omittedProviders: 3,
    }))
    expect(snapshot.rows.find(row => row.id === 'terminal')).toMatchObject({ severity: 'info' })
    expect(snapshot.rows.filter(row => row.id.startsWith('provider:'))).toHaveLength(8)
    expect(snapshot.rows.find(row => row.id === 'providers-omitted')?.summary).toContain('5 additional providers')
  })

  it('wraps rows to physical terminal width with explicit severity marks and next actions', () => {
    const snapshot = projectTuiDiagnostics(input({
      providers: [{ id: 'deepseek', name: 'DeepSeek', configured: false }],
    }))
    const lines = tuiDiagnosticPanelLines(snapshot, 24)
    expect(lines.some(line => line.kind === 'summary' && line.text.startsWith('! '))).toBe(true)
    expect(lines.some(line => line.kind === 'remediation' && line.text.includes('Next:'))).toBe(true)
    expect(lines.every(line => stringWidth(line.text) <= 24)).toBe(true)
  })
})
