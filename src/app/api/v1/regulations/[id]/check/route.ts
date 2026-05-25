import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'

// POST /api/v1/regulations/[id]/check — mark current updates as seen
export const POST = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const id = param(ctx, 'id')
    const tracker = await prisma.regulationTracker.findUnique({ where: { id } })
    if (!tracker || tracker.userId !== ctx.user.id) {
      return NextResponse.json({ error: '追踪记录不存在' }, { status: 404 })
    }
    const updated = await prisma.regulationTracker.update({
      where: { id },
      data: { lastCheckedAt: new Date() },
    })
    return NextResponse.json({ lastCheckedAt: updated.lastCheckedAt?.toISOString() ?? null })
  }),
)
