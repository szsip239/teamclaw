import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { updateAgentDefaultsSchema } from '@/lib/validations/agent'
import { auditLog } from '@/lib/audit'
import { extractAgentsConfig } from '@/lib/agents/helpers'

// GET /api/v1/instances/[id]/agent-defaults — Read agents.defaults
export const GET = withAuth(
  withPermission('agents:view', async (_req, { user, params }) => {
    await ensureRegistryInitialized()
    const instanceId = params!.id as string

    // Non-admin users must have instance access
    if (user.role !== 'SYSTEM_ADMIN') {
      if (!user.departmentId) {
        return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
      }
      const access = await prisma.instanceAccess.findUnique({
        where: { departmentId_instanceId: { departmentId: user.departmentId, instanceId } },
      })
      if (!access) {
        return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
      }
    }

    const adapter = registry.getAdapter(instanceId)
    const client = registry.getClient(instanceId)
    if (!adapter || !client) {
      return NextResponse.json({ error: 'Instance not connected' }, { status: 400 })
    }

    const configResult = await adapter.getConfig(client)
    const { defaults } = extractAgentsConfig(configResult.config)

    return NextResponse.json({
      instanceId,
      defaults,
      hash: configResult.hash,
    })
  }),
)

// PUT /api/v1/instances/[id]/agent-defaults — Update agents.defaults
export const PUT = withAuth(
  withPermission(
    'agents:manage',
    withValidation(updateAgentDefaultsSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      await ensureRegistryInitialized()

      const instanceId = params.id

      const adapter = registry.getAdapter(instanceId)
      const client = registry.getClient(instanceId)
      if (!adapter || !client) {
        return NextResponse.json({ error: 'Instance not connected' }, { status: 400 })
      }

      // Read current config to get hash
      const { hash } = await adapter.getConfig(client)

      // Patch only agents.defaults (objects merge recursively)
      try {
        await adapter.patchConfig(client, { agents: { defaults: body } }, hash)
      } catch (err) {
        return NextResponse.json(
          { error: `Configuration update failed:${(err as Error).message}` },
          { status: 500 },
        )
      }

      auditLog({
        userId: user.id,
        action: 'AGENT_DEFAULTS_UPDATE',
        resource: 'instance',
        resourceId: instanceId,
        details: { instanceId },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ status: 'updated', instanceId })
    }),
  ),
)
