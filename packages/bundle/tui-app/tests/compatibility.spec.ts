/** Exact Host versions and installation ownership for the post-install bundle. */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TuiHostCompatibilityError,
  validateTuiHostCompatibility,
  type TuiHostPackageResolution,
} from '../src/compatibility.ts'

const manifest = {
  version: '0.1.14-rc.2',
  peerDependencies: {
    '@deepseek-ai/dsh-app-boot': '0.2.1-rc.2',
    '@deepseek-ai/dsh-session': '0.2.1-rc.2',
  },
}

function host(name: string, version = '0.2.1-rc.2'): TuiHostPackageResolution {
  return { name, version, manifestPath: join('/official/node_modules', name, 'package.json') }
}

describe('post-install TUI Host compatibility', () => {
  it('accepts only the official third-party pi-ai compatibility range', () => {
    const withPiAi = { ...manifest, peerDependencies: { ...manifest.peerDependencies, '@earendil-works/pi-ai': '^1.1.0' } }
    const peers = [host('@deepseek-ai/dsh-app-boot'), host('@deepseek-ai/dsh-session')]
    for (const version of ['1.1.0', '1.3.0']) {
      expect(() => validateTuiHostCompatibility(withPiAi, [...peers, host('@earendil-works/pi-ai', version)], '/profile')).not.toThrow()
    }
    for (const version of ['1.0.0', '2.0.0']) {
      expect(() => validateTuiHostCompatibility(withPiAi, [...peers, host('@earendil-works/pi-ai', version)], '/profile')).toThrow('compatible range ^1.1.0')
    }
  })

  it('accepts one exact installation-owned Host graph', () => {
    expect(validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot'),
      host('@deepseek-ai/dsh-session'),
    ], '/dsh-home/profiles/tui')).toMatchObject({
      compatibility: 'compatible',
      dshVersion: '0.2.1-rc.2',
      supportedDshVersion: '0.2.1-rc.2',
      tuiVersion: '0.1.14-rc.2',
      profile: 'tui',
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      agentPresetIds: ['standard', 'ptc', 'minimal', 'cordis'],
      recoveryCommand: 'dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.14-rc.2',
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
    ], '/dsh-home/profiles/tui')).toThrow('dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.14-rc.2')
  })

  it('rejects a Host peer materialized inside the active profile', () => {
    expect(() => validateTuiHostCompatibility(manifest, [
      host('@deepseek-ai/dsh-app-boot'),
      {
        name: '@deepseek-ai/dsh-session',
        version: '0.2.1-rc.2',
        manifestPath: '/dsh-home/profiles/tui/node_modules/@deepseek-ai/dsh-session/package.json',
      },
    ], '/dsh-home/profiles/tui')).toThrow('resolves from the TUI profile')
  })

  it('allows workspace protocols only in the source checkout', () => {
    expect(validateTuiHostCompatibility({
      version: '0.1.14-rc.2',
      peerDependencies: {
        '@deepseek-ai/dsh-app-boot': 'workspace:*',
        '@earendil-works/pi-ai': '^1.1.0',
      },
    }, [
      host('@deepseek-ai/dsh-app-boot', 'development'),
      host('@earendil-works/pi-ai', '0.85.1'),
    ], '/dsh-home/profiles/tui').dshVersion).toBe('development')
  })

  it('pins a transitive Host library to the official registry installation', () => {
    const registryManifest = {
      version: '0.1.14-rc.2',
      peerDependencies: {
        '@deepseek-ai/dsh-app-boot': '0.2.1-rc.2',
        '@earendil-works/pi-ai': '^1.1.0',
      },
    }
    expect(validateTuiHostCompatibility(registryManifest, [
      host('@deepseek-ai/dsh-app-boot'),
      host('@earendil-works/pi-ai', '1.3.0'),
    ], '/dsh-home/profiles/tui').compatibility).toBe('compatible')
    expect(() => validateTuiHostCompatibility(registryManifest, [
      host('@deepseek-ai/dsh-app-boot'),
      host('@earendil-works/pi-ai', '0.85.1'),
    ], '/dsh-home/profiles/tui')).toThrow('expected compatible range ^1.1.0')
  })
})
