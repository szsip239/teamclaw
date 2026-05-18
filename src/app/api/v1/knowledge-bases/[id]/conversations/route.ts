import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'

// GET /api/v1/knowledge-bases/[id]/conversations
// List the current user's QA conversations for this KB, most recent first.
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const conversations = await prisma.kbConversation.findMany({
      where: { knowledgeBaseId: kbId, userId: ctx.user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    })

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c._count.messages,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    })
  }),
)

// POST /api/v1/knowledge-bases/[id]/conversations
// Create a fresh empty conversation.
export const POST = withAuth(
  withPermission('knowledge:view', async (req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    let title = '新对话'
    try {
      const body = (await req.json().catch(() => ({}))) as { title?: string }
      if (typeof body.title === 'string' && body.title.trim()) {
        title = body.title.trim().slice(0, 80)
      }
    } catch {
      /* empty body is fine */
    }

    const conversation = await prisma.kbConversation.create({
      data: {
        knowledgeBaseId: kbId,
        userId: ctx.user.id,
        title,
      },
    })

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      messageCount: 0,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    })
  }),
)
