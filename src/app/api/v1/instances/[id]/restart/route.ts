import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { decrypt } from '@/lib/auth/encryption'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import { auditLog } from '@/lib/audit'

// POST /api/v1/instances/[id]/restart — Restart container + reconnect gateway
export const POST = withAuth(
  withPermission('instances:manage', async (req, { user, params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    await ensureRegistryInitialized()

    // Disconnect gateway first
    await registry.disconnect(id)

    // Restart Docker container if managed
    if (instance.containerId) {
      try {
        await dockerManager.restartContainer(instance.containerId)
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to restart container:${(err as Error).message}` },
          { status: 500 },
        )
      }

      // Wait for container to initialize
      await new Promise((r) => setTimeout(r, 3000))
    }

    // Reconnect to gateway
    try {
      const token = decrypt(instance.gatewayToken)
      await registry.connect(id, instance.gatewayUrl, token)

      // Extract version from Docker container OCI labels
      let version: string | undefined
      if (instance.containerId) {
        try {
          const info = await dockerManager.inspectContainer(instance.containerId)
          version = info.version
        } catch {
          // Non-fatal
        }
      }

      await prisma.instance.update({
        where: { id },
        data: { status: 'ONLINE', ...(version ? { version } : {}) },
      })

      auditLog({
        userId: user.id,
        action: 'INSTANCE_RESTART',
        resource: 'instance',
        resourceId: id,
        details: { name: instance.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ status: 'restarted' })
    } catch (err) {
      await prisma.instance.update({
        where: { id },
        data: { status: 'ERROR' },
      })

      auditLog({
        userId: user.id,
        action: 'INSTANCE_RESTART',
        resource: 'instance',
        resourceId: id,
        details: { name: instance.name, error: (err as Error).message },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'FAILURE',
      })

      return NextResponse.json(
        { error: `Failed to reconnect gateway:${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)
