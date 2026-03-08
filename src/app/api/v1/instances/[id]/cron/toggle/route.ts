import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { resolveAdapter } from '@/lib/gateway/adapter'

// POST /api/v1/instances/[id]/cron/toggle — Toggle cron job enabled/disabled
export const POST = withAuth(
  withPermission('agents:manage', async (req, { params }) => {
    const id = params!.id as string
    const body = await req.json()
    const { jobId, enabled } = body as { jobId: string; enabled: boolean }

    if (!jobId || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'jobId and enabled are required' }, { status: 400 })
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
      const result = await adapter.toggleCronJob(client, jobId, enabled)
      return NextResponse.json(result)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 })
    }
  }),
)
