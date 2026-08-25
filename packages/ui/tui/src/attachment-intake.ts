/** TUI attachment intake: unified path parsing, rail projection, and preflight. */

import { AttachmentError, type ImageAttachmentRef, type ImageAttachmentLimits, type ImageMediaType } from './host.ts'
import { terminalSafe } from './sanitize.ts'
import type { TuiLocale } from './locale.ts'
import { tuiMessage } from './locale.ts'

const MAX_PASTED_PATHS = 32
const WINDOWS_ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\)/iu
const EXPLICIT_RELATIVE_PATH = /^\.\.?(?:[\\/]|$)/u
const UNESCAPED_SHELL_OPERATOR = /[;&|<>`$]/u
const PATH_CONTROL = /[\u0000-\u001f\u007f-\u009f]/u

/** One entry in the composer attachment rail. */
export interface TuiAttachmentRailEntry {
  readonly attachmentId: string
  readonly name: string
  readonly mediaType: ImageMediaType
  readonly bytes: number
  readonly width: number
  readonly height: number
}

/** Snapshot of the current attachment rail state. */
export interface TuiAttachmentRailSnapshot {
  readonly entries: readonly TuiAttachmentRailEntry[]
  readonly totalBytes: number
  readonly count: number
}

/** Preflight result before sending attachments to the model. */
export type TuiAttachmentPreflightResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: TuiAttachmentPreflightReason; readonly message: string }

/** Machine-routable preflight failure codes. */
export type TuiAttachmentPreflightReason =
  | 'too-many-images'
  | 'image-too-large'
  | 'images-too-large'
  | 'image-dimensions-too-large'
  | 'unsupported-type'
  | 'no-attachment-service'
  | 'model-no-vision'

/** Parse a bracketed paste only when every word is an explicit filesystem path.
 *
 * This accepts shell-quoted or backslash-escaped paths emitted by terminal file
 * drag operations, but performs no shell expansion. Ordinary prose and command
 * lines return `undefined` and stay ordinary composer text.
 * @param input - exact bracketed-paste payload from the terminal decoder.
 * @returns decoded path words, or `undefined` when the payload is not a pure path list.
 */
export function parseTuiTerminalPathPaste(input: string): readonly string[] | undefined {
  const trimmed = input.trim()
  const quotedWindows = /^"((?:[a-z]:[\\/]|\\\\)[^"\r\n]+)"$/iu.exec(trimmed)
  if (quotedWindows?.[1] !== undefined) return Object.freeze([quotedWindows[1]])
  if (!/\s/u.test(trimmed) && WINDOWS_ABSOLUTE_PATH.test(trimmed)) return Object.freeze([trimmed])
  const words: string[] = []
  let word = ''
  let started = false
  let quote: 'single' | 'double' | undefined
  let escaped = false
  const finishWord = (): boolean => {
    if (!started || word === '') return false
    words.push(word)
    word = ''
    started = false
    return words.length <= MAX_PASTED_PATHS
  }

  for (const character of input) {
    if (escaped) {
      if (PATH_CONTROL.test(character) && !/\s/u.test(character)) return undefined
      word += character
      started = true
      escaped = false
      continue
    }
    if (quote === 'single') {
      if (character === "'") quote = undefined
      else {
        if (PATH_CONTROL.test(character)) return undefined
        word += character
      }
      continue
    }
    if (quote === 'double') {
      if (character === '"') quote = undefined
      else if (character === '\\') escaped = true
      else {
        if (PATH_CONTROL.test(character)) return undefined
        word += character
      }
      continue
    }
    if (/\s/u.test(character)) {
      if (started && !finishWord()) return undefined
      continue
    }
    if (character === "'") {
      quote = 'single'
      started = true
      continue
    }
    if (character === '"') {
      quote = 'double'
      started = true
      continue
    }
    if (character === '\\') {
      escaped = true
      started = true
      continue
    }
    if (PATH_CONTROL.test(character) || UNESCAPED_SHELL_OPERATOR.test(character)) return undefined
    word += character
    started = true
  }
  if (quote !== undefined || escaped || (started && !finishWord()) || words.length === 0) return undefined
  if (!words.every(isExplicitPath)) return undefined
  return Object.freeze(words)
}

/** Stable, localized storage failure shown without raw provider messages.
 * @param error - attachment owner failure or an unknown exception.
 * @param operation - whether the owner was saving or reading a durable image.
 * @param locale - active TUI locale.
 * @returns actionable terminal-safe text.
 */
export function tuiAttachmentStoreErrorMessage(
  error: unknown,
  operation: 'save' | 'read',
  locale: TuiLocale,
): string {
  const code = error instanceof AttachmentError ? error.code : 'UNKNOWN'
  return tuiMessage(locale, operation === 'save' ? 'attachment.error.save' : 'attachment.error.read', { code })
}

/** Project composer attachments into a rail snapshot for rendering. */
export function projectAttachmentRail(
  attachments: readonly { ref: ImageAttachmentRef }[] | undefined,
): TuiAttachmentRailSnapshot {
  if (attachments === undefined || attachments.length === 0) {
    return { entries: [], totalBytes: 0, count: 0 }
  }
  const entries = attachments.map(({ ref }) => ({
    attachmentId: ref.attachmentId as string,
    name: ref.name ?? `image.${extensionForMediaType(ref.mediaType)}`,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
  }))
  const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0)
  return { entries, totalBytes, count: entries.length }
}

/** Preflight check before sending: validate against deployment limits. */
export function preflightAttachments(
  rail: TuiAttachmentRailSnapshot,
  limits: ImageAttachmentLimits | undefined,
  modelSupportsVision: boolean,
  locale: TuiLocale,
): TuiAttachmentPreflightResult {
  if (rail.count === 0) return { ok: true }
  if (!modelSupportsVision) {
    return {
      ok: false,
      reason: 'model-no-vision',
      message: tuiMessage(locale, 'attachment.preflight.noVision'),
    }
  }
  if (limits === undefined) {
    return {
      ok: false,
      reason: 'no-attachment-service',
      message: tuiMessage(locale, 'attachment.preflight.noService'),
    }
  }
  if (rail.count > limits.maxImagesPerMessage) {
    return {
      ok: false,
      reason: 'too-many-images',
      message: tuiMessage(locale, 'attachment.preflight.tooMany', {
        count: String(rail.count),
        max: String(limits.maxImagesPerMessage),
      }),
    }
  }
  for (const entry of rail.entries) {
    if (entry.bytes > limits.maxImageBytes) {
      return {
        ok: false,
        reason: 'image-too-large',
        message: tuiMessage(locale, 'attachment.preflight.imageTooLarge', {
          name: terminalSafe(entry.name),
          size: formatBytes(entry.bytes),
          max: formatBytes(limits.maxImageBytes),
        }),
      }
    }
    if (entry.width > limits.maxImageDimension || entry.height > limits.maxImageDimension
      || entry.width * entry.height > limits.maxImagePixels) {
      return {
        ok: false,
        reason: 'image-dimensions-too-large',
        message: tuiMessage(locale, 'attachment.preflight.dimensionsTooLarge', {
          name: terminalSafe(entry.name),
          width: entry.width,
          height: entry.height,
          maxDimension: limits.maxImageDimension,
          maxPixels: limits.maxImagePixels,
        }),
      }
    }
  }
  if (rail.totalBytes > limits.maxMessageImageBytes) {
    return {
      ok: false,
      reason: 'images-too-large',
      message: tuiMessage(locale, 'attachment.preflight.tooLarge', {
        size: formatBytes(rail.totalBytes),
        max: formatBytes(limits.maxMessageImageBytes),
      }),
    }
  }
  for (const entry of rail.entries) {
    if (!limits.mediaTypes.includes(entry.mediaType)) {
      return {
        ok: false,
        reason: 'unsupported-type',
        message: tuiMessage(locale, 'attachment.preflight.unsupportedType', {
          type: entry.mediaType,
        }),
      }
    }
  }
  return { ok: true }
}

/** Format byte count for compact display. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format one rail entry for display. */
export function formatRailEntry(entry: TuiAttachmentRailEntry): string {
  return `${entry.name} · ${entry.mediaType} · ${formatBytes(entry.bytes)}`
}

function extensionForMediaType(mediaType: ImageMediaType): string {
  switch (mediaType) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
  }
}

function isExplicitPath(value: string): boolean {
  return value.startsWith('/') || EXPLICIT_RELATIVE_PATH.test(value) || WINDOWS_ABSOLUTE_PATH.test(value)
}
