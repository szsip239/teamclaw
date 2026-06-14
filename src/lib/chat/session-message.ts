/**
 * Parse a v4 `session.message` event into the fields TeamClaw's chat UI needs.
 *
 * v4 session.message carries the full assistant/user turn as content blocks
 * (`thinking` | `toolCall` | `text`) plus `stopReason`. `stopReason==='stop'`
 * marks the final turn; `'toolUse'` marks an intermediate (staged) turn. This
 * is more authoritative than the legacy "has toolCalls?" heuristic and drives
 * the issue #13 staged/final display.
 */
export interface ParsedSessionMessage {
  messageId: string
  messageSeq: number
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls?: { toolName: string; toolInput: unknown }[]
  stopReason?: string
  /** True when this is the model's final turn (stopReason==='stop'). */
  isFinal: boolean
}

interface RawBlock {
  type?: string
  text?: string
  thinking?: string
  name?: string
  arguments?: unknown
}

export function parseSessionMessage(event: unknown): ParsedSessionMessage {
  const e = (event ?? {}) as Record<string, unknown>
  const msg = (e.message ?? {}) as Record<string, unknown>
  const role = msg.role === 'user' ? 'user' : 'assistant'
  const rawContent = msg.content
  const blocks: RawBlock[] = Array.isArray(rawContent) ? (rawContent as RawBlock[]) : []

  const text =
    typeof rawContent === 'string'
      ? rawContent
      : blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('')
  const thinkingParts = blocks.filter((b) => b.type === 'thinking').map((b) => b.thinking ?? '')
  const thinking = thinkingParts.length ? thinkingParts.join('\n') : undefined
  const toolCallBlocks = blocks.filter((b) => b.type === 'toolCall')
  const toolCalls = toolCallBlocks.length
    ? toolCallBlocks.map((b) => ({ toolName: b.name ?? 'tool', toolInput: b.arguments }))
    : undefined
  const stopReason = typeof msg.stopReason === 'string' ? msg.stopReason : undefined

  return {
    messageId: String(e.messageId ?? ''),
    messageSeq: typeof e.messageSeq === 'number' ? e.messageSeq : 0,
    role,
    text,
    ...(thinking ? { thinking } : {}),
    ...(toolCalls ? { toolCalls } : {}),
    ...(stopReason ? { stopReason } : {}),
    isFinal: stopReason === 'stop',
  }
}
