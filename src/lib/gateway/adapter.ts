// Server-side only -- OpenClaw Gateway protocol version adapter
import type {
  GatewayAgent,
  AgentsListResult,
  GatewaySession,
  HealthStatus,
  ChatOptions,
  ConfigGetResult,
  ChatHistoryResult,
  ConfigSchemaResult,
} from '@/types/gateway'
import type { CronListResult, CronRunsResult } from '@/types/cron'
import { GatewayClient } from './client'

/**
 * Abstract adapter interface for OpenClaw Gateway protocol versions.
 * When OpenClaw upgrades its WS protocol, add a new adapter implementation
 * instead of modifying existing code.
 */
export interface GatewayAdapter {
  readonly protocolVersion: string

  // Agent operations
  getAgents(client: GatewayClient): Promise<AgentsListResult>
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

  // Cron
  listCronJobs(client: GatewayClient): Promise<CronListResult>
  getCronRuns(client: GatewayClient, params?: { jobId?: string; limit?: number }): Promise<CronRunsResult>
  toggleCronJob(client: GatewayClient, jobId: string, enabled: boolean): Promise<{ ok: boolean }>
  runCronJob(client: GatewayClient, jobId: string): Promise<{ ok: boolean; runId?: string }>
  deleteCronJob(client: GatewayClient, jobId: string): Promise<{ ok: boolean }>
}

/**
 * V1 adapter -- current OpenClaw Gateway protocol.
 * Method names follow the `resource.action` convention discovered
 * via the Gateway JS bundle analysis.
 */
export class GatewayV1Adapter implements GatewayAdapter {
  readonly protocolVersion = '1.0'

  async getAgents(client: GatewayClient): Promise<AgentsListResult> {
    const result = (await client.request('agents.list')) as
      | { defaultId?: string; agents?: GatewayAgent[] }
      | GatewayAgent[]
    // agents.list returns { defaultId, agents: [...] } — preserve defaultId
    if (Array.isArray(result)) {
      return { agents: result, defaultId: null }
    }
    return {
      agents: result.agents ?? [],
      defaultId: result.defaultId ?? null,
    }
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

  async listCronJobs(client: GatewayClient): Promise<CronListResult> {
    const result = await client.request('cron.list', { includeDisabled: true })
    // Normalize: response may be { jobs: [...] } or a raw array
    const rawJobs: Record<string, unknown>[] = Array.isArray(result)
      ? result
      : ((result as Record<string, unknown>)?.jobs as Record<string, unknown>[]) ?? []

    // Gateway returns `id` not `jobId`, and timestamps as epoch ms inside `state`
    const jobs = rawJobs.map((raw) => {
      const state = raw.state as Record<string, unknown> | undefined
      return {
        ...raw,
        jobId: (raw.jobId as string) ?? (raw.id as string),
        nextRunAt: state?.nextRunAtMs
          ? new Date(state.nextRunAtMs as number).toISOString()
          : (raw.nextRunAt as string | undefined),
        lastRunAt: state?.lastRunAtMs
          ? new Date(state.lastRunAtMs as number).toISOString()
          : (raw.lastRunAt as string | undefined),
        lastRunStatus: (state?.lastRunStatus as string) ?? (raw.lastRunStatus as string | undefined),
        createdAt: raw.createdAtMs
          ? new Date(raw.createdAtMs as number).toISOString()
          : (raw.createdAt as string | undefined),
      } as CronListResult['jobs'][number]
    })

    return { jobs }
  }

  async getCronRuns(
    client: GatewayClient,
    params?: { jobId?: string; limit?: number },
  ): Promise<CronRunsResult> {
    const rpcParams: Record<string, unknown> = {}
    if (params?.jobId) rpcParams.jobId = params.jobId
    if (params?.limit) rpcParams.limit = params.limit
    const result = await client.request(
      'cron.runs',
      Object.keys(rpcParams).length > 0 ? rpcParams : undefined,
    )
    const obj = result as Record<string, unknown> | null
    const rawRuns: Record<string, unknown>[] = Array.isArray(result)
      ? result
      : (obj?.runs as Record<string, unknown>[])
        ?? (obj?.entries as Record<string, unknown>[])
        ?? []

    // Normalize: gateway returns entries with field names that differ from our CronRun type.
    // Key mappings: runAtMs→startedAt, ts→endedAt, sessionId→runId, status "ok"→"success",
    // usage.input_tokens→tokens.input
    const runs = rawRuns.map((raw) => {
      const usage = raw.usage as Record<string, number> | undefined
      const statusRaw = (raw.status as string) ?? ''
      const status = statusRaw === 'ok' ? 'success' : statusRaw === 'error' ? 'error' : statusRaw

      return {
        ...raw,
        jobId: (raw.jobId as string) ?? (raw.cronId as string) ?? (raw.id as string),
        runId: (raw.runId as string) ?? (raw.sessionId as string) ?? (raw.id as string),
        status,
        startedAt: raw.startedAtMs
          ? new Date(raw.startedAtMs as number).toISOString()
          : raw.runAtMs
            ? new Date(raw.runAtMs as number).toISOString()
            : (raw.startedAt as string),
        endedAt: raw.endedAtMs
          ? new Date(raw.endedAtMs as number).toISOString()
          : raw.ts
            ? new Date(raw.ts as number).toISOString()
            : (raw.endedAt as string | undefined),
        tokens: usage
          ? { input: usage.input_tokens, output: usage.output_tokens }
          : (raw.tokens as Record<string, number> | undefined),
      } as CronRunsResult['runs'][number]
    })

    return { runs }
  }

  async toggleCronJob(
    client: GatewayClient,
    jobId: string,
    enabled: boolean,
  ): Promise<{ ok: boolean }> {
    await client.request('cron.update', { jobId, patch: { enabled } })
    return { ok: true }
  }

  async runCronJob(
    client: GatewayClient,
    jobId: string,
  ): Promise<{ ok: boolean; runId?: string }> {
    const result = await client.request('cron.run', { jobId, mode: 'force' })
    const obj = result as Record<string, unknown> | null
    return { ok: true, runId: obj?.runId as string | undefined }
  }

  async deleteCronJob(
    client: GatewayClient,
    jobId: string,
  ): Promise<{ ok: boolean }> {
    await client.request('cron.remove', { jobId })
    return { ok: true }
  }
}

/** Resolve the appropriate adapter for the connected gateway version. */
export function resolveAdapter(_version?: string): GatewayAdapter {
  // For now we only have V1. When OpenClaw ships a breaking protocol change,
  // add a V2 adapter and select based on the version string returned during
  // the connect handshake.
  return new GatewayV1Adapter()
}
