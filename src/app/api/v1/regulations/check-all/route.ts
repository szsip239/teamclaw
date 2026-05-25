import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withPermission, type AuthContext } from '@/lib/middleware/auth'
import { runCheckForUser } from '@/lib/regulation/check'

// POST /api/v1/regulations/check-all — run check pipeline for every tracker
// owned by the current user. Convenience endpoint for the chat agent / cron.
export const POST = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    try {
      const results = await runCheckForUser(ctx.user.id)
      return NextResponse.json({
        ranAt: new Date().toISOString(),
        results,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'check pipeline failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }),
)
