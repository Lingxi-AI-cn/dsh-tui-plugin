/** Incremental terminal protocol decoding for native TUI input dispatch. */

import { StringDecoder } from 'node:string_decoder'
import { useEffect, useRef } from 'react'
import { useStdin } from 'ink'
import type { TuiKeypress } from './keybindings.ts'

const ESCAPE = '\u001b'
const CSI = `${ESCAPE}[`
const BRACKETED_PASTE_START = `${CSI}200~`
const BRACKETED_PASTE_END = `${CSI}201~`
const MAX_SEQUENCE_LENGTH = 256
const MAX_PASTE_BYTES = 16 * 1024 * 1024

/** One normalized event emitted by the native terminal input decoder. */
export type TuiTerminalInputEvent =
  | {
    readonly kind: 'input'
    /** Committed text, or the printable identity of a modified key. */
    readonly input: string
    /** Normalized key flags independent of a terminal keyboard protocol. */
    readonly key: TuiKeypress
    /** Whether an oversized bracketed paste was bounded before dispatch. */
    readonly truncated?: boolean
  }
  | {
    readonly kind: 'mouse'
    /** SGR button and modifier bit field. */
    readonly button: number
    /** One-based terminal column. */
    readonly column: number
    /** One-based terminal row. */
    readonly row: number
    /** Whether the report ends a press rather than starting or moving one. */
    readonly release: boolean
  }
  | {
    readonly kind: 'focus'
    /** Whether the terminal reports that it gained focus. */
    readonly focused: boolean
  }
  | {
    readonly kind: 'reply'
    /** Complete terminal capability or status reply, retained for negotiation. */
    readonly sequence: string
  }

/** Why a decoder is retaining an incomplete terminal sequence. */
export type TuiTerminalInputWait = 'escape' | 'sequence' | 'paste'

type ParseResult =
  | { readonly status: 'incomplete' }
  | { readonly status: 'complete'; readonly length: number; readonly event?: TuiTerminalInputEvent; readonly paste?: true }

/**
 * Incrementally tokenize raw terminal input without relying on transport chunk boundaries.
 *
 * Complete unknown control sequences are discarded. Incomplete sequences remain bounded
 * until {@link flush} applies the caller's escape timeout.
 */
export class TuiTerminalInputDecoder {
  private utf8 = new StringDecoder('utf8')
  private pending = ''
  private paste: string | undefined
  private pasteBytes = 0
  private pasteTruncated = false

  /** The kind of timeout required for the currently retained input, if any. */
  get waiting(): TuiTerminalInputWait | undefined {
    if (this.paste !== undefined) return 'paste'
    if (this.pending === ESCAPE) return 'escape'
    return this.pending === '' ? undefined : 'sequence'
  }

  /**
   * Decode one raw terminal chunk.
   * @param data - UTF-8 input from Ink's raw input emitter or a terminal stream.
   * @returns complete normalized events in byte-stream order.
   */
  push(data: string | Buffer): readonly TuiTerminalInputEvent[] {
    const value = this.utf8.write(Buffer.isBuffer(data) ? data : Buffer.from(data))
    if (value !== '') this.pending += value
    return this.drain()
  }

  /**
   * Settle input retained past the escape or incomplete-sequence timeout.
   * @returns a standalone Escape or bounded paste event; other fragments are discarded.
   */
  flush(): readonly TuiTerminalInputEvent[] {
    const events: TuiTerminalInputEvent[] = []
    this.utf8.end()
    this.utf8 = new StringDecoder('utf8')
    events.push(...this.drain())
    if (this.paste !== undefined) {
      this.appendPaste(this.pending)
      this.pending = ''
      events.push(inputEvent(this.paste, { paste: true }, this.pasteTruncated))
      this.paste = undefined
      this.pasteBytes = 0
      this.pasteTruncated = false
    } else if (this.pending === ESCAPE) {
      events.push(inputEvent('', { escape: true }))
      this.pending = ''
    } else {
      this.pending = ''
    }
    return Object.freeze(events)
  }

  /** Discard retained sequence and paste state during input-owner teardown. */
  reset(): void {
    this.utf8.end()
    this.utf8 = new StringDecoder('utf8')
    this.pending = ''
    this.paste = undefined
    this.pasteBytes = 0
    this.pasteTruncated = false
  }

