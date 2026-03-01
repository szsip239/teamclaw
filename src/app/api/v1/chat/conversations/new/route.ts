import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { archiveSession } from '@/lib/chat/snapshot-helpers'

const bodySchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
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

    const { instanceId, agentId } = parsed.data

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

    // Find current active session
    const activeSession = await prisma.chatSession.findFirst({
      where: { userId: user.id, instanceId, agentId, isActive: true },
    })

    if (activeSession) {
      // Archive the active session using shared helper
      await ensureRegistryInitialized()
      const client = registry.getClient(instanceId)

      if (client) {
        await archiveSession(activeSession.id, instanceId, agentId, user.id, client)
      } else {
        // No client — just mark inactive + clear liveMessages
        await prisma.chatSession.update({
          where: { id: activeSession.id },
          data: { isActive: false, liveMessages: Prisma.DbNull },
        })
      }
    }

    // Create new active session
    const sessionKey = `agent:${agentId}:tc:${user.id}`
    const newSession = await prisma.chatSession.create({
      data: {
        userId: user.id,
        instanceId,
        agentId,
        sessionId: sessionKey,
        isActive: true,
      },
      include: { instance: { select: { name: true } } },
    })

    return NextResponse.json({
      session: {
        id: newSession.id,
        sessionId: newSession.sessionId,
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
