import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { updateResourceSchema } from '@/lib/validations/resource'
import { encryptCredential, maskCredential, decryptCredential } from '@/lib/resources/credential-utils'
import { getDisplayName } from '@/lib/utils/display-name'
import { getProvider } from '@/lib/resources/providers'
import type { ResourceDetail, ResourceType, ResourceConfig } from '@/types/resource'

// GET /api/v1/resources/[id] — Resource detail (masked key)
export const GET = withAuth(
  withPermission('resources:manage', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少资源 ID' }, { status: 400 })
    }

    const resource = await prisma.resource.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true, email: true } } },
    })

    if (!resource) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 })
    }

    let maskedKey = '***'
    try {
      maskedKey = maskCredential(decryptCredential(resource.credentials))
    } catch { /* keep masked */ }

    const detail: ResourceDetail = {
      id: resource.id,
      name: resource.name,
      type: resource.type as ResourceType,
      provider: resource.provider,
      providerName: getProvider(resource.provider)?.name ?? resource.provider,
      status: resource.status as ResourceDetail['status'],
      maskedKey,
      config: resource.config as ResourceConfig | null,
      description: resource.description,
      isDefault: resource.isDefault,
      lastTestedAt: resource.lastTestedAt?.toISOString() ?? null,
      lastTestError: resource.lastTestError,
      createdByName: getDisplayName(resource.createdBy),
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    }

    return NextResponse.json(detail)
  }),
)

// PUT /api/v1/resources/[id] — Update resource
export const PUT = withAuth(
  withPermission(
    'resources:manage',
    withValidation(updateResourceSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }
      const id = ctx.params?.id as string
      if (!id) {
        return NextResponse.json({ error: '缺少资源 ID' }, { status: 400 })
      }

      const resource = await prisma.resource.findUnique({ where: { id } })
      if (!resource) {
        return NextResponse.json({ error: '资源不存在' }, { status: 404 })
      }

      const updateData: Prisma.ResourceUpdateInput = {}
      if (body.name !== undefined) updateData.name = body.name
      if (body.type !== undefined) updateData.type = body.type
      if (body.provider !== undefined) updateData.provider = body.provider
      if (body.description !== undefined) updateData.description = body.description
      if (body.config !== undefined) updateData.config = body.config as Prisma.InputJsonValue
      if (body.apiKey !== undefined) {
        updateData.credentials = encryptCredential(body.apiKey)
        // Reset test status when key changes
        updateData.status = 'UNTESTED'
        updateData.lastTestedAt = null
        updateData.lastTestError = null
      }

      // Handle isDefault toggle
      if (body.isDefault !== undefined) {
        updateData.isDefault = body.isDefault
        if (body.isDefault) {
          const type = body.type ?? resource.type
          const provider = body.provider ?? resource.provider
          await prisma.resource.updateMany({
            where: { type, provider, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          })
        }
      }

      const updated = await prisma.resource.update({
        where: { id },
        data: updateData,
        include: { createdBy: { select: { name: true, email: true } } },
      })

      let maskedKey = '***'
      try {
        maskedKey = maskCredential(decryptCredential(updated.credentials))
      } catch { /* keep masked */ }

      auditLog({
        userId: user.id,
        action: 'RESOURCE_UPDATE',
        resource: 'resource',
        resourceId: id,
        details: { name: updated.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        id: updated.id,
        name: updated.name,
        type: updated.type,
        provider: updated.provider,
        providerName: getProvider(updated.provider)?.name ?? updated.provider,
        status: updated.status,
        maskedKey,
        config: updated.config,
        description: updated.description,
        isDefault: updated.isDefault,
        lastTestedAt: updated.lastTestedAt?.toISOString() ?? null,
        lastTestError: updated.lastTestError,
        createdByName: getDisplayName(updated.createdBy),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      })
    }),
  ),
)

// DELETE /api/v1/resources/[id] — Delete resource
export const DELETE = withAuth(
  withPermission('resources:manage', async (req, { user, params }) => {
    const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? ''
    if (!id) {
      return NextResponse.json({ error: '缺少资源 ID' }, { status: 400 })
    }

    const resource = await prisma.resource.findUnique({ where: { id } })
    if (!resource) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 })
    }

    await prisma.resource.delete({ where: { id } })

    auditLog({
      userId: user.id,
      action: 'RESOURCE_DELETE',
      resource: 'resource',
      resourceId: id,
      details: { name: resource.name },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return NextResponse.json({ status: 'deleted' })
  }),
)
