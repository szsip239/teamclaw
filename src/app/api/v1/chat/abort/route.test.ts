import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/app/api/v1/chat/abort/route.ts'), 'utf-8')

describe('chat abort runtime routing', () => {
  it('routes pi abort through the runtime gateway client', () => {
    expect(source).toContain('getRuntimeGatewayClient')
    expect(source).toContain("runtime === 'pi'")
    expect(source).toContain("'chat.abort'")
    expect(source).not.toContain('Pi runtime is not implemented yet')
  })
})
