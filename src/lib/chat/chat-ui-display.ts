import type { ChatMessage } from '@/types/chat'
import { selectChatDisplay, type ChatDisplay, type DisplayTurn } from './chat-display'

export interface AssistantUiDisplay extends ChatDisplay {
  stagedToolName?: string
}

function stringifyToolInput(input: unknown): string {
  if (input == null || input === '') return ''
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

function turnFromMessage(message: ChatMessage, isFinal: boolean): DisplayTurn {
  return {
    text: message.content,
    toolCalls: message.toolCalls,
    isFinal,
  }
}

export function selectAssistantUiDisplay(
  message: ChatMessage,
  opts: { isStreaming: boolean; processSteps?: ChatMessage[] },
): AssistantUiDisplay {
  const turns: DisplayTurn[] = [
    ...(opts.processSteps ?? []).map((step) => turnFromMessage(step, false)),
    turnFromMessage(
      message,
      typeof message.isFinal === 'boolean' ? message.isFinal : !opts.isStreaming,
    ),
  ].filter((turn) => turn.text || (turn.toolCalls?.length ?? 0) > 0)

  const display = selectChatDisplay(turns)
  if (display.finalText || display.stagedText) return display
  if (message.error) return display

  const lastTool = display.toolCalls.at(-1)
  const stagedText = stringifyToolInput(lastTool?.toolInput)
  return {
    ...display,
    stagedText: stagedText || null,
    stagedToolName: stagedText ? lastTool?.toolName : undefined,
  }
}
