import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { getRuntimeGatewayClient } from '@/lib/chat/runtime-gateway'
import {
  instanceSupportsPiRuntime,
  toDbChatRuntime,
  type ChatRuntime,
} from '@/lib/chat/runtime'
import { resolveChatModelSummary } from '@/lib/chat/model-summary'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseRuntime(value: string | null): ChatRuntime {
  return value === 'pi' ? 'pi' : 'openclaw'
}

async function canUseInstance(params: {
  instanceId: string
  user: { role: string; departmentId: string | null }
}): Promise<boolean> {
  if (params.user.role === 'SYSTEM_ADMIN') return true
  if (!params.user.departmentId) return false
  const grant = await prisma.instanceAccess.findFirst({
    where: {
      instanceId: params.instanceId,
      departmentId: params.user.departmentId,
    },
    select: { id: true },
  })
  return Boolean(grant)
}

async function findRuntimeDbSession(params: {
  userId: string
  instanceId: string
  agentId: string
  runtime: ChatRuntime
  visibleSessionId?: string
}) {
  if (!params.visibleSessionId) return null
  return prisma.chatSession.findFirst({
    where: {
      userId: params.userId,
      instanceId: params.instanceId,
      agentId: params.agentId,
      runtime: toDbChatRuntime(params.runtime),
      OR: [
        { id: params.visibleSessionId },
        { conversationGroupId: params.visibleSessionId },
      ],
    },
    orderBy: [
      { isActive: 'desc' },
      { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      isActive: true,
      sessionId: true,
    },
  })
}

function readAgentModel(agentsList: unknown, agentId: string): string | undefined {
  const agents = Array.isArray(agentsList)
    ? agentsList
    : isRecord(agentsList) && Array.isArray(agentsList.agents)
      ? agentsList.agents
      : []
  for (const agent of agents) {
    if (!isRecord(agent)) continue
    if (agent.id !== agentId) continue
    return typeof agent.model === 'string' ? agent.model : undefined
  }
  return undefined
}

async function describeOpenClawSession(params: {
  client: { request: (method: string, params?: Record<string, unknown>) => Promise<unknown> }
  sessionKey?: string
}): Promise<unknown> {
  if (!params.sessionKey) return undefined
  try {
    const result = await params.client.request('sessions.describe', {
      key: params.sessionKey,
    })
    return isRecord(result) ? result.session : undefined
  } catch {
    return undefined
  }
}

export const GET = withAuth(
  withPermission('chat:use', async (req, { user }) => {
    const url = new URL(req.url)
    const instanceId = url.searchParams.get('instanceId')?.trim()
    const agentId = url.searchParams.get('agentId')?.trim()
    const runtime = parseRuntime(url.searchParams.get('runtime'))
    const sessionId = url.searchParams.get('sessionId')?.trim() || undefined

    if (!instanceId || !agentId) {
      return NextResponse.json({ error: 'Missing instanceId or agentId' }, { status: 400 })
    }

    if (!(await canUseInstance({ instanceId, user }))) {
      return NextResponse.json({ error: 'No access to instance' }, { status: 403 })
    }

    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      select: { dockerConfig: true },
    })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }
    if (runtime === 'pi' && !instanceSupportsPiRuntime(instance.dockerConfig)) {
      return NextResponse.json({ model: null })
    }

    const lease = await getRuntimeGatewayClient(instanceId, runtime).catch(() => null)
    if (!lease) {
      return NextResponse.json({ model: null })
    }

    try {
      const configResult = await lease.client.request('config.get').catch(() => null)
      const config = isRecord(configResult) && isRecord(configResult.config)
        ? configResult.config
        : {}
      const settings = isRecord(configResult) ? configResult.settings : undefined
      const dbSession = await findRuntimeDbSession({
        userId: user.id,
        instanceId,
        agentId,
        runtime,
        visibleSessionId: sessionId,
      })
      const session =
        runtime === 'openclaw' && dbSession?.isActive
          ? await describeOpenClawSession({
              client: lease.client,
              sessionKey: dbSession.sessionId,
            })
          : undefined
      const agentsList =
        runtime === 'openclaw'
          ? await lease.client.request('agents.list').catch(() => null)
          : null
      const model = resolveChatModelSummary({
        runtime,
        config,
        agentId,
        agentModel: readAgentModel(agentsList, agentId),
        session,
        settings,
      })
      return NextResponse.json({ model })
    } finally {
      lease.release()
    }
  }),
)
