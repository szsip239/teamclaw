import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/app/api/v1/instances/route.ts'), 'utf-8')

describe('instance docker pi-wrapper wiring', () => {
  it('creates OpenClaw containers with pi-wrapper command, bind, and host port metadata', () => {
    expect(source).toContain('buildOpenClawGatewayCommandWithPiWrapper')
    expect(source).toContain('buildPiWrapperBind')
    expect(source).toContain('derivePiHostPort')
    expect(source).toContain('hostPiPort')
    expect(source).toContain('PI_WRAPPER_CONTAINER_PORT')
    expect(source).toContain("hostIp: '127.0.0.1'")
  })
})
