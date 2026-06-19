import { describe, expect, it } from 'vitest'
import {
  buildChatRuntimeSessionKey,
  fromDbChatRuntime,
  instanceSupportsPiRuntime,
  normalizeChatRuntime,
  toDbChatRuntime,
} from './runtime'
import { sendMessageSchema } from '@/lib/validations/chat'

describe('chat runtime guardrails', () => {
  it('defaults unspecified runtime to OpenClaw', () => {
    expect(normalizeChatRuntime(undefined)).toBe('openclaw')
    expect(toDbChatRuntime(undefined)).toBe('OPENCLAW')
    expect(fromDbChatRuntime('OPENCLAW')).toBe('openclaw')
  })

  it('uses separate gateway session keys per runtime', () => {
    expect(buildChatRuntimeSessionKey('openclaw', 'main', 'user-1')).toBe(
      'agent:main:tc:user-1',
    )
    expect(buildChatRuntimeSessionKey('pi', 'main', 'user-1')).toBe(
      'agent:pi:main:tc:user-1',
    )
  })

  it('only marks pi runtime supported when a pi port is configured', () => {
    expect(instanceSupportsPiRuntime(null)).toBe(false)
    expect(instanceSupportsPiRuntime({})).toBe(false)
    expect(instanceSupportsPiRuntime({ hostPiPort: 18790 })).toBe(true)
    expect(instanceSupportsPiRuntime({ hostPiPort: '18790' })).toBe(true)
  })

  it('keeps chat send requests backward-compatible by defaulting to OpenClaw', () => {
    const parsed = sendMessageSchema.parse({
      instanceId: 'inst-1',
      agentId: 'main',
      message: 'hello',
    })

    expect(parsed.runtime).toBe('openclaw')
  })
})
