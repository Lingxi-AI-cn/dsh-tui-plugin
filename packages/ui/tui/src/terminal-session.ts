/** Exclusive owner of terminal capability probing, alternate-screen mutation, and restoration. */

import { TuiTerminalInputDecoder, type TuiTerminalInputEvent } from './terminal-input.ts'

const ENTER_ALT_SCREEN = '\u001B[?1049h\u001B[2J\u001B[H'
const EXIT_ALT_SCREEN = '\u001B[?1049l'
const SHOW_CURSOR = '\u001B[?25h'
const HIDE_CURSOR = '\u001B[?25l'
const ENABLE_MOUSE = '\u001B[?1000h\u001B[?1006h'
const ENABLE_SELECTION_MOUSE = '\u001B[?1002h'
const DISABLE_SELECTION_MOUSE = '\u001B[?1002l'
const DISABLE_MOUSE = '\u001B[?1000l\u001B[?1002l\u001B[?1003l\u001B[?1006l'
const ENABLE_ALTERNATE_SCROLL = '\u001B[?1007h'
const DISABLE_ALTERNATE_SCROLL = '\u001B[?1007l'
const ENABLE_FOCUS = '\u001B[?1004h'
const DISABLE_FOCUS = '\u001B[?1004l'
const ENABLE_BRACKETED_PASTE = '\u001B[?2004h'
const DISABLE_BRACKETED_PASTE = '\u001B[?2004l'
const ENABLE_KITTY_KEYBOARD = '\u001B[>1u'
const DISABLE_KITTY_KEYBOARD = '\u001B[<u'
const CAPABILITY_QUERY = '\u001B[c\u001B[?u\u001B]10;?\u0007\u001B]11;?\u0007'
const DEFAULT_NEGOTIATION_TIMEOUT_MS = 75
const MAX_OSC52_BYTES = 100_000

/** Process-stream capability set borrowed by one terminal transaction. */
export interface TuiStreams {
  /** Interactive key input. */
  stdin: NodeJS.ReadStream
  /** Full-screen renderer output. */
  stdout: NodeJS.WriteStream
  /** Startup and fatal error output. */
  stderr: NodeJS.WriteStream
}

/** One-based terminal cell where IME preedit text must begin. */
export interface InputCursorTarget {
  /** One-based terminal row. */
  row: number
  /** One-based terminal column. */
  column: number
}

/** Idempotent release/reacquire handle for a child process that owns the TTY temporarily. */
export interface TuiTerminalHandoff {
  /** Re-enter the prior terminal transaction after the child exits. */
  resume(): void
  /** Prevent a later resume when application shutdown owns the terminal teardown. */
  cancel(): void
}

/** Terminal color precision used by semantic renderers. */
export type TuiTerminalColorDepth = 'none' | 'ansi16' | 'ansi256' | 'truecolor'

/** Terminal background classification derived from a validated OSC 11 reply. */
export type TuiTerminalBackground = 'light' | 'dark' | 'unknown'

/** Keyboard protocol that the terminal agreed to receive. */
export type TuiTerminalKeyboardProtocol = 'legacy' | 'kitty'

/** Capabilities observed or conservatively inferred for one terminal session. */
export interface TuiTerminalCapabilities {
  /** Color precision reported by the output stream or `NO_COLOR`. */
  readonly colorDepth: TuiTerminalColorDepth
  /** Normalized background class; unknown when OSC 11 is absent or malformed. */
  readonly background: TuiTerminalBackground
  /** Enhanced keyboard protocol enabled for this transaction. */
  readonly keyboardProtocol: TuiTerminalKeyboardProtocol
  /** Whether SGR mouse reports may be enabled. */
  readonly mouse: 'none' | 'sgr'
  /** Whether focus-in/out reports may be enabled. */
  readonly focus: boolean
  /** Whether bracketed paste may be enabled. */
  readonly bracketedPaste: boolean
  /** Whether OSC terminal strings were accepted during probing. */
  readonly osc: boolean
  /** Whether synchronized output was explicitly confirmed. */
  readonly synchronizedOutput: boolean
  /** Whether the process is inside a verified tmux or SSH environment. */
  readonly outer: Readonly<{ tmux: boolean; ssh: boolean }>
}

/** Options for the bounded terminal capability probe. */
export interface TuiTerminalNegotiationOptions {
  /** Probe deadline in milliseconds; defaults to a short non-blocking window. */
  readonly timeoutMs?: number
  /** Cancellation signal for startup or teardown. */
  readonly signal?: AbortSignal
  /** Environment used only to identify outer transport context. */
  readonly environment?: NodeJS.ProcessEnv
}

