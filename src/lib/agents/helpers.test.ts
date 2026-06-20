import { describe, expect, it } from 'vitest'
import { sanitizeAgentEntry } from './helpers'

describe('agent helpers', () => {
  it('preserves display names when sanitizing agent entries', () => {
    expect(
      sanitizeAgentEntry({
        id: 'main',
        name: '智访通',
        workspace: '/workspace/main',
        unknown: 'drop-me',
      }),
    ).toEqual({
      id: 'main',
      name: '智访通',
      workspace: '/workspace/main',
    })
  })
})
