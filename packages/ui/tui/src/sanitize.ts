/** Terminal-safe text normalization. The renderer alone may emit controls. */

/**
 * Remove terminal control characters from untrusted model, tool, path, and error text.
 * Newline and tab remain ordinary layout input; ESC and every other C0/C1 code become visible replacement glyphs.
 * @param value - untrusted text.
 * @returns text that cannot open an ANSI/OSC control sequence.
 */
export function terminalSafe(value: string): string {
  let safe = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (character === '\n' || character === '\t') {
      safe += character
    } else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      safe += '�'
    } else {
      safe += character
    }
  }
  return safe
}
