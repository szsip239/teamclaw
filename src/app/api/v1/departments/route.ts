import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { createDepartmentSchema } from '@/lib/validations/department'
import { auditLog } from '@/lib/audit'

// ─── GET /api/v1/departments — List departments ────────────────────

export const GET = withAuth(
  withPermission('departments:view', async (_req) => {
    try {
      const departments = await prisma.department.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              instanceAccess: true,
            },
          },
        },
      })

      const result = departments.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        userCount: d._count.users,
        accessCount: d._count.instanceAccess,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }))

      return NextResponse.json({ departments: result })
    } catch (err) {
      console.error('GET /api/v1/departments error:', err)
      return NextResponse.json(
        { error: 'Failed to fetch department list' },
        { status: 500 },
      )
    }
  }),
)

// ─── POST /api/v1/departments — Create department ──────────────────

export const POST = withAuth(
  withPermission(
    'departments:manage',
    withValidation(createDepartmentSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }

      // Check name uniqueness
      const existing = await prisma.department.findUnique({
        where: { name: body.name },
      })
      if (existing) {
        return NextResponse.json({ error: 'Department name already exists' }, { status: 409 })
      }

      const department = await prisma.department.create({
        data: {
          name: body.name,
          description: body.description,
        },
        include: {
          _count: {
            select: {
              users: true,
              instanceAccess: true,
            },
          },
        },
      })

      auditLog({
        userId: user.id,
        action: 'DEPARTMENT_CREATE',
        resource: 'department',
        resourceId: department.id,
        details: { name: department.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json(
        {
          department: {
            id: department.id,
            name: department.name,
            description: department.description,
            userCount: department._count.users,
            accessCount: department._count.instanceAccess,
            createdAt: department.createdAt.toISOString(),
            updatedAt: department.updatedAt.toISOString(),
          },
        },
        { status: 201 },
      )
    }),
  ),
)
