import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { resolveAdapter } from '@/lib/gateway/adapter'

// GET /api/v1/instances/[id]/cron/runs?jobId=xxx&limit=50
export const GET = withAuth(
  withPermission('agents:view', async (req: NextRequest, { params }) => {
    const id = params!.id as string
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId') ?? undefined
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    await ensureRegistryInitialized()

    if (!registry.isConnected(id)) {
      return NextResponse.json({
        runs: [],
        instanceId: id,
        error: 'Instance not connected',
      })
    }

    try {
      const client = registry.getClient(id)
      if (!client) {
        return NextResponse.json({ runs: [], instanceId: id, error: 'Client not available' })
      }
      const adapter = resolveAdapter()
      const result = await adapter.getCronRuns(client, { jobId, limit })

      return NextResponse.json({
        ...result,
        instanceId: id,
      })
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message, runs: [], instanceId: id },
        { status: 502 },
      )
    }
  }),
)