/** Result of one bounded terminal clipboard write. */
export type TuiClipboardResult =
  | { readonly ok: true; readonly method: 'osc52' | 'tmux-buffer' }
  | { readonly ok: false; readonly reason: 'inactive' | 'unsupported' | 'too-large' | 'write-failed'; readonly message: string }

/** Capabilities used by the compatibility `enter()` call in isolated tests. */
export const DEFAULT_TUI_TERMINAL_CAPABILITIES: TuiTerminalCapabilities = Object.freeze({
  colorDepth: 'ansi16',
  background: 'unknown',
  keyboardProtocol: 'legacy',
  mouse: 'sgr',
  focus: false,
  bracketedPaste: true,
  osc: false,
  synchronizedOutput: false,
  outer: Object.freeze({ tmux: false, ssh: false }),
})

/** Full-screen transaction. Ink owns raw mode; this owner restores outer terminal modes. */
export class TerminalSession {
  private active = false
  private rawModeHeld = false
  private selectionMouseMode = false
  private cursorTarget: InputCursorTarget | undefined
  private activeModes: { mouse: boolean; focus: boolean; paste: boolean; kitty: boolean } = {
    mouse: false, focus: false, paste: false, kitty: false,
  }
  private negotiation: Promise<TuiTerminalCapabilities> | undefined
  private cancelNegotiation: (() => void) | undefined
  private capabilitiesSnapshot: TuiTerminalCapabilities | undefined
  private bufferedInput: TuiTerminalInputEvent[] = []
  /** Ink-facing output that restores the real terminal cursor after each full-screen render. */
  readonly rendererOutput: NodeJS.WriteStream

  constructor(readonly streams: TuiStreams) {
    this.rendererOutput = this.createRendererOutput()
  }

  /**
   * Move the real terminal cursor to the active input insertion cell after rendering.
   * @param target - one-based cell, or `undefined` while no text editor owns input.
   */
  setInputCursor(target: InputCursorTarget | undefined): void {
    if (target !== undefined && (!Number.isSafeInteger(target.row) || target.row < 1
      || !Number.isSafeInteger(target.column) || target.column < 1)) {
      throw new TypeError('TUI input cursor target must contain positive integer cells')
    }
    this.cursorTarget = target === undefined ? undefined : { ...target }
  }

  /**
   * Validate the terminal before emitting any control sequence.
   * @throws when stdin or stdout is not an interactive TTY.
   */
  assertInteractive(): void {
    if (!this.streams.stdin.isTTY || !this.streams.stdout.isTTY) {
      throw new Error('TUI requires interactive stdin and stdout TTYs; use dsh --profile headless for automation')
    }
  }

  /**
   * Probe terminal capabilities without blocking startup beyond a short deadline.
   * @param options - timeout, cancellation, and outer transport context.
   * @returns the disposable capability snapshot for this terminal transaction.
   */
  negotiate(options: TuiTerminalNegotiationOptions = {}): Promise<TuiTerminalCapabilities> {
    if (this.active) {
      return Promise.resolve(this.capabilitiesSnapshot ?? this.capabilitiesForEntry(options.environment))
    }
    this.negotiation ??= this.performNegotiation(options).then((capabilities) => {
      this.capabilitiesSnapshot = capabilities
      return capabilities
    }).finally(() => { this.negotiation = undefined })
    return this.negotiation
  }

  /**
   * Take ordinary input that arrived while terminal replies were being probed.
   * @returns input events in the original byte-stream order.
   */
  takeBufferedInput(): readonly TuiTerminalInputEvent[] {
    const events = Object.freeze(this.bufferedInput.splice(0))
    return events
  }

  /**
   * Copy bounded text through the negotiated OSC 52 path.
   * tmux receives the same sequence as buffer integration and decides whether
   * its configured `set-clipboard` policy also forwards it to the outer terminal.
   * @param text - complete text selected by a non-secret TUI surface.
   * @returns the observed local write outcome; terminals do not acknowledge clipboard mutation.
   */
  copyToClipboard(text: string): TuiClipboardResult {
    if (!this.active) {
      return { ok: false, reason: 'inactive', message: 'Clipboard is unavailable outside an active TUI session.' }
    }
    const capabilities = this.capabilitiesSnapshot
    if (capabilities?.osc !== true) {
      return { ok: false, reason: 'unsupported', message: 'This terminal did not confirm OSC clipboard support.' }
    }
    const bytes = Buffer.byteLength(text)
    if (bytes > MAX_OSC52_BYTES) {
      return { ok: false, reason: 'too-large', message: 'Selected text exceeds the terminal clipboard limit.' }
    }
    try {
      this.streams.stdout.write(`\u001B]52;c;${Buffer.from(text).toString('base64')}\u0007`)
    } catch {
      return { ok: false, reason: 'write-failed', message: 'The terminal clipboard write failed.' }
    }
    return { ok: true, method: capabilities.outer.tmux ? 'tmux-buffer' : 'osc52' }
  }

