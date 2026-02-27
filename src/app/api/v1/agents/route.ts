import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry } from '@/lib/gateway/registry'
import { ensureRegistryInitialized } from '@/lib/gateway/registry'
import { createAgentSchema } from '@/lib/validations/agent'
import { auditLog } from '@/lib/audit'
import {
  extractAgentsConfig,
  resolveWorkspacePath,
  resolveWorkspaceForInstance,
  buildAgentId,
  sanitizeAgentEntry,
  isAgentVisible,
  autoRegisterAgents,
  getDefaultCategory,
  canCreateWithCategory,
} from '@/lib/agents/helpers'
import type { AgentOverview, AgentCategory } from '@/types/agent'
import type { GatewayAgent, AgentsListResult } from '@/types/gateway'

// GET /api/v1/agents — List all agents across connected instances
export const GET = withAuth(
  withPermission('agents:view', async (req, { user }) => {
    await ensureRegistryInitialized()

    const url = new URL(req.url)
    const instanceFilter = url.searchParams.get('instanceId')
    const categoryFilter = url.searchParams.get('category') as AgentCategory | null

    const connectedIds = registry.getConnectedIds()
    const targetIds = instanceFilter
      ? connectedIds.filter((id) => id === instanceFilter)
      : connectedIds

    // Fetch instance names for display
    const instances = await prisma.instance.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true },
    })
    const nameMap = new Map(instances.map((i) => [i.id, i.name]))

    const agents: AgentOverview[] = []
    const errors: { instanceId: string; error: string }[] = []

    await Promise.allSettled(
      targetIds.map(async (instanceId) => {
        try {
          const adapter = registry.getAdapter(instanceId)
          const client = registry.getClient(instanceId)
          if (!adapter || !client) return

          // Fast fail if WebSocket is disconnected
          if (!client.isConnected()) {
            errors.push({ instanceId, error: 'WebSocket connection disconnected' })
            return
          }

          // Fetch config and live agents in parallel
          const [configResult, agentsResult] = await Promise.all([
            adapter.getConfig(client),
            adapter.getAgents(client).catch((): AgentsListResult => ({ agents: [], defaultId: null })),
          ])
          const { agents: liveAgents, defaultId } = agentsResult

          const { defaults, list } = extractAgentsConfig(configResult.config)
          const configIds = new Set(list.map((a) => a.id))

          // Collect all agent IDs from this instance (config + live)
          const allAgentIds = new Set<string>()
          for (const entry of list) allAgentIds.add(entry.id)
          for (const live of liveAgents) allAgentIds.add(live.id)

          // Build name map from live agents (id → display name)
          const liveNameMap = new Map(liveAgents.map(a => [a.id, a.name]))

          // Auto-register unknown agents as DEFAULT
          await autoRegisterAgents(instanceId, [...allAgentIds], user.id)

          // Fetch AgentMeta for this instance (with department/owner names)
          const metas = await prisma.agentMeta.findMany({
            where: { instanceId },
            include: {
              department: { select: { name: true } },
              owner: { select: { name: true } },
            },
          })
          const metaMap = new Map(metas.map((m) => [m.agentId, m]))

          // Build agents from config list
          for (const entry of list) {
            const meta = metaMap.get(entry.id)
            if (meta && !isAgentVisible(meta, user)) continue
            if (categoryFilter && meta?.category !== categoryFilter) continue

            agents.push({
              id: entry.id,
              instanceId,
              instanceName: nameMap.get(instanceId) || instanceId,
              name: liveNameMap.get(entry.id) || entry.id,
              workspace: resolveWorkspacePath(entry, defaults),
              isDefault: defaultId ? entry.id === defaultId : entry.default === true,
              models: entry.models ?? defaults.models,
              sandbox: entry.sandbox ?? defaults.sandbox,
              category: meta?.category as AgentCategory | undefined,
              departmentName: meta?.department?.name ?? null,
              ownerName: meta?.owner?.name ?? null,
            })
          }

          // Merge implicit agents from live list (host instances without explicit agents.list)
          for (const live of liveAgents) {
            if (!configIds.has(live.id)) {
              const meta = metaMap.get(live.id)
              if (meta && !isAgentVisible(meta, user)) continue
              if (categoryFilter && meta?.category !== categoryFilter) continue

              agents.push({
                id: live.id,
                instanceId,
                instanceName: nameMap.get(instanceId) || instanceId,
                name: live.name || live.id,
                workspace: live.workspace || (defaults as Record<string, unknown>).workspace as string || '~/.openclaw/workspace',
                isDefault: defaultId ? live.id === defaultId : live.id === 'main',
                models: defaults.models,
                sandbox: defaults.sandbox,
                category: meta?.category as AgentCategory | undefined,
                departmentName: meta?.department?.name ?? null,
                ownerName: meta?.owner?.name ?? null,
              })
            }
          }
        } catch (err) {
          console.error(`[agents:list] Instance ${instanceId} error:`, (err as Error).message)
          errors.push({ instanceId, error: (err as Error).message })
        }
      }),
    )

    return NextResponse.json({
      agents,
      instanceCount: targetIds.length,
      ...(errors.length > 0 ? { errors } : {}),
    })
  }),
)

