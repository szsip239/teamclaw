import { describe, expect, it } from 'vitest'
import {
  agentSupportsChatRuntime,
  ensureChatRuntimeForAgent,
  getAvailableChatRuntimes,
} from './runtime-options'

describe('chat runtime options', () => {
  it('defaults older agent payloads to OpenClaw only', () => {
    expect(getAvailableChatRuntimes(null)).toEqual(['openclaw'])
    expect(agentSupportsChatRuntime({}, 'openclaw')).toBe(true)
    expect(agentSupportsChatRuntime({}, 'pi')).toBe(false)
  })

  it('preserves pi when the selected agent supports it', () => {
    const agent = { availableRuntimes: ['openclaw', 'pi'] as const }

    expect(getAvailableChatRuntimes(agent)).toEqual(['openclaw', 'pi'])
    expect(ensureChatRuntimeForAgent(agent, 'pi')).toBe('pi')
  })

  it('falls back to OpenClaw when the agent cannot use pi', () => {
    expect(ensureChatRuntimeForAgent({ availableRuntimes: ['openclaw'] }, 'pi')).toBe(
      'openclaw',
    )
  })
})
