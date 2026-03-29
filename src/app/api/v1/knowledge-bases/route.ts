import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, type AuthContext } from '@/lib/middleware/auth'
import { createKbSchema } from '@/lib/validations/knowledge-base'
import { kbListWhereClause } from '@/lib/knowledge-base/permissions'
import { hasPermission } from '@/lib/auth/permissions'

// GET /api/v1/knowledge-bases — list knowledge bases
export const GET = withAuth(
  withPermission('knowledge:view', async (req: NextRequest, ctx: AuthContext) => {
    const url = new URL(req.url)
    const scope = url.searchParams.get('scope')
    const search = url.searchParams.get('search')

    const where: Record<string, unknown> = {
      ...kbListWhereClause(ctx.user),
    }

    if (scope && scope !== 'all') {
      where.scope = scope
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [knowledgeBases, total] = await Promise.all([
      prisma.knowledgeBase.findMany({
        where,
        include: {
          createdBy: { select: { name: true } },
          department: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.knowledgeBase.count({ where }),
    ])

    return NextResponse.json({
      knowledgeBases: knowledgeBases.map((kb) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        scope: kb.scope,
        departmentId: kb.departmentId,
        departmentName: kb.department?.name ?? null,
        createdById: kb.createdById,
        creatorName: kb.createdBy.name,
        documentCount: kb.documentCount,
        createdAt: kb.createdAt.toISOString(),
        updatedAt: kb.updatedAt.toISOString(),
      })),
      total,
    })
  }),
)

// POST /api/v1/knowledge-bases — create knowledge base
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = createKbSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { name, description, scope: rawScope, departmentId } = parsed.data
  const scope = rawScope ?? 'PERSONAL'

  // Permission check based on scope
  if (scope === 'GLOBAL' && !hasPermission(ctx.user.role, 'knowledge:manage_global')) {
    return NextResponse.json({ error: 'No permission to create GLOBAL KB' }, { status: 403 })
  }
  if (scope === 'DEPARTMENT' && !hasPermission(ctx.user.role, 'knowledge:manage_dept')) {
    return NextResponse.json({ error: 'No permission to create DEPARTMENT KB' }, { status: 403 })
  }

  const effectiveDeptId = scope === 'DEPARTMENT'
    ? (departmentId || ctx.user.departmentId)
    : null

  if (scope === 'DEPARTMENT' && !effectiveDeptId) {
    return NextResponse.json({ error: 'Department required for DEPARTMENT scope' }, { status: 400 })
  }

  const kb = await prisma.knowledgeBase.create({
    data: {
      name,
      description: description ?? null,
      scope,
      departmentId: effectiveDeptId,
      createdById: ctx.user.id,
    },
  })

  return NextResponse.json({ id: kb.id, name: kb.name }, { status: 201 })
})
