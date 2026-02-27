import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { autoRegisterAgents, isAgentVisible } from '@/lib/agents/helpers'
import type { ChatAgentInfo } from '@/types/chat'
import type { AgentCategory } from '@/types/agent'

// GET /api/v1/chat/agents — list agents available to the current user
export const GET = withAuth(
  withPermission('chat:use', async (_req, { user }) => {
    await ensureRegistryInitialized()

    const agents: ChatAgentInfo[] = []

    // Determine which instances the user can access
    let instanceIds: string[]

    if (user.role === 'SYSTEM_ADMIN') {
      const instances = await prisma.instance.findMany({
        where: { status: { in: ['ONLINE', 'DEGRADED'] } },
        select: { id: true, name: true },
      })
      instanceIds = instances.map((i) => i.id)
    } else {
      if (!user.departmentId) {
        return NextResponse.json({ agents: [] })
      }
      const accessGrants = await prisma.instanceAccess.findMany({
        where: { departmentId: user.departmentId },
        include: {
          instance: { select: { id: true, name: true, status: true } },
        },
      })
      instanceIds = accessGrants
        .filter((a) => a.instance.status === 'ONLINE' || a.instance.status === 'DEGRADED')
        .map((a) => a.instanceId)
    }

    // Fetch instance name map
    const instances = await prisma.instance.findMany({
      where: { id: { in: instanceIds } },
      select: { id: true, name: true, containerId: true },
    })
    const nameMap = new Map(instances.map((i) => [i.id, i.name]))
    const containerMap = new Map(instances.map((i) => [i.id, !!i.containerId]))

    await Promise.allSettled(
      instanceIds.map(async (instanceId) => {
        const adapter = registry.getAdapter(instanceId)
        const client = registry.getClient(instanceId)
        if (!adapter || !client) return

        try {
          const { agents: liveAgents } = await adapter.getAgents(client)
          const agentIds = liveAgents.map((a) => a.id)

          // Auto-register unknown agents
          await autoRegisterAgents(instanceId, agentIds, user.id)

          // Fetch AgentMeta for visibility filtering
          const metas = await prisma.agentMeta.findMany({
            where: { instanceId },
            include: {
              department: { select: { name: true } },
              owner: { select: { name: true } },
            },
          })
          const metaMap = new Map(metas.map((m) => [m.agentId, m]))

          for (const agent of liveAgents) {
            const meta = metaMap.get(agent.id)
            // If meta exists, check visibility; if not, treat as DEFAULT (visible to all)
            if (meta && !isAgentVisible(meta, user)) continue

            agents.push({
              instanceId,
              instanceName: nameMap.get(instanceId) || instanceId,
              agentId: agent.id,
              agentName: agent.name || agent.id,
              status: agent.status || 'active',
              model: agent.model,
              category: (meta?.category as AgentCategory) ?? 'DEFAULT',
              hasContainer: containerMap.get(instanceId) ?? false,
            })
          }
        } catch {
          // Skip instances that fail to respond
        }
      }),
    )

    return NextResponse.json({ agents })
  }),
)
