import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import { SESSION_LOG_FILENAME } from '@deepseek-ai/dsh-session-log-export'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
/** Host Session export service: root preflight, bounded ZIP writing, exclusive publication, and cancellation cleanup. */

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { strFromU8, unzipSync } from 'fflate'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  SessionLogOffset, SessionSeq, type SessionEvent, type SessionHeader, type SessionId,
} from '@deepseek-ai/dsh-session'
import type { SessionLineageNode } from '@deepseek-ai/dsh-session-query'
import type { SessionInspection } from '@deepseek-ai/dsh-session-persistence'
import SessionLogExporter, {
  prepareSessionLogExport,
  renderSessionMarkdown,
  sessionMarkdownExportDeps,
  SessionLogExportError,
} from '../src/index.ts'

const roots: string[] = []
const sid = (value: string): SessionId => value as SessionId

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function header(id: string, parentSession?: SessionId): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: sid(id),
    createdAt: 1,
    cwd: '/workspace',
    isSeeded: false,
    delegationDepth: parentSession === undefined ? 0 : 1,
    ...parentSession === undefined ? {} : { parentSession },
  }
}

function artifact(id: string, content = `${id}\n`, parentSession?: SessionId): SessionInspection {
  return {
    meta: header(id, parentSession), inheritedEventCount: SessionLogOffset(0), events: [{
      type: 'user/message', seq: SessionSeq(0), time: 1, surfaceOp: 'append',
      data: createUserMessage({ content: [{ type: 'text', text: content }], source: { kind: 'user' } }),
    }],
  }
}

function lineageNode(id: string): SessionLineageNode {
  return {
    session: { header: header(id, sid('root')), live: false, persisted: true },
    descendants: [],
  }
}

interface Services {
  readonly root?: SessionInspection | undefined
  readonly readSnapshot?: (id: SessionId, signal?: AbortSignal) => Promise<SessionInspection | undefined>
  readonly traceSession?: (id: SessionId, signal?: AbortSignal) => Promise<{
    target: { header: SessionHeader; live: boolean; persisted: boolean }
    ancestors: readonly SessionLineageNode[]
    complete: boolean
    root: { header: SessionHeader; live: boolean; persisted: boolean }
    descendants: readonly SessionLineageNode[]
  }>
  readonly flush?: () => Promise<boolean>
}

