import { describe, expect, it } from 'vitest'
import { computeTextDelta } from './stream-delta'

describe('v4 chat text delta (computeTextDelta)', () => {
  it('emits deltaText directly without slicing the cumulative snapshot', () => {
    const out = computeTextDelta({
      deltaText: ' world',
      cumulative: 'hello world',
      lastEmitted: 'hello',
    })
    expect(out.text).toBe(' world')
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

  it('falls back to slicing the cumulative snapshot when deltaText is absent', () => {
    const out = computeTextDelta({
      cumulative: 'hello world',
      lastEmitted: 'hello',
    })
    expect(out.text).toBe(' world')
    expect(out.replace).toBe(false)
    expect(out.nextLast).toBe('hello world')
  })
})
