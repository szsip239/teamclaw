import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { querySchema } from '@/lib/validations/knowledge-base'
import { queryStream } from '@/lib/knowledge-base/rag-client'

// POST /api/v1/knowledge-bases/[id]/query/stream — SSE streaming Q&A
export const POST = withAuth(
  withPermission('knowledge:view', async (req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')

    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb || !isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = querySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    try {
      const stream = await queryStream({
        kbId,
        question: parsed.data.question,
        generateAnswer: parsed.data.generateAnswer,
        topK: parsed.data.topK,
      })

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message || 'Query failed' }, { status: 502 })
    }
  }),
)