  /**
   * Enable or disable button-motion reports for a process-local text-selection owner.
   * All-motion hover (`1003`) is never enabled. Unsupported or inactive sessions
   * return `false` without writing a terminal mode sequence.
   * @param enabled - whether selection drag motion should be reported.
   * @returns whether the requested state is active in this transaction.
   */
  setSelectionMouseMode(enabled: boolean): boolean {
    if (!this.active || !this.activeModes.mouse || this.capabilitiesSnapshot?.mouse !== 'sgr') return false
    if (this.selectionMouseMode === enabled) return true
    try {
      this.streams.stdout.write(enabled ? ENABLE_SELECTION_MOUSE : DISABLE_SELECTION_MOUSE)
    } catch {
      return false
    }
    this.selectionMouseMode = enabled
    return true
  }

  /**
   * Transfer pointer ownership between the TUI and the outer terminal.
   * Disabling clears click, button-motion, all-motion, and SGR reporting;
   * enabling restores click plus SGR coordinates only after capability confirmation.
   * @param enabled - whether the TUI should receive negotiated mouse reports.
   * @returns whether the requested mode is active in this transaction.
   */
  setMouseMode(enabled: boolean): boolean {
    if (!this.active || this.capabilitiesSnapshot?.mouse !== 'sgr') return false
    if (this.activeModes.mouse === enabled) return true
    try {
      this.streams.stdout.write(enabled
        ? DISABLE_ALTERNATE_SCROLL + ENABLE_MOUSE
        : DISABLE_MOUSE + ENABLE_ALTERNATE_SCROLL)
    } catch {
      return false
    }
    this.activeModes.mouse = enabled
    if (!enabled) this.selectionMouseMode = false
    return true
  }

  /**
   * Enter the alternate screen exactly once after TTY validation.
   * @param capabilities - negotiated capabilities controlling enabled terminal modes.
   */
  enter(capabilities: TuiTerminalCapabilities = DEFAULT_TUI_TERMINAL_CAPABILITIES): void {
    this.assertInteractive()
    if (this.active) return
    this.active = true
    this.selectionMouseMode = false
    this.capabilitiesSnapshot = capabilities
    this.activeModes = {
      mouse: capabilities.mouse === 'sgr',
      focus: capabilities.focus,
      paste: capabilities.bracketedPaste,
      kitty: capabilities.keyboardProtocol === 'kitty',
    }
    this.streams.stdout.write(ENTER_ALT_SCREEN
      + (this.activeModes.mouse ? DISABLE_ALTERNATE_SCROLL + ENABLE_MOUSE : '')
      + (this.activeModes.focus ? ENABLE_FOCUS : '')
      + (this.activeModes.paste ? ENABLE_BRACKETED_PASTE : '')
      + (this.activeModes.kitty ? ENABLE_KITTY_KEYBOARD : ''))
  }

  /**
   * Release the current terminal transaction for an external interactive child.
   * @returns an idempotent handle that either reacquires the same capabilities or cancels reacquisition.
   */
  handoff(): TuiTerminalHandoff {
    const wasActive = this.active
    const capabilities = this.capabilitiesSnapshot ?? DEFAULT_TUI_TERMINAL_CAPABILITIES
    const wasMouseMode = this.activeModes.mouse
    const wasSelectionMouseMode = this.selectionMouseMode
    this.restore()
    let state: 'suspended' | 'resumed' | 'cancelled' = 'suspended'
    return {
      resume: (): void => {
        if (state !== 'suspended') return
        state = 'resumed'
        if (wasActive) {
          this.enter(capabilities)
          if (!wasMouseMode) this.setMouseMode(false)
          if (wasSelectionMouseMode) this.setSelectionMouseMode(true)
        }
      },
      cancel: (): void => {
        if (state === 'suspended') state = 'cancelled'
      },
    }
  }

