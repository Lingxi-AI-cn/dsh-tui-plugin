/** Exact Host versions and installation ownership for the post-install bundle. */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TuiHostCompatibilityError,
  validateTuiHostCompatibility,
  type TuiHostPackageResolution,
} from '../src/compatibility.ts'

const manifest = {
  version: '0.1.8-rc.1',
  peerDependencies: {
    '@deepseek-ai/dsh-app-boot': '0.1.2-rc.1',
    '@deepseek-ai/dsh-session': '0.1.2-rc.1',
  },
}

function host(name: string, version = '0.1.2-rc.1'): TuiHostPackageResolution {
  return { name, version, manifestPath: join('/official/node_modules', name, 'package.json') }
}

describe('post-install TUI Host compatibility', () => {
  it('accepts one exact installation-owned Host graph', () => {
    expect(validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot'),
      host('@deepseek-ai/dsh-session'),
    ], '/dsh-home/profiles/tui')).toMatchObject({
      compatibility: 'compatible',
      dshVersion: '0.1.2-rc.1',
      supportedDshVersion: '0.1.2-rc.1',
      tuiVersion: '0.1.8-rc.1',
      profile: 'tui',
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      agentPresetIds: ['standard', 'ptc', 'minimal', 'cordis'],
      recoveryCommand: 'dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.8-rc.1',
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
    ], '/dsh-home/profiles/tui')).toThrow('dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.8-rc.1')
  })

  it('rejects a Host peer materialized inside the active profile', () => {
    expect(() => validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot'),
      {
        name: '@deepseek-ai/dsh-session',
        version: '0.1.2-rc.1',
        manifestPath: '/dsh-home/profiles/tui/node_modules/@deepseek-ai/dsh-session/package.json',
      },
    ], '/dsh-home/profiles/tui')).toThrow('resolves from the TUI profile')
  })

  it('allows workspace protocols only in the source checkout', () => {
    expect(validateTuiHostCompatibility({
      version: '0.1.8-rc.1',
      peerDependencies: {
        '@deepseek-ai/dsh-app-boot': 'workspace:*',
        '@earendil-works/pi-ai': '0.84.4',
      },
    }, [
      host('@deepseek-ai/dsh-app-boot', 'development'),
      host('@earendil-works/pi-ai', '0.84.2'),
    ], '/dsh-home/profiles/tui').dshVersion).toBe('development')
  })

  it('pins a transitive Host library to the official registry installation', () => {
    const registryManifest = {
      version: '0.1.8-rc.1',
      peerDependencies: {
        '@deepseek-ai/dsh-app-boot': '0.1.2-rc.1',
        '@earendil-works/pi-ai': '0.84.4',
      },
    }
    expect(validateTuiHostCompatibility(registryManifest, [
      host('@deepseek-ai/dsh-app-boot'),
      host('@earendil-works/pi-ai', '0.84.4'),
    ], '/dsh-home/profiles/tui').compatibility).toBe('compatible')
    expect(() => validateTuiHostCompatibility(registryManifest, [
      host('@deepseek-ai/dsh-app-boot'),
      host('@earendil-works/pi-ai', '0.84.2'),
    ], '/dsh-home/profiles/tui')).toThrow('expected exactly 0.84.4')
  })
})
