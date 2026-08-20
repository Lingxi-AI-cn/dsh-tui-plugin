/** Cross-platform default-browser hand-off without invoking a shell. */

import { runNativeCommand } from './host.ts'

/**
 * Open one HTTP(S) URL with the operating system's default browser.
 * @param value - provider-issued authentication URL.
 * @param signal - authentication lifetime.
 * @returns fulfillment after the native launcher accepts the URL.
 */
export async function openExternalUrl(value: string, signal: AbortSignal): Promise<void> {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`TUI refuses to open non-HTTP authentication URL protocol ${JSON.stringify(url.protocol)}`)
  }
  if (process.platform === 'darwin') {
    await runNativeCommand('open', [url.toString()], signal)
  } else if (process.platform === 'win32') {
    await runNativeCommand('rundll32', ['url.dll,FileProtocolHandler', url.toString()], signal)
  } else {
    await runNativeCommand('xdg-open', [url.toString()], signal)
  }
}
