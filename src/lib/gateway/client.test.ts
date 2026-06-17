import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { buildConnectParams, GatewayClient } from './client'

let servers: WebSocketServer[] = []

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
  servers = []
})

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

  it('notifies immediately when an established connection closes unexpectedly', async () => {
    const server = new WebSocketServer({ port: 0 })
    servers.push(server)

    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: {} }))
      socket.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { id?: string; method?: string }
        if (msg.method !== 'connect' || !msg.id) return
        socket.send(
          JSON.stringify({
            type: 'res',
            id: msg.id,
            ok: true,
            payload: {
              server: { version: 'test' },
              policy: { tickIntervalMs: 30_000 },
            },
          }),
        )
        socket.close()
      })
    })

    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test server port')

    const client = new GatewayClient(`ws://127.0.0.1:${address.port}`, 'tok')
    const lost = new Promise<void>((resolve) => {
      client.onUnexpectedDisconnect = () => {
        client.disconnect()
        resolve()
      }
    })

    await client.connect()
    await lost
  })
})
