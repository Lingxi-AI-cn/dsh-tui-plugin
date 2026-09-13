/** Human-readable Markdown projection for durable Session history. */

import type { Context } from '@deepseek-ai/cordis'
import {
  foldSurface,
  type SessionEvent,
  type SessionHeader,
  type SessionId,
} from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { SessionLineageNode, SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { extractSessionEventText } from '@deepseek-ai/dsh-session-query'

/** Attachment policy supported by the summary Markdown export. */
export type SessionMarkdownAttachmentPolicy = 'reference'

/** Request for one human-readable Session projection. */
export interface SessionMarkdownExportRequest {
  /** Root Session identity. */
  readonly sessionId: SessionId
  /** Whether all known durable descendants are included. */
  readonly includeDescendants: boolean
  /** Attachment handling; references are explicit and bytes are never copied. */
  readonly attachmentPolicy?: SessionMarkdownAttachmentPolicy
}

/** Services required to build a Markdown projection. */
export interface SessionMarkdownExportDeps {
  readonly sessionQuery: SessionQueryEngine
  readonly sessionPersistence: SessionPersistence
  readonly sessions: SessionMarkdownSessionStore | undefined
}

/** Minimal live-session surface needed by the flush barrier. */
export interface SessionMarkdownSessionStore {
  get(id: SessionId): { id: SessionId } | undefined
  flush(session: { id: SessionId }): Promise<boolean>
}

/**
 * Resolve the Markdown projection services from a composed Host context.
 * @param ctx - composed Host context containing Session query and persistence services.
 * @returns the services used by Markdown projection.
 */
export function sessionMarkdownExportDeps(ctx: Context): SessionMarkdownExportDeps {
  const sessionQuery = ctx.get('sessionQuery')
  const sessionPersistence = ctx.get('sessionPersistence')
  if (sessionQuery === undefined || sessionPersistence === undefined) {
    throw new Error('session Markdown export requires session-query and session-persistence services')
  }
  return {
    sessionQuery,
    sessionPersistence,
    sessions: ctx.get('sessions'),
  }
}

/**
 * Build a safe suggested filename for one Markdown projection.
 * @param sessionId - Session identity included in the filename.
 * @returns a sanitized Markdown filename.
 */
export function sessionMarkdownFilename(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/gu, '_')
  return `dsh-session-${safe}.md`
}

interface MarkdownSource {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
}

const MAX_MARKDOWN_OUTPUT_CHARS = 4 * 1024 * 1024
const MAX_BLOCK_CHARS = 16 * 1024

/**
 * Render a bounded, summary-only Markdown document from one Session lineage.
 *
 * Raw event artifacts remain the source of truth in the ZIP export. This
 * projection intentionally omits tool argument values, includes bounded tool
 * result summaries, and emits attachment references without copying bytes.
 * @param deps - services used to load and query the Session lineage.
 * @param request - projection scope and attachment policy.
 * @param signal - cancellation signal for persistence and lineage reads.
 * @returns the bounded human-readable Markdown projection.
 */
export async function renderSessionMarkdown(
  deps: SessionMarkdownExportDeps,
  request: SessionMarkdownExportRequest,
  signal: AbortSignal,
): Promise<string> {
  const attachmentPolicy: unknown = request.attachmentPolicy
  if (attachmentPolicy !== undefined && attachmentPolicy !== 'reference') {
    throw new Error('unsupported Session Markdown attachment policy')
  }
  const sources: MarkdownSource[] = [await loadMarkdownSource(deps, request.sessionId, signal)]
  if (request.includeDescendants) {
    const lineage = await deps.sessionQuery.traceSession(request.sessionId, signal)
    const seen = new Set<SessionId>([request.sessionId])
    const append = async (nodes: readonly SessionLineageNode[]): Promise<void> => {
      for (const node of nodes) {
        signal.throwIfAborted()
        const id = node.session.header.id
        if (seen.has(id)) continue
        seen.add(id)
        sources.push(await loadMarkdownSource(deps, id, signal))
        await append(node.descendants)
      }
    }
    await append(lineage.descendants)
  }

  const lines = [
    '# DeepSeek Harness Session',
    '',
    `- Root Session: \`${safeInline(String(request.sessionId))}\``,
    `- Included descendants: ${request.includeDescendants ? 'yes' : 'no'}`,
    '- Export: human-readable Markdown projection; the raw ZIP remains the source-of-truth archive.',
    '- Tool arguments: omitted by default; only bounded result summaries are shown.',
    '- Attachments: reference-only (`attachment:<id>`); attachment bytes are not copied.',
    '',
  ]
  for (const [index, source] of sources.entries()) {
    signal.throwIfAborted()
    if (index > 0) lines.push('')
    lines.push(`## Session \`${safeInline(String(source.header.id))}\``)
    lines.push(`- Workspace: \`${safeInline(source.header.cwd ?? '(no workspace)')}\``)
    lines.push(`- Created: ${formatTime(source.header.createdAt)}`)
    lines.push('')
    appendSurface(lines, source.events)
  }
  const output = `${lines.join('\n').trimEnd()}\n`
  if (output.length > MAX_MARKDOWN_OUTPUT_CHARS) {
    return `${output.slice(0, MAX_MARKDOWN_OUTPUT_CHARS).trimEnd()}\n\n[Older Markdown content omitted at the export bound.]\n`
  }
  return output
}

