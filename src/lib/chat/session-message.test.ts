import { describe, expect, it } from 'vitest'
import { parseSessionMessage } from './session-message'

describe('v4 session.message parsing', () => {
  it('parses a final assistant message (stopReason=stop) into text + thinking', () => {
    const parsed = parseSessionMessage({
      messageId: 'a4b4ff6e',
      messageSeq: 4,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'reasoning here' },
          { type: 'text', text: '当前目录下有 6 个文件' },
        ],
        stopReason: 'stop',
      },
    })
    expect(parsed.role).toBe('assistant')
    expect(parsed.text).toBe('当前目录下有 6 个文件')
    expect(parsed.thinking).toBe('reasoning here')
    expect(parsed.isFinal).toBe(true)
  })

  it('parses a staged assistant message (stopReason=toolUse) with tool calls', () => {
    const parsed = parseSessionMessage({
      messageId: '68a3e251',
      messageSeq: 2,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'let me run ls' },
          { type: 'toolCall', id: 'call_x', name: 'exec', arguments: { command: 'ls' } },
        ],
        stopReason: 'toolUse',
      },
    })
    expect(parsed.isFinal).toBe(false)
    expect(parsed.stopReason).toBe('toolUse')
    expect(parsed.toolCalls).toEqual([{ toolName: 'exec', toolInput: { command: 'ls' } }])
  })

  it('parses a user message with plain string content', () => {
    const parsed = parseSessionMessage({
      messageId: 'cf6bb550',
      messageSeq: 1,
      message: { role: 'user', content: '用 exec 工具执行 ls' },
    })
    expect(parsed.role).toBe('user')
    expect(parsed.text).toBe('用 exec 工具执行 ls')
    expect(parsed.isFinal).toBe(false)
  })
})
