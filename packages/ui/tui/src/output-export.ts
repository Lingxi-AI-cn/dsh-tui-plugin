/** Host-filesystem export of one assistant segment or complete response as standalone Markdown. */

import { resolve } from 'node:path'
import { FsError, type FileSystem } from './host.ts'

const OUTPUT_EXPORT_ATTEMPTS = 100

/** Standalone Markdown artifact scope selected by the Output Reader. */
export type TuiOutputExportKind = 'output' | 'response'

/** Result returned to the mounted detail surface after one export request. */
export type TuiOutputExportResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly message?: string | undefined }

/**
 * Normalize one terminal-safe assistant output for a standalone Markdown file.
 * @param text - complete raw Markdown retained by the transcript projection.
 * @returns the same content with exactly one final line ending.
 */
export function tuiOutputMarkdown(text: string): string {
  return `${text.replace(/\n+$/u, '')}\n`
}

/**
 * Resolve a collision-resistant output path inside the active Session workspace.
 * @param workspace - absolute Session working directory.
 * @param now - timestamp used for deterministic ordering and tests.
 * @param attempt - zero-based collision suffix.
 * @param kind - current segment output or complete response artifact family.
 * @returns absolute `.md` output path.
 */
export function resolveTuiOutputExportPath(
  workspace: string,
  now: number,
  attempt = 0,
  kind: TuiOutputExportKind = 'output',
): string {
  const timestamp = new Date(now).toISOString().replace(/[-:.]/gu, '')
  const suffix = attempt <= 0 ? '' : `-${attempt + 1}`
  return resolve(workspace, `dsh-${kind}-${timestamp}${suffix}.md`)
}

/**
 * Atomically create one output Markdown file through the composed Host filesystem owner.
 * @param fs - active Host filesystem capability.
 * @param workspace - absolute Session workspace used for path confinement.
 * @param text - complete assistant Markdown output.
 * @param now - timestamp shared across bounded collision retries.
 * @param kind - current segment output or complete response artifact family.
 * @returns created path, or one safe failure for the detail surface.
 */
export async function writeTuiOutputMarkdown(
  fs: FileSystem,
  workspace: string,
  text: string,
  now = Date.now(),
  kind: TuiOutputExportKind = 'output',
): Promise<TuiOutputExportResult> {
  for (let attempt = 0; attempt < OUTPUT_EXPORT_ATTEMPTS; attempt += 1) {
    const path = resolveTuiOutputExportPath(workspace, now, attempt, kind)
    try {
      const target = await fs.resolve(path, { cwd: workspace })
      await fs.writeText(target, tuiOutputMarkdown(text), { kind: 'createIfAbsent' })
      return { ok: true, path }
    } catch (error: unknown) {
      if (error instanceof FsError && error.code === 'FS_NOT_OBSERVED') continue
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
  return { ok: false, message: 'Could not allocate a unique Markdown output path.' }
}
