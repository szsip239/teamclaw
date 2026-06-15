import { describe, expect, it } from 'vitest'
import { selectChatDisplay } from './chat-display'

describe('v4 chat display selection (thinking hidden / staged overwrite / final replace)', () => {
  it('shows the latest staged text while the run is in progress', () => {
    const d = selectChatDisplay([
      {
        text: '正在查看目录',
        toolCalls: [{ toolName: 'exec', toolInput: { command: 'ls' } }],
        isFinal: false,
      },
    ])
    expect(d.stagedText).toBe('正在查看目录')
    expect(d.finalText).toBe(null)
    expect(d.toolCalls).toEqual([{ toolName: 'exec', toolInput: { command: 'ls' } }])
  })

  it('replaces staged with final text when the final turn arrives', () => {
    const d = selectChatDisplay([
      {
        text: '正在查看目录',
        toolCalls: [{ toolName: 'exec', toolInput: { command: 'ls' } }],
        isFinal: false,
      },
      { text: '当前目录下有 6 个文件', isFinal: true },
    ])
    expect(d.finalText).toBe('当前目录下有 6 个文件')
    expect(d.stagedText).toBe(null)
    expect(d.toolCalls).toEqual([{ toolName: 'exec', toolInput: { command: 'ls' } }])
  })

  it('keeps only the latest staged text and merges all tool calls', () => {
    const d = selectChatDisplay([
      { text: '先看目录', toolCalls: [{ toolName: 'exec', toolInput: { command: 'ls' } }], isFinal: false },
      { text: '再读文件', toolCalls: [{ toolName: 'exec', toolInput: { command: 'cat x' } }], isFinal: false },
    ])
    expect(d.stagedText).toBe('再读文件')
    expect(d.toolCalls).toHaveLength(2)
  })
})
