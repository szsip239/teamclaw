import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { decryptCredential } from '@/lib/resources/credential-utils'

// GET /api/v1/resources/[id]/credential — Get decrypted credential (sensitive)
export const GET = withAuth(
  withPermission('resources:manage', async (req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少资源 ID' }, { status: 400 })
    }

    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { credentials: true, provider: true, name: true, config: true },
    })

    if (!resource) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 })
    }

    let apiKey: string
    try {
      apiKey = decryptCredential(resource.credentials)
    } catch {
      return NextResponse.json({ error: '凭据解密失败' }, { status: 500 })
    }

    auditLog({
      userId: ctx.user!.id,
      action: 'RESOURCE_CREDENTIAL_ACCESS',
      resource: 'resource',
      resourceId: id,
      details: { name: resource.name, provider: resource.provider },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return NextResponse.json({
      apiKey,
      provider: resource.provider,
      config: resource.config,
    })
  }),
)
