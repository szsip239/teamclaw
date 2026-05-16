import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./credential-utils', () => ({
  decryptCredential: vi.fn(() => 'test-key'),
}))

import { testConnection } from './test-connection'

describe('testConnection volcengine coding plan', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses chat completions for the coding endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'chatcmpl-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testConnection('doubao', 'encrypted', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      apiType: 'openai-completions',
      models: [{ id: 'ark-code-latest', name: 'Ark Coding Plan' }],
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"model":"ark-code-latest"'),
      }),
    )
  })

  it('uses chat completions for the agent plan endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'chatcmpl-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testConnection('doubao', 'encrypted', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
      apiType: 'openai-completions',
      models: [{ id: 'doubao-seed-2.0-code', name: 'Doubao Seed 2.0 Code' }],
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"doubao-seed-2.0-code"'),
      }),
    )
  })

  it('normalizes the bare agent plan endpoint before testing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'chatcmpl-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testConnection('doubao', 'encrypted', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/plan',
      apiType: 'openai-completions',
      models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"doubao-seed-2.0-pro"'),
      }),
    )
  })
})
