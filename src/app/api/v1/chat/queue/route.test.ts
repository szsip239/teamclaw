import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/app/api/v1/chat/queue/route.ts'), 'utf-8')

describe('chat queue runtime routing', () => {
  it('routes pi queued sends through pi-wrapper with cwd', () => {
    expect(source).toContain('getRuntimeGatewayClient')
    expect(source).toContain('buildPiChatSendParams')
    expect(source).toContain("runtime === 'pi'")
    expect(source).toContain('cwd: piCwd')
    expect(source).not.toContain('Pi runtime is not implemented yet')
  })
})
