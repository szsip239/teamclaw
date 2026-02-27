import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { updateInstanceSchema } from '@/lib/validations/instance'
import { encrypt } from '@/lib/auth/encryption'
import { auditLog } from '@/lib/audit'
import { registry } from '@/lib/gateway/registry'
import type { Prisma } from '@/generated/prisma'
import { dockerManager } from '@/lib/docker'
import { cleanupInstanceFiles } from '@/lib/docker/config-generator'

// GET /api/v1/instances/[id] — Instance detail
export const GET = withAuth(
  withPermission('instances:view', async (_req, { params }) => {
    const instance = await prisma.instance.findUnique({
      where: { id: params!.id as string },
      select: {
        id: true,
        name: true,
        description: true,
        gatewayUrl: true,
        containerId: true,
        containerName: true,
        imageName: true,
        dockerConfig: true,
        status: true,
        lastHealthCheck: true,
        healthData: true,
        version: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    return NextResponse.json({ instance })
  }),
)

// PUT /api/v1/instances/[id] — Update instance
export const PUT = withAuth(
  withPermission(
    'instances:manage',
    withValidation(updateInstanceSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = params.id

      const existing = await prisma.instance.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
      }

      // Check name uniqueness if name is being changed
      if (body.name && body.name !== existing.name) {
        const nameConflict = await prisma.instance.findUnique({
          where: { name: body.name },
        })
        if (nameConflict) {
          return NextResponse.json({ error: 'Instance name already exists' }, { status: 409 })
        }
      }

      const updateData: Prisma.InstanceUpdateInput = {}
      if (body.name !== undefined) updateData.name = body.name
      if (body.description !== undefined) updateData.description = body.description
      if (body.gatewayUrl !== undefined) updateData.gatewayUrl = body.gatewayUrl
      if (body.gatewayToken !== undefined) updateData.gatewayToken = encrypt(body.gatewayToken)
      if (body.docker !== undefined) {
        updateData.dockerConfig = body.docker as unknown as Prisma.InputJsonValue
        if (body.docker.imageName) updateData.imageName = body.docker.imageName
      }

      const instance = await prisma.instance.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          description: true,
          gatewayUrl: true,
          containerId: true,
          containerName: true,
          imageName: true,
          dockerConfig: true,
          status: true,
          lastHealthCheck: true,
          healthData: true,
          version: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      auditLog({
        userId: user.id,
        action: 'INSTANCE_UPDATE',
        resource: 'instance',
        resourceId: id,
        details: { name: instance.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ instance })
    }),
  ),
)

// DELETE /api/v1/instances/[id] — Delete instance
export const DELETE = withAuth(
  withPermission('instances:manage', async (req, { user, params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    // Disconnect from gateway
    await registry.disconnect(id)

    // Stop and remove container if managed
    if (instance.containerId) {
      try {
        await dockerManager.stopContainer(instance.containerId)
      } catch {
        // Container may already be stopped
      }
      try {
        await dockerManager.removeContainer(instance.containerId, true)
      } catch {
        // Container may not exist
      }
    }

    await prisma.instance.delete({ where: { id } })

    // Clean up host data directory
    try {
      await cleanupInstanceFiles(instance.name)
    } catch {
      // Non-fatal: log but don't fail the delete
    }

    auditLog({
      userId: user.id,
      action: 'INSTANCE_DELETE',
      resource: 'instance',
      resourceId: id,
      details: { name: instance.name },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return new NextResponse(null, { status: 204 })
  }),
)
