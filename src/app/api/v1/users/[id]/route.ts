import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { updateUserSchema } from '@/lib/validations/user'
import { hasPermission } from '@/lib/auth/permissions'
import { auditLog } from '@/lib/audit'
import type { Prisma } from '@/generated/prisma'

const userSelectFields = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  departmentId: true,
  department: { select: { name: true } },
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const

function mapUser(u: { department?: { name: string } | null } & Record<string, unknown>) {
  return {
    ...u,
    departmentName: u.department?.name ?? null,
    department: undefined,
  }
}

// GET /api/v1/users/[id] — User detail
export const GET = withAuth(async (_req, { user, params }) => {
  const id = params?.id as string

  // Allow self-access or users:list permission
  if (id !== user.id && !hasPermission(user.role, 'users:list')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: userSelectFields,
  })

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ user: mapUser(target) })
})

// PUT /api/v1/users/[id] — Update user
export const PUT = withAuth(
  withPermission(
    'users:update',
    withValidation(updateUserSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = params.id

      const existing = await prisma.user.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Cannot change own role
      if (id === user.id && body.role !== undefined) {
        return NextResponse.json(
          { error: 'Cannot modify your own role' },
          { status: 400 },
        )
      }

      // Validate departmentId if provided
      if (body.departmentId) {
        const dept = await prisma.department.findUnique({
          where: { id: body.departmentId },
        })
        if (!dept) {
          return NextResponse.json({ error: 'Department not found' }, { status: 400 })
        }
      }

      const updateData: Prisma.UserUpdateInput = {}
      if (body.name !== undefined) updateData.name = body.name
      if (body.role !== undefined) updateData.role = body.role
      if (body.departmentId !== undefined) {
        updateData.department = body.departmentId
          ? { connect: { id: body.departmentId } }
          : { disconnect: true }
      }
      if (body.status !== undefined) updateData.status = body.status

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        select: userSelectFields,
      })

      auditLog({
        userId: user.id,
        action: 'USER_UPDATE',
        resource: 'user',
        resourceId: id,
        details: { name: updated.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ user: mapUser(updated) })
    }),
  ),
)

// DELETE /api/v1/users/[id] — Soft delete (set status=DISABLED)
export const DELETE = withAuth(
  withPermission('users:delete', async (req, { user, params }) => {
    const id = params?.id as string

    if (id === user.id) {
      return NextResponse.json(
        { error: 'Cannot disable your own account' },
        { status: 400 },
      )
    }

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await prisma.user.update({
      where: { id },
      data: { status: 'DISABLED' },
    })

    auditLog({
      userId: user.id,
      action: 'USER_DELETE',
      resource: 'user',
      resourceId: id,
      details: { name: existing.name, email: existing.email },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return new NextResponse(null, { status: 204 })
  }),
)
