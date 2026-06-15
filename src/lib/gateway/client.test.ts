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

  // Regression lock: the control-ui backend client + scopes below are the
  // exact handshake that authenticates against the v4 gateway.  Changing
  // any of these fields silently breaks the connect — keep them pinned.
  it('preserves the v4 handshake posture required by the gateway', () => {
    const params = buildConnectParams('tok-xyz')
    expect(params.client.id).toBe('openclaw-control-ui')
    expect(params.client.mode).toBe('backend')
    expect(params.scopes).toEqual(['operator.read', 'operator.write', 'operator.admin'])
    expect(params.auth.token).toBe('tok-xyz')
  })
})
