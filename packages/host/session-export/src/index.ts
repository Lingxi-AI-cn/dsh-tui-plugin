/**
 * Native Session-log export service: reuses the official canonical ZIP stream
 * and publishes complete archives into a host directory without exposing a
 * partial final file.
 * @module @lingxi-ai-cn/dsh-session-export
 */

import { randomUUID } from 'node:crypto'
import { link, open, rm, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRawArtifact } from '@deepseek-ai/dsh-session-persistence'
import {
  DEFAULT_SESSION_LOG_COMPRESSION_LEVEL,
  flushLiveSessionLog,
  sessionLogExportDeps,
  sessionLogZipFilename,
  streamSessionLogZip,
  type SessionLogCompressionLevel,
  type SessionLogExportReady,
} from '@deepseek-ai/dsh-session-log-export'
import {
  renderSessionMarkdown,
  sessionMarkdownExportDeps,
  sessionMarkdownFilename,
} from './markdown.ts'
import type { SessionMarkdownExportRequest } from './markdown.ts'

export {
  DEFAULT_SESSION_LOG_COMPRESSION_LEVEL,
  flushLiveSessionLog,
  sessionLogExportDeps,
  sessionLogZipEntries,
  sessionLogZipFilename,
  streamSessionLogZip,
} from '@deepseek-ai/dsh-session-log-export'
export type {
  SessionLogCompressionLevel,
  SessionLogExportDeps,
  SessionLogExportReady,
  SessionLogZipEntry,
} from '@deepseek-ai/dsh-session-log-export'
export {
  renderSessionMarkdown,
  sessionMarkdownExportDeps,
  sessionMarkdownFilename,
} from './markdown.ts'
export type {
  SessionMarkdownAttachmentPolicy,
  SessionMarkdownExportDeps,
  SessionMarkdownExportRequest,
  SessionMarkdownSessionStore,
} from './markdown.ts'

/** Stable failure categories shared by the native writer and host transports. */
export type SessionLogExportErrorCode =
  | 'services-unavailable'
  | 'raw-artifacts-unsupported'
  | 'session-not-found'
  | 'prepare-failed'
  | 'destination-invalid'
  | 'write-failed'

/** Typed session-log export failure with a consumer-safe message. */
export class SessionLogExportError extends Error {
  /**
   * @param code - stable failure category.
   * @param message - safe operator-facing description.
   * @param options - optional private cause retained for host diagnostics.
   */
  constructor(
    readonly code: SessionLogExportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SessionLogExportError'
  }
}

/** Prepared root artifact and mounted services for one export operation. */
export interface PreparedSessionLogExport {
  /** Mounted services used while descendant and attachment entries stream. */
  readonly ready: SessionLogExportReady
  /** Root artifact already flushed and read for the first ZIP entry. */
  readonly root: SessionRawArtifact
}

/** One export request independent of its transport or destination. */
export interface SessionLogExportRequest {
  /** Root Session whose stored artifact is exported. */
  readonly sessionId: SessionId
  /** Whether all durable descendant artifacts are included. */
  readonly includeDescendants: boolean
}

/** Prepared streaming result for a transport consumer. */
export interface SessionLogExportStream {
  /** Safe suggested archive filename. */
  readonly filename: string
  /** Bounded ZIP byte stream; cancellation aborts the producer. */
  readonly stream: ReadableStream<Uint8Array>
}

/** Completed native export result. */
export interface SessionLogExportFile {
  /** Absolute path atomically published after the ZIP completed. */
  readonly path: string
  /** Published base filename, including a collision suffix when required. */
  readonly filename: string
}

/** Host session-log exporter configuration. */
export interface Config {
  /**
   * DEFLATE level for ZIP entries. Zero stores, one favors latency, and nine
   * favors archive size.
   * @default 6
   */
  readonly compressionLevel?: SessionLogCompressionLevel
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-owned Session ZIP stream and native file writer. */
    sessionLogExporter: SessionLogExporter
  }
}

/**
 * Flush and read the root artifact before any ZIP byte is produced. Expected
 * capability and persistence failures use {@link SessionLogExportError}; an
 * aborted signal preserves its original reason.
 * @param ctx - composed host context.
 * @param sessionId - root Session identity.
 * @param signal - operation cancellation.
 * @returns the mounted services and root artifact ready for streaming.
 */
