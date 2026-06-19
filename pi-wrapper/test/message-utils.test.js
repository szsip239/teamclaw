import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gatewayMessagesFromSessionEntries } from '../src/message-utils.js'

test('maps session entry timestamps into gateway history messages', () => {
  const messages = gatewayMessagesFromSessionEntries([
    {
      type: 'message',
      timestamp: '2026-06-17T23:13:09.474Z',
      message: {
        role: 'user',
        content: 'hello',
        timestamp: '2026-06-17T23:13:09.474Z',
      },
    },
    {
      type: 'message',
      timestamp: '2026-06-17T23:13:11.240Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
      },
    },
  ])

  assert.equal(messages[0].timestamp, '2026-06-17T23:13:09.474Z')
  assert.equal(messages[1].timestamp, '2026-06-17T23:13:11.240Z')
})
