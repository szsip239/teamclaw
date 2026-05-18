import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'

// DELETE /api/v1/knowledge-bases/[id]/conversations/[convId]/messages/[msgId]
// Drop a single message. Used by the chat UI's per-round delete and the
// regenerate flow (which removes the old assistant answer before re-streaming).
export const DELETE = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const convId = param(ctx, 'convId')
    const msgId = param(ctx, 'msgId')

    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb || !isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const conv = await prisma.kbConversation.findFirst({
      where: { id: convId, knowledgeBaseId: kbId, userId: ctx.user.id },
    })
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const message = await prisma.kbMessage.findFirst({
      where: { id: msgId, conversationId: convId },
      select: { id: true },
    })
    if (!message) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.kbMessage.delete({ where: { id: msgId } })
    return NextResponse.json({ deleted: true })
  }),
)