function contextWithServices(services: Services = {}): Context {
  const ctx = new Context()
  ctx.provide('sessions', {
    get: (id: SessionId) => id === sid('root') ? { id } : undefined,
    flush: services.flush ?? (async () => true),
  } as never)
  ctx.provide('sessionPersistence', {
    open: async (id: SessionId, access: string, options?: { signal?: AbortSignal }) => {
      expect(access).toBe('read')
      const source = services.readSnapshot === undefined
        ? id === sid('root') ? services.root ?? artifact('root') : undefined
        : await services.readSnapshot(id, options?.signal)
      if (source === undefined) throw new SessionPersistenceNotFoundError(id)
      return {
        id, access, header: source.meta, inheritedEventCount: source.inheritedEventCount,
        read: async () => ({ eventState: 'detached', events: structuredClone(source.events) }),
        close: async () => {},
      }
    },
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

const attachment = {
  attachmentId: AttachmentId('sha256:' + 'a'.repeat(64)),
  mediaType: 'image/png',
  bytes: 3,
  width: 1,
  height: 1,
} satisfies ImageAttachmentRef

function markdownEvents(id: string): SessionEvent[] {
  const callId = ToolCallId(`${id}-call`)
  return [
    {
      type: 'user/message', seq: SessionSeq(0), time: 100,
      data: createUserMessage({
        content: [
          { type: 'text', text: 'Please inspect the workspace.' },
          { type: 'image', attachment },
        ],
        source: { kind: 'user' },
      }),
      surfaceOp: 'append',
    },
    {
      type: 'assistant/message', seq: SessionSeq(1), time: 110,
      data: { stream: [],
        turn: 1, step: 1,
        message: createMessage({
          role: 'assistant',
          content: [{ type: 'text', text: 'I will inspect the files now.' }],
          source: { kind: 'model', provider: 'fixture', model: 'fixture' },
        }),
      },
      surfaceOp: 'append',
    },
    {
      type: 'tool/call', seq: SessionSeq(2), time: 120,
      data: { turn: 1, step: 1, callId, name: 'read_file', arguments: '{"path":"/private/secret.txt","token":"DO_NOT_EXPORT"}' },
    },
    {
      type: 'tool/result', seq: SessionSeq(3), time: 130,
      data: {
        turn: 1, step: 1,
        message: createToolResultMessage({
          callId,
          content: [{ type: 'text', text: 'README.md contains the expected heading.' }],
          isError: false,
        }),
      },
      surfaceOp: 'append',
    },
  ]
}

describe('prepareSessionLogExport', () => {
  it('flushes a live root before reading its raw artifact', async () => {
    let flushed = false
    const ctx = contextWithServices({
      flush: async () => {
        flushed = true
        return true
      },
      readSnapshot: async () => {
        expect(flushed).toBe(true)
        return artifact('root', 'durable-after-flush\n')
      },
    })
    const prepared = await prepareSessionLogExport(ctx, sid('root'), new AbortController().signal)
    expect(prepared.root).toContain('durable-after-flush\\n')
  })

  it('exports logical logs without a raw-artifact capability and reports missing roots', async () => {
    const exported = await prepareSessionLogExport(contextWithServices(), sid('root'), new AbortController().signal)
    expect(exported.root).toContain('\"version\":3')

    const missing = contextWithServices({ readSnapshot: async () => undefined })
    await expect(prepareSessionLogExport(missing, sid('root'), new AbortController().signal))
      .rejects.toMatchObject({ code: 'session-not-found' })
  })

  it('preserves cancellation and sanitizes backend preparation failures', async () => {
    const controller = new AbortController()
    const cancellation = new Error('stop export')
    controller.abort(cancellation)
    await expect(prepareSessionLogExport(contextWithServices(), sid('root'), controller.signal))
      .rejects.toBe(cancellation)

    const ctx = contextWithServices({ readSnapshot: async () => { throw new Error('/private/session.jsonl') } })
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
    expect(strFromU8(files[SESSION_LOG_FILENAME] as Uint8Array)).toContain('exact raw text\\n')
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
      readSnapshot: async (id, signal) => {
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

describe('Session Markdown export', () => {
  it('renders human-visible messages and tool summaries without arguments or attachment bytes', async () => {
    const ctx = contextWithServices({
      readSnapshot: async id => ({
        meta: header(String(id)), inheritedEventCount: SessionLogOffset(0), events: markdownEvents(String(id)),
      }),
    })
    const markdown = await renderSessionMarkdown(
      sessionMarkdownExportDeps(ctx),
      { sessionId: sid('root'), includeDescendants: false, attachmentPolicy: 'reference' },
      new AbortController().signal,
    )

    expect(markdown).toContain('Please inspect the workspace.')
    expect(markdown).toContain('I will inspect the files now.')
    expect(markdown).toContain('### Tool: read_file')
    expect(markdown).toContain('README.md contains the expected heading.')
    expect(markdown).toContain('Arguments: omitted in summary export.')
    expect(markdown).toContain('attachment:sha256:')
    expect(markdown).toContain('Time: 1970-01-01T00:00:00.100Z')
    expect(markdown).not.toContain('DO_NOT_EXPORT')
    expect(markdown).not.toContain('/private/secret.txt')
  })

  it('projects recursive descendants and publishes collision-safe owner-only Markdown', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-markdown-'))
    roots.push(directory)
    await writeFile(join(directory, 'dsh-session-root.md'), 'existing')
    const childId = sid('child')
    const ctx = contextWithServices({
      readSnapshot: async id => ({
        meta: header(String(id), id === childId ? sid('root') : undefined),
        inheritedEventCount: SessionLogOffset(0),
        events: markdownEvents(String(id)),
      }),
      traceSession: async () => ({
        target: { header: header('root'), live: true, persisted: true },
        ancestors: [], complete: true,
        root: { header: header('root'), live: true, persisted: true },
        descendants: [lineageNode('child')],
      }),
    })
    const exporter = new SessionLogExporter(ctx, {})
    const result = await exporter.writeMarkdownToDirectory(
      { sessionId: sid('root'), includeDescendants: true, attachmentPolicy: 'reference' },
      directory,
      new AbortController().signal,
    )

    expect(result.filename).toBe('dsh-session-root-2.md')
    const markdown = await readFile(result.path, 'utf8')
    expect(markdown.match(/^## Session /gmu)).toHaveLength(2)
    expect(markdown).toContain('Session `child`')
    expect((await stat(result.path)).mode & 0o777).toBe(0o600)
    expect(await readdir(directory)).toEqual(['dsh-session-root-2.md', 'dsh-session-root.md'])
  })

  it('preserves cancellation and removes a partial Markdown publication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-session-markdown-cancel-'))
    roots.push(directory)
    let reportStarted!: (signal: AbortSignal) => void
    const started = new Promise<AbortSignal>((resolve) => { reportStarted = resolve })
    const ctx = contextWithServices({
      readSnapshot: async (_id, signal) => new Promise<SessionInspection>((_resolve, reject) => {
        if (signal === undefined) throw new Error('missing inspection signal')
        reportStarted(signal)
        signal.addEventListener('abort', () => { reject(signal.reason as Error) }, { once: true })
      }),
    })
    const exporter = new SessionLogExporter(ctx, {})
    const controller = new AbortController()
    const operation = exporter.writeMarkdownToDirectory(
      { sessionId: sid('root'), includeDescendants: false },
      directory,
      controller.signal,
    )
    const producerSignal = await started
    const cancellation = new Error('operator cancelled Markdown export')
    controller.abort(cancellation)

    await expect(operation).rejects.toBe(cancellation)
    expect(producerSignal.reason).toBe(cancellation)
    expect(await readdir(directory)).toEqual([])
  })

  it('sanitizes persistence failures before exposing them to the TUI', async () => {
    const exporter = new SessionLogExporter(contextWithServices({
      readSnapshot: async () => { throw new Error('/private/session.sqlite') },
    }), {})
    await expect(exporter.writeMarkdownToDirectory(
      { sessionId: sid('root'), includeDescendants: false },
      '/tmp',
      new AbortController().signal,
    )).rejects.toEqual(expect.objectContaining({
      code: 'prepare-failed',
      message: 'Session Markdown export failed to prepare the projection',
    }))
  })
})
