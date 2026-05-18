import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'

describe('knowledge base upload proxy limits', () => {
  it('allows 100MB PDFs plus multipart overhead through the Next proxy', () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe('110mb')
  })
})
