import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { createPiEventBridge } from './event-mapper.js'
import { PiRuntime } from './pi-runtime.js'
import {
  DEFAULT_PORT,
  DEFAULT_TICK_INTERVAL_MS,
  RpcError,
  buildHelloPayload,
  challengePayload,
  parseJsonFrame,
  requireRequest,
  sendError,
  sendEvent,
  sendResponse,
} from './protocol.js'
import { parsePiSessionKey } from './session-key.js'
import { SessionStore } from './session-store.js'

export function createPiGatewayServer(options = {}) {
  const runtime = options.runtime ?? new PiRuntime({ agentDir: options.agentDir })
  const tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS
  const sessionStore =
    options.sessionStore ??
    new SessionStore({
      runtime,
      ttlMs: options.sessionTtlMs,
    })
  const httpServer = options.server ?? createServer()
  const wss = new WebSocketServer({ server: httpServer })

  let sweepTimer

  wss.on('connection', (ws) => {
    const connId = randomUUID()
    let connected = false
    const tickTimer = setInterval(() => {
      if (connected) sendEvent(ws, 'tick', { ts: Date.now() })
    }, tickIntervalMs)

    sendEvent(ws, 'connect.challenge', challengePayload())

    ws.on('message', (data) => {
      void handleMessage(ws, data, {
        connId,
        runtime,
        sessionStore,
        tickIntervalMs,
        markConnected: () => {
          connected = true
        },
      })
    })

    ws.on('close', () => {
      clearInterval(tickTimer)
    })
  })

  async function listen(port = DEFAULT_PORT, host) {
    if (!sweepTimer) {
      sweepTimer = setInterval(() => {
        sessionStore.sweep().catch((err) => {
          console.error('[pi-wrapper] session sweep failed:', err)
        })
      }, options.sweepIntervalMs ?? 5 * 60 * 1000)
      sweepTimer.unref?.()
    }

    await new Promise((resolve, reject) => {
      const onError = (err) => {
        httpServer.off('listening', onListening)
        reject(err)
      }
      const onListening = () => {
        httpServer.off('error', onError)
        resolve()
      }
      httpServer.once('error', onError)
      httpServer.once('listening', onListening)
      httpServer.listen(port, host)
    })
    return httpServer.address()
  }

  async function close() {
    if (sweepTimer) {
      clearInterval(sweepTimer)
      sweepTimer = undefined
    }
    await sessionStore.dispose()
    await new Promise((resolve) => wss.close(resolve))
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve))
    }
  }

  return { httpServer, wss, runtime, sessionStore, listen, close }
}

async function handleMessage(ws, data, ctx) {
  let frame
  try {
    frame = parseJsonFrame(data)
    requireRequest(frame)
    const payload = await dispatch(frame.method, frame.params ?? {}, ws, ctx)
    sendResponse(ws, frame.id, payload)
  } catch (err) {
    sendError(ws, frame?.id, err)
  }
}

async function dispatch(method, params, ws, ctx) {
  switch (method) {
    case 'connect':
      ctx.markConnected()
      return buildHelloPayload(params, {
        connId: ctx.connId,
        tickIntervalMs: ctx.tickIntervalMs,
      })
    case 'agents.list':
      return ctx.runtime.listAgents()
    case 'health':
      return { status: 'ok', runtime: 'pi', ts: Date.now() }
    case 'chat.send':
      return handleChatSend(params, ws, ctx)
    case 'chat.abort':
      return handleChatAbort(params, ctx)
    case 'chat.history':
      return handleChatHistory(params, ctx)
    case 'sessions.delete':
      return handleSessionDelete(params, ctx)
    case 'config.get':
      return ctx.runtime.getConfig(params)
    case 'config.patch':
      return ctx.runtime.patchConfig(params)
    default:
      throw new RpcError('NOT_FOUND', `Unknown method: ${method}`)
  }
}

async function handleChatSend(params, ws, ctx) {
  const sessionKey = params.sessionKey
  const { agentId, userId } = parsePiSessionKey(sessionKey)
  const runId = typeof params.idempotencyKey === 'string' ? params.idempotencyKey : randomUUID()
  const session = await ctx.sessionStore.getOrCreate(sessionKey, {
    cwd: params.cwd,
    agentId,
    userId,
  })
  const bridge = createPiEventBridge({
    runId,
    emit: (event, payload) => sendEvent(ws, event, payload),
  })

  session
    .prompt({
      message: String(params.message ?? ''),
      attachments: params.attachments ?? [],
      runId,
      emit: (event) => bridge.handle(event),
    })
    .catch((err) => {
      sendEvent(ws, 'chat', {
        runId,
        state: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      sendEvent(ws, 'agent', {
        runId,
        stream: 'lifecycle',
        data: { phase: 'error' },
      })
    })

  return { runId, status: 'started' }
}

async function handleChatAbort(params, ctx) {
  const sessionKey = params.sessionKey
  parsePiSessionKey(sessionKey)
  const aborted = await ctx.sessionStore.abort(sessionKey)
  return { ok: true, aborted }
}

async function handleChatHistory(params, ctx) {
  const sessionKey = params.sessionKey
  parsePiSessionKey(sessionKey)
  const session = ctx.sessionStore.get(sessionKey)
  const messages = session ? await session.getHistory?.() : []
  return {
    sessionId: sessionKey,
    messages: Array.isArray(messages) ? messages : [],
  }
}

async function handleSessionDelete(params, ctx) {
  const sessionKey = params.sessionKey ?? params.key
  parsePiSessionKey(sessionKey)
  const deleted = await ctx.sessionStore.delete(sessionKey, { destroy: true })
  return { ok: true, deleted }
}
