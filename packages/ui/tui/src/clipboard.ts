/** Typed, bounded system clipboard reads for the native TUI composer. */

import { fileURLToPath } from 'node:url'
import type { ImageAttachmentRef, ImageMediaType, SubprocessHandle, SubprocessRuntime } from './host.ts'

const DEFAULT_TIMEOUT_MS = 750
const MAX_CLIPBOARD_BYTES = 16 * 1024 * 1024
const MAX_STDERR_BYTES = 4 * 1024
const PROCESS_GRACE_MS = 100

/** Host platform values accepted by the clipboard provider. */
export type TuiClipboardPlatform = 'darwin' | 'linux' | 'win32' | 'other'

/** Environment facts used to select a system clipboard backend. */
export interface TuiClipboardEnvironment {
  readonly platform: TuiClipboardPlatform
  readonly values: Readonly<Record<string, string | undefined>>
}

/** One typed image read from a system clipboard. */
export interface TuiClipboardImage {
  readonly kind: 'image'
  readonly data: Uint8Array
  readonly mediaType: ImageMediaType
  readonly name: string
}

/** One typed file-list read from a system clipboard. */
export interface TuiClipboardFiles {
  readonly kind: 'files'
  readonly paths: readonly string[]
}

/** System clipboard payload after media and byte validation. */
export type TuiClipboardPayload =
  | { readonly kind: 'text'; readonly text: string }
  | TuiClipboardImage
  | TuiClipboardFiles

/** Stable failure vocabulary for a clipboard read. */
export type TuiClipboardFailureReason =
  | 'unsupported'
  | 'unavailable'
  | 'timeout'
  | 'too-large'
  | 'invalid-media'

/** One bounded clipboard read outcome. */
export type TuiClipboardReadResult =
  | { readonly ok: true; readonly payload: TuiClipboardPayload; readonly method: string }
  | { readonly ok: false; readonly reason: TuiClipboardFailureReason; readonly message: string }

/** Composer-ready result after the TUI owner has persisted any image payload. */
export interface TuiClipboardInsert {
  readonly text: string
  readonly attachments: readonly ImageAttachmentRef[]
}

/** Fully typed input used by the provider; keeps subprocess policy out of the composer. */
export interface TuiClipboardReadOptions {
  readonly cwd: string
  readonly environment: TuiClipboardEnvironment
  readonly timeoutMs?: number
  readonly maxBytes?: number
  readonly signal?: AbortSignal
}

interface ClipboardCommand {
  readonly method: string
  readonly argv: readonly string[]
  readonly kind: 'text' | 'image' | 'files' | 'targets'
  readonly mediaType?: ImageMediaType
}

interface CommandOutput {
  readonly bytes: Uint8Array
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly timedOut: boolean
  readonly tooLarge: boolean
}

/** Read the system clipboard through the platform's typed command backend.
 * @param subprocess - argv-only subprocess capability used by the selected backend.
 * @param options - bounded environment, working-directory, and cancellation policy.
 * @returns a typed payload or an explicit unsupported/unavailable failure.
 */
export async function readTuiClipboard(
  subprocess: SubprocessRuntime,
  options: TuiClipboardReadOptions,
): Promise<TuiClipboardReadResult> {
  const backend = resolveBackend(options.environment)
  if (backend === undefined) {
    return { ok: false, reason: 'unsupported', message: clipboardUnavailableMessage(options.environment) }
  }
  const commands = backend(options.environment)
  if (commands.length === 0) {
    return { ok: false, reason: 'unsupported', message: clipboardUnavailableMessage(options.environment) }
  }

  const maxBytes = options.maxBytes ?? MAX_CLIPBOARD_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let lastFailure: TuiClipboardReadResult | undefined
  const pending = [...commands]
  while (pending.length > 0) {
    const command = pending.shift()
    if (command === undefined) break
    const output = await runClipboardCommand(subprocess, command, options.cwd, timeoutMs, maxBytes, options.signal)
    if (output.timedOut) {
      return { ok: false, reason: 'timeout', message: 'System clipboard read timed out.' }
    }
    if (output.tooLarge) {
      return { ok: false, reason: 'too-large', message: 'System clipboard content exceeds the TUI clipboard limit.' }
    }
    if (output.exitCode !== 0 || output.signal !== null) {
      lastFailure = { ok: false, reason: 'unavailable', message: `System clipboard command ${command.argv[0] ?? 'backend'} failed.` }
      continue
    }
    if (command.kind === 'targets') {
      pending.unshift(...commandsFromTargets(command, output.bytes))
      continue
    }
    const payload = decodeClipboardPayload(command, output.bytes)
    if (payload === undefined) continue
    if (payload.kind === 'image' && detectImageMediaType(payload.data) !== payload.mediaType) {
      return { ok: false, reason: 'invalid-media', message: 'System clipboard image bytes do not match their declared media type.' }
    }
    return { ok: true, payload, method: command.method }
  }
  return lastFailure ?? { ok: false, reason: 'unavailable', message: 'The system clipboard is empty or unavailable.' }
}

