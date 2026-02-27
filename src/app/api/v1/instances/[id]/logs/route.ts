import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker'

// GET /api/v1/instances/[id]/logs — Container logs
export const GET = withAuth(
  withPermission('instances:view', async (req, { user, params }) => {
    const id = params!.id as string
    const url = new URL(req.url)
    const tail = Math.min(1000, Math.max(10, parseInt(url.searchParams.get('tail') || '200')))

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    // DEPT_ADMIN must have instance access for their department
    if (user.role === 'DEPT_ADMIN' && user.departmentId) {
      const access = await prisma.instanceAccess.findUnique({
        where: { departmentId_instanceId: { departmentId: user.departmentId, instanceId: id } },
      })
      if (!access) {
        return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
      }
    }

    if (!instance.containerId) {
      return NextResponse.json(
        { error: 'This instance is not a Docker-managed container' },
        { status: 400 },
      )
    }

    try {
      const logs = await dockerManager.getContainerLogs(instance.containerId, tail)
      return NextResponse.json({ logs, containerId: instance.containerId })
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to fetch logs:${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)
