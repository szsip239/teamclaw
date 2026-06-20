import { describe, expect, it } from 'vitest'
import {
  initialChatSendStreamState,
  reduceChatMessageStreamUpdate,
} from './chat-send-stream-reducer'

describe('chat send stream reducer', () => {
  it('emits only newly streamed text, thinking, and inline images', () => {
    const first = reduceChatMessageStreamUpdate(initialChatSendStreamState(), {
      message: {
        content: [
          { type: 'thinking', thinking: 'checking' },
          { type: 'text', text: 'hello' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'abc' },
          },
        ],
      },
    })

    expect(first.events).toEqual([
      { type: 'thinking', content: 'checking' },
      { type: 'text', content: 'hello' },
      { type: 'image', imageUrl: 'data:image/png;base64,abc', mimeType: 'image/png' },
    ])
    expect(first.capturedImages).toEqual([
      { imageUrl: 'data:image/png;base64,abc', mimeType: 'image/png' },
    ])

    const second = reduceChatMessageStreamUpdate(first.state, {
      message: {
        content: [
          { type: 'thinking', thinking: 'checking done' },
          { type: 'text', text: 'hello world' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'abc' },
          },
          { type: 'image', url: 'https://example.test/chart.webp', alt: 'chart' },
        ],
      },
    })

    expect(second.events).toEqual([
      { type: 'thinking', content: ' done' },
      { type: 'text', content: ' world' },
      {
        type: 'image',
        imageUrl: 'https://example.test/chart.webp',
        mimeType: undefined,
        alt: 'chart',
      },
    ])
    expect(second.capturedImages).toEqual([
      { imageUrl: 'https://example.test/chart.webp', mimeType: undefined },
    ])
  })

  it('can skip duplicate text already emitted by preamble events', () => {
    const state = {
      lastTextContent: 'already sent',
      lastThinkingContent: '',
      lastImageCount: 0,
    }

    const result = reduceChatMessageStreamUpdate(state, {
      message: { content: 'already sent' },
      deltaText: 'already sent',
      skipDuplicateText: true,
    })

    expect(result.events).toEqual([])
    expect(result.state.lastTextContent).toBe('already sent')
  })
})
