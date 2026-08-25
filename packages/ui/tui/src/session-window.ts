/** Shared append-prefix identity window for Session-derived terminal projections. */

/** One projection update boundary over the current durable Session-event prefix. */
export interface TuiSessionWindowUpdate {
  readonly reset: boolean
  readonly startIndex: number
}

/**
 * Track only prefix identity and position; target projections retain their own semantic state.
 * A reconnect, replay replacement, prepend, or truncation returns a full rebuild boundary.
 */
export class TuiAppendOnlySessionWindow<Event extends object> {
  private eventCount = 0
  private firstEvent: Event | undefined
  private lastEvent: Event | undefined

  /**
   * Compare one current event array with the committed append-only prefix.
   * @param events - current durable event array.
   * @param forceReset - whether the consumer lost its semantic state.
   * @returns append start or a full rebuild boundary.
   */
  begin(events: readonly Event[], forceReset = false): TuiSessionWindowUpdate {
    const prefixMatches = this.eventCount === 0 || events.length >= this.eventCount
      && events[0] === this.firstEvent
      && events[this.eventCount - 1] === this.lastEvent
    if (forceReset || !prefixMatches) {
      this.eventCount = 0
      this.firstEvent = undefined
      this.lastEvent = undefined
      return { reset: true, startIndex: 0 }
    }
    return { reset: false, startIndex: this.eventCount }
  }

  /**
   * Commit the identity boundary after a projection consumes the array.
   * @param events - completely consumed current durable event array.
   */
  commit(events: readonly Event[]): void {
    this.eventCount = events.length
    this.firstEvent = events[0]
    this.lastEvent = events.at(-1)
  }

  /** Forget the committed prefix so the next update rebuilds from zero. */
  reset(): void {
    this.eventCount = 0
    this.firstEvent = undefined
    this.lastEvent = undefined
  }
}
