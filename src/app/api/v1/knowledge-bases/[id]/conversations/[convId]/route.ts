import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'

async function loadConversation(kbId: string, convId: string, userId: string) {
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
  if (!kb) return { kb: null, conv: null }
  const conv = await prisma.kbConversation.findFirst({
    where: { id: convId, knowledgeBaseId: kbId, userId },
  })
  return { kb, conv }
}

// PATCH /api/v1/knowledge-bases/[id]/conversations/[convId] — rename.
export const PATCH = withAuth(
  withPermission('knowledge:view', async (req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const convId = param(ctx, 'convId')
    const { kb, conv } = await loadConversation(kbId, convId, ctx.user.id)
    if (!kb || !isKbVisible(kb, ctx.user) || !conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = (await req.json().catch(() => ({}))) as { title?: string }
    const next = (body.title || '').trim().slice(0, 80)
    if (!next) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 })
    }

    const updated = await prisma.kbConversation.update({
      where: { id: convId },
      data: { title: next },
    })
    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt.toISOString(),
    })
  }),
)

// DELETE /api/v1/knowledge-bases/[id]/conversations/[convId] — drop the
// conversation (cascade deletes its messages).
export const DELETE = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const convId = param(ctx, 'convId')
    const { kb, conv } = await loadConversation(kbId, convId, ctx.user.id)
    if (!kb || !isKbVisible(kb, ctx.user) || !conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.kbConversation.delete({ where: { id: convId } })
    return NextResponse.json({ deleted: true })
  }),
)
