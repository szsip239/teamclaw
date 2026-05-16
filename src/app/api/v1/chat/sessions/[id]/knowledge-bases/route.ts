import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, param, type AuthContext } from '@/lib/middleware/auth'
import { mountKbSchema } from '@/lib/validations/chat'
import { isKbVisible } from '@/lib/knowledge-base/permissions'

// GET /api/v1/chat/sessions/[id]/knowledge-bases
// List mounted KBs + auto-mounted RULES KBs for a chat session
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const sessionId = param(ctx, 'id')

  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, mountedKbIds: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.userId !== ctx.user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Fetch mounted KB metadata
  const mountedKbIds = session.mountedKbIds ?? []
  const mountedKbs =
    mountedKbIds.length > 0
      ? await prisma.knowledgeBase.findMany({
          where: { id: { in: mountedKbIds } },
          select: {
            id: true,
            name: true,
            description: true,
            scope: true,
            category: true,
            departmentId: true,
            department: { select: { name: true } },
            createdById: true,
            createdBy: { select: { name: true } },
            documentCount: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : []

  // Fetch auto-mounted RULES KBs
  const autoRulesKbs = await prisma.knowledgeBase.findMany({
    where: { category: 'RULES' },
    select: {
      id: true,
      name: true,
      description: true,
      scope: true,
      category: true,
      departmentId: true,
      department: { select: { name: true } },
      createdById: true,
      createdBy: { select: { name: true } },
      documentCount: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    kbIds: mountedKbIds,
    knowledgeBases: mountedKbs.map(formatKb),
    autoRules: autoRulesKbs.map(formatKb),
  })
})

// POST /api/v1/chat/sessions/[id]/knowledge-bases
// Mount a KB to the session
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const sessionId = param(ctx, 'id')

  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, mountedKbIds: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.userId !== ctx.user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = mountKbSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { kbId } = parsed.data

  // Reject RULES KBs — they are auto-mounted
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: kbId },
    select: { id: true, scope: true, category: true, departmentId: true, createdById: true },
  })

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
  }

  if (kb.category === 'RULES') {
    return NextResponse.json({ error: 'Rules KBs are auto-mounted and cannot be manually toggled' }, { status: 400 })
  }

  if (!isKbVisible(kb, ctx.user)) {
    return NextResponse.json({ error: 'Knowledge base not accessible' }, { status: 403 })
  }

  // Check max 10 mounted KBs (not counting RULES auto-mounts)
  const currentIds = session.mountedKbIds ?? []
  if (currentIds.length >= 10) {
    return NextResponse.json({ error: 'Maximum 10 knowledge bases per session' }, { status: 400 })
  }

  // Idempotent: don't add duplicates
  if (currentIds.includes(kbId)) {
    return NextResponse.json({ kbIds: currentIds })
  }

  const updatedIds = [...currentIds, kbId]
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { mountedKbIds: updatedIds },
  })

  return NextResponse.json({ kbIds: updatedIds })
})

// DELETE /api/v1/chat/sessions/[id]/knowledge-bases?kbId=xxx
// Unmount a KB from the session
export const DELETE = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const sessionId = param(ctx, 'id')
  const kbId = new URL(req.url).searchParams.get('kbId')

  if (!kbId) {
    return NextResponse.json({ error: 'kbId query parameter required' }, { status: 400 })
  }

  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, mountedKbIds: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.userId !== ctx.user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Reject unmounting RULES
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: kbId },
    select: { category: true },
  })

  if (kb?.category === 'RULES') {
    return NextResponse.json({ error: 'Rules KBs cannot be unmounted' }, { status: 400 })
  }

  const currentIds = session.mountedKbIds ?? []
  const updatedIds = currentIds.filter((id) => id !== kbId)

  if (updatedIds.length === currentIds.length) {
    // Already not mounted — no change
    return NextResponse.json({ kbIds: currentIds })
  }

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { mountedKbIds: updatedIds },
  })

  return NextResponse.json({ kbIds: updatedIds })
})

// Helper: format a KB record for API response
function formatKb(kb: {
  id: string
  name: string
  description: string | null
  scope: string
  category: string
  departmentId: string | null
  department: { name: string } | null
  createdById: string
  createdBy: { name: string }
  documentCount: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: kb.id,
    name: kb.name,
    description: kb.description,
    scope: kb.scope,
    category: kb.category,
    departmentId: kb.departmentId,
    departmentName: kb.department?.name ?? null,
    createdById: kb.createdById,
    creatorName: kb.createdBy.name,
    documentCount: kb.documentCount,
    createdAt: kb.createdAt.toISOString(),
    updatedAt: kb.updatedAt.toISOString(),
  }
}
