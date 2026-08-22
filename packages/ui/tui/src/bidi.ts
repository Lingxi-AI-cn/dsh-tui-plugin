/** UAX #9 visual ordering while retaining logical grapheme identity. */

import { createRequire } from 'node:module'

interface BidiEngine {
  getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl'): { levels: Uint8Array | readonly number[] }
}

type BidiFactory = () => BidiEngine

const require = createRequire(import.meta.url)
const bidi = (require('bidi-js') as BidiFactory)()
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** One grapheme in visual order with its original logical token index. */
export interface TuiBidiGrapheme {
  readonly text: string
  readonly logicalIndex: number
  readonly sourceIndex: number
  readonly level: number
}

function reorder<T extends { level: number }>(items: readonly T[]): T[] {
  const output = [...items]
  const levels = output.map(item => item.level)
  const odd = levels.filter(level => (level & 1) !== 0)
  if (odd.length === 0) return output
  const minimum = Math.min(...odd)
  const maximum = Math.max(...levels)
  for (let level = maximum; level >= minimum; level -= 1) {
    for (let start = 0; start < output.length;) {
      while (start < output.length) {
        const item = output[start]
        if (item === undefined || item.level >= level) break
        start += 1
      }
      if (start >= output.length) break
      let end = start
      while (end + 1 < output.length) {
        const item = output[end + 1]
        if (item === undefined || item.level < level) break
        end += 1
      }
      output.splice(start, end - start + 1, ...output.slice(start, end + 1).reverse())
      start = end + 1
    }
  }
  return output
}

/**
 * Reorder one logical line using the Unicode Bidirectional Algorithm.
 * Graphemes remain atomic, and each output token retains its logical index.
 * @param text - terminal-safe logical line.
 * @returns visual grapheme sequence.
 */
export function tuiBidiGraphemes(text: string): readonly TuiBidiGrapheme[] {
  const tokens = [...graphemes.segment(text)].map((part, logicalIndex) => ({
    text: part.segment,
    logicalIndex,
    sourceIndex: part.index,
    level: 0,
  }))
  if (tokens.length < 2) return Object.freeze(tokens)
  const levels = bidi.getEmbeddingLevels(text).levels
  const resolved = tokens.map(token => ({
    ...token,
    level: levels[token.sourceIndex] ?? 0,
  }))
  return Object.freeze(reorder(resolved).map(token => Object.freeze(token)))
}

/** Return one line in terminal visual order while retaining safe text.
 * @param text - terminal-safe logical text, possibly containing newlines.
 * @returns text with each line reordered for terminal display.
 */
export function tuiBidiVisualText(text: string): string {
  return text.split('\n').map(line => tuiBidiGraphemes(line).map(token => token.text).join('')).join('\n')
}