type BackendResolver = (environment: TuiClipboardEnvironment) => readonly ClipboardCommand[]

function resolveBackend(environment: TuiClipboardEnvironment): BackendResolver | undefined {
  if (environment.platform === 'win32' || environment.platform === 'other') return undefined
  if (environment.values.SSH_CONNECTION !== undefined
    || environment.values.SSH_TTY !== undefined
    || environment.values.SSH_CLIENT !== undefined) return undefined
  if (environment.platform === 'darwin') return macosCommands
  if (environment.values.WAYLAND_DISPLAY !== undefined) return waylandCommands
  if (environment.values.DISPLAY !== undefined) return x11Commands
  return undefined
}

function macosCommands(): readonly ClipboardCommand[] {
  return [
    { method: 'pbpaste:file-list', argv: ['pbpaste', '-Prefer', 'public.file-url'], kind: 'files' },
    { method: 'pbpaste:image/png', argv: ['pbpaste', '-Prefer', 'public.png'], kind: 'image', mediaType: 'image/png' },
    { method: 'pbpaste:image/jpeg', argv: ['pbpaste', '-Prefer', 'public.jpeg'], kind: 'image', mediaType: 'image/jpeg' },
    { method: 'pbpaste:text', argv: ['pbpaste', '-Prefer', 'txt'], kind: 'text' },
  ]
}

function waylandCommands(): readonly ClipboardCommand[] {
  return [
    { method: 'wl-paste:targets', argv: ['wl-paste', '--list-types'], kind: 'targets' },
  ]
}

function x11Commands(): readonly ClipboardCommand[] {
  return [
    { method: 'xclip:targets', argv: ['xclip', '-selection', 'clipboard', '-target', 'TARGETS', '-out'], kind: 'targets' },
    { method: 'xclip:text', argv: ['xclip', '-selection', 'clipboard', '-out'], kind: 'text' },
    { method: 'xsel:text', argv: ['xsel', '--clipboard', '--output'], kind: 'text' },
  ]
}

function decodeClipboardPayload(command: ClipboardCommand, bytes: Uint8Array): TuiClipboardPayload | undefined {
  if (bytes.byteLength === 0) return undefined
  if (command.kind === 'text' || command.kind === 'files') {
    const text = new TextDecoder().decode(bytes)
    if (command.kind === 'files') {
      const paths = parseClipboardFileList(text)
      return paths.length === 0 ? undefined : { kind: 'files', paths }
    }
    return { kind: 'text', text }
  }
  const mediaType = command.mediaType
  if (mediaType === undefined) return undefined
  return { kind: 'image', data: bytes, mediaType, name: `clipboard.${imageExtension(mediaType)}` }
}

