/** Host Session export service: root preflight, bounded ZIP writing, exclusive publication, and cancellation cleanup. */

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { strFromU8, unzipSync } from 'fflate'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionLineageNode } from '@deepseek-ai/dsh-session-query'
import type { SessionRawArtifact } from '@deepseek-ai/dsh-session-persistence'
import SessionLogExporter, {
  prepareSessionLogExport,
  SessionLogExportError,
} from '../src/index.ts'

const roots: string[] = []
const sid = (value: string): SessionId => value as SessionId

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function header(id: string, parentSession?: SessionId): SessionHeader {
  return {
    version: 0,
    id: sid(id),
    createdAt: 1,
    cwd: '/workspace',
    delegationDepth: parentSession === undefined ? 0 : 1,
    ...parentSession === undefined ? {} : { parentSession },
  }
}

function artifact(id: string, content = `${id}\n`, parentSession?: SessionId): SessionRawArtifact {
  return { meta: header(id, parentSession), filename: 'session.jsonl', content }
}

function lineageNode(id: string): SessionLineageNode {
  return {
    session: { header: header(id, sid('root')), live: false, persisted: true },
    descendants: [],
  }
}

interface Services {
  readonly root?: SessionRawArtifact | undefined
  readonly readRaw?: (id: SessionId, signal?: AbortSignal) => Promise<SessionRawArtifact | undefined>
  readonly traceSession?: (id: SessionId, signal?: AbortSignal) => Promise<{
    target: { header: SessionHeader; live: boolean; persisted: boolean }
    ancestors: readonly SessionLineageNode[]
    complete: boolean
    root: { header: SessionHeader; live: boolean; persisted: boolean }
    descendants: readonly SessionLineageNode[]
  }>
  readonly supportsRawArtifacts?: boolean
  readonly flush?: () => Promise<boolean>
}

function contextWithServices(services: Services = {}): Context {
  const ctx = new Context()
  ctx.provide('sessions', {
    get: (id: SessionId) => id === sid('root') ? { id } : undefined,
    flush: services.flush ?? (async () => true),
  } as never)
  ctx.provide('sessionPersistence', {
    supportsRawArtifacts: services.supportsRawArtifacts ?? true,
    readRaw: services.readRaw ?? (async (id: SessionId) => id === sid('root')
      ? services.root ?? artifact('root')
      : undefined),
  } as never)
  ctx.provide('sessionQuery', {
    traceSession: services.traceSession ?? (async () => ({
      target: { header: header('root'), live: true, persisted: true },
      ancestors: [],
      complete: true,
      root: { header: header('root'), live: true, persisted: true },
      descendants: [],
    })),
  } as never)
  ctx.provide('attachments', {
    imageLimits: {} as never,
    validateImage: async () => {},
    saveImage: async () => { throw new Error('test exporter does not save images') },
    readImage: async (ref: ImageAttachmentRef) => ({ ref, data: new Uint8Array([1]) }),
  } as never)
  return ctx
}

describe('prepareSessionLogExport', () => {
  it('flushes a live root before reading its raw artifact', async () => {
    let flushed = false
    const ctx = contextWithServices({
      flush: async () => {
        flushed = true
        return true
      },
      readRaw: async () => {
        expect(flushed).toBe(true)
        return artifact('root', 'durable-after-flush\n')
      },
    })
    const prepared = await prepareSessionLogExport(ctx, sid('root'), new AbortController().signal)
    expect(prepared.root.content).toBe('durable-after-flush\n')
  })

  it('reports unsupported raw artifacts and missing roots with stable codes', async () => {
    const unsupported = contextWithServices({ supportsRawArtifacts: false })
    await expect(prepareSessionLogExport(unsupported, sid('root'), new AbortController().signal))
      .rejects.toMatchObject({ code: 'raw-artifacts-unsupported' })

    const missing = contextWithServices({ readRaw: async () => undefined })
    await expect(prepareSessionLogExport(missing, sid('root'), new AbortController().signal))
      .rejects.toMatchObject({ code: 'session-not-found' })
  })

  it('preserves cancellation and sanitizes backend preparation failures', async () => {
    const controller = new AbortController()
    const cancellation = new Error('stop export')
    controller.abort(cancellation)
    await expect(prepareSessionLogExport(contextWithServices(), sid('root'), controller.signal))
      .rejects.toBe(cancellation)

    const ctx = contextWithServices({ readRaw: async () => { throw new Error('/private/session.jsonl') } })
    await expect(prepareSessionLogExport(ctx, sid('root'), new AbortController().signal))
      .rejects.toEqual(expect.objectContaining({
        code: 'prepare-failed',
        message: 'session log export failed to prepare the stored artifact',
      }))
  })
})

