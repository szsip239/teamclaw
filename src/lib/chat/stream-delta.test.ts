import { describe, expect, it } from 'vitest'
import { computeTextDelta } from './stream-delta'

describe('v4 chat text delta (computeTextDelta)', () => {
  it('prefers cumulative slice over deltaText when already partially emitted', () => {
    const out = computeTextDelta({
      deltaText: 'hello world',
      cumulative: 'hello world',
      lastEmitted: 'hello',
    })
    expect(out.text).toBe(' world')  // sliced, not full deltaText
    expect(out.replace).toBe(false)
    expect(out.nextLast).toBe('hello world')
  })

  it('marks a non-prefix replacement so the frontend replaces instead of appends', () => {
    const out = computeTextDelta({
      deltaText: 'corrected answer',
      replace: true,
      cumulative: 'corrected answer',
      lastEmitted: 'wrong draft',
    })
    expect(out.text).toBe('corrected answer')
    expect(out.replace).toBe(true)
    expect(out.nextLast).toBe('corrected answer')
  })

  it('uses deltaText when cumulative has not advanced', () => {
    const out = computeTextDelta({
      deltaText: 'extra',
      cumulative: 'hello',
      lastEmitted: 'hello',
    })
    expect(out.text).toBe('extra')  // sliced = '', deltaText is the only increment
    expect(out.nextLast).toBe('hello')
  })
})
