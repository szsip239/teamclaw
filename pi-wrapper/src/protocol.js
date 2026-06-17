import { randomUUID } from 'node:crypto'

export const PROTOCOL_VERSION = 4
export const DEFAULT_PORT = 18790
export const DEFAULT_TICK_INTERVAL_MS = 30_000
export const DEFAULT_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024
export const DEFAULT_MAX_BUFFERED_BYTES = 50 * 1024 * 1024

export const METHODS = Object.freeze([
  'connect',
  'agents.list',
  'chat.send',
  'chat.abort',
  'chat.history',
  'sessions.delete',
  'health',
  'config.get',
  'config.patch',
])

export class RpcError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'RpcError'
    this.code = code
    this.details = details
  }
}

export function parseJsonFrame(data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
  const frame = JSON.parse(text)
  if (!frame || typeof frame !== 'object') {
    throw new RpcError('BAD_REQUEST', 'Frame must be a JSON object')
  }
  return frame
}

export function requireRequest(frame) {
  if (frame.type !== 'req') {
    throw new RpcError('BAD_REQUEST', 'Frame type must be req')
  }
  if (typeof frame.id !== 'string' || !frame.id) {
    throw new RpcError('BAD_REQUEST', 'Request id is required')
  }
  if (typeof frame.method !== 'string' || !frame.method) {
    throw new RpcError('BAD_REQUEST', 'Request method is required')
  }
}

export function sendJson(ws, frame) {
  if (ws.readyState !== ws.OPEN) return false
  ws.send(JSON.stringify(frame))
  return true
}

export function sendEvent(ws, event, payload, extra = {}) {
  return sendJson(ws, { type: 'event', event, payload, ...extra })
}

export function sendResponse(ws, id, payload) {
  return sendJson(ws, { type: 'res', id, ok: true, payload })
}

export function sendError(ws, id, err) {
  const code = err instanceof RpcError ? err.code : 'INTERNAL'
  const message = err instanceof Error ? err.message : String(err)
  const details = err instanceof RpcError ? err.details : undefined
  return sendJson(ws, {
    type: 'res',
    id,
    ok: false,
    error: details ? { code, message, details } : { code, message },
  })
}

export function buildHelloPayload(params = {}, options = {}) {
  const protocol = negotiateProtocol(params)
  return {
    type: 'hello-ok',
    protocol,
    server: {
      version: options.version ?? 'pi-1.0',
      connId: options.connId ?? randomUUID(),
    },
    features: {
      methods: [...METHODS],
      events: ['chat', 'agent', 'tick'],
    },
    snapshot: {},
    auth: {
      role: typeof params.role === 'string' ? params.role : 'operator',
      scopes: Array.isArray(params.scopes) ? params.scopes : [],
    },
    policy: {
      maxPayload: DEFAULT_MAX_PAYLOAD_BYTES,
      maxBufferedBytes: DEFAULT_MAX_BUFFERED_BYTES,
      tickIntervalMs: options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS,
    },
  }
}

export function negotiateProtocol(params = {}) {
  const minProtocol = Number(params.minProtocol ?? PROTOCOL_VERSION)
  const maxProtocol = Number(params.maxProtocol ?? PROTOCOL_VERSION)
  if (minProtocol > PROTOCOL_VERSION || maxProtocol < PROTOCOL_VERSION) {
    throw new RpcError('UNSUPPORTED_PROTOCOL', `pi-wrapper requires protocol ${PROTOCOL_VERSION}`, {
      minProtocol,
      maxProtocol,
      serverProtocol: PROTOCOL_VERSION,
    })
  }
  return PROTOCOL_VERSION
}

export function challengePayload() {
  return { nonce: randomUUID(), ts: Date.now() }
}