  /** Restore every terminal mode this application may have enabled, idempotently. */
  restore(): void {
    if (!this.active && !this.rawModeHeld && this.cancelNegotiation === undefined) return
    this.cancelNegotiation?.()
    this.cancelNegotiation = undefined
    const wasActive = this.active
    this.active = false
    this.cursorTarget = undefined
    this.selectionMouseMode = false
    const modes = this.activeModes
    this.activeModes = { mouse: false, focus: false, paste: false, kitty: false }
    try {
      if ((this.rawModeHeld || this.streams.stdin.isRaw) && typeof this.streams.stdin.setRawMode === 'function') {
        this.streams.stdin.setRawMode(false)
      }
      this.rawModeHeld = false
    } catch {
      // The terminal may already be detached. Best-effort control restoration follows.
    }
    try {
      if (wasActive || modes.mouse || modes.focus || modes.paste || modes.kitty) {
        this.streams.stdout.write((modes.kitty ? DISABLE_KITTY_KEYBOARD : '')
          + (modes.focus ? DISABLE_FOCUS : '')
          + (modes.mouse ? DISABLE_MOUSE + ENABLE_ALTERNATE_SCROLL : '')
          + (modes.paste ? DISABLE_BRACKETED_PASTE : '')
          + SHOW_CURSOR + (wasActive ? EXIT_ALT_SCREEN : ''))
      }
    } catch {
      // A closed output stream cannot be restored further.
    }
  }

  private capabilitiesForEntry(environment = process.env): TuiTerminalCapabilities {
    return createInitialCapabilities(this.streams.stdout, environment)
  }

  private async performNegotiation(options: TuiTerminalNegotiationOptions): Promise<TuiTerminalCapabilities> {
    this.assertInteractive()
    const timeoutMs = options.timeoutMs ?? DEFAULT_NEGOTIATION_TIMEOUT_MS
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000) {
      throw new TypeError('TUI terminal capability timeout must be an integer from 1 to 1000 ms')
    }
    let capabilities = createInitialCapabilities(this.streams.stdout, options.environment ?? process.env)
    const decoder = new TuiTerminalInputDecoder()
    const input = this.streams.stdin as NodeJS.ReadStream & {
      on(event: 'data', listener: (chunk: string | Buffer) => void): unknown
      off(event: 'data', listener: (chunk: string | Buffer) => void): unknown
    }
    const onData = (chunk: string | Buffer): void => {
      for (const event of decoder.push(chunk)) {
        if (event.kind === 'reply') capabilities = applyTuiTerminalReply(capabilities, event.sequence)
        else this.bufferedInput.push(event)
      }
    }
    const removeListener = (): void => {
      input.off('data', onData)
    }
    const setRawMode = (value: boolean): void => {
      if (typeof this.streams.stdin.setRawMode !== 'function') return
      try {
        this.streams.stdin.setRawMode(value)
        this.rawModeHeld = value
      } catch {
        // A terminal without raw mode still gets the conservative snapshot.
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      setRawMode(true)
      input.on('data', onData)
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = (): void => {
          if (settled) return
          settled = true
          if (timer !== undefined) clearTimeout(timer)
          if (abort !== undefined) options.signal?.removeEventListener('abort', abort)
          resolve()
        }
        timer = setTimeout(finish, timeoutMs)
        abort = finish
        this.cancelNegotiation = finish
        if (options.signal?.aborted === true) finish()
        else options.signal?.addEventListener('abort', finish, { once: true })
        try { this.streams.stdout.write(CAPABILITY_QUERY) } catch { finish() }
      })
      for (const event of decoder.flush()) {
        if (event.kind === 'reply') capabilities = applyTuiTerminalReply(capabilities, event.sequence)
        else this.bufferedInput.push(event)
      }
    } finally {
      this.cancelNegotiation = undefined
      removeListener()
      decoder.reset()
      setRawMode(false)
    }
    return Object.freeze({ ...capabilities, outer: Object.freeze({ ...capabilities.outer }) })
  }

  private cursorSequence(): string {
    const target = this.cursorTarget
    if (target === undefined) return HIDE_CURSOR
    const rows = this.streams.stdout.rows || target.row
    const columns = this.streams.stdout.columns || target.column
    const row = Math.min(target.row, rows)
    const column = Math.min(target.column, columns)
    return `\u001B[${row};${column}H${SHOW_CURSOR}`
  }

  private createRendererOutput(): NodeJS.WriteStream {
    const output = this.streams.stdout
    const writeMethod = Reflect.get(output, 'write', output) as unknown
    if (typeof writeMethod !== 'function') throw new TypeError('TUI stdout has no write method')
    const write = (...args: unknown[]): boolean => {
      const chunk = args[0]
      const text = typeof chunk === 'string'
        ? chunk
        : chunk instanceof Uint8Array
          ? Buffer.from(chunk).toString()
          : ''
      if (text === HIDE_CURSOR && this.cursorTarget !== undefined) {
        return output.write(this.cursorSequence())
      }
      const result = Reflect.apply(writeMethod, output, args) as unknown
      if (text.includes('\n')) output.write(this.cursorSequence())
      return result !== false
    }
    return new Proxy(output, {
      get: (target, property) => {
        if (property === 'write') return write
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function'
          ? (...methodArgs: unknown[]): unknown => Reflect.apply(value, target, methodArgs) as unknown
          : value
      },
    })
  }
}