  private drain(): TuiTerminalInputEvent[] {
    const events: TuiTerminalInputEvent[] = []
    while (this.pending !== '') {
      if (this.paste !== undefined) {
        const end = this.pending.indexOf(BRACKETED_PASTE_END)
        if (end < 0) {
          const retained = terminalPrefixSuffixLength(this.pending, BRACKETED_PASTE_END)
          this.appendPaste(retained === 0 ? this.pending : this.pending.slice(0, -retained))
          this.pending = retained === 0 ? '' : this.pending.slice(-retained)
          break
        }
        this.appendPaste(this.pending.slice(0, end))
        this.pending = this.pending.slice(end + BRACKETED_PASTE_END.length)
        events.push(inputEvent(this.paste, { paste: true }, this.pasteTruncated))
        this.paste = undefined
        this.pasteBytes = 0
        this.pasteTruncated = false
        continue
      }

      const first = this.pending.charCodeAt(0)
      if (this.pending.startsWith(ESCAPE) || first === 0x9b) {
        const parsed = first === 0x9b ? parseCsi(this.pending, 1) : parseEscape(this.pending)
        if (parsed.status === 'incomplete') {
          if (this.pending.length > MAX_SEQUENCE_LENGTH) this.pending = ''
          break
        }
        this.pending = this.pending.slice(parsed.length)
        if (parsed.paste === true) {
          this.paste = ''
          this.pasteBytes = 0
          this.pasteTruncated = false
        } else if (parsed.event !== undefined) events.push(parsed.event)
        continue
      }

      if (isControl(first)) {
        const event = controlEvent(first)
        this.pending = this.pending.slice(1)
        if (event !== undefined) events.push(event)
        continue
      }

      let end = 1
      while (end < this.pending.length) {
        const code = this.pending.charCodeAt(end)
        if (this.pending[end] === ESCAPE || code === 0x7f || isControl(code)) break
        end += code >= 0xd800 && code <= 0xdbff ? 2 : 1
      }
      const text = this.pending.slice(0, end)
      this.pending = this.pending.slice(end)
      events.push(inputEvent(text, shiftedTextKey(text)))
    }
    return events
  }

  private appendPaste(value: string): void {
    if (this.paste === undefined || this.pasteTruncated || value === '') return
    const bytes = Buffer.from(value)
    const remaining = MAX_PASTE_BYTES - this.pasteBytes
    if (bytes.length <= remaining) {
      this.paste += value
      this.pasteBytes += bytes.length
      return
    }
    let end = Math.max(0, remaining)
    while (end > 0 && ((bytes[end] as number) & 0b11000000) === 0b10000000) end -= 1
    if (end > 0) {
      this.paste += bytes.subarray(0, end).toString('utf8')
      this.pasteBytes += end
    }
    this.pasteTruncated = true
  }
}

/**
 * Own raw-mode input for one Ink component and dispatch decoder events.
 * @param handler - current normalized input consumer.
 * @param initialEvents - events buffered before the Ink input emitter mounted.
 */
export function useTuiTerminalInput(
  handler: (event: TuiTerminalInputEvent) => void,
  initialEvents: readonly TuiTerminalInputEvent[] = [],
): void {
  const { internal_eventEmitter: inputEvents, setRawMode } = useStdin()
  const handlerRef = useRef(handler)
  const decoderRef = useRef<TuiTerminalInputDecoder>()
  const initialEventsRef = useRef<readonly TuiTerminalInputEvent[]>()
  handlerRef.current = handler
  if (decoderRef.current === undefined) decoderRef.current = new TuiTerminalInputDecoder()
  if (initialEventsRef.current === undefined) initialEventsRef.current = initialEvents

  useEffect(() => {
    const decoder = decoderRef.current as TuiTerminalInputDecoder
    let timeout: ReturnType<typeof setTimeout> | undefined
    const dispatch = (events: readonly TuiTerminalInputEvent[]): void => {
      for (const event of events) handlerRef.current(event)
    }
    const clearInputTimeout = (): void => {
      if (timeout !== undefined) clearTimeout(timeout)
      timeout = undefined
    }
    const scheduleInputTimeout = (): void => {
      clearInputTimeout()
      const waiting = decoder.waiting
      if (waiting === undefined) return
      timeout = setTimeout(() => {
        timeout = undefined
        dispatch(decoder.flush())
      }, waiting === 'paste' ? 1000 : 35)
    }
    const onInput = (data: string | Buffer): void => {
      clearInputTimeout()
      dispatch(decoder.push(data))
      scheduleInputTimeout()
    }

    setRawMode(true)
    inputEvents.on('input', onInput)
    dispatch(initialEventsRef.current ?? [])
    return () => {
      clearInputTimeout()
      inputEvents.off('input', onInput)
      decoder.reset()
      setRawMode(false)
    }
  }, [inputEvents, setRawMode])
}

