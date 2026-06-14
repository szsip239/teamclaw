import { describe, expect, it } from 'vitest'
import { buildConnectParams } from './client'

describe('gateway connect handshake', () => {
  it('negotiates protocol v4', () => {
    const params = buildConnectParams('tok-123')
    expect(params.minProtocol).toBe(4)
    expect(params.maxProtocol).toBe(4)
  })

  it('declares the operator role required by the v4 handshake', () => {
    const params = buildConnectParams('tok-123')
    expect(params.role).toBe('operator')
  })

  // Regression lock: this is the exact connection posture the v4 spike proved
  // can authenticate against the 6.6 gateway (control-ui backend client on the
  // dangerouslyDisableDeviceAuth trust path). Changing any of these silently
  // breaks the handshake, so pin them.
  it('preserves the connection posture verified by the v4 spike', () => {
    const params = buildConnectParams('tok-xyz')
    expect(params.client.id).toBe('openclaw-control-ui')
    expect(params.client.mode).toBe('backend')
    expect(params.scopes).toEqual(['operator.read', 'operator.write', 'operator.admin'])
    expect(params.auth.token).toBe('tok-xyz')
  })
})
