import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/app/api/v1/chat/agents/route.ts'), 'utf-8')

describe('chat agents runtime capabilities', () => {
  it('exposes pi runtime only from instance dockerConfig support', () => {
    expect(source).toContain('instanceSupportsPiRuntime')
    expect(source).toContain('availableRuntimes: piRuntimeMap.get(instanceId)')
    expect(source).toContain("['openclaw', 'pi']")
    expect(source).toContain("['openclaw']")
  })
})
