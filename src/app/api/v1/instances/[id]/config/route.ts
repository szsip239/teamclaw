import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { updateInstanceConfigSchema } from '@/lib/validations/instance'
import { dockerManager } from '@/lib/docker'
import { decrypt } from '@/lib/auth/encryption'
import { registry, ensureRegistryInitialized, resolveGatewayUrl } from '@/lib/gateway/registry'
import { auditLog } from '@/lib/audit'

// GET /api/v1/instances/[id]/config — Read openclaw.json from container
export const GET = withAuth(
  withPermission('instances:manage', async (_req, { params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    if (!instance.containerId) {
      return NextResponse.json(
        { error: 'This instance is not a Docker-managed container' },
        { status: 400 },
      )
    }

    try {
      const config = await dockerManager.getContainerConfig(instance.containerId)
      return NextResponse.json({ config, containerId: instance.containerId })
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to read config:${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)

// PUT /api/v1/instances/[id]/config — Update openclaw.json + restart container
export const PUT = withAuth(
  withPermission(
    'instances:manage',
    withValidation(updateInstanceConfigSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = params.id

      const instance = await prisma.instance.findUnique({ where: { id } })
      if (!instance) {
        return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
      }

      if (!instance.containerId) {
        return NextResponse.json(
          { error: 'This instance is not a Docker-managed container' },
          { status: 400 },
        )
      }

      try {
        await ensureRegistryInitialized()

        // Disconnect gateway before restart (mirrors restart/route.ts pattern)
        await registry.disconnect(id)

        await dockerManager.updateContainerConfig(instance.containerId, body.config)
        await dockerManager.restartContainer(instance.containerId)

        // Wait for container to initialize
        await new Promise((r) => setTimeout(r, 3000))

        // Reconnect to gateway
        const token = decrypt(instance.gatewayToken)
        await registry.connect(id, resolveGatewayUrl(instance), token)
        await prisma.instance.update({
          where: { id },
          data: { status: 'ONLINE' },
        })

        auditLog({
          userId: user.id,
          action: 'INSTANCE_CONFIG_UPDATE',
          resource: 'instance',
          resourceId: id,
          details: { name: instance.name },
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent') || undefined,
          result: 'SUCCESS',
        })

        return NextResponse.json({ status: 'updated', containerId: instance.containerId })
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to update config:${(err as Error).message}` },
          { status: 500 },
        )
      }
    }),
  ),
)
