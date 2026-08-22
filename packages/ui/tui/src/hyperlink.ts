/** Bounded OSC 8 hyperlink parsing and terminal rendering. */

import { terminalSafe } from './sanitize.ts'

/** One safe URL span in terminal-safe text, using UTF-16 offsets. */
export interface TuiHyperlinkRange {
  readonly start: number
  readonly end: number
  readonly url: string
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu
const TRAILING_PUNCTUATION = /[.,;:!?]+$/u

/**
 * Validate one URL before it reaches an OSC control sequence or native opener.
 * Credentials, control characters, and non-web schemes are rejected.
 * @param value - untrusted URL text.
 * @returns canonical HTTP(S) URL, or undefined when it is not safe to activate.
 */
export function tuiSafeHyperlinkUrl(value: string): string | undefined {
  if (value.length === 0 || value.length > 2048 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return undefined
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function trimUrl(value: string): string {
  let result = value
  for (;;) {
    const next = result.replace(TRAILING_PUNCTUATION, '')
    if (next === result) return result
    result = next
  }
}

/**
 * Find safe HTTP(S) URL spans in one terminal-safe line.
 * @param text - text after model/tool sanitization.
 * @returns immutable URL ranges with bounded canonical targets.
 */
export function tuiFindHyperlinks(text: string): readonly TuiHyperlinkRange[] {
  const safe = terminalSafe(text)
  const ranges: TuiHyperlinkRange[] = []
  for (const match of safe.matchAll(URL_PATTERN)) {
    const raw = match[0]
    const index = match.index
    const candidate = trimUrl(raw)
    const url = tuiSafeHyperlinkUrl(candidate)
    if (url === undefined || candidate.length === 0) continue
    ranges.push(Object.freeze({ start: index, end: index + candidate.length, url }))
  }
  return Object.freeze(ranges)
}

/**
 * Wrap safe URL spans in OSC 8 sequences. The BEL terminator is accepted by
 * common terminals and avoids embedding an untrusted ST sequence in the URI.
 * @param text - terminal-safe display text.
 * @returns display text with hyperlinks, or the original safe text.
 */
export function tuiOsc8Text(text: string): string {
  const safe = terminalSafe(text)
  const ranges = tuiFindHyperlinks(safe)
  if (ranges.length === 0) return safe
  let result = ''
  let offset = 0
  for (const range of ranges) {
    result += safe.slice(offset, range.start)
    const display = safe.slice(range.start, range.end)
    result += `\u001b]8;;${range.url}\u0007${display}\u001b]8;;\u0007`
    offset = range.end
  }
  return result + safe.slice(offset)
}

/**
 * Return the safe hyperlink covering a UTF-16 text offset, when present.
 * @param ranges - safe hyperlink ranges in the terminal-safe text.
 * @param offset - UTF-16 offset to inspect.
 * @returns the covering URL, or undefined when the offset is not linked.
 */
export function tuiHyperlinkAt(ranges: readonly TuiHyperlinkRange[], offset: number): string | undefined {
  return ranges.find(range => offset >= range.start && offset < range.end)?.url
}
