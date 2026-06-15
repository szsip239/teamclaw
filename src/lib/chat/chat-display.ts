/**
 * Select what to render for a v4 chat turn group, per issue #13:
 *   - thinking: dropped (never rendered)
 *   - tool calls: kept (all turns merged)
 *   - staged reply: only the LATEST non-final turn's text (overwrite, not accrue)
 *   - final reply: the final turn's text, which replaces the staged area
 *
 * Pure function over already-parsed turns (see parseSessionMessage). Drives the
 * chat-assistant-message render without it owning the staged/final logic.
 */
export interface DisplayTurn {
  text: string
  toolCalls?: { toolName: string; toolInput: unknown }[]
  isFinal: boolean
}

export interface ChatDisplay {
  toolCalls: { toolName: string; toolInput: unknown }[]
  /** Latest in-progress reply (null once the final reply exists). */
  stagedText: string | null
  /** Final reply text (null while still running). */
  finalText: string | null
}

export function selectChatDisplay(turns: DisplayTurn[]): ChatDisplay {
  const toolCalls = turns.flatMap((t) => t.toolCalls ?? [])
  const final = turns.find((t) => t.isFinal)
  const staged = [...turns].reverse().find((t) => !t.isFinal && t.text)
  return {
    toolCalls,
    stagedText: final ? null : (staged?.text ?? null),
    finalText: final?.text ?? null,
  }
}
