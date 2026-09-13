/** Bounded Session activity reads retain failures on their individual picker rows. */

import type { SessionRecord } from './host.ts'

/** Activity metadata or the storage failure that disables one Session row. */
export type TuiResumeActivityResolution =
  | { readonly time: number | undefined; readonly failure?: undefined }
  | { readonly time?: undefined; readonly failure: unknown }

/**
 * Read activity without letting one incompatible Session discard the roster.
 * @param records - listed Session records in result order.
 * @param read - owning runtime's live or persisted activity reader.
 * @param signal - scan cancellation, which must still reject the entire operation.
 * @param concurrency - positive maximum number of simultaneous activity reads.
 * @returns one activity value or read failure per listed Session.
 */
export async function collectTuiResumeActivity(
  records: readonly SessionRecord[],
  read: (record: SessionRecord) => Promise<number | undefined>,
  signal: AbortSignal,
  concurrency: number,
): Promise<TuiResumeActivityResolution[]> {
  const resolutions = new Array<TuiResumeActivityResolution>(records.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      signal.throwIfAborted()
      const index = cursor
      if (index >= records.length) return
      cursor += 1
      try {
        resolutions[index] = { time: await read(records[index] as SessionRecord) }
      } catch (failure: unknown) {
        signal.throwIfAborted()
        resolutions[index] = { failure }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, records.length) }, () => worker()))
  signal.throwIfAborted()
  return resolutions
}
