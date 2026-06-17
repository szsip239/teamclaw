import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import WebSocket from 'ws'
import { createPiGatewayServer } from '../src/gateway-server.js'
import { PiRuntime } from '../src/pi-runtime.js'
import { SessionStore } from '../src/session-store.js'

test('handshakes with OpenClaw gateway v4 frames and ticks', async () => {
  const server = createPiGatewayServer({
    runtime: createFakeRuntime(),
    tickIntervalMs: 20,
    sweepIntervalMs: 1_000,
  })
  const address = await server.listen(0, '127.0.0.1')
  const client = await connectClient(address.port)

  try {
    const hello = await client.request('connect', {
      minProtocol: 4,
      maxProtocol: 4,
      role: 'operator',
      scopes: ['operator.read'],
    })
    assert.equal(hello.type, 'hello-ok')
    assert.equal(hello.protocol, 4)
    assert.equal(hello.server.version, 'pi-1.0')
    assert.deepEqual(hello.auth.scopes, ['operator.read'])
    assert.ok(hello.features.methods.includes('chat.send'))

    const tick = await client.nextFrame((frame) => frame.type === 'event' && frame.event === 'tick')
    assert.equal(typeof tick.payload.ts, 'number')
  } finally {
    client.close()
    await server.close()
  }
})

test('streams fake pi chat events as TeamClaw gateway chat and agent events', async () => {
  const runtime = createFakeRuntime()
  const server = createPiGatewayServer({ runtime, tickIntervalMs: 10 })
  const address = await server.listen(0, '127.0.0.1')
  const client = await connectClient(address.port)

  try {
    await client.request('connect', { minProtocol: 4, maxProtocol: 4 })
    const response = await client.request('chat.send', {
      sessionKey: 'agent:pi:telecom:tc:user-1',
      idempotencyKey: 'run-1',
      message: 'create report',
      cwd: '/workspace',
    })

    assert.deepEqual(response, { runId: 'run-1', status: 'started' })

    const textDelta = await client.nextFrame(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'chat' &&
        frame.payload.runId === 'run-1' &&
        frame.payload.state === 'delta' &&
        frame.payload.deltaText === 'Working ',
    )
    assert.equal(textDelta.payload.message.content[0].text, 'Working ')

    const toolStart = await client.nextFrame(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'agent' &&
        frame.payload.stream === 'item' &&
        frame.payload.data.phase === 'start',
    )
    assert.equal(toolStart.payload.data.kind, 'tool')
    assert.equal(toolStart.payload.data.name, 'write')
    assert.deepEqual(toolStart.payload.data.args, { path: 'report.html' })

    const toolOutput = await client.nextFrame(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'agent' &&
        frame.payload.stream === 'command_output',
    )
    assert.equal(toolOutput.payload.data.output, 'wrote report.html')

    const toolEnd = await client.nextFrame(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'agent' &&
        frame.payload.stream === 'item' &&
        frame.payload.data.phase === 'end',
    )
    assert.equal(toolEnd.payload.data.result, 'ok')

    const final = await client.nextFrame(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'chat' &&
        frame.payload.state === 'final',
    )
    assert.equal(final.payload.message.content[0].text, 'Working done.')

    const history = await client.request('chat.history', {
      sessionKey: 'agent:pi:telecom:tc:user-1',
    })
    assert.equal(history.sessionId, 'agent:pi:telecom:tc:user-1')
    assert.equal(history.messages.length, 2)
    assert.equal(history.messages[0].role, 'user')

    const session = runtime.sessions.get('agent:pi:telecom:tc:user-1')
    const deleted = await client.request('sessions.delete', {
      sessionKey: 'agent:pi:telecom:tc:user-1',
    })
    assert.deepEqual(deleted, { ok: true, deleted: true })
    assert.equal(session.disposed, true)

    await client.request('chat.send', {
      sessionKey: 'agent:pi:finance:tc:user-1',
      idempotencyKey: 'run-2',
      message: 'separate session',
      cwd: '/workspace',
    })
    await client.nextFrame(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'chat' &&
        frame.payload.runId === 'run-2' &&
        frame.payload.state === 'final',
    )
    assert.equal(runtime.sessions.has('agent:pi:telecom:tc:user-1'), true)
    assert.equal(runtime.sessions.has('agent:pi:finance:tc:user-1'), true)
  } finally {
    client.close()
    await server.close()
  }
})

test('rejects non-pi session keys fail-closed', async () => {
  const server = createPiGatewayServer({ runtime: createFakeRuntime() })
  const address = await server.listen(0, '127.0.0.1')
  const client = await connectClient(address.port)

  try {
    await client.request('connect', { minProtocol: 4, maxProtocol: 4 })
    await assert.rejects(
      () => client.request('chat.send', {
        sessionKey: 'agent:telecom:tc:user-1',
        message: 'hello',
      }),
      /sessionKey must match/,
    )
  } finally {
    client.close()
    await server.close()
  }
})

