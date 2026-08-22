/** Bounded, shell-free handoff of one composer draft to the user's editor. */

import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scrubbedParentEnv } from './host.ts'

const MAX_EDITOR_FILE_BYTES = 1_000_000
const EDITOR_TEMP_PREFIX = 'dsh-tui-editor-'

/** Result returned to the composer after one editor attempt. */
export type TuiExternalEditorResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly message: string }

/** Minimal child-process surface used by the editor handoff and its tests. */
export interface TuiExternalEditorChild {
  once(event: 'error', listener: (error: Error) => void): unknown
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  off(event: 'error', listener: (error: Error) => void): unknown
  off(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

/** Injectable process launcher for POSIX stub-editor tests. */
export const externalEditorInternals: {
  spawn: (argv: readonly string[], cwd: string, env: Readonly<Record<string, string>>) => TuiExternalEditorChild
} = {
  spawn: (argv, cwd, env) => {
    const program = argv[0]
    if (program === undefined) throw new Error('Editor command must name an executable')
    return spawn(program, argv.slice(1), {
      cwd,
      env,
      shell: false,
      stdio: 'inherit',
      windowsHide: false,
    })
  },
}

/**
 * Resolve an editor command without invoking a shell.
 * @param environment - environment containing VISUAL and EDITOR.
 * @param platform - target platform used for the explicit fallback.
 * @returns parsed executable and arguments.
 */
export function resolveTuiEditorArgv(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
  platform: NodeJS.Platform = process.platform,
): readonly string[] {
  const configured = [environment.VISUAL, environment.EDITOR]
    .find(value => value !== undefined && value.trim() !== '')
  if (configured !== undefined) return parseTuiEditorCommand(configured)
  if (platform === 'win32') return ['notepad.exe']
  if (platform === 'darwin') return ['open', '-W', '-t']
  return ['vi']
}

/**
 * Parse one VISUAL/EDITOR value with shell-like quoting but no expansion.
 * @param command - configured executable plus optional arguments.
 * @returns immutable argv with quotes and escapes removed.
 */
export function parseTuiEditorCommand(command: string): readonly string[] {
  const argv: string[] = []
  let value = ''
  let quote: 'single' | 'double' | undefined
  let tokenStarted = false
  let escaping = false
  for (const character of command) {
    if (escaping) {
      value += character
      tokenStarted = true
      escaping = false
      continue
    }
    if (quote === 'single') {
      if (character === "'") quote = undefined
      else value += character
      tokenStarted = true
      continue
    }
    if (quote === 'double') {
      if (character === '"') quote = undefined
      else if (character === '\\') escaping = true
      else value += character
      tokenStarted = true
      continue
    }
    if (character === '\\') {
      escaping = true
      tokenStarted = true
    } else if (character === "'") {
      quote = 'single'
      tokenStarted = true
    } else if (character === '"') {
      quote = 'double'
      tokenStarted = true
    } else if (/\s/u.test(character)) {
      if (tokenStarted) {
        argv.push(value)
        value = ''
        tokenStarted = false
      }
    } else {
      value += character
      tokenStarted = true
    }
  }
  if (escaping) throw new Error('Editor command ends with an escape')
  if (quote !== undefined) throw new Error('Editor command has an unterminated quote')
  if (tokenStarted) argv.push(value)
  if (argv[0] === undefined || argv[0] === '') throw new Error('Editor command must name an executable')
  if (argv.some(argument => argument.includes('\u0000'))) throw new Error('Editor command contains a NUL byte')
  return Object.freeze(argv)
}

/**
 * Run one editor against a private draft file and return only a successful, valid replacement.
 * @param options - draft, Session workspace, optional environment/platform, and cancellation signal.
 * @returns replacement text or a bounded diagnostic.
 */
export async function runTuiExternalEditor(options: {
  readonly draft: string
  readonly cwd: string
  readonly environment?: Readonly<NodeJS.ProcessEnv>
  readonly platform?: NodeJS.Platform
  readonly signal?: AbortSignal
}): Promise<TuiExternalEditorResult> {
  const environment = options.environment ?? process.env
  const argv = resolveTuiEditorArgv(environment, options.platform ?? process.platform)
  if (options.signal?.aborted === true) return { ok: false, message: 'External editor cancelled.' }

  let directory: string | undefined
  let result: TuiExternalEditorResult = { ok: false, message: 'External editor failed; draft preserved.' }
  try {
    directory = await mkdtemp(join(tmpdir(), EDITOR_TEMP_PREFIX))
    await chmod(directory, 0o700)
    const file = join(directory, 'draft.txt')
    await writeFile(file, options.draft, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await chmod(file, 0o600)
    const child = externalEditorInternals.spawn(
      [...argv, file],
      options.cwd,
      scrubbedParentEnv(),
    )
    const exit = await waitForEditor(child, options.signal)
    if (exit.cancelled) result = { ok: false, message: 'External editor cancelled; draft preserved.' }
    else if (exit.error !== undefined) result = { ok: false, message: `External editor failed to start: ${exit.error}` }
    else if (exit.code !== 0 || exit.signal !== null) {
      const status = exit.signal === null ? `exit code ${String(exit.code)}` : `signal ${exit.signal}`
      result = { ok: false, message: `External editor returned ${status}; draft preserved.` }
    } else {
      const bytes = await readFile(file)
      if (bytes.byteLength > MAX_EDITOR_FILE_BYTES) {
        result = { ok: false, message: 'External editor output exceeded the 1 MB limit; draft preserved.' }
      } else {
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          result = { ok: true, text: text.replace(/\r\n?/gu, '\n') }
        } catch {
          result = { ok: false, message: 'External editor output was not valid UTF-8; draft preserved.' }
        }
      }
    }
  } catch (error: unknown) {
    result = {
      ok: false,
      message: `External editor failed: ${error instanceof Error ? error.message : String(error)}; draft preserved.`,
    }
  }
  if (directory !== undefined) {
    try {
      await rm(directory, { recursive: true, force: true, maxRetries: 1, retryDelay: 10 })
    } catch {
      return { ok: false, message: 'External editor cleanup failed; draft preserved.' }
    }
  }
  return result
}

interface EditorExit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly error?: string
  readonly cancelled: boolean
}

function waitForEditor(child: TuiExternalEditorChild, signal?: AbortSignal): Promise<EditorExit> {
  return new Promise((resolve) => {
    let settled = false
    let cancelled = signal?.aborted === true
    const finish = (exit: EditorExit): void => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      child.off('error', onError)
      child.off('close', onClose)
      resolve(exit)
    }
    const onError = (error: Error): void => {
      finish({ code: null, signal: null, error: error.message, cancelled })
    }
    const onClose = (code: number | null, childSignal: NodeJS.Signals | null): void => {
      finish({ code, signal: childSignal, cancelled })
    }
    const onAbort = (): void => {
      cancelled = true
      try { child.kill('SIGTERM') } catch { /* The child may have exited between abort and signalling. */ }
    }
    child.once('error', onError)
    child.once('close', onClose)
    if (signal?.aborted === true) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}
