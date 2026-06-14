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
  // Non-prefix replacement: use deltaText as the authoritative replacement.
  if (input.replace) {
    return {
      text: input.deltaText ?? '',
      replace: true,
      nextLast: input.cumulative,
    }
  }
  // When we already have partial text (e.g. from agent item preamble events),
  // slice the cumulative remainder instead of emitting the full deltaText.
  const sliced = input.cumulative.slice(input.lastEmitted.length)
  if (sliced) {
    return { text: sliced, replace: false, nextLast: input.cumulative }
  }
  // No new cumulative text.  v4 deltaText may still carry an increment — use
  // it directly, but only when we haven't already seen this content.
  if (typeof input.deltaText === 'string') {
    return {
      text: input.deltaText,
      replace: false,
      nextLast: input.cumulative,
    }
  }
  return { text: '', replace: false, nextLast: input.cumulative }
}
