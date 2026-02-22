import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import { updateAccessSchema } from '@/lib/validations/instance-access'
import { auditLog } from '@/lib/audit'
import { Prisma } from '@/generated/prisma'

// ─── PUT /api/v1/instance-access/[id] — Update agentIds ────────────

export const PUT = withAuth(
  withPermission(
    'instance_access:manage',
    withValidation(updateAccessSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }
      const id = param(ctx as unknown as import('@/lib/middleware/auth').AuthContext, 'id')

      const existing = await prisma.instanceAccess.findUnique({
        where: { id },
        include: {
          department: { select: { name: true } },
          instance: { select: { name: true } },
        },
      })
      if (!existing) {
        return NextResponse.json({ error: '授权记录不存在' }, { status: 404 })
      }

      const grant = await prisma.instanceAccess.update({
        where: { id },
        data: {
          agentIds: body.agentIds !== null
            ? (body.agentIds as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
        include: {
          department: { select: { name: true } },
          instance: { select: { name: true, status: true } },
          grantedBy: { select: { name: true } },
        },
      })

      auditLog({
        userId: user.id,
        action: 'INSTANCE_ACCESS_UPDATE',
        resource: 'instance_access',
        resourceId: id,
        details: {
          departmentName: existing.department.name,
          instanceName: existing.instance.name,
        },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        grant: {
          id: grant.id,
          departmentId: grant.departmentId,
          departmentName: grant.department.name,
          instanceId: grant.instanceId,
          instanceName: grant.instance.name,
          instanceStatus: grant.instance.status,
          agentIds: grant.agentIds as string[] | null,
          grantedByName: grant.grantedBy.name,
          createdAt: grant.createdAt.toISOString(),
          updatedAt: grant.updatedAt.toISOString(),
        },
      })
    }),
  ),
)

// ─── DELETE /api/v1/instance-access/[id] — Revoke access ───────────

export const DELETE = withAuth(
  withPermission('instance_access:manage', async (req, ctx) => {
    const { user } = ctx
    const id = param(ctx, 'id')

    const existing = await prisma.instanceAccess.findUnique({
      where: { id },
      include: {
        department: { select: { name: true } },
        instance: { select: { name: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: '授权记录不存在' }, { status: 404 })
    }

    await prisma.instanceAccess.delete({ where: { id } })

    auditLog({
      userId: user.id,
      action: 'INSTANCE_ACCESS_REVOKE',
      resource: 'instance_access',
      resourceId: id,
      details: {
        departmentName: existing.department.name,
        instanceName: existing.instance.name,
      },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return new NextResponse(null, { status: 204 })
  }),
)