// POST /api/v1/agents — Create a new agent on an instance
export const POST = withAuth(
  withPermission(
    'agents:create',
    withValidation(createAgentSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }
      await ensureRegistryInitialized()

      const { instanceId, id: agentId, workspace, models, sandbox, category: requestedCategory, departmentId } = body

      // Determine category (default based on role if not specified)
      const category = requestedCategory || getDefaultCategory(user.role)

      // Validate the user can create with this category
      if (!canCreateWithCategory(user.role, category, user.departmentId, departmentId)) {
        return NextResponse.json(
          { error: 'No permission to create agent of this category' },
          { status: 403 },
        )
      }

      // For non-admins creating on gateway, verify instance access
      if (user.role !== 'SYSTEM_ADMIN') {
        if (!user.departmentId) {
          return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
        }
        const access = await prisma.instanceAccess.findUnique({
          where: {
            departmentId_instanceId: {
              departmentId: user.departmentId,
              instanceId,
            },
          },
        })
        if (!access) {
          return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
        }
      }

      // Verify instance is connected
      const adapter = registry.getAdapter(instanceId)
      const client = registry.getClient(instanceId)
      if (!adapter || !client) {
        return NextResponse.json({ error: 'Instance not connected' }, { status: 400 })
      }

      // Read current config
      const { config, hash } = await adapter.getConfig(client)
      const { list } = extractAgentsConfig(config)

      // Check for duplicate agent ID
      if (list.some((a) => a.id === agentId)) {
        return NextResponse.json(
          { error: `Agent "${agentId}" already exists in this instance` },
          { status: 409 },
        )
      }

      // Build new agent entry
      const newAgent: Record<string, unknown> = { id: agentId }
      if (workspace) newAgent.workspace = await resolveWorkspaceForInstance(instanceId, workspace)
      if (models) newAgent.models = models
      if (sandbox) newAgent.sandbox = sandbox

      // config.patch does union merge for arrays — sending only the new entry
      // adds it to the existing list. Avoids sending back redacted values from
      // existing entries which would crash OpenClaw (SIGUSR1 on "truncated" detection).
      try {
        await adapter.patchConfig(client, { agents: { list: [sanitizeAgentEntry(newAgent)] } }, hash)
      } catch (err) {
        return NextResponse.json(
          { error: `Configuration update failed:${(err as Error).message}` },
          { status: 500 },
        )
      }

      // Upsert AgentMeta — handles orphaned records left by config editor deletion
      await prisma.agentMeta.upsert({
        where: { instanceId_agentId: { instanceId, agentId } },
        create: {
          instanceId,
          agentId,
          category,
          departmentId: category === 'DEPARTMENT' ? (departmentId || user.departmentId) : null,
          ownerId: category === 'PERSONAL' ? user.id : null,
          createdById: user.id,
        },
        update: {
          category,
          departmentId: category === 'DEPARTMENT' ? (departmentId || user.departmentId) : null,
          ownerId: category === 'PERSONAL' ? user.id : null,
        },
      })

      auditLog({
        userId: user.id,
        action: 'AGENT_CREATE',
        resource: 'agent',
        resourceId: buildAgentId(instanceId, agentId),
        details: { agentId, instanceId, category },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json(
        { id: buildAgentId(instanceId, agentId), agentId, instanceId, category },
        { status: 201 },
      )
    }),
  ),
)
