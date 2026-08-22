/** Pure timing transition for the idle TUI double-Escape rewind gesture. */

/** Maximum interval between Escape presses that forms one rewind gesture. */
export const TUI_DOUBLE_ESCAPE_WINDOW_MS = 500

/** Result of consuming one standalone Escape for the double-Escape gesture. */
export interface TuiDoubleEscapeTransition {
  /** Whether this Escape completed the gesture. */
  readonly triggered: boolean
  /** Timestamp to retain for a possible subsequent Escape. */
  readonly lastEscapeAt?: number
}

/**
 * Consume one Escape timestamp without owning any UI or command state.
 * @param now - current timestamp in milliseconds.
 * @param lastEscapeAt - timestamp retained from the previous eligible Escape.
 * @param windowMs - maximum interval accepted between the two presses.
 * @returns whether the gesture fired and the timestamp to retain.
 */
export function consumeTuiDoubleEscape(
  now: number,
  lastEscapeAt: number | undefined,
  windowMs = TUI_DOUBLE_ESCAPE_WINDOW_MS,
): TuiDoubleEscapeTransition {
  if (lastEscapeAt !== undefined && now >= lastEscapeAt && now - lastEscapeAt <= windowMs) {
    return { triggered: true }
  }
  return { triggered: false, lastEscapeAt: now }
}