function commandsFromTargets(command: ClipboardCommand, bytes: Uint8Array): readonly ClipboardCommand[] {
  const targets = new Set(new TextDecoder().decode(bytes).split(/\r?\n/gu).map(value => value.trim().toLowerCase()).filter(Boolean))
  const uriType = [...targets].find(value => value === 'text/uri-list' || value === 'public.file-url')
  const commands: ClipboardCommand[] = []
  if (uriType !== undefined) {
    commands.push(command.argv[0] === 'wl-paste'
      ? { method: 'wl-paste:file-list', argv: ['wl-paste', '--no-newline', '--type', uriType], kind: 'files' }
      : { method: 'xclip:file-list', argv: ['xclip', '-selection', 'clipboard', '-target', uriType, '-out'], kind: 'files' })
  }
  const imageType = [...targets].find(value => value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif')
  if (imageType !== undefined) {
    const mediaType = imageType
    commands.push(command.argv[0] === 'wl-paste'
      ? { method: `wl-paste:${mediaType}`, argv: ['wl-paste', '--no-newline', '--type', mediaType], kind: 'image', mediaType }
      : { method: `xclip:${mediaType}`, argv: ['xclip', '-selection', 'clipboard', '-target', mediaType, '-out'], kind: 'image', mediaType })
  }
  const textCommand: ClipboardCommand = command.argv[0] === 'wl-paste'
    ? { method: 'wl-paste:text', argv: ['wl-paste', '--no-newline'], kind: 'text' }
    : { method: 'xclip:text', argv: ['xclip', '-selection', 'clipboard', '-out'], kind: 'text' }
  commands.push(textCommand)
  return commands
}

function parseClipboardFileList(value: string): readonly string[] {
  const paths: string[] = []
  for (const line of value.split(/\r?\n/gu)) {
    const item = line.trim()
    if (item === '' || item.startsWith('#')) continue
    try {
      const url = new URL(item)
      if (url.protocol === 'file:') paths.push(fileURLToPath(url))
    } catch {
      if (item.startsWith('/')) paths.push(item)
    }
  }
  return Object.freeze(paths)
}

async function runClipboardCommand(
  subprocess: SubprocessRuntime,
  command: ClipboardCommand,
  cwd: string,
  timeoutMs: number,
  maxBytes: number,
  parentSignal: AbortSignal | undefined,
): Promise<CommandOutput> {
  const controller = new AbortController()
  const abort = (): void => {
    controller.abort(parentSignal?.reason ?? new Error('clipboard read aborted'))
  }
  if (parentSignal?.aborted === true) abort()
  else parentSignal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('clipboard read timed out'))
  }, timeoutMs)
  let handle: SubprocessHandle | undefined
  try {
    const executable = await subprocess.resolveExecutable(command.argv[0] ?? '', undefined, controller.signal)
    handle = subprocess.spawn({
      argv: [executable, ...command.argv.slice(1)],
      cwd,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: MAX_STDERR_BYTES } },
      graceMs: PROCESS_GRACE_MS,
      signal: controller.signal,
    })
    const chunks: Uint8Array[] = []
    let size = 0
    let tooLarge = false
    if (handle.stdout !== undefined) {
      for await (const chunk of handle.stdout) {
        const bytes = clipboardChunkBytes(chunk as unknown)
        size += bytes.byteLength
        if (size > maxBytes) {
          tooLarge = true
          handle.terminate()
          break
        }
        chunks.push(bytes)
      }
    }
    const outcome = await handle.done.catch(() => ({ exitCode: null, signal: null } as const))
    return { bytes: concatBytes(chunks, size), exitCode: outcome.exitCode, signal: outcome.signal, timedOut, tooLarge }
  } catch {
    return { bytes: new Uint8Array(), exitCode: null, signal: null, timedOut, tooLarge: false }
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', abort)
    if (handle !== undefined && controller.signal.aborted) handle.terminate()
  }
}

function clipboardChunkBytes(value: unknown): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof Uint8Array) return value.slice()
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
  }
  return new Uint8Array()
}

function concatBytes(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

/** Detect the accepted raster type from bytes, independently of clipboard claims.
 * @param data - encoded image bytes to inspect.
 * @returns the detected image media type, or undefined for non-raster bytes.
 */
export function detectImageMediaType(data: Uint8Array): ImageMediaType | undefined {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6 && ((data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38
    && (data[4] === 0x37 || data[4] === 0x39) && data[5] === 0x61))) return 'image/gif'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
    && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  return undefined
}

function imageExtension(mediaType: ImageMediaType): string {
  switch (mediaType) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
  }
}

function clipboardUnavailableMessage(environment: TuiClipboardEnvironment): string {
  if (environment.values.SSH_CONNECTION !== undefined || environment.values.SSH_TTY !== undefined) {
    return 'System clipboard is unavailable over SSH; use terminal paste or @ path completion.'
  }
  if (environment.platform === 'win32') return 'System clipboard integration is not available on Windows yet; use terminal paste or @ path completion.'
  return 'System clipboard integration is unavailable; use terminal paste or @ path completion.'
}
