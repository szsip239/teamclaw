import { NextResponse } from 'next/server'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { clawHubSearchSchema } from '@/lib/validations/skill'
import { searchClawHub } from '@/lib/skills/clawhub'

// POST /api/v1/skills/clawhub/search - Search ClawHub for skills
export const POST = withAuth(
  withPermission(
    'skills:manage_global',
    withValidation(clawHubSearchSchema, async (_req, ctx) => {
      const { body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }

      try {
        const results = await searchClawHub(body.query)
        return NextResponse.json({ results })
      } catch (err) {
        return NextResponse.json(
          { error: `搜索 ClawHub 失败: ${(err as Error).message}` },
          { status: 500 },
        )
      }
    }),
  ),
)
