import { randomUUID } from 'crypto'
import WebSocket from 'ws'
import type {
  GatewayMessage,
  GatewayResponse,
  GatewayEvent,
} from '@/types/gateway'

const PROTOCOL_VERSION = 3
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 32_000

interface PendingRequest {
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type EventCallback = (payload: unknown) => void

export class GatewayClient {
  private ws: WebSocket | null = null
  private url: string
  private token: string
  private pending = new Map<string, PendingRequest>()
  private listeners = new Map<string, Set<EventCallback>>()
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private tickIntervalMs = 30_000
  private lastTick = 0
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private connected = false
  private intentionalDisconnect = false

  /** Resolve/reject from the initial connect() call, used by challenge handler. */
  private connectResolve: (() => void) | null = null
  private connectReject: ((err: Error) => void) | null = null

  /** Server version extracted from the hello-ok handshake payload. */
  public serverVersion: string | null = null

  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
  onPermanentDisconnect?: () => void

  constructor(url: string, token: string) {
    this.url = url
    this.token = token
  }

  /**
   * Open the WebSocket and authenticate with the gateway.
   *
   * Flow:
   *  1. WS open
   *  2. Gateway sends `connect.challenge` event with `{ nonce }`
   *  3. Client sends `connect` request with protocol info + auth token
   *  4. Gateway responds with `hello-ok` payload → resolved
   */
  async connect(): Promise<void> {
    this.intentionalDisconnect = false
    this.onStatusChange?.('connecting')

    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject

      // 15s overall timeout: if handshake doesn't complete, reject and close
      this.connectTimer = setTimeout(() => {
        this.clearConnectTimer()
        if (this.connectReject) {
          this.connectReject(new Error('Connect handshake timed out'))
          this.connectResolve = null
          this.connectReject = null
        }
        this.ws?.close(4001, 'connect timeout')
      }, 15_000)

      // resolveGatewayUrl may rewrite 127.0.0.1 → host.docker.internal for
      // Docker. OpenClaw's checkBrowserOrigin checks both Host and Origin
      // headers against loopback, so we rewrite them back to 127.0.0.1.
      const httpUrl = this.url.replace(/^ws(s?):/, 'http$1:')
      const loopbackUrl = httpUrl.replace('host.docker.internal', '127.0.0.1')
      const headers: Record<string, string> = { Origin: loopbackUrl }
      if (this.url.includes('host.docker.internal')) {
        const parsed = new URL(loopbackUrl)
        headers['Host'] = parsed.host
      }
      this.ws = new WebSocket(this.url, { headers })

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data)
      })

      this.ws.on('close', () => {
        this.clearConnectTimer()
        this.connected = false
        this.stopTickWatch()
        this.onStatusChange?.('disconnected')

        // Reject any pending connect() promise so the caller doesn't hang.
        // handleReconnect() will create a fresh connect() call with its own promise.
        if (this.connectReject) {
          this.connectReject(new Error('WebSocket closed before handshake completed'))
          this.connectResolve = null
          this.connectReject = null
        }

        if (!this.intentionalDisconnect) {
          this.handleReconnect()
        }
      })

      this.ws.on('error', (err: Error) => {
        this.clearConnectTimer()
        if (!this.connected && this.connectReject) {
          this.connectReject(err)
          this.connectResolve = null
          this.connectReject = null
        }
      })
    })
  }

  /** Cleanly shut down the connection. */
  disconnect(): void {
    this.intentionalDisconnect = true
    this.clearConnectTimer()
    this.stopTickWatch()
    this.clearReconnectTimer()
    this.rejectAllPending('Client disconnected')
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  /**
   * Wait for the client to become connected (e.g. during background reconnection).
   * Returns true if connected within the timeout, false otherwise.
   */
  waitForConnection(timeoutMs = 10_000): Promise<boolean> {
    if (this.connected) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        clearInterval(check)
        resolve(false)
      }, timeoutMs)
      const check = setInterval(() => {
        if (this.connected) {
          clearTimeout(timer)
          clearInterval(check)
          resolve(true)
        }
      }, 200)
    })
  }

  /**
   * Send a request and wait for the matching response.
   * Rejects after `timeoutMs` (default 30 s) or if the response carries an error.
   */
  request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket is not connected'))
      }

      const timeout = timeoutMs ?? REQUEST_TIMEOUT_MS
      const id = randomUUID()
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request ${method} (id=${id}) timed out after ${timeout}ms`))
      }, timeout)

      this.pending.set(id, { resolve, reject, timer })

      this.ws.send(
        JSON.stringify({ type: 'req', id, method, params }),
      )
    })
  }

  /** Subscribe to gateway push events. Returns an unsubscribe function. */
  on(event: string, callback: EventCallback): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(callback)
    return () => this.off(event, callback)
  }

  /** Remove an event listener. */
  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback)
  }

  // --- Private -----------------------------------------------------------

  private handleMessage(data: WebSocket.Data): void {
    let msg: GatewayMessage
    try {
      msg = JSON.parse(data.toString()) as GatewayMessage
    } catch {
      return // ignore malformed frames
    }

    if (msg.type === 'event') {
      this.handleEventFrame(msg)
    } else if (msg.type === 'res') {
      this.handleResponse(msg)
    }
  }

  private handleEventFrame(evt: GatewayEvent): void {
    // Intercept the connect challenge to complete the handshake
    if (evt.event === 'connect.challenge') {
      this.sendConnect()
      return
    }

    // Track server tick for liveness detection
    if (evt.event === 'tick') {
      this.lastTick = Date.now()
    }

    // Dispatch to registered listeners
    const callbacks = this.listeners.get(evt.event)
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(evt.payload)
        } catch {
          // listener errors should not crash the client
        }
      }
    }
  }

  /** Send the connect request with protocol negotiation + auth. */
  private sendConnect(): void {
    const params = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'openclaw-control-ui' as const,
        version: '1.0.0',
        platform: typeof process !== 'undefined' ? process.platform : 'unknown',
        mode: 'backend' as const,
      },
      auth: { token: this.token },
      scopes: ['operator.read', 'operator.write', 'operator.admin'],
      caps: [],
    }

    this.request('connect', params as unknown as Record<string, unknown>)
      .then((helloOk) => {
        this.clearConnectTimer()
        this.connected = true
        this.reconnectAttempts = 0

        const payload = helloOk as Record<string, unknown> | undefined

        // Extract server version from hello-ok payload (nested under server.version)
        const server = payload?.server as Record<string, unknown> | undefined
        const version = server?.version
        if (typeof version === 'string' && version) {
          this.serverVersion = version
        }

        // Extract tick interval from server policy
        const policy = payload?.policy as
          | Record<string, unknown>
          | undefined
        if (typeof policy?.tickIntervalMs === 'number') {
          this.tickIntervalMs = policy.tickIntervalMs
        }
        this.lastTick = Date.now()
        this.startTickWatch()

        this.onStatusChange?.('connected')

        // Resolve the outer connect() promise
        if (this.connectResolve) {
          this.connectResolve()
          this.connectResolve = null
          this.connectReject = null
        }
      })
      .catch((err) => {
        // Reject the outer connect() promise
        if (this.connectReject) {
          this.connectReject(err instanceof Error ? err : new Error(String(err)))
          this.connectResolve = null
          this.connectReject = null
        }
        this.ws?.close(1008, 'connect failed')
      })
  }

  private handleResponse(res: GatewayResponse): void {
    const pending = this.pending.get(res.id)
    if (!pending) return

    clearTimeout(pending.timer)
    this.pending.delete(res.id)

    if (res.ok) {
      pending.resolve(res.payload)
    } else {
      const errMsg = res.error?.message ?? 'Unknown gateway error'
      const errCode = res.error?.code ?? 'UNKNOWN'
      pending.reject(new Error(`[${errCode}] ${errMsg}`))
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.rejectAllPending('Max reconnect attempts reached')
      this.onStatusChange?.('error')
      this.onPermanentDisconnect?.()
      return
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY_MS,
    )
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect()
      } catch {
        // connect() failure triggers another close -> handleReconnect
      }
    }, delay)
  }

  /** Monitor server tick events — close if the server goes silent. */
  private startTickWatch(): void {
    this.stopTickWatch()
    const interval = Math.max(this.tickIntervalMs, 1_000)
    this.tickTimer = setInterval(() => {
      if (!this.lastTick) return
      if (Date.now() - this.lastTick > this.tickIntervalMs * 2) {
        this.ws?.close(4000, 'tick timeout')
      }
    }, interval)
  }

  private stopTickWatch(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
      this.pending.delete(id)
    }
  }
}