function parseEscape(value: string): ParseResult {
  if (value.length === 1) return { status: 'incomplete' }
  if (value.startsWith(CSI)) return parseCsi(value, CSI.length)
  const second = value[1]
  if (second === 'O') return parseSs3(value)
  if (second === ']' || second === 'P' || second === '_' || second === '^') return parseTerminalString(value)
  if (second === ESCAPE) return {
    status: 'complete', length: 2, event: inputEvent('', { escape: true, meta: true }),
  }
  const code = second?.charCodeAt(0) ?? 0
  if (isControl(code)) return { status: 'complete', length: 1, event: inputEvent('', { escape: true }) }
  const character = firstCharacter(value.slice(1))
  if (character === 'b' || character === 'f') return {
    status: 'complete',
    length: 2,
    event: inputEvent('', character === 'b'
      ? { leftArrow: true, meta: true }
      : { rightArrow: true, meta: true }),
  }
  return {
    status: 'complete',
    length: 1 + character.length,
    event: inputEvent(character, { ...shiftedTextKey(character), meta: true }),
  }
}

function parseCsi(value: string, prefixLength: number): ParseResult {
  let finalIndex = prefixLength
  while (finalIndex < value.length) {
    const code = value.charCodeAt(finalIndex)
    if (code >= 0x40 && code <= 0x7e) break
    finalIndex += 1
  }
  if (finalIndex >= value.length) return { status: 'incomplete' }
  const sequence = value.slice(0, finalIndex + 1)
  const body = value.slice(prefixLength, finalIndex)
  const final = value[finalIndex] as string
  const length = finalIndex + 1

  if (sequence === BRACKETED_PASTE_START) return { status: 'complete', length, paste: true }
  if (sequence === BRACKETED_PASTE_END) return { status: 'complete', length }

  const mouse = /^<(\d+)\s*;\s*(\d+)\s*;\s*(\d+)$/u.exec(body)
  if ((final === 'M' || final === 'm') && mouse !== null) return {
    status: 'complete',
    length,
    event: Object.freeze({
      kind: 'mouse',
      button: Number(mouse[1]),
      column: Number(mouse[2]),
      row: Number(mouse[3]),
      release: final === 'm',
    }),
  }
  if (body === '' && (final === 'I' || final === 'O')) return {
    status: 'complete', length, event: Object.freeze({ kind: 'focus', focused: final === 'I' }),
  }
  if (isTerminalReply(body, final)) return {
    status: 'complete', length, event: Object.freeze({ kind: 'reply', sequence }),
  }

  const key = csiKey(body, final)
  return { status: 'complete', length, ...key === undefined ? {} : { event: key } }
}

function parseSs3(value: string): ParseResult {
  if (value.length < 3) return { status: 'incomplete' }
  const code = value[2] as string
  const key = ss3Keys[code]
  return { status: 'complete', length: 3, ...key === undefined ? {} : { event: key() } }
}

function parseTerminalString(value: string): ParseResult {
  const bel = value.indexOf('\u0007', 2)
  const stringTerminator = value.indexOf(`${ESCAPE}\\`, 2)
  const end = bel < 0 ? stringTerminator
    : stringTerminator < 0 ? bel : Math.min(bel, stringTerminator)
  if (end < 0) return { status: 'incomplete' }
  const length = end + (value[end] === ESCAPE ? 2 : 1)
  return {
    status: 'complete',
    length,
    event: Object.freeze({ kind: 'reply', sequence: value.slice(0, length) }),
  }
}

function csiKey(body: string, final: string): TuiTerminalInputEvent | undefined {
  if (final === 'Z' && body === '') return inputEvent('', { tab: true, shift: true })
  if (final === 'u') return kittyKey(body)
  if (final === '~') return tildeKey(body)
  const directional = directionalKeys[final]
  if (directional === undefined) return undefined
  const parameters = body === '' ? [] : body.split(';')
  if (parameters.length > 2 || (parameters[0] !== undefined && parameters[0] !== '' && parameters[0] !== '1')) {
    return undefined
  }
  const modifiers = decodeModifiers(parameters[1])
  return inputEvent('', { ...directional, ...modifiers })
}

