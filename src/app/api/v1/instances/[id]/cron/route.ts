import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { resolveAdapter } from '@/lib/gateway/adapter'

// GET /api/v1/instances/[id]/cron — List cron jobs
export const GET = withAuth(
  withPermission('agents:view', async (_req, { params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    await ensureRegistryInitialized()

    if (!registry.isConnected(id)) {
      return NextResponse.json({
        jobs: [],
        instanceId: id,
        error: 'Instance not connected',
      })
    }

    try {
      const client = registry.getClient(id)
      if (!client) {
        return NextResponse.json({ jobs: [], instanceId: id, error: 'Client not available' })
      }
      const adapter = resolveAdapter()
      const result = await adapter.listCronJobs(client)

      return NextResponse.json({
        ...result,
        instanceId: id,
      })
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message, jobs: [], instanceId: id },
        { status: 502 },
      )
    }
  }),
)

// DELETE /api/v1/instances/[id]/cron?jobId=xxx — Delete a cron job
export const DELETE = withAuth(
  withPermission('agents:manage', async (req, { params }) => {
    const id = params!.id as string
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json({ error: 'jobId query param is required' }, { status: 400 })
    }

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    await ensureRegistryInitialized()

    const client = registry.getClient(id)
    if (!client) {
      return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
    }

    try {
      const adapter = resolveAdapter()
      const result = await adapter.deleteCronJob(client, jobId)
      return NextResponse.json(result)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 })
    }
  }),
)
