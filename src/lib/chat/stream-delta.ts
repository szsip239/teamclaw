/**
 * Compute what text to emit to the SSE stream for one v4 chat `delta` event.
 *
 * v4 chat deltas carry `deltaText` (the increment) alongside `message` (the
 * cumulative assistant snapshot). Non-prefix replacements set `replace=true`
 * and use `deltaText` as the replacement text. This pure function centralizes
 * that contract so the SSE route stays thin and the logic is unit-testable.
 */
export interface DeltaInput {
  /** v4 increment; absent on legacy/edge events. */
  deltaText?: string
  /** v4 non-prefix replacement flag. */
  replace?: boolean
  /** Cumulative assistant text snapshot (extractTextFromMessage(evt.message)). */
  cumulative: string
  /** Cumulative text emitted so far (for the no-deltaText fallback). */
  lastEmitted: string
}

export interface DeltaOutput {
  /** Text to write to the stream (empty string = nothing to emit). */
  text: string
  /** Whether the frontend should replace the rendered text instead of appending. */
  replace: boolean
  /** New cumulative-emitted value to carry into the next event. */
  nextLast: string
}

export function computeTextDelta(input: DeltaInput): DeltaOutput {
  if (typeof input.deltaText === 'string') {
    return {
      text: input.deltaText,
      replace: input.replace === true,
      nextLast: input.cumulative,
    }
  }
  // Fallback (no deltaText): slice the cumulative snapshot. Defensive — v4
  // always carries deltaText, but legacy/edge events may not.
  return {
    text: input.cumulative.slice(input.lastEmitted.length),
    replace: false,
    nextLast: input.cumulative,
  }
}