function createInitialCapabilities(stdout: NodeJS.WriteStream, environment: NodeJS.ProcessEnv): TuiTerminalCapabilities {
  const tmux = environment.TMUX !== undefined && environment.TMUX_PANE !== undefined
  const ssh = environment.SSH_CONNECTION !== undefined || environment.SSH_TTY !== undefined
  return Object.freeze({
    colorDepth: resolveColorDepth(stdout, environment),
    background: 'unknown' as const,
    keyboardProtocol: 'legacy' as const,
    mouse: 'none' as const,
    focus: false,
    bracketedPaste: false,
    osc: false,
    synchronizedOutput: false,
    outer: Object.freeze({ tmux, ssh }),
  })
}

/**
 * Fold one decoder reply into a capability snapshot.
 * @param current - current session snapshot.
 * @param sequence - complete terminal reply consumed by the decoder.
 * @returns a new immutable snapshot.
 */
export function applyTuiTerminalReply(
  current: TuiTerminalCapabilities,
  sequence: string,
): TuiTerminalCapabilities {
  const identified = /^\u001B\[(?:\?|>)[^\s]*c$/u.test(sequence)
  const kitty = /^\u001B\[\?\d+u$/u.test(sequence)
  const osc = sequence.startsWith('\u001B]10;') || sequence.startsWith('\u001B]11;')
  const background = terminalBackgroundFromOsc11(sequence)
  return Object.freeze({
    ...current,
    ...(identified ? { mouse: 'sgr' as const, focus: true, bracketedPaste: true } : {}),
    ...(kitty ? { keyboardProtocol: 'kitty' as const } : {}),
    ...(osc ? { osc: true } : {}),
    ...(background === 'unknown' ? {} : { background }),
    outer: Object.freeze({ ...current.outer }),
  })
}

function terminalBackgroundFromOsc11(sequence: string): TuiTerminalBackground {
  const reply = /^\u001B\]11;([^\u0007\u001B]*)(?:\u0007|\u001B\\)$/u.exec(sequence)
  if (reply === null) return 'unknown'
  const color = parseOscColor(reply[1] as string)
  if (color === undefined) return 'unknown'
  const luma = 0.299 * color.red + 0.587 * color.green + 0.114 * color.blue
  return luma > 140 ? 'light' : 'dark'
}

function parseOscColor(specification: string): Readonly<{ red: number; green: number; blue: number }> | undefined {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(specification)
  if (hex !== null) return Object.freeze({
    red: Number.parseInt(hex[1] as string, 16),
    green: Number.parseInt(hex[2] as string, 16),
    blue: Number.parseInt(hex[3] as string, 16),
  })
  const rgb = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/iu.exec(specification)
  if (rgb === null) return undefined
  const scale = (component: string): number => Math.round(
    Number.parseInt(component, 16) / (16 ** component.length - 1) * 255,
  )
  return Object.freeze({
    red: scale(rgb[1] as string),
    green: scale(rgb[2] as string),
    blue: scale(rgb[3] as string),
  })
}

function resolveColorDepth(stdout: NodeJS.WriteStream, environment: NodeJS.ProcessEnv): TuiTerminalColorDepth {
  if (environment.NO_COLOR !== undefined) return 'none'
  const getColorDepth = Reflect.get(stdout, 'getColorDepth') as unknown
  if (typeof getColorDepth !== 'function') return 'ansi16'
  let depth: unknown
  try { depth = Reflect.apply(getColorDepth, stdout, []) } catch { return 'ansi16' }
  if (typeof depth !== 'number' || !Number.isFinite(depth) || depth <= 0) return 'none'
  if (depth <= 4) return 'ansi16'
  if (depth <= 8) return 'ansi256'
  return 'truecolor'
}

/** Process streams used in production; tests replace this object. */
export const terminalInternals: TuiStreams = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
}
