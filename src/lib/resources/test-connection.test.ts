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

  it('keeps the bare agent plan endpoint for anthropic-compatible testing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testConnection('doubao', 'encrypted', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/plan',
      apiType: 'anthropic-messages',
      models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/plan/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"model":"doubao-seed-2.0-pro"'),
      }),
    )
  })
})

describe('testConnection anthropic-compatible resources', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses an anthropic messages smoke test when a DeepSeek resource is configured as anthropic-compatible', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testConnection('deepseek', 'encrypted', {
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiType: 'anthropic-messages',
      defaultModelId: 'deepseek-v4-flash',
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }],
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/anthropic/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"model":"deepseek-v4-flash"'),
      }),
    )
  })
})
