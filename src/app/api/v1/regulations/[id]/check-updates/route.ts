import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { runCheckForTracker } from '@/lib/regulation/check'

// POST /api/v1/regulations/[id]/check-updates — run pipeline for one tracker
export const POST = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const id = param(ctx, 'id')
    const tracker = await prisma.regulationTracker.findUnique({ where: { id } })
    if (!tracker || tracker.userId !== ctx.user.id) {
      return NextResponse.json({ error: '追踪记录不存在' }, { status: 404 })
    }
    try {
      const result = await runCheckForTracker(id)
      return NextResponse.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'check pipeline failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }),
)
