// Server-side only -- OpenClaw Gateway protocol version adapter
import type {
  GatewayAgent,
  GatewaySession,
  HealthStatus,
  ChatOptions,
  ConfigGetResult,
  ChatHistoryResult,
  ConfigSchemaResult,
} from '@/types/gateway'
import { GatewayClient } from './client'

/**
 * Abstract adapter interface for OpenClaw Gateway protocol versions.
 * When OpenClaw upgrades its WS protocol, add a new adapter implementation
 * instead of modifying existing code.
 */
export interface GatewayAdapter {
  readonly protocolVersion: string

  // Agent operations
  getAgents(client: GatewayClient): Promise<GatewayAgent[]>
  getAgent(client: GatewayClient, agentId: string): Promise<GatewayAgent>

  // Session operations
  getSessions(client: GatewayClient, agentId?: string): Promise<GatewaySession[]>
  getSession(client: GatewayClient, sessionId: string): Promise<GatewaySession>
  deleteSession(client: GatewayClient, sessionId: string): Promise<void>

  // Chat operations
  sendMessage(
    client: GatewayClient,
    sessionKey: string,
    message: string,
    idempotencyKey: string,
    options?: ChatOptions,
  ): Promise<unknown>

  // Config operations — read/write openclaw.json via gateway protocol
  getConfig(client: GatewayClient): Promise<ConfigGetResult>
  getSchema(client: GatewayClient): Promise<ConfigSchemaResult>
  patchConfig(client: GatewayClient, patch: Record<string, unknown>, baseHash: string): Promise<void>
  applyConfig(client: GatewayClient, raw: string, baseHash: string): Promise<void>

  // Chat history
  getHistory(client: GatewayClient, sessionKey: string, limit?: number): Promise<ChatHistoryResult>

  // System
  getHealth(client: GatewayClient): Promise<HealthStatus>
  getCronJobs(client: GatewayClient): Promise<unknown>
}

/**
 * V1 adapter -- current OpenClaw Gateway protocol.
 * Method names follow the `resource.action` convention discovered
 * via the Gateway JS bundle analysis.
 */
export class GatewayV1Adapter implements GatewayAdapter {
  readonly protocolVersion = '1.0'

  async getAgents(client: GatewayClient): Promise<GatewayAgent[]> {
    const result = (await client.request('agents.list')) as { agents?: GatewayAgent[] } | GatewayAgent[]
    // agents.list returns { defaultId, agents: [...] } — extract the array
    if (Array.isArray(result)) return result
    return (result as { agents?: GatewayAgent[] }).agents ?? []
  }

  async getAgent(client: GatewayClient, agentId: string): Promise<GatewayAgent> {
    return (await client.request('agents.get', { agentId })) as GatewayAgent
  }

  async getSessions(client: GatewayClient, agentId?: string): Promise<GatewaySession[]> {
    return (await client.request(
      'sessions.list',
      agentId ? { agentId } : undefined,
    )) as GatewaySession[]
  }

  async getSession(client: GatewayClient, sessionId: string): Promise<GatewaySession> {
    return (await client.request('sessions.get', { sessionId })) as GatewaySession
  }

  async deleteSession(client: GatewayClient, sessionKey: string): Promise<void> {
    await client.request('sessions.delete', { key: sessionKey })
  }

  async sendMessage(
    client: GatewayClient,
    sessionKey: string,
    message: string,
    idempotencyKey: string,
    options?: ChatOptions,
  ): Promise<unknown> {
    const params: Record<string, unknown> = {
      sessionKey,
      message,
      idempotencyKey,
    }
    // Use longer timeout (120s) when attachments are present since
    // base64-encoded images make the WebSocket frame much larger
    let timeoutMs: number | undefined
    if (options?.attachments?.length) {
      params.attachments = options.attachments
      timeoutMs = 120_000
    }
    return client.request('chat.send', params, timeoutMs)
  }

  async getHistory(
    client: GatewayClient,
    sessionKey: string,
    limit = 200,
  ): Promise<ChatHistoryResult> {
    return (await client.request('chat.history', { sessionKey, limit })) as ChatHistoryResult
  }

  async getConfig(client: GatewayClient): Promise<ConfigGetResult> {
    return (await client.request('config.get')) as ConfigGetResult
  }

  async getSchema(client: GatewayClient): Promise<ConfigSchemaResult> {
    return (await client.request('config.schema')) as ConfigSchemaResult
  }

  async patchConfig(
    client: GatewayClient,
    patch: Record<string, unknown>,
    baseHash: string,
  ): Promise<void> {
    await client.request('config.patch', {
      raw: JSON.stringify(patch),
      baseHash,
    })
  }

  async applyConfig(
    client: GatewayClient,
    raw: string,
    baseHash: string,
  ): Promise<void> {
    await client.request('config.apply', { raw, baseHash })
  }

  async getHealth(client: GatewayClient): Promise<HealthStatus> {
    return (await client.request('health')) as HealthStatus
  }

  async getCronJobs(client: GatewayClient): Promise<unknown> {
    return client.request('cron.list')
  }
}

/** Resolve the appropriate adapter for the connected gateway version. */
export function resolveAdapter(_version?: string): GatewayAdapter {
  // For now we only have V1. When OpenClaw ships a breaking protocol change,
  // add a V2 adapter and select based on the version string returned during
  // the connect handshake.
  return new GatewayV1Adapter()
}
