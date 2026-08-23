/** Pure compact feedback projections derived from durable Session events. */

import type { SessionEvent, SessionStatsProjection } from './host.ts'

const TREND_CELLS = '▁▂▃▄▅▆▇█'
const TREND_BUCKETS = 6
const ESTIMATED_CHARACTERS_PER_TOKEN = 4

/** Latest settled or live decode-speed sample shown in the footer. */
export interface TuiSpeedProjection {
  /** Tokens per second for the latest model step or settled Session average. */
  readonly tokensPerSecond: number
  /** Whether output tokens were estimated from streamed characters. */
  readonly approximate: boolean
  /** Fixed-width recent speed trend; empty when no stream distribution exists. */
  readonly trend: string
  /** Output tokens counted or estimated for this sample. */
  readonly tokens: number
  /** Decode interval used by the sample. */
  readonly elapsedMs: number
}

function deltaCharacters(event: SessionEvent): number {
  if (event.type !== 'assistant/chunk') return 0
  const chunk = event.data.chunk
  if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return chunk.text.length
  if (chunk.type === 'tool-call-delta') {
    return chunk.argumentsDelta.length + (chunk.name?.length ?? 0)
  }
  return 0
}

function speedTrend(chunks: readonly SessionEvent[], start: number, end: number): string {
  const duration = Math.max(1, end - start)
  const buckets = Array.from({ length: TREND_BUCKETS }, () => 0)
  for (const event of chunks) {
    const characters = deltaCharacters(event)
    if (characters === 0) continue
    const ratio = Math.min(0.999_999, Math.max(0, (event.time - start) / duration))
    const index = Math.floor(ratio * TREND_BUCKETS)
    buckets[index] = (buckets[index] ?? 0) + characters / ESTIMATED_CHARACTERS_PER_TOKEN
  }
  const maximum = Math.max(...buckets)
  if (maximum <= 0) return ''
  return buckets.map((value) => {
    const index = value <= 0 ? 0 : Math.max(0, Math.ceil((value / maximum) * TREND_CELLS.length) - 1)
    return TREND_CELLS[index] ?? TREND_CELLS[0]
  }).join('')
}

/**
 * Project the latest model step into a compact speed sample.
 * A completed step uses provider-reported output tokens; an open stream uses the same explicit
 * four-characters-per-token heuristic as the Host meter and is marked approximate.
 * @param events - complete durable Session events in sequence order.
 * @param now - current timestamp used for an open stream.
 * @returns latest-step speed, or `undefined` before output arrives.
 */
export function projectTuiLatestSpeed(
  events: readonly SessionEvent[],
  now: number = Date.now(),
): TuiSpeedProjection | undefined {
  const stepIndex = events.findLastIndex(event => event.type === 'step/start')
  const stepStart = events[stepIndex]
  if (stepStart?.type !== 'step/start') return undefined
  const { turn, step } = stepStart.data
  const following = events.slice(stepIndex + 1)
  const chunks = following.filter(event => event.type === 'assistant/chunk'
    && event.data.turn === turn && event.data.step === step && deltaCharacters(event) > 0)
  const first = chunks[0]
  if (first === undefined) return undefined
  const completed = following.find(event => event.type === 'assistant/message'
    && event.data.turn === turn && event.data.step === step)
  const end = completed?.time ?? Math.max(first.time, now)
  const elapsedMs = Math.max(250, end - first.time)
  const exactTokens = completed?.type === 'assistant/message'
    && typeof completed.data.usage?.outputTokens === 'number'
    && Number.isFinite(completed.data.usage.outputTokens)
    && completed.data.usage.outputTokens >= 0
    ? completed.data.usage.outputTokens
    : undefined
  const estimatedTokens = Math.ceil(chunks.reduce((total, event) => total + deltaCharacters(event), 0)
    / ESTIMATED_CHARACTERS_PER_TOKEN)
  const tokens = exactTokens ?? estimatedTokens
  if (tokens <= 0) return undefined
  return Object.freeze({
    tokensPerSecond: tokens * 1_000 / elapsedMs,
    approximate: exactTokens === undefined,
    trend: speedTrend(chunks, first.time, end),
    tokens,
    elapsedMs,
  })
}

/**
 * Use the authoritative whole-Session decode sample when no latest-step stream is available.
 * @param stats - settled Session timing projection.
 * @returns settled speed, or `undefined` before a valid decode sample exists.
 */
export function projectTuiSettledSpeed(
  stats: SessionStatsProjection | undefined,
): TuiSpeedProjection | undefined {
  if (stats === undefined || stats.decodeTokens <= 0 || stats.decodeMs <= 0) return undefined
  return Object.freeze({
    tokensPerSecond: stats.decodeTokens * 1_000 / stats.decodeMs,
    approximate: false,
    trend: '',
    tokens: stats.decodeTokens,
    elapsedMs: stats.decodeMs,
  })
}