async function loadMarkdownSource(
  deps: SessionMarkdownExportDeps,
  sessionId: SessionId,
  signal: AbortSignal,
): Promise<MarkdownSource> {
  signal.throwIfAborted()
  if (deps.sessions !== undefined) {
    const live = deps.sessions.get(sessionId)
    if (live !== undefined) await deps.sessions.flush(live)
  }
  signal.throwIfAborted()
  const handle = await deps.sessionPersistence.open(sessionId, 'read', { signal })
  try {
    const loaded = await handle.read(0, undefined, { signal })
    signal.throwIfAborted()
    return {
      header: structuredClone(handle.header),
      events: loaded.events.map(event => structuredClone(event)),
    }
  } finally {
    await handle.close()
  }
}

function appendSurface(lines: string[], events: readonly SessionEvent[]): void {
  const bySeq = new Map(events.map(event => [event.seq, event]))
  const calls = new Map<string, { name: string; arguments: string }>()
  for (const event of events) {
    if (event.type === 'tool/call') {
      calls.set(String(event.data.callId), { name: event.data.name, arguments: event.data.arguments })
    }
  }
  const surface = foldSurface(events).nodes
  let rendered = 0
  for (const seq of surface) {
    const event = bySeq.get(seq)
    if (event === undefined) continue
    const renderedLines = renderSurfaceEvent(event, calls)
    if (renderedLines.length === 0) continue
    if (rendered > 0) lines.push('')
    lines.push(...renderedLines)
    rendered += 1
  }
  if (rendered === 0) lines.push('_No human-visible surface events._')
}

function renderSurfaceEvent(
  event: SessionEvent,
  calls: ReadonlyMap<string, { name: string; arguments: string }>,
): readonly string[] {
  if (event.type === 'user/message') {
    const role = event.data.source.kind === 'user' ? 'User' : 'Context'
    return renderMessage(role, event.seq, event.time, extractSessionEventText(event), event.data.content)
  }
  if (event.type === 'assistant/message') {
    return renderMessage('Assistant', event.seq, event.time, extractSessionEventText(event), event.data.message.content)
  }
  if (event.type !== 'tool/result') return []

  const callId = String(event.data.message.source.callId)
  const call = calls.get(callId)
  const result = boundedText(extractSessionEventText(event), MAX_BLOCK_CHARS)
  const lines = [
    `### Tool: ${safeInline(call?.name ?? `call ${callId}`)}`,
    `- Sequence: ${event.seq}`,
    `- Time: ${formatTime(event.time)}`,
    '- Arguments: omitted in summary export.',
    `- Outcome: ${event.data.error === undefined ? 'completed' : 'error'}`,
    'Result summary:',
    ...fenced(result.text),
  ]
  if (result.truncated) lines.push('[Tool result summary truncated at the export bound.]')
  appendAttachmentReferences(lines, event.data.message.content)
  return lines
}

function renderMessage(
  role: string,
  seq: number,
  time: number,
  text: string,
  content: readonly unknown[],
): readonly string[] {
  const bounded = boundedText(text, MAX_BLOCK_CHARS)
  if (bounded.text === '' && attachmentIds(content).length === 0) return []
  const lines = [`### ${role}`, `- Sequence: ${seq}`, `- Time: ${formatTime(time)}`]
  if (bounded.text !== '') lines.push(...blockquote(bounded.text))
  if (bounded.truncated) lines.push('[Message content truncated at the export bound.]')
  appendAttachmentReferences(lines, content)
  return lines
}

function appendAttachmentReferences(lines: string[], content: readonly unknown[]): void {
  const ids = attachmentIds(content)
  if (ids.length === 0) return
  lines.push(`- Attachments (reference-only): ${ids.map(id => `\`attachment:${safeInline(id)}\``).join(', ')}`)
}

function attachmentIds(value: unknown): string[] {
  const ids = new Set<string>()
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item)
      return
    }
    if (typeof current !== 'object' || current === null) return
    const record = current as { type?: unknown; attachment?: unknown; content?: unknown }
    if (record.type === 'image' && typeof record.attachment === 'object' && record.attachment !== null) {
      const id = (record.attachment as { attachmentId?: unknown }).attachmentId
      if (typeof id === 'string' || typeof id === 'number') ids.add(String(id))
    }
    visit(record.content)
  }
  visit(value)
  return [...ids]
}

function boundedText(value: string, maxChars: number): { text: string; truncated: boolean } {
  const safe = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, '�')
    .replace(/\r\n?/gu, '\n')
    .trim()
  if (safe.length <= maxChars) return { text: safe, truncated: false }
  return { text: `${safe.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`, truncated: true }
}

function blockquote(value: string): string[] {
  return value.split('\n').map(line => line === '' ? '>' : `> ${line}`)
}

function fenced(value: string): string[] {
  const longest = Math.max(0, ...value.match(/`+/gu)?.map(match => match.length) ?? [])
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return [fence, value === '' ? '[empty]' : value, fence]
}

function safeInline(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/gu, '�')
    .replace(/`/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim() || '(unknown)'
}

function formatTime(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString()
}
