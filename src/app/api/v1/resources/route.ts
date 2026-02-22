import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { createResourceSchema } from '@/lib/validations/resource'
import { encryptCredential, maskCredential, decryptCredential } from '@/lib/resources/credential-utils'
import { getDisplayName } from '@/lib/utils/display-name'
import { getProvider } from '@/lib/resources/providers'
import type { ResourceOverview, ResourceListResponse, ResourceType, ResourceConfig } from '@/types/resource'

// GET /api/v1/resources — List resources with filtering
export const GET = withAuth(
  withPermission('resources:manage', async (req) => {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50')))
    const type = url.searchParams.get('type') as ResourceType | null
    const provider = url.searchParams.get('provider')
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')

    const where: Prisma.ResourceWhereInput = {}
    if (type) where.type = type
    if (provider) where.provider = provider
    if (status) where.status = status as Prisma.EnumResourceStatusFilter
    if (search) {
      const q = search.trim().slice(0, 100)
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ]
      }
    }

    const [resources, total] = await Promise.all([
      prisma.resource.findMany({
        where,
        include: { createdBy: { select: { name: true, email: true } } },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.resource.count({ where }),
    ])

    const items: ResourceOverview[] = resources.map((r) => {
      let maskedKey = '***'
      try {
        maskedKey = maskCredential(decryptCredential(r.credentials))
      } catch { /* keep masked */ }

      return {
        id: r.id,
        name: r.name,
        type: r.type as ResourceType,
        provider: r.provider,
        providerName: getProvider(r.provider)?.name ?? r.provider,
        status: r.status as ResourceOverview['status'],
        maskedKey,
        config: r.config as ResourceConfig | null,
        description: r.description,
        isDefault: r.isDefault,
        lastTestedAt: r.lastTestedAt?.toISOString() ?? null,
        lastTestError: r.lastTestError,
        createdByName: getDisplayName(r.createdBy),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }
    })

    const response: ResourceListResponse = {
      resources: items,
      total,
      page,
      pageSize,
    }

    return NextResponse.json(response)
  }),
)

// POST /api/v1/resources — Create a new resource
export const POST = withAuth(
  withPermission(
    'resources:manage',
    withValidation(createResourceSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }

      const { name, type, provider, apiKey, config, description, isDefault } = body

      // If setting as default, unset other defaults of same type+provider
      if (isDefault) {
        await prisma.resource.updateMany({
          where: { type, provider, isDefault: true },
          data: { isDefault: false },
        })
      }

      const resource = await prisma.resource.create({
        data: {
          name,
          type,
          provider,
          credentials: encryptCredential(apiKey),
          config: config ? (config as Prisma.InputJsonValue) : undefined,
          description: description ?? null,
          isDefault: isDefault ?? false,
          createdById: user.id,
        },
        include: { createdBy: { select: { name: true, email: true } } },
      })

      auditLog({
        userId: user.id,
        action: 'RESOURCE_CREATE',
        resource: 'resource',
        resourceId: resource.id,
        details: { name, type, provider },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json(
        {
          id: resource.id,
          name: resource.name,
          type: resource.type,
          provider: resource.provider,
          providerName: getProvider(resource.provider)?.name ?? resource.provider,
          status: resource.status,
          maskedKey: maskCredential(apiKey),
          config: resource.config,
          description: resource.description,
          isDefault: resource.isDefault,
          lastTestedAt: null,
          lastTestError: null,
          createdByName: getDisplayName(resource.createdBy),
          createdAt: resource.createdAt.toISOString(),
          updatedAt: resource.updatedAt.toISOString(),
        },
        { status: 201 },
      )
    }),
  ),
)
