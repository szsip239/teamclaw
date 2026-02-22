import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import { auditLog } from '@/lib/audit'

// POST /api/v1/instances/[id]/stop — Disconnect gateway + stop container
export const POST = withAuth(
  withPermission('instances:manage', async (req, { user, params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: '实例不存在' }, { status: 404 })
    }

    // Disconnect from gateway
    await registry.disconnect(id)

    // Stop Docker container if managed
    if (instance.containerId) {
      try {
        await dockerManager.stopContainer(instance.containerId)
      } catch (err) {
        const msg = (err as Error).message
        if (!msg.includes('already stopped') && !msg.includes('is not running')) {
          return NextResponse.json(
            { error: `停止容器失败: ${msg}` },
            { status: 500 },
          )
        }
      }
    }

    await prisma.instance.update({
      where: { id },
      data: { status: 'OFFLINE' },
    })

    auditLog({
      userId: user.id,
      action: 'INSTANCE_STOP',
      resource: 'instance',
      resourceId: id,
      details: { name: instance.name },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return NextResponse.json({ status: 'stopped' })
  }),
)
