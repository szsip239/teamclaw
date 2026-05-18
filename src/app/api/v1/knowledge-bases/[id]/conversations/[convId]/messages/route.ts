import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { Prisma } from '@/generated/prisma'

async function loadConversation(kbId: string, convId: string, userId: string) {
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
  if (!kb) return { kb: null, conv: null }
  const conv = await prisma.kbConversation.findFirst({
    where: { id: convId, knowledgeBaseId: kbId, userId },
  })
  return { kb, conv }
}

function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue)
}

// GET /api/v1/knowledge-bases/[id]/conversations/[convId]/messages
// Load the full transcript for a conversation. Used when the user clicks
// a past conversation in the sidebar.
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const convId = param(ctx, 'convId')
    const { kb, conv } = await loadConversation(kbId, convId, ctx.user.id)
    if (!kb || !isKbVisible(kb, ctx.user) || !conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const messages = await prisma.kbMessage.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({
      conversation: {
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        reasoning: m.reasoning,
        stage: m.stage,
        error: m.error,
        stopped: m.stopped,
        answerSources: m.answerSourcesJson ?? [],
        answerAssets: m.answerAssetsJson ?? [],
        retrievalGroups: m.retrievalGroupsJson ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    })
  }),
)

// POST /api/v1/knowledge-bases/[id]/conversations/[convId]/messages
// Append a message after the chat UI finishes streaming. The frontend
// calls this twice per round (once for the user prompt, once for the
// completed assistant reply) so the conversation can be rehydrated
// later.
export const POST = withAuth(
  withPermission('knowledge:view', async (req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const convId = param(ctx, 'convId')
    const { kb, conv } = await loadConversation(kbId, convId, ctx.user.id)
    if (!kb || !isKbVisible(kb, ctx.user) || !conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = (await req.json().catch(() => null)) as {
      role?: string
      content?: string
      reasoning?: string
      stage?: string
      error?: boolean
      stopped?: boolean
      answerSources?: unknown
      answerAssets?: unknown
      retrievalGroups?: unknown
      autoTitle?: boolean
    } | null
    if (!body || (body.role !== 'user' && body.role !== 'assistant')) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const role = body.role
    const content = (body.content || '').slice(0, 200000)

    const message = await prisma.kbMessage.create({
      data: {
        conversationId: convId,
        role,
        content,
        reasoning: body.reasoning ? body.reasoning.slice(0, 200000) : null,
        stage: body.stage ?? null,
        error: !!body.error,
        stopped: !!body.stopped,
        answerSourcesJson: nullableJson(body.answerSources),
        answerAssetsJson: nullableJson(body.answerAssets),
        retrievalGroupsJson: nullableJson(body.retrievalGroups),
      },
    })

    // Auto-title: if this is the first user message and the title is still
    // the default placeholder, derive a title from the message content.
    const updates: { updatedAt: Date; title?: string } = { updatedAt: new Date() }
    if (body.autoTitle && role === 'user') {
      const trimmed = content.trim().replace(/\s+/g, ' ').slice(0, 40)
      if (trimmed) updates.title = trimmed
    }
    await prisma.kbConversation.update({ where: { id: convId }, data: updates })

    return NextResponse.json({
      id: message.id,
      createdAt: message.createdAt.toISOString(),
    })
  }),
)
