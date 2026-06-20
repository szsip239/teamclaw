import { describe, expect, it } from 'vitest'
import {
  extractImagesFromGatewayMessage,
  extractTextFromGatewayMessage,
  extractThinkingFromGatewayMessage,
} from './gateway-message-content'

describe('gateway message content extraction', () => {
  it('extracts string and block text from gateway messages', () => {
    expect(extractTextFromGatewayMessage({ content: 'plain text' })).toBe('plain text')
    expect(
      extractTextFromGatewayMessage({
        content: [
          { type: 'text', text: 'first' },
          { type: 'thinking', thinking: 'hidden' },
          { type: 'text', text: 'second' },
        ],
      }),
    ).toBe('first\nsecond')
  })

  it('extracts hidden thinking blocks without exposing visible text', () => {
    expect(
      extractThinkingFromGatewayMessage({
        content: [
          { type: 'text', text: 'visible' },
          { type: 'thinking', thinking: 'step 1' },
          { type: 'thinking', thinking: 'step 2' },
        ],
      }),
    ).toBe('step 1\nstep 2')
  })

  it('extracts inline image blocks from base64 and url gateway content', () => {
    expect(
      extractImagesFromGatewayMessage({
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'abc' },
            alt: 'chart',
          },
          { type: 'image', url: 'https://example.test/image.webp' },
        ],
      }),
    ).toEqual([
      { url: 'data:image/png;base64,abc', mimeType: 'image/png', alt: 'chart' },
      { url: 'https://example.test/image.webp', mimeType: undefined, alt: undefined },
    ])
  })
})