export async function prepareSessionLogExport(
  ctx: Context,
  sessionId: SessionId,
  signal: AbortSignal,
): Promise<PreparedSessionLogExport> {
  signal.throwIfAborted()
  const deps = sessionLogExportDeps(ctx)
  if (deps.sessionQuery === undefined || deps.sessionPersistence === undefined || deps.attachments === undefined) {
    throw new SessionLogExportError(
      'services-unavailable',
      'session log export is unavailable: missing session-query, session-persistence, or attachments service',
    )
  }
  if (!deps.sessionPersistence.supportsRawArtifacts) {
    throw new SessionLogExportError(
      'raw-artifacts-unsupported',
      'session log export is unavailable: the persistence backend does not expose per-session raw artifacts',
    )
  }
  const ready: SessionLogExportReady = {
    sessionQuery: deps.sessionQuery,
    sessionPersistence: deps.sessionPersistence,
    attachments: deps.attachments,
    sessions: deps.sessions,
  }
  let root: SessionRawArtifact | undefined
  try {
    await flushLiveSessionLog(deps, sessionId, signal)
    root = await deps.sessionPersistence.readRaw(sessionId, signal)
    signal.throwIfAborted()
  } catch (error) {
    signal.throwIfAborted()
    throw new SessionLogExportError(
      'prepare-failed',
      'session log export failed to prepare the stored artifact',
      { cause: error },
    )
  }
  if (root === undefined) {
    throw new SessionLogExportError('session-not-found', 'session not found')
  }
  return { ready, root }
}

/** Write a complete chunk even when the host returns a short write. */
async function writeChunk(file: FileHandle, chunk: Uint8Array, signal: AbortSignal): Promise<void> {
  let offset = 0
  while (offset < chunk.byteLength) {
    signal.throwIfAborted()
    const { bytesWritten } = await file.write(chunk, offset, chunk.byteLength - offset)
    if (bytesWritten === 0) throw new Error('session log export made no progress writing the archive')
    offset += bytesWritten
  }
}

/** Candidate filename that retains the extension while avoiding an existing export. */
function collisionFilename(filename: string, collision: number): string {
  if (collision === 0) return filename
  const extension = extname(filename)
  const stem = basename(filename, extension)
  return `${stem}-${collision + 1}${extension}`
}

