import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/chat'
import { selectAssistantUiDisplay } from './chat-ui-display'

function assistant(content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `a-${content}`,
    role: 'assistant',
    content,
    createdAt: '2026-06-15T00:00:00.000Z',
    ...extra,
  }
}

describe('assistant UI display selection', () => {
  it('replaces staged toolUse text with the final assistant reply', () => {
    const display = selectAssistantUiDisplay(
      assistant('当前目录下有 6 个文件', { isFinal: true, stopReason: 'stop' }),
      {
        isStreaming: false,
        processSteps: [
          assistant('正在查看目录', {
            isFinal: false,
            stopReason: 'toolUse',
            toolCalls: [{ toolName: 'exec', toolInput: { command: 'ls' } }],
          }),
        ],
      },
    )

    expect(display.finalText).toBe('当前目录下有 6 个文件')
    expect(display.stagedText).toBe(null)
    expect(display.toolCalls).toEqual([{ toolName: 'exec', toolInput: { command: 'ls' } }])
  })

  it('uses the latest tool input as staged text while streaming has no model text', () => {
    const display = selectAssistantUiDisplay(
      assistant('', {
        toolCalls: [{ toolName: 'exec', toolInput: { command: 'ls' } }],
      }),
      { isStreaming: true },
    )

    expect(display.finalText).toBe(null)
    expect(display.stagedText).toBe('{"command":"ls"}')
    expect(display.stagedToolName).toBe('exec')
  })

  it('does not show tool input as staged text for terminal errors', () => {
    const display = selectAssistantUiDisplay(
      assistant('', {
        error: 'Agent failed before reply: non_deliverable_terminal_turn',
        isFinal: true,
        stopReason: 'length',
        toolCalls: [{ toolName: 'exec', toolInput: { command: 'mkdir -p output' } }],
      }),
      { isStreaming: false },
    )

    expect(display.finalText).toBe(null)
    expect(display.stagedText).toBe(null)
    expect(display.stagedToolName).toBeUndefined()
    expect(display.toolCalls).toEqual([
      { toolName: 'exec', toolInput: { command: 'mkdir -p output' } },
    ])
  })
})