function kittyKey(body: string): TuiTerminalInputEvent | undefined {
  if (body.startsWith('?')) return undefined
  const parameters = body.split(';')
  if (parameters.length === 0 || parameters.length > 3) return undefined
  const keyCodes = parameters[0]?.split(':') ?? []
  const codepoint = parseCodepoint(keyCodes[0])
  if (codepoint === undefined) return undefined
  const modifierParts = parameters[1]?.split(':') ?? []
  const eventType = Number(modifierParts[1] ?? 1)
  if (eventType === 3) return undefined
  if (eventType !== 1 && eventType !== 2) return undefined
  const modifiers = decodeModifiers(modifierParts[0], true)
  const text = kittyText(parameters[2])
  if (text !== undefined && modifiers.ctrl !== true && modifiers.meta !== true
    && modifiers.super !== true && modifiers.hyper !== true) {
    return inputEvent(text, modifiers)
  }
  const shifted = modifiers.shift === true ? parseCodepoint(keyCodes[1]) : undefined
  const base = modifiers.ctrl === true || modifiers.meta === true || modifiers.super === true || modifiers.hyper === true
    ? parseCodepoint(keyCodes[2])
    : undefined
  return codepointKey(base ?? shifted ?? codepoint, modifiers)
}

function tildeKey(body: string): TuiTerminalInputEvent | undefined {
  const parameters = body.split(';')
  if (parameters[0] === '27' && parameters.length === 3) {
    const codepoint = Number(parameters[2])
    if (!Number.isSafeInteger(codepoint) || codepoint < 0 || codepoint > 0x10ffff) return undefined
    return codepointKey(codepoint, decodeModifiers(parameters[1]))
  }
  if (parameters.length > 2) return undefined
  const modifiers = decodeModifiers(parameters[1])
  const key = tildeKeys[parameters[0] ?? '']
  return key === undefined ? undefined : inputEvent('', { ...key, ...modifiers })
}

function codepointKey(codepoint: number, modifiers: TuiKeypress): TuiTerminalInputEvent | undefined {
  const functional = kittyFunctionalKeys[codepoint]
  if (functional !== undefined) {
    return typeof functional === 'string'
      ? inputEvent(functional, modifiers)
      : inputEvent('', { ...functional, ...modifiers })
  }
  if (codepoint >= 0xe000 && codepoint <= 0xf8ff) return undefined
  if (codepoint === 8 || codepoint === 127) return inputEvent('', { ...modifiers, backspace: true })
  if (codepoint === 9) return inputEvent('', { ...modifiers, tab: true })
  if (codepoint === 13) return inputEvent('', { ...modifiers, return: true })
  if (codepoint === 27) return inputEvent('', { ...modifiers, escape: true })
  if (codepoint < 0x20 || (codepoint >= 0x7f && codepoint < 0xa0)) return undefined
  const input = String.fromCodePoint(codepoint)
  return inputEvent(input, { ...shiftedTextKey(input), ...modifiers })
}

function controlEvent(code: number): TuiTerminalInputEvent | undefined {
  if (code === 0x7f || code === 0x08) return inputEvent('', { backspace: true })
  if (code === 0x09) return inputEvent('', { tab: true })
  if (code === 0x0a) return inputEvent('j', { ctrl: true })
  if (code === 0x0d) return inputEvent('', { return: true })
  if (code === 0x00) return inputEvent('space', { ctrl: true })
  if (code >= 0x01 && code <= 0x1a) return inputEvent(String.fromCharCode(96 + code), { ctrl: true })
  if (code >= 0x1c && code <= 0x1f) return inputEvent(['\\', ']', '^', '_'][code - 0x1c] as string, { ctrl: true })
  return undefined
}

function decodeModifiers(value: string | undefined, kitty = false): TuiKeypress {
  const encoded = Number(value ?? 1)
  if (!Number.isSafeInteger(encoded) || encoded < 1) return {}
  const bits = encoded - 1
  return {
    ...(bits & 1) !== 0 ? { shift: true } : {},
    ...(bits & 2) !== 0 ? { meta: true } : {},
    ...(bits & 4) !== 0 ? { ctrl: true } : {},
    ...kitty && (bits & 8) !== 0 ? { super: true } : {},
    ...kitty && (bits & 16) !== 0 ? { hyper: true } : {},
    ...kitty && (bits & 32) !== 0 ? { meta: true } : {},
  }
}

