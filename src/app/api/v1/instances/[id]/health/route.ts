import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import type { Prisma } from '@/generated/prisma'

// GET /api/v1/instances/[id]/health — Real-time health probe
export const GET = withAuth(
  withPermission('instances:view', async (_req, { params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: '实例不存在' }, { status: 404 })
    }

    await ensureRegistryInitialized()

    if (!registry.isConnected(id)) {
      return NextResponse.json({
        status: 'disconnected',
        checkedAt: new Date().toISOString(),
      })
    }

    try {
      const health = await registry.checkHealth(id)
      const healthData = health as Record<string, unknown>

      // Version fallback: healthData → hello-ok → Docker OCI label (one-time backfill)
      let version = (healthData.version as string) || null
      if (!version && typeof registry.getServerVersion === 'function') {
        version = registry.getServerVersion(id)
      }
      if (!version && !instance.version && instance.containerId) {
        try {
          const info = await dockerManager.inspectContainer(instance.containerId)
          version = info.version || null
        } catch {
          // Non-fatal
        }
      }

      // Update DB with latest health data
      await prisma.instance.update({
        where: { id },
        data: {
          lastHealthCheck: new Date(),
          healthData: healthData as Prisma.InputJsonValue,
          version: version || undefined,
          status: 'ONLINE',
        },
      })

      return NextResponse.json({
        ...healthData,
        checkedAt: new Date().toISOString(),
      })
    } catch (err) {
      return NextResponse.json({
        status: 'error',
        error: (err as Error).message,
        checkedAt: new Date().toISOString(),
      })
    }
  }),
)
