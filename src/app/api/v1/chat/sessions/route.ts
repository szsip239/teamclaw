import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { fromDbChatRuntime } from '@/lib/chat/runtime'
import { groupChatSessions } from '@/lib/chat/conversation-groups'
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
      conversationGroupId: r.conversationGroupId ?? undefined,
      sessionId: r.sessionId,
      runtime: fromDbChatRuntime(r.runtime),
      instanceId: r.instanceId,
      instanceName: r.instance.name,
      agentId: r.agentId,
      title: r.title,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      messageCount: r.messageCount,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({ sessions: groupChatSessions(sessions) })
  }),
)
