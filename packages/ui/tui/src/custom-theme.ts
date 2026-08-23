/** Bounded JSON custom-theme discovery under the Harness home. */

import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dshHomePath } from './host.ts'
import type { TuiCustomThemeDefinition, TuiSemanticThemeTokens } from './theme.tsx'

const MAX_THEME_BYTES = 16 * 1_024
const MAX_THEME_FILES = 32
const THEME_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u
const HEX_COLOR = /^#[0-9a-f]{6}$/iu
const ANSI_COLORS = new Set([
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'gray', 'grey', 'blackBright', 'redBright', 'greenBright', 'yellowBright',
  'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
])
const TOKEN_KEYS = new Set<keyof TuiSemanticThemeTokens>([
  'text', 'muted', 'accent', 'success', 'warning', 'error', 'permission',
  'reasoning', 'selection', 'border', 'diffAdd', 'diffDelete',
])

/** One validated theme available to the config picker. */
export interface TuiCustomThemeFile {
  /** File name persisted in settings. */
  readonly fileName: string
  /** Validated palette definition. */
  readonly theme: TuiCustomThemeDefinition
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`${label} contains unknown field ${JSON.stringify(unknown)}`)
}

/**
 * Read and validate one custom theme file without executing user code.
 * @param fileName - simple JSON file name under `$DSH_HOME/themes`.
 * @param signal - optional cancellation signal for the bounded read.
 * @returns immutable custom theme file and palette.
 */
export async function loadTuiCustomTheme(
  fileName: string,
  signal?: AbortSignal,
): Promise<TuiCustomThemeFile> {
  if (!THEME_FILE.test(fileName)) throw new Error('Custom theme must be one JSON file name')
  const path = join(dshHomePath('themes'), fileName)
  const info = await lstat(path)
  if (!info.isFile()) throw new Error(`Custom theme is not a regular file: ${fileName}`)
  if (info.size > MAX_THEME_BYTES) throw new Error(`Custom theme exceeds ${MAX_THEME_BYTES} bytes: ${fileName}`)
  const source = await readFile(path, { encoding: 'utf8', signal })
  const root = record(JSON.parse(source) as unknown, 'Custom theme')
  exactKeys(root, new Set(['name', 'base', 'dim', 'tokens']), 'Custom theme')
  if (typeof root.name !== 'string' || root.name.trim() === '' || root.name.length > 80) {
    throw new Error('Custom theme name must contain 1-80 characters')
  }
  if (root.base !== 'dark' && root.base !== 'light') throw new Error('Custom theme base must be dark or light')
  if (root.dim !== undefined && typeof root.dim !== 'boolean') throw new Error('Custom theme dim must be boolean')
  const inputTokens = record(root.tokens, 'Custom theme tokens')
  exactKeys(inputTokens, TOKEN_KEYS, 'Custom theme tokens')
  const tokens: Partial<Record<keyof TuiSemanticThemeTokens, string>> = {}
  for (const [key, value] of Object.entries(inputTokens)) {
    if (typeof value !== 'string' || (!HEX_COLOR.test(value) && !ANSI_COLORS.has(value))) {
      throw new Error(`Custom theme token ${JSON.stringify(key)} must be a #RRGGBB or ANSI color`)
    }
    tokens[key as keyof TuiSemanticThemeTokens] = value
  }
  const theme: TuiCustomThemeDefinition = Object.freeze({
    name: root.name.trim(),
    base: root.base,
    ...(root.dim === undefined ? {} : { dim: root.dim }),
    tokens: Object.freeze(tokens),
  })
  return Object.freeze({ fileName, theme })
}

/**
 * Discover valid custom themes for the interactive config picker.
 * @param signal - optional cancellation signal.
 * @returns at most 32 valid JSON theme files ordered by file name.
 */
export async function listTuiCustomThemes(signal?: AbortSignal): Promise<readonly TuiCustomThemeFile[]> {
  let entries
  try {
    entries = await readdir(dshHomePath('themes'), { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze([])
    throw error
  }
  const files = entries.filter(entry => entry.isFile() && THEME_FILE.test(entry.name))
    .map(entry => entry.name).sort().slice(0, MAX_THEME_FILES)
  const settled = await Promise.allSettled(files.map(file => loadTuiCustomTheme(file, signal)))
  return Object.freeze(settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []))
}
