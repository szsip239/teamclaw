import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { archiveSession } from '@/lib/chat/snapshot-helpers'
import {
  buildChatRuntimeSessionKey,
  instanceSupportsPiRuntime,
  toDbChatRuntime,
} from '@/lib/chat/runtime'

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
    if (runtime === 'pi') {
      return NextResponse.json({ error: 'Pi runtime is not implemented yet' }, { status: 501 })
    }

    // Find current active session
    const activeSession = await prisma.chatSession.findFirst({
      where: { userId: user.id, instanceId, agentId, runtime: dbRuntime, isActive: true },
    })

    if (activeSession) {
      // Archive the active session using shared helper
      await ensureRegistryInitialized()
      const client = registry.getClient(instanceId)

      if (client) {
        await archiveSession(activeSession.id, instanceId, agentId, user.id, client, { triggerMemoryDump: true, waitForNewCompletion: true })
      } else {
        // No client — just mark inactive + clear liveMessages
        await prisma.chatSession.update({
          where: { id: activeSession.id },
          data: { isActive: false, liveMessages: Prisma.DbNull },
        })
      }
    }

    // Create new active session
    const sessionKey = buildChatRuntimeSessionKey(runtime, agentId, user.id)
    const newSession = await prisma.chatSession.create({
      data: {
        userId: user.id,
        instanceId,
        agentId,
        runtime: dbRuntime,
        sessionId: sessionKey,
        isActive: true,
      },
      include: { instance: { select: { name: true } } },
    })

    return NextResponse.json({
      session: {
        id: newSession.id,
        sessionId: newSession.sessionId,
        runtime,
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
