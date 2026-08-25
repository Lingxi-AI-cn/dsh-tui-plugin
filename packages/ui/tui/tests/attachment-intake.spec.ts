import { describe, expect, it } from 'vitest'
import { AttachmentError, AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment'
import {
  projectAttachmentRail,
  preflightAttachments,
  formatBytes,
  formatRailEntry,
  parseTuiTerminalPathPaste,
  tuiAttachmentStoreErrorMessage,
} from '../src/attachment-intake.ts'

function ref(id: string, overrides: Partial<Omit<ImageAttachmentRef, 'attachmentId'>> = {}): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(id),
    mediaType: overrides.mediaType ?? 'image/png',
    bytes: overrides.bytes ?? 1024,
    width: overrides.width ?? 100,
    height: overrides.height ?? 100,
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
  }
}

const defaultLimits: ImageAttachmentLimits = {
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 5,
  maxMessageImageBytes: 20 * 1024 * 1024,
  maxImagePixels: 25_000_000,
  maxImageDimension: 8192,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

describe('native TUI Attachment Intake', () => {
  it('recognizes terminal file-drag path lists without treating prose or commands as paths', () => {
    expect(parseTuiTerminalPathPaste('/tmp/screenshot.png')).toEqual(['/tmp/screenshot.png'])
    expect(parseTuiTerminalPathPaste('/tmp/one\\ file.png ../资料/说明.md')).toEqual([
      '/tmp/one file.png', '../资料/说明.md',
    ])
    expect(parseTuiTerminalPathPaste('"/tmp/one file.png"\n\'../notes file.md\'')).toEqual([
      '/tmp/one file.png', '../notes file.md',
    ])
    expect(parseTuiTerminalPathPaste('"C:\\Users\\Ada Lovelace\\shot.png"')).toEqual([
      'C:\\Users\\Ada Lovelace\\shot.png',
    ])
    expect(parseTuiTerminalPathPaste('please read /tmp/screenshot.png')).toBeUndefined()
    expect(parseTuiTerminalPathPaste('/bin/echo hello')).toBeUndefined()
    expect(parseTuiTerminalPathPaste('/tmp/image.png; rm -rf /tmp/nope')).toBeUndefined()
    expect(parseTuiTerminalPathPaste('"/tmp/unclosed')).toBeUndefined()
    expect(parseTuiTerminalPathPaste('/tmp/trailing\\')).toBeUndefined()
  })

  it('bounds terminal file-drag batches', () => {
    const accepted = Array.from({ length: 32 }, (_, index) => `/tmp/${index}.png`).join(' ')
    const rejected = `${accepted} /tmp/overflow.png`
    expect(parseTuiTerminalPathPaste(accepted)).toHaveLength(32)
    expect(parseTuiTerminalPathPaste(rejected)).toBeUndefined()
  })

  it('projects empty when no attachments', () => {
    const rail = projectAttachmentRail(undefined)
    expect(rail.count).toBe(0)
    expect(rail.totalBytes).toBe(0)
    expect(rail.entries).toHaveLength(0)
  })

  it('projects empty array as empty rail', () => {
    const rail = projectAttachmentRail([])
    expect(rail.count).toBe(0)
  })

  it('projects attachments into rail entries', () => {
    const attachments = [
      { ref: ref('a1', { name: 'screenshot.png', bytes: 2048 }) },
      { ref: ref('a2', { mediaType: 'image/jpeg', bytes: 4096 }) },
    ]
    const rail = projectAttachmentRail(attachments)
    expect(rail.count).toBe(2)
    expect(rail.totalBytes).toBe(6144)
    expect(rail.entries[0]?.name).toBe('screenshot.png')
    expect(rail.entries[1]?.name).toBe('image.jpg')
  })

  it('preflight passes with valid attachments', () => {
    const rail = projectAttachmentRail([{ ref: ref('a1') }])
    const result = preflightAttachments(rail, defaultLimits, true, 'en')
    expect(result.ok).toBe(true)
  })

  it('preflight passes with empty rail', () => {
    const rail = projectAttachmentRail(undefined)
    const result = preflightAttachments(rail, defaultLimits, true, 'en')
    expect(result.ok).toBe(true)
  })

  it('preflight fails when model has no vision', () => {
    const rail = projectAttachmentRail([{ ref: ref('a1') }])
    const result = preflightAttachments(rail, defaultLimits, false, 'en')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('model-no-vision')
  })

  it('preflight fails without attachment service', () => {
    const rail = projectAttachmentRail([{ ref: ref('a1') }])
    const result = preflightAttachments(rail, undefined, true, 'en')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-attachment-service')
  })

  it('preflight fails when too many images', () => {
    const attachments = Array.from({ length: 6 }, (_, i) => ({ ref: ref(`a${i}`) }))
    const rail = projectAttachmentRail(attachments)
    const result = preflightAttachments(rail, defaultLimits, true, 'en')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too-many-images')
  })

  it('preflight fails when total bytes exceed limit', () => {
    const rail = projectAttachmentRail(Array.from({ length: 5 }, (_, index) => ({
      ref: ref(`a${index}`, { bytes: 5 * 1024 * 1024 }),
    })))
    const result = preflightAttachments(rail, defaultLimits, true, 'en')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('images-too-large')
  })

  it('preflight enforces per-image byte, dimension, and pixel limits from the owner', () => {
    const bytes = preflightAttachments(projectAttachmentRail([{
      ref: ref('bytes', { name: 'huge.png', bytes: defaultLimits.maxImageBytes + 1 }),
    }]), defaultLimits, true, 'en')
    expect(bytes).toMatchObject({ ok: false, reason: 'image-too-large' })
    if (!bytes.ok) expect(bytes.message).toContain('huge.png')

    const dimension = preflightAttachments(projectAttachmentRail([{
      ref: ref('dimension', { name: 'wide.png', width: defaultLimits.maxImageDimension + 1 }),
    }]), defaultLimits, true, 'zh')
    expect(dimension).toMatchObject({ ok: false, reason: 'image-dimensions-too-large' })

    const pixels = preflightAttachments(projectAttachmentRail([{
      ref: ref('pixels', { name: 'pixels.png', width: 6_000, height: 6_000 }),
    }]), defaultLimits, true, 'en')
    expect(pixels).toMatchObject({ ok: false, reason: 'image-dimensions-too-large' })
  })

  it('formats bytes correctly', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('formats a rail entry for display', () => {
    const entry = { attachmentId: 'a1', name: 'test.png', mediaType: 'image/png' as const, bytes: 2048, width: 100, height: 100 }
    expect(formatRailEntry(entry)).toBe('test.png · image/png · 2.0 KB')
  })

  it('maps owner storage failures without leaking their raw messages', () => {
    const failure = new AttachmentError('sensitive backend path', 'ATTACHMENT_WRITE_FAILED')
    expect(tuiAttachmentStoreErrorMessage(failure, 'save', 'en')).toContain('ATTACHMENT_WRITE_FAILED')
    expect(tuiAttachmentStoreErrorMessage(failure, 'save', 'en')).not.toContain('sensitive backend path')
    expect(tuiAttachmentStoreErrorMessage(failure, 'read', 'zh')).toContain('ATTACHMENT_WRITE_FAILED')
    expect(tuiAttachmentStoreErrorMessage(new Error('secret'), 'read', 'en')).toContain('UNKNOWN')
  })
})