function shiftedTextKey(value: string): TuiKeypress {
  return value.length === 1 && /[A-Z]/u.test(value) ? { shift: true } : {}
}

function inputEvent(input: string, key: TuiKeypress, truncated = false): TuiTerminalInputEvent {
  return Object.freeze({ kind: 'input', input, key: Object.freeze(key), ...truncated ? { truncated: true } : {} })
}

function firstCharacter(value: string): string {
  return Array.from(value)[0] ?? ''
}

function parseCodepoint(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const codepoint = Number(value)
  return Number.isSafeInteger(codepoint) && codepoint >= 0 && codepoint <= 0x10ffff
    && !(codepoint >= 0xd800 && codepoint <= 0xdfff)
    ? codepoint
    : undefined
}

function kittyText(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  const codepoints = value.split(':').map(parseCodepoint)
  if (codepoints.some(codepoint => codepoint === undefined || isControl(codepoint))) return undefined
  return String.fromCodePoint(...codepoints as number[])
}

function terminalPrefixSuffixLength(value: string, sequence: string): number {
  const maximum = Math.min(value.length, sequence.length - 1)
  for (let length = maximum; length > 0; length -= 1) {
    if (value.endsWith(sequence.slice(0, length))) return length
  }
  return 0
}

function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)
}

function isTerminalReply(body: string, final: string): boolean {
  if (body.startsWith('?') || body.startsWith('>') || body.startsWith('=')) return true
  if (final === 'R' && /^\d+;\d+$/u.test(body)) return true
  return final === 'c' || final === 'n' || final === 'y'
}

const directionalKeys: Readonly<Record<string, TuiKeypress>> = Object.freeze({
  A: Object.freeze({ upArrow: true }),
  B: Object.freeze({ downArrow: true }),
  C: Object.freeze({ rightArrow: true }),
  D: Object.freeze({ leftArrow: true }),
  F: Object.freeze({ end: true }),
  H: Object.freeze({ home: true }),
})

const tildeKeys: Readonly<Record<string, TuiKeypress>> = Object.freeze({
  '1': Object.freeze({ home: true }),
  '3': Object.freeze({ delete: true }),
  '4': Object.freeze({ end: true }),
  '5': Object.freeze({ pageUp: true }),
  '6': Object.freeze({ pageDown: true }),
  '7': Object.freeze({ home: true }),
  '8': Object.freeze({ end: true }),
})

const kittyFunctionalKeys: Readonly<Record<number, string | TuiKeypress>> = Object.freeze({
  57399: '0',
  57400: '1',
  57401: '2',
  57402: '3',
  57403: '4',
  57404: '5',
  57405: '6',
  57406: '7',
  57407: '8',
  57408: '9',
  57409: '.',
  57410: '/',
  57411: '*',
  57412: '-',
  57413: '+',
  57414: Object.freeze({ return: true }),
  57415: '=',
  57416: ',',
  57417: Object.freeze({ leftArrow: true }),
  57418: Object.freeze({ rightArrow: true }),
  57419: Object.freeze({ upArrow: true }),
  57420: Object.freeze({ downArrow: true }),
  57421: Object.freeze({ pageUp: true }),
  57422: Object.freeze({ pageDown: true }),
  57423: Object.freeze({ home: true }),
  57424: Object.freeze({ end: true }),
  57426: Object.freeze({ delete: true }),
})

const ss3Keys: Readonly<Record<string, () => TuiTerminalInputEvent>> = Object.freeze({
  A: () => inputEvent('', { upArrow: true }),
  B: () => inputEvent('', { downArrow: true }),
  C: () => inputEvent('', { rightArrow: true }),
  D: () => inputEvent('', { leftArrow: true }),
  F: () => inputEvent('', { end: true }),
  H: () => inputEvent('', { home: true }),
  M: () => inputEvent('', { return: true }),
  j: () => inputEvent('*', {}),
  k: () => inputEvent('+', {}),
  m: () => inputEvent('-', {}),
  n: () => inputEvent('.', {}),
  o: () => inputEvent('/', {}),
  p: () => inputEvent('0', {}),
  q: () => inputEvent('1', {}),
  r: () => inputEvent('2', {}),
  s: () => inputEvent('3', {}),
  t: () => inputEvent('4', {}),
  u: () => inputEvent('5', {}),
  v: () => inputEvent('6', {}),
  w: () => inputEvent('7', {}),
  x: () => inputEvent('8', {}),
  y: () => inputEvent('9', {}),
})