/** Publish a completed private temp inode under the first available final name. */
async function publishExclusive(
  tempPath: string,
  directory: string,
  filename: string,
  signal: AbortSignal,
): Promise<SessionLogExportFile> {
  for (let collision = 0; collision < 10_000; collision += 1) {
    signal.throwIfAborted()
    const candidate = collisionFilename(filename, collision)
    const target = join(directory, candidate)
    try {
      await link(tempPath, target)
      try {
        await rm(tempPath)
      } catch {
        // The final hard link is already committed; a private sibling link is
        // harmless residue and must not turn a successful export into failure.
      }
      return { path: target, filename: candidate }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
  }
  throw new Error(`session log export exhausted collision suffixes for ${filename}`)
}

/** Host service shared by terminal and programmatic Session export consumers. */
export default class SessionLogExporter extends Service {
  static inject = ['attachments', 'sessionPersistence', 'sessionQuery', 'sessions']

  static Config: z<Config> = z.object({
    compressionLevel: z.number().step(1).min(0).max(9)
      .default(DEFAULT_SESSION_LOG_COMPRESSION_LEVEL) as z<SessionLogCompressionLevel>,
  })

  private readonly compressionLevel: SessionLogCompressionLevel

  constructor(ctx: Context, config: Config) {
    super(ctx, 'sessionLogExporter')
    this.compressionLevel = config.compressionLevel ?? DEFAULT_SESSION_LOG_COMPRESSION_LEVEL
  }

  /**
   * Prepare and expose one bounded ZIP byte stream.
   * @param request - root identity and descendant policy.
   * @param signal - producer lifetime; consumer cancellation is combined with it.
   * @returns suggested filename and archive stream after root preflight succeeds.
   */
  async stream(request: SessionLogExportRequest, signal: AbortSignal): Promise<SessionLogExportStream> {
    const prepared = await prepareSessionLogExport(this.ctx, request.sessionId, signal)
    return {
      filename: sessionLogZipFilename(request.sessionId),
      stream: streamSessionLogZip(
        prepared.ready,
        prepared.root,
        request.sessionId,
        request.includeDescendants,
        this.compressionLevel,
        signal,
      ),
    }
  }

  /**
   * Stream one archive to a private sibling file and publish it atomically under
   * the first available safe filename. Existing exports are never overwritten.
   * The destination must be an existing absolute directory. Cancellation or a
   * producer/write failure removes the partial file and publishes nothing.
   * @param request - root identity and descendant policy.
   * @param directory - existing absolute host directory chosen by the operator.
   * @param signal - complete preparation, streaming, and publication lifetime.
   * @returns the exact published path and filename.
   */
  async writeToDirectory(
    request: SessionLogExportRequest,
    directory: string,
    signal: AbortSignal,
  ): Promise<SessionLogExportFile> {
    signal.throwIfAborted()
    if (!isAbsolute(directory)) {
      throw new SessionLogExportError('destination-invalid', 'session log export destination must be an absolute directory')
    }
    try {
      if (!(await stat(directory)).isDirectory()) {
        throw new Error('destination is not a directory')
      }
    } catch (error) {
      throw new SessionLogExportError(
        'destination-invalid',
        `session log export destination is not an accessible directory: ${directory}`,
        { cause: error },
      )
    }

    const prepared = await this.stream(request, signal)
    const tempPath = join(directory, `.${prepared.filename}.${randomUUID()}.tmp`)
    let file: FileHandle | undefined
    const reader = prepared.stream.getReader()
    try {
      file = await open(tempPath, 'wx', 0o600)
      for (;;) {
        signal.throwIfAborted()
        const chunk = await reader.read()
        if (chunk.done) break
        await writeChunk(file, chunk.value, signal)
      }
      signal.throwIfAborted()
      await file.sync()
      await file.close()
      file = undefined
      return await publishExclusive(tempPath, directory, prepared.filename, signal)
    } catch (error) {
      try {
        await reader.cancel(error)
      } catch {
        // The producer may already have failed with the same cause.
      }
      try {
        await file?.close()
      } catch {
        // Cleanup continues with unlink; close failure is secondary to the export failure.
      }
      await rm(tempPath, { force: true })
      signal.throwIfAborted()
      if (error instanceof SessionLogExportError) throw error
      throw new SessionLogExportError('write-failed', 'session log export failed while writing the archive', { cause: error })
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Render a summary-only human-readable Markdown projection and publish it
   * atomically under the first available safe filename. The official raw ZIP
   * remains the diagnostic source of truth; tool arguments are omitted and
   * attachment bytes are never copied into the Markdown file.
   * @param request - root identity, descendant policy, and explicit attachment policy.
   * @param directory - existing absolute host directory chosen by the operator.
   * @param signal - complete projection, writing, and publication lifetime.
   * @returns the exact published Markdown path and filename.
   */
  async writeMarkdownToDirectory(
    request: SessionMarkdownExportRequest,
    directory: string,
    signal: AbortSignal,
  ): Promise<SessionLogExportFile> {
    signal.throwIfAborted()
    if (!isAbsolute(directory)) {
      throw new SessionLogExportError('destination-invalid', 'Session Markdown export destination must be an absolute directory')
    }
    try {
      if (!(await stat(directory)).isDirectory()) {
        throw new Error('destination is not a directory')
      }
    } catch (error) {
      throw new SessionLogExportError(
        'destination-invalid',
        `Session Markdown export destination is not an accessible directory: ${directory}`,
        { cause: error },
      )
    }

    let markdown: string
    try {
      markdown = await renderSessionMarkdown(sessionMarkdownExportDeps(this.ctx), request, signal)
      signal.throwIfAborted()
    } catch (error) {
      signal.throwIfAborted()
      throw new SessionLogExportError(
        'prepare-failed',
        'Session Markdown export failed to prepare the projection',
        { cause: error },
      )
    }

    const filename = sessionMarkdownFilename(request.sessionId)
    const tempPath = join(directory, `.${filename}.${randomUUID()}.tmp`)
    let file: FileHandle | undefined
    try {
      file = await open(tempPath, 'wx', 0o600)
      await writeChunk(file, new TextEncoder().encode(markdown), signal)
      signal.throwIfAborted()
      await file.sync()
      await file.close()
      file = undefined
      return await publishExclusive(tempPath, directory, filename, signal)
    } catch (error) {
      try {
        await file?.close()
      } catch {
        // Cleanup continues with unlink; close failure is secondary to the export failure.
      }
      await rm(tempPath, { force: true })
      signal.throwIfAborted()
      if (error instanceof SessionLogExportError) throw error
      throw new SessionLogExportError('write-failed', 'Session Markdown export failed while writing the projection', { cause: error })
    }
  }
}
