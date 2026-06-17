import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { archiveSession } from '@/lib/chat/snapshot-helpers'
import {
  buildChatRuntimeSessionKey,
  fromDbChatRuntime,
  instanceSupportsPiRuntime,
  toDbChatRuntime,
} from '@/lib/chat/runtime'
import { getRuntimeGatewayClient, markSessionInactive } from '@/lib/chat/runtime-gateway'

const bodySchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
  runtime: z.enum(['openclaw', 'pi']).default('openclaw'),
})

// POST /api/v1/chat/conversations/new — archive current session and create a new one
export const POST = withAuth(
  withPermission('chat:use', async (req, { user }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { instanceId, agentId, runtime } = parsed.data
    const dbRuntime = toDbChatRuntime(runtime)

    // Permission check
    if (user.role !== 'SYSTEM_ADMIN') {
      if (!user.departmentId) {
        return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
      }
      const access = await prisma.instanceAccess.findUnique({
        where: {
          departmentId_instanceId: {
            departmentId: user.departmentId,
            instanceId,
          },
        },
      })
      if (!access) {
        return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
      }
      const allowedIds = access.agentIds as string[] | null
      if (allowedIds && !allowedIds.includes(agentId)) {
        return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
      }
    }

    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      select: { dockerConfig: true },
    })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }
    if (runtime === 'pi' && !instanceSupportsPiRuntime(instance.dockerConfig)) {
      return NextResponse.json(
        { error: 'Pi runtime is not enabled for this instance' },
        { status: 503 },
      )
    }
    // Starting a visible conversation resets all active runtime sessions for this agent.
    const activeSessions = await prisma.chatSession.findMany({
      where: { userId: user.id, instanceId, agentId, isActive: true },
    })

    for (const activeSession of activeSessions) {
      const sessionRuntime = fromDbChatRuntime(activeSession.runtime)
      const lease = await getRuntimeGatewayClient(instanceId, sessionRuntime).catch(() => null)

      if (!lease) {
        await markSessionInactive(activeSession.id)
      } else {
        try {
          await archiveSession(activeSession.id, instanceId, agentId, user.id, lease.client, {
            runtime: sessionRuntime,
            triggerMemoryDump: sessionRuntime === 'openclaw',
            waitForNewCompletion: sessionRuntime === 'openclaw',
          })
        } finally {
          lease.release()
        }
      }
    }

    // Create new active session
    const sessionKey = buildChatRuntimeSessionKey(runtime, agentId, user.id)
    const conversationGroupId = randomUUID()
    const newSession = await prisma.chatSession.create({
      data: {
        userId: user.id,
        instanceId,
        agentId,
        runtime: dbRuntime,
        conversationGroupId,
        sessionId: sessionKey,
        isActive: true,
      },
      include: { instance: { select: { name: true } } },
    })

    return NextResponse.json({
      session: {
        id: conversationGroupId,
        conversationGroupId,
        sessionId: newSession.sessionId,
        runtime,
        runtimes: [runtime],
        sessionIdsByRuntime: { [runtime]: newSession.id },
        instanceId: newSession.instanceId,
        instanceName: newSession.instance.name,
        agentId: newSession.agentId,
        title: newSession.title,
        lastMessageAt: null,
        messageCount: 0,
        isActive: true,
        createdAt: newSession.createdAt.toISOString(),
      },
    })
  }),
)
