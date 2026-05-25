import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import type { ChatSessionResponse } from '@/types/chat'

// GET /api/v1/chat/sessions — list current user's chat sessions
export const GET = withAuth(
  withPermission('chat:use', async (_req, { user }) => {
    const rows = await prisma.chatSession.findMany({
      where: { userId: user.id },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      include: {
        instance: { select: { name: true } },
      },
    })

    const sessions: ChatSessionResponse[] = rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      instanceId: r.instanceId,
      instanceName: r.instance.name,
      agentId: r.agentId,
      title: r.title,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      messageCount: r.messageCount,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({ sessions })
  }),
)