describe('SessionLogExporter.writeToDirectory', () => {
  it('writes a complete owner-only ZIP and keeps an existing export unchanged', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-export-'))
    roots.push(directory)
    const original = join(directory, 'dsh-session-root.zip')
    await writeFile(original, 'existing')
    const exporter = new SessionLogExporter(contextWithServices({ root: artifact('root', 'exact raw text\n') }), {
      compressionLevel: 0,
    })

    const result = await exporter.writeToDirectory(
      { sessionId: sid('root'), includeDescendants: false },
      directory,
      new AbortController().signal,
    )

    expect(result).toEqual({
      path: join(directory, 'dsh-session-root-2.zip'),
      filename: 'dsh-session-root-2.zip',
    })
    expect(await readFile(original, 'utf8')).toBe('existing')
    const files = unzipSync(await readFile(result.path))
    expect(strFromU8(files['session.jsonl'] as Uint8Array)).toBe('exact raw text\n')
    expect((await stat(result.path)).mode & 0o777).toBe(0o600)
    expect((await readdir(directory)).sort()).toEqual([
      'dsh-session-root-2.zip',
      'dsh-session-root.zip',
    ])
  })

  it('rejects a relative or non-directory destination before preparing the archive', async () => {
    const exporter = new SessionLogExporter(contextWithServices(), {})
    await expect(exporter.writeToDirectory(
      { sessionId: sid('root'), includeDescendants: false },
      'relative',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'destination-invalid' })

    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-export-file-'))
    roots.push(directory)
    const file = join(directory, 'not-a-directory')
    await writeFile(file, '')
    await expect(exporter.writeToDirectory(
      { sessionId: sid('root'), includeDescendants: false },
      file,
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'destination-invalid' })
  })

  it('aborts descendant work and removes the unpublished partial archive', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-export-cancel-'))
    roots.push(directory)
    let reportStarted!: (signal: AbortSignal) => void
    const started = new Promise<AbortSignal>((resolve) => { reportStarted = resolve })
    const ctx = contextWithServices({
      traceSession: async () => ({
        target: { header: header('root'), live: true, persisted: true },
        ancestors: [],
        complete: true,
        root: { header: header('root'), live: true, persisted: true },
        descendants: [lineageNode('child')],
      }),
      readRaw: async (id, signal) => {
        if (id === sid('root')) return artifact('root')
        if (signal === undefined) throw new Error('missing producer signal')
        reportStarted(signal)
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => { reject(signal.reason as Error) }, { once: true })
        })
      },
    })
    const exporter = new SessionLogExporter(ctx, {})
    const controller = new AbortController()
    const operation = exporter.writeToDirectory(
      { sessionId: sid('root'), includeDescendants: true },
      directory,
      controller.signal,
    )
    const producerSignal = await started
    const cancellation = new Error('operator cancelled export')
    controller.abort(cancellation)

    await expect(operation).rejects.toBe(cancellation)
    expect(producerSignal.reason).toBe(cancellation)
    expect(await readdir(directory)).toEqual([])
  })

  it('validates compression config', () => {
    expect(SessionLogExporter.Config({})).toEqual({ compressionLevel: 6 })
    expect(SessionLogExporter.Config({ compressionLevel: 0 })).toEqual({ compressionLevel: 0 })
    expect(SessionLogExporter.Config({ compressionLevel: 9 })).toEqual({ compressionLevel: 9 })
    for (const value of [-1, 1.5, 10]) {
      expect(() => SessionLogExporter.Config({ compressionLevel: value } as never)).toThrow()
    }
  })

  it('keeps typed write failures distinct from preparation errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-export-fail-'))
    roots.push(directory)
    const ctx = contextWithServices({
      traceSession: async () => { throw new Error('lineage failed') },
    })
    const exporter = new SessionLogExporter(ctx, {})
    await expect(exporter.writeToDirectory(
      { sessionId: sid('root'), includeDescendants: true },
      directory,
      new AbortController().signal,
    )).rejects.toEqual(expect.objectContaining<Partial<SessionLogExportError>>({ code: 'write-failed' }))
    expect(await readdir(directory)).toEqual([])
  })
})
