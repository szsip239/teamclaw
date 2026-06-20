import { describe, expect, it } from 'vitest'
import { updateAgentConfigSchema } from './agent'

describe('agent validation', () => {
  it('accepts and trims agent display names', () => {
    expect(updateAgentConfigSchema.parse({ name: '  智访通  ' }).name).toBe('智访通')
  })

  it('rejects blank agent display names', () => {
    expect(() => updateAgentConfigSchema.parse({ name: '   ' })).toThrow()
  })
})
