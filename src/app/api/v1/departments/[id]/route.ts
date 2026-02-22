import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import { updateDepartmentSchema } from '@/lib/validations/department'
import { auditLog } from '@/lib/audit'

// ─── GET /api/v1/departments/[id] — Department detail ──────────────

export const GET = withAuth(
  withPermission('departments:view', async (_req, ctx) => {
    const id = param(ctx, 'id')

    // DEPT_ADMIN can only view their own department's detail
    if (ctx.user.role === 'DEPT_ADMIN' && ctx.user.departmentId !== id) {
      return NextResponse.json({ error: '无权查看其他部门详情' }, { status: 403 })
    }

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            avatar: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        instanceAccess: {
          include: {
            instance: {
              select: { name: true, status: true },
            },
            grantedBy: {
              select: { name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            users: true,
            instanceAccess: true,
          },
        },
      },
    })

    if (!department) {
      return NextResponse.json({ error: '部门不存在' }, { status: 404 })
    }

    return NextResponse.json({
      department: {
        id: department.id,
        name: department.name,
        description: department.description,
        userCount: department._count.users,
        accessCount: department._count.instanceAccess,
        createdAt: department.createdAt.toISOString(),
        updatedAt: department.updatedAt.toISOString(),
        users: department.users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          avatar: u.avatar,
        })),
        instanceAccess: department.instanceAccess.map((a) => ({
          id: a.id,
          instanceId: a.instanceId,
          instanceName: a.instance.name,
          instanceStatus: a.instance.status,
          agentIds: a.agentIds as string[] | null,
          grantedByName: a.grantedBy.name,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    })
  }),
)

// ─── PUT /api/v1/departments/[id] — Update department ──────────────

export const PUT = withAuth(
  withPermission(
    'departments:manage',
    withValidation(updateDepartmentSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = param(ctx as unknown as import('@/lib/middleware/auth').AuthContext, 'id')

      const existing = await prisma.department.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: '部门不存在' }, { status: 404 })
      }

      // Check name uniqueness if name is being changed
      if (body.name && body.name !== existing.name) {
        const nameConflict = await prisma.department.findUnique({
          where: { name: body.name },
        })
        if (nameConflict) {
          return NextResponse.json({ error: '部门名称已存在' }, { status: 409 })
        }
      }

      const department = await prisma.department.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
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
        action: 'DEPARTMENT_UPDATE',
        resource: 'department',
        resourceId: id,
        details: { name: department.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        department: {
          id: department.id,
          name: department.name,
          description: department.description,
          userCount: department._count.users,
          accessCount: department._count.instanceAccess,
          createdAt: department.createdAt.toISOString(),
          updatedAt: department.updatedAt.toISOString(),
        },
      })
    }),
  ),
)

// ─── DELETE /api/v1/departments/[id] — Delete department ───────────

export const DELETE = withAuth(
  withPermission('departments:manage', async (req, ctx) => {
    const { user } = ctx
    const id = param(ctx, 'id')

    const department = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    })

    if (!department) {
      return NextResponse.json({ error: '部门不存在' }, { status: 404 })
    }

    if (department._count.users > 0) {
      return NextResponse.json(
        { error: '部门下还有成员，无法删除。请先将成员移出该部门。' },
        { status: 400 },
      )
    }

    await prisma.department.delete({ where: { id } })

    auditLog({
      userId: user.id,
      action: 'DEPARTMENT_DELETE',
      resource: 'department',
      resourceId: id,
      details: { name: department.name },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return new NextResponse(null, { status: 204 })
  }),
)
