import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { archiveSession } from '@/lib/chat/snapshot-helpers'
import { fromDbChatRuntime } from '@/lib/chat/runtime'
import { getRuntimeGatewayClient } from '@/lib/chat/runtime-gateway'
import { Prisma, type ChatSession } from '@/generated/prisma'

async function resolveSessionsToClear(id: string, userId: string): Promise<ChatSession[]> {
  const session = await prisma.chatSession.findUnique({ where: { id } })

  if (session) {
    if (session.userId !== userId) {
      throw Object.assign(new Error('No access to this session'), { status: 403 })
    }
    return [session]
  }

  const groupSessions = await prisma.chatSession.findMany({
    where: { userId, conversationGroupId: id },
    orderBy: { createdAt: 'asc' },
  })
  if (groupSessions.length === 0) {
    throw Object.assign(new Error('Session not found'), { status: 404 })
  }
  return groupSessions
}

async function clearRuntimeSession(session: ChatSession): Promise<void> {
  if (!session.isActive) {
    throw Object.assign(new Error('Session is archived, cannot clear context'), { status: 400 })
  }

  const runtime = fromDbChatRuntime(session.runtime)
  const lease = await getRuntimeGatewayClient(session.instanceId, runtime).catch(() => null)
  if (!lease) {
    throw Object.assign(new Error('Instance not connected'), { status: 502 })
  }

  try {
    // Archive: snapshot messages + delete runtime session context (keeps DB session active)
    await archiveSession(
      session.id,
      session.instanceId,
      session.agentId,
      session.userId,
      lease.client,
      {
        keepActive: true,
        runtime,
        triggerMemoryDump: runtime === 'openclaw',
        waitForNewCompletion: runtime === 'openclaw',
      },
    )

    // Clear liveMessages and reset messageCount since context was reset.
    // messageCount must be reset to 0 so the session-lost detection
    // (which checks messageCount > 0) doesn't fire a false alarm.
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { liveMessages: Prisma.DbNull, messageCount: 0 },
    })
  } finally {
    lease.release()
  }
}

// POST /api/v1/chat/sessions/[id]/clear-context — snapshot messages and reset OpenClaw session
export const POST = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    try {
      const sessions = await resolveSessionsToClear(id, ctx.user.id)
      for (const session of sessions) {
        await clearRuntimeSession(session)
      }

      return NextResponse.json({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear context'
      const status = typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 502
      return NextResponse.json({ error: message }, { status })
    }
  }),
)
