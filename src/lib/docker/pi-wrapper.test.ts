import { describe, expect, it } from 'vitest'
import {
  buildOpenClawGatewayCommandWithPiWrapper,
  buildPiWrapperBind,
  derivePiHostPort,
} from './pi-wrapper'

describe('docker pi-wrapper wiring', () => {
  it('mounts the repository pi-wrapper read-only into OpenClaw containers', () => {
    expect(buildPiWrapperBind('/repo/teamclaw')).toBe(
      '/repo/teamclaw/pi-wrapper:/opt/teamclaw/pi-wrapper:ro',
    )
  })

  it('starts pi-wrapper before execing the OpenClaw gateway command', () => {
    const command = buildOpenClawGatewayCommandWithPiWrapper()
    expect(command).toEqual(['sh', '-lc', expect.any(String)])
    expect(command[2]).toContain('PI_WRAPPER_PORT=18790')
    expect(command[2]).toContain('node src/server.js')
    expect(command[2]).toContain('exec node openclaw.mjs gateway')
  })

  it('derives a stable host pi-wrapper port from the gateway host port', () => {
    expect(derivePiHostPort(18804)).toBe(19804)
  })
})
