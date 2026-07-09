import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClientId } from './client-id'

describe('createClientId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses crypto.randomUUID when the browser exposes it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-crypto' })

    expect(createClientId('chat')).toBe('uuid-from-crypto')
  })

  it('falls back when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {})

    expect(createClientId('chat')).toMatch(/^chat-[a-z0-9]+-[a-z0-9]+$/)
  })
})
