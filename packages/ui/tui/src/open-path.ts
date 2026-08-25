/** Cross-platform host path hand-off without invoking a shell. */

import { runNativeCommand } from './host.ts'

/** Injectable Host facts used to explain native-open availability. */
export interface TuiPathOpenerInternals {
  readonly platform?: NodeJS.Platform
  readonly env?: NodeJS.ProcessEnv
}

function present(value: string | undefined): boolean {
  return value !== undefined && value !== ''
}

function isWsl(env: NodeJS.ProcessEnv): boolean {
  return present(env['WSL_DISTRO_NAME']) || present(env['WSL_INTEROP'])
}

/** Whether this Host can plausibly hand a path to a visible desktop application. */
export function canOpenExternalPath(internals: TuiPathOpenerInternals = {}): boolean {
  const platform = internals.platform ?? process.platform
  if (platform === 'darwin' || platform === 'win32') return true
  if (platform !== 'linux') return false
  const env = internals.env ?? process.env
  return isWsl(env) || present(env['DISPLAY']) || present(env['WAYLAND_DISPLAY'])
}

/**
 * Open one absolute filesystem path with the Host operating system.
 * @param path - validated absolute Host path.
 * @param signal - operation lifetime.
 * @returns fulfillment after the native launcher accepts the path.
 */
export async function openExternalPath(path: string, signal: AbortSignal): Promise<void> {
  if (path.trim() === '' || path.includes('\0')) throw new TypeError('TUI refuses to open an empty or NUL path')
  if (process.platform === 'darwin') {
    await runNativeCommand('open', [path], signal)
  } else if (process.platform === 'win32') {
    await runNativeCommand('explorer.exe', [path], signal)
  } else {
    if (isWsl(process.env)) {
      const translated = await runNativeCommand('wslpath', ['-w', path], signal)
      signal.throwIfAborted()
      const windowsPath = translated.stdout.replace(/[\r\n]+$/u, '')
      if (windowsPath === '') throw new Error('wslpath returned no Windows path')
      await runNativeCommand('explorer.exe', [windowsPath], signal)
      return
    }
    await runNativeCommand('xdg-open', [path], signal)
  }
}
