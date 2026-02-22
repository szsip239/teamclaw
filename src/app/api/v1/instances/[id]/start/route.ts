import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { decrypt } from '@/lib/auth/encryption'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import { auditLog } from '@/lib/audit'
import type { DockerConfig } from '@/types/instance'

// POST /api/v1/instances/[id]/start — Start container + connect gateway
export const POST = withAuth(
  withPermission('instances:manage', async (req, { user, params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: '实例不存在' }, { status: 404 })
    }

    await ensureRegistryInitialized()

    // Start Docker container if managed
    if (instance.containerId) {
      try {
        await dockerManager.startContainer(instance.containerId)
      } catch (err) {
        const msg = (err as Error).message
        // Ignore "already started" errors
        if (!msg.includes('already started') && !msg.includes('is already running')) {
          return NextResponse.json(
            { error: `启动容器失败: ${msg}` },
            { status: 500 },
          )
        }
      }

      // Wait briefly for container to initialize
      await new Promise((r) => setTimeout(r, 2000))
    }

    // Connect to gateway
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
          // Non-fatal: container inspect can fail
        }
      }

      await prisma.instance.update({
        where: { id },
        data: { status: 'ONLINE', ...(version ? { version } : {}) },
      })

      auditLog({
        userId: user.id,
        action: 'INSTANCE_START',
        resource: 'instance',
        resourceId: id,
        details: { name: instance.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ status: 'started' })
    } catch (err) {
      await prisma.instance.update({
        where: { id },
        data: { status: 'ERROR' },
      })

      auditLog({
        userId: user.id,
        action: 'INSTANCE_START',
        resource: 'instance',
        resourceId: id,
        details: { name: instance.name, error: (err as Error).message },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'FAILURE',
      })

      return NextResponse.json(
        { error: `连接 Gateway 失败: ${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)