test('config.patch writes pi models.json atomically and refreshes registry', async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'teamclaw-pi-wrapper-'))
  const runtime = new PiRuntime({
    agentDir,
    createSession: async () => createFakeSession(),
  })
  let refreshes = 0
  runtime.modelRegistry = {
    refresh() {
      refreshes += 1
    },
  }

  try {
    const result = await runtime.patchConfig({
      models: {
        providers: {
          anthropic: {
            api: 'anthropic-messages',
            models: [{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }],
          },
        },
      },
      agents: [{ id: 'ignored-openclaw-key' }],
    })
    assert.equal(result.ok, true)
    assert.equal(refreshes, 1)

    const raw = await readFile(join(agentDir, 'models.json'), 'utf8')
    const parsed = JSON.parse(raw)
    assert.equal(parsed.providers.anthropic.api, 'anthropic-messages')
    assert.equal(parsed.agents, undefined)
    assert.equal(typeof result.hash, 'string')
    assert.equal(result.raw, raw)
  } finally {
    await rm(agentDir, { recursive: true, force: true })
  }
})

test('session store expires idle sessions without destroying persisted data', async () => {
  let now = 1_000
  let disposed = 0
  let destroyed = 0
  const store = new SessionStore({
    ttlMs: 100,
    now: () => now,
    runtime: {
      async createSession() {
        return {
          dispose() {
            disposed += 1
          },
          destroy() {
            destroyed += 1
          },
        }
      },
    },
  })

  await store.getOrCreate('agent:pi:telecom:tc:user-1')
  now = 1_101
  const expired = await store.sweep()
  assert.deepEqual(expired, ['agent:pi:telecom:tc:user-1'])
  assert.equal(disposed, 1)
  assert.equal(destroyed, 0)
})

function createFakeRuntime() {
  const sessions = new Map()
  return {
    sessions,
    async listAgents() {
      return { agents: [{ id: 'pi', name: 'pi', status: 'active' }], defaultId: 'pi' }
    },
    async createSession({ sessionKey }) {
      const session = createFakeSession()
      sessions.set(sessionKey, session)
      return session
    },
    async getConfig() {
      return { config: {} }
    },
    async patchConfig() {
      return { ok: true }
    },
  }
}

function createFakeSession() {
  const history = []
  let disposed = false
  return {
    async prompt({ message, emit }) {
      history.push({ role: 'user', content: message, timestamp: Date.now() })
      emit({ type: 'agent_start' })
      emit({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Working ' },
      })
      emit({
        type: 'tool_execution_start',
        toolCallId: 'tool-1',
        toolName: 'write',
        args: { path: 'report.html' },
      })
      emit({
        type: 'tool_execution_update',
        toolCallId: 'tool-1',
        toolName: 'write',
        partialResult: { content: [{ type: 'text', text: 'wrote report.html' }] },
      })
      emit({
        type: 'tool_execution_end',
        toolCallId: 'tool-1',
        toolName: 'write',
        result: { content: [{ type: 'text', text: 'ok' }] },
      })
      emit({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'done.' },
      })
      const assistant = {
        role: 'assistant',
        content: [{ type: 'text', text: 'Working done.' }],
        stopReason: 'stop',
        timestamp: Date.now(),
      }
      history.push(assistant)
      emit({ type: 'message_end', message: assistant })
      emit({ type: 'agent_end', messages: [assistant] })
    },
    async abort() {
      return true
    },
    getHistory() {
      return history
    },
    dispose() {
      disposed = true
    },
    get disposed() {
      return disposed
    },
  }
}

async function connectClient(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`)
  const frames = []
  const waiters = []

  ws.on('message', (data) => {
    const frame = JSON.parse(data.toString('utf8'))
    frames.push(frame)
    for (const waiter of [...waiters]) {
      if (waiter.predicate(frame)) {
        waiters.splice(waiters.indexOf(waiter), 1)
        clearTimeout(waiter.timer)
        waiter.resolve(frame)
      }
    }
  })

  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  await nextFrame((frame) => frame.type === 'event' && frame.event === 'connect.challenge')

  function nextFrame(predicate, timeoutMs = 1_000) {
    const existing = frames.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`Timed out waiting for frame; received ${frames.length}`)
        error.frames = frames
        reject(error)
      }, timeoutMs)
      waiters.push({ predicate, resolve, timer })
    })
  }

  async function request(method, params) {
    const id = `req-${Math.random().toString(16).slice(2)}`
    ws.send(JSON.stringify({ type: 'req', id, method, params }))
    const response = await nextFrame((frame) => frame.type === 'res' && frame.id === id)
    if (!response.ok) {
      throw new Error(response.error?.message ?? 'Request failed')
    }
    return response.payload
  }

  return {
    ws,
    frames,
    nextFrame,
    request,
    close() {
      ws.close()
    },
  }
}
