import { describe, expect, it } from 'vitest'
import { imageBlockDisplayKey, imageIdFromHistoryUrl, uniqueImageBlocks } from './image-blocks'

describe('chat image block display keys', () => {
  it('extracts image ids from history image URLs', () => {
    expect(
      imageIdFromHistoryUrl('/api/v1/chat/sessions/session-1/images/abc123?size=small'),
    ).toBe('abc123')
  })

  it('deduplicates an imageId block and a matching history URL block', () => {
    const blocks = uniqueImageBlocks([
      {
        type: 'image',
        imageId: 'abc123',
        imageUrl: 'data:image/png;base64,old-inline',
      },
      {
        type: 'image',
        imageUrl: '/api/v1/chat/sessions/session-1/images/abc123',
      },
    ])

    expect(blocks).toHaveLength(1)
    expect(imageBlockDisplayKey(blocks[0])).toBe('image:abc123')
  })
})
