import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { grantAccessSchema } from '@/lib/validations/instance-access'
import { auditLog } from '@/lib/audit'
import { Prisma } from '@/generated/prisma'

// ─── GET /api/v1/instance-access — List access grants ──────────────

export const GET = withAuth(
  withPermission('instance_access:manage', async (req) => {
    const url = new URL(req.url)
    const departmentId = url.searchParams.get('departmentId')
    const instanceId = url.searchParams.get('instanceId')

    const where: Prisma.InstanceAccessWhereInput = {
      ...(departmentId ? { departmentId } : {}),
      ...(instanceId ? { instanceId } : {}),
    }

    const grants = await prisma.instanceAccess.findMany({
      where,
      include: {
        department: { select: { name: true } },
        instance: { select: { name: true, status: true } },
        grantedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = grants.map((g) => ({
      id: g.id,
      departmentId: g.departmentId,
      departmentName: g.department.name,
      instanceId: g.instanceId,
      instanceName: g.instance.name,
      instanceStatus: g.instance.status,
      agentIds: g.agentIds as string[] | null,
      grantedByName: g.grantedBy.name,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }))

    return NextResponse.json({ grants: result })
  }),
)

// ─── POST /api/v1/instance-access — Grant access ───────────────────

export const POST = withAuth(
  withPermission(
    'instance_access:manage',
    withValidation(grantAccessSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }

      // Verify department exists
      const department = await prisma.department.findUnique({
        where: { id: body.departmentId },
      })
      if (!department) {
        return NextResponse.json({ error: '部门不存在' }, { status: 404 })
      }

      // Verify instance exists
      const instance = await prisma.instance.findUnique({
        where: { id: body.instanceId },
      })
      if (!instance) {
        return NextResponse.json({ error: '实例不存在' }, { status: 404 })
      }

      // Upsert on unique(departmentId, instanceId)
      const grant = await prisma.instanceAccess.upsert({
        where: {
          departmentId_instanceId: {
            departmentId: body.departmentId,
            instanceId: body.instanceId,
          },
        },
        update: {
          agentIds: body.agentIds !== undefined
            ? (body.agentIds as unknown as Prisma.InputJsonValue ?? Prisma.DbNull)
            : undefined,
          grantedById: user.id,
        },
        create: {
          departmentId: body.departmentId,
          instanceId: body.instanceId,
          agentIds: body.agentIds != null
            ? (body.agentIds as unknown as Prisma.InputJsonValue)
            : undefined,
          grantedById: user.id,
        },
        include: {
          department: { select: { name: true } },
          instance: { select: { name: true, status: true } },
          grantedBy: { select: { name: true } },
        },
      })

      auditLog({
        userId: user.id,
        action: 'INSTANCE_ACCESS_GRANT',
        resource: 'instance_access',
        resourceId: grant.id,
        details: {
          departmentName: department.name,
          instanceName: instance.name,
        },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json(
        {
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
        },
        { status: 201 },
      )
    }),
  ),
)
