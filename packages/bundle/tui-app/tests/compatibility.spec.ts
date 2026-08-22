/** Exact Host versions and installation ownership for the post-install bundle. */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TuiHostCompatibilityError,
  validateTuiHostCompatibility,
  type TuiHostPackageResolution,
} from '../src/compatibility.ts'

const manifest = {
  version: '0.1.2-rc.8',
  peerDependencies: {
    '@deepseek-ai/dsh-app-boot': '0.1.0-rc.8',
    '@deepseek-ai/dsh-session': '0.1.0-rc.8',
  },
}

function host(name: string, version = '0.1.0-rc.8'): TuiHostPackageResolution {
  return { name, version, manifestPath: join('/official/node_modules', name, 'package.json') }
}

describe('post-install TUI Host compatibility', () => {
  it('accepts one exact installation-owned Host graph', () => {
    expect(validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot'),
      host('@deepseek-ai/dsh-session'),
    ], '/dsh-home/profiles/tui')).toMatchObject({
      compatibility: 'compatible',
      dshVersion: '0.1.0-rc.8',
      supportedDshVersion: '0.1.0-rc.8',
      tuiVersion: '0.1.2-rc.8',
      profile: 'tui',
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      agentPresetIds: ['standard', 'code', 'minimal', 'cordis'],
      recoveryCommand: 'dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.2-rc.8',
    })
  })

  it('rejects a version mismatch with the exact recovery command', () => {
    expect(() => validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot', '0.1.0-rc.7'),
      host('@deepseek-ai/dsh-session'),
    ], '/dsh-home/profiles/tui')).toThrow(TuiHostCompatibilityError)
    expect(() => validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot', '0.1.0-rc.7'),
      host('@deepseek-ai/dsh-session'),
    ], '/dsh-home/profiles/tui')).toThrow('dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.2-rc.8')
  })

  it('rejects a Host peer materialized inside the active profile', () => {
    expect(() => validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot'),
      {
        name: '@deepseek-ai/dsh-session',
        version: '0.1.0-rc.8',
        manifestPath: '/dsh-home/profiles/tui/node_modules/@deepseek-ai/dsh-session/package.json',
      },
    ], '/dsh-home/profiles/tui')).toThrow('resolves from the TUI profile')
  })

  it('allows workspace protocols only in the source checkout', () => {
    expect(validateTuiHostCompatibility({
      version: '0.1.2-rc.8',
      peerDependencies: { '@deepseek-ai/dsh-app-boot': 'workspace:*' },
    }, [host('@deepseek-ai/dsh-app-boot', 'development')], '/dsh-home/profiles/tui').dshVersion).toBe('development')
  })
})
