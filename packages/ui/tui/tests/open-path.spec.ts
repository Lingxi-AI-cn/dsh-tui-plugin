import { describe, expect, it } from 'vitest'
import { canOpenExternalPath } from '../src/open-path.ts'

describe('Host path opener capability', () => {
  it('distinguishes local desktops, WSL, and headless Linux Hosts', () => {
    expect(canOpenExternalPath({ platform: 'darwin', env: {} })).toBe(true)
    expect(canOpenExternalPath({ platform: 'win32', env: {} })).toBe(true)
    expect(canOpenExternalPath({ platform: 'linux', env: { DISPLAY: ':0' } })).toBe(true)
    expect(canOpenExternalPath({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } })).toBe(true)
    expect(canOpenExternalPath({ platform: 'linux', env: { WSL_DISTRO_NAME: 'Ubuntu' } })).toBe(true)
    expect(canOpenExternalPath({ platform: 'linux', env: { SSH_CONNECTION: 'remote' } })).toBe(false)
    expect(canOpenExternalPath({ platform: 'aix', env: {} })).toBe(false)
  })
})
