import { describe, expect, it } from 'vitest'
import { buildPiChatSendParams, resolvePiGatewayUrl } from './pi-runtime-gateway'

describe('pi runtime gateway wiring', () => {
  it('resolves pi-wrapper URL for Docker and host runtimes', () => {
    expect(
      resolvePiGatewayUrl(
        {
          containerName: 'teamclaw-sales',
          dockerConfig: { hostPiPort: 18790 },
        },
        { inDockerNetwork: true },
      ),
    ).toBe('ws://teamclaw-sales:18790')

    expect(
      resolvePiGatewayUrl(
        {
          containerName: 'teamclaw-sales',
          dockerConfig: { hostPiPort: '18791' },
        },
        { inDockerNetwork: false },
      ),
    ).toBe('ws://127.0.0.1:18791')
  })

  it('builds pi chat.send params with cwd and attachments', () => {
    expect(
      buildPiChatSendParams({
        sessionKey: 'agent:pi:main:tc:user-1',
        message: 'read test.txt',
        idempotencyKey: 'run-1',
        cwd: '/home/node/.openclaw/workspace-sales',
        attachments: [{ fileName: 'a.png', mimeType: 'image/png', content: 'abc' }],
      }),
    ).toEqual({
      sessionKey: 'agent:pi:main:tc:user-1',
      message: 'read test.txt',
      idempotencyKey: 'run-1',
      cwd: '/home/node/.openclaw/workspace-sales',
      attachments: [{ fileName: 'a.png', mimeType: 'image/png', content: 'abc' }],
    })
  })
})
