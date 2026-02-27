import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { updateAgentConfigSchema } from '@/lib/validations/agent'
import { auditLog } from '@/lib/audit'
import {
  parseAgentId,
  extractAgentsConfig,
  resolveWorkspacePath,
  listAgentWorkspaceFiles,
  getInstanceWithContainer,
  sanitizeAgentEntry,
  isAgentVisible,
} from '@/lib/agents/helpers'
import { dockerManager } from '@/lib/docker/manager'
import type { GatewayAgent, AgentsListResult } from '@/types/gateway'

// GET /api/v1/agents/[id] — Agent detail (id = instanceId:agentId)
export const GET = withAuth(
  withPermission('agents:view', async (_req, { user, params }) => {
    await ensureRegistryInitialized()
    const parsed = parseAgentId(params!.id as string)
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    const { instanceId, agentId } = parsed

    // Access check: non-admin users must have instance access
    if (user.role !== 'SYSTEM_ADMIN') {
      if (!user.departmentId) {
        return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
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

    const instance = await getInstanceWithContainer(instanceId)
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    const [configResult, agentsResult] = await Promise.all([
      adapter.getConfig(client),
      adapter.getAgents(client).catch((): AgentsListResult => ({ agents: [], defaultId: null })),
    ])
    const { agents: liveAgents, defaultId } = agentsResult

    const { defaults, list } = extractAgentsConfig(configResult.config)
    const agentConfig = list.find((a) => a.id === agentId)
    const live = liveAgents.find((a) => a.id === agentId)

    // If not in config list, check if it's an implicit agent from live list
    if (!agentConfig && !live) {
      return NextResponse.json({ error: `Agent "${agentId}" not found` }, { status: 404 })
    }

    const workspace = agentConfig
      ? resolveWorkspacePath(agentConfig, defaults)
      : live?.workspace || (defaults as Record<string, unknown>).workspace as string || '~/.openclaw/workspace'

    // List workspace files if container is available
    let workspaceFiles: Awaited<ReturnType<typeof listAgentWorkspaceFiles>> = []
    if (instance.containerId) {
      workspaceFiles = await listAgentWorkspaceFiles(instance.containerId, workspace)
    }

    // Fetch AgentMeta for category info
    const meta = await prisma.agentMeta.findUnique({
      where: { instanceId_agentId: { instanceId, agentId } },
      include: {
        department: { select: { name: true } },
        owner: { select: { name: true } },
      },
    })

    // Visibility check: ensure user can see this agent
    if (meta && !isAgentVisible(meta, user)) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: agentId,
      instanceId,
      instanceName: instance.name,
      name: live?.name || agentId,
      workspace,
      isDefault: defaultId ? agentId === defaultId : (agentConfig ? agentConfig.default === true : false),
      models: agentConfig?.models ?? defaults.models,
      sandbox: agentConfig?.sandbox ?? defaults.sandbox,
      config: agentConfig || { id: agentId },
      defaults,
      workspaceFiles,
      configHash: configResult.hash,
      category: meta?.category ?? null,
      departmentName: meta?.department?.name ?? null,
      ownerName: meta?.owner?.name ?? null,
    })
  }),
)

// PUT /api/v1/agents/[id] — Update agent hard config
export const PUT = withAuth(
  withPermission(
    'agents:manage',
    withValidation(updateAgentConfigSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      await ensureRegistryInitialized()

      const parsed = parseAgentId(params.id)
      if (!parsed) {
        return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
      }

      const { instanceId, agentId } = parsed

      const adapter = registry.getAdapter(instanceId)
      const client = registry.getClient(instanceId)
      if (!adapter || !client) {
        return NextResponse.json({ error: 'Instance not connected' }, { status: 400 })
      }

      // Read current config
      const { config, hash } = await adapter.getConfig(client)
      const { list } = extractAgentsConfig(config)

      const agentIdx = list.findIndex((a) => a.id === agentId)
      if (agentIdx === -1) {
        return NextResponse.json({ error: `Agent "${agentId}" not found` }, { status: 404 })
      }

      // Merge updates into the agent entry
      const updated = { ...list[agentIdx] }
      if (body.workspace !== undefined) updated.workspace = body.workspace
      if (body.models !== undefined) updated.models = { ...updated.models, ...body.models }
      if (body.sandbox !== undefined) updated.sandbox = { ...updated.sandbox, ...body.sandbox }
      if (body.tools !== undefined) updated.tools = { ...updated.tools, ...body.tools }
      if (body.subagents !== undefined) updated.subagents = { ...updated.subagents, ...body.subagents }
      if (body.session !== undefined) updated.session = { ...updated.session, ...body.session }

      const updatedList = [...list]
      updatedList[agentIdx] = updated

      // OpenClaw merges agents.list arrays (union, not replace) in config.patch.
      // Two-step: null the key to clear it, then re-fetch hash and set the new list.
      // sanitizeAgentEntry strips __OPENCLAW_REDACTED__ values to prevent crash.
      try {
        await adapter.patchConfig(client, { agents: { list: null } }, hash)
        const freshConfig = await adapter.getConfig(client)
        await adapter.patchConfig(client, { agents: { list: updatedList.map(sanitizeAgentEntry) } }, freshConfig.hash)
      } catch (err) {
        return NextResponse.json(
          { error: `Configuration update failed:${(err as Error).message}` },
          { status: 500 },
        )
      }

      auditLog({
        userId: user.id,
        action: 'AGENT_CONFIG_UPDATE',
        resource: 'agent',
        resourceId: params.id,
        details: { agentId, instanceId },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ status: 'updated', agentId })
    }),
  ),
)

// DELETE /api/v1/agents/[id] — Remove agent from instance config
export const DELETE = withAuth(
  withPermission('agents:manage', async (req, { user, params }) => {
    await ensureRegistryInitialized()
    const parsed = parseAgentId(params!.id as string)
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    const { instanceId, agentId } = parsed

    const adapter = registry.getAdapter(instanceId)
    const client = registry.getClient(instanceId)
    if (!adapter || !client) {
      return NextResponse.json({ error: 'Instance not connected' }, { status: 400 })
    }

    const { config, hash } = await adapter.getConfig(client)
    const { defaults, list } = extractAgentsConfig(config)

    const agentIdx = list.findIndex((a) => a.id === agentId)
    if (agentIdx === -1) {
      return NextResponse.json({ error: `Agent "${agentId}" not found` }, { status: 404 })
    }

    // Prevent deleting the default agent
    if (list[agentIdx].default === true) {
      return NextResponse.json({ error: 'Cannot delete the default agent' }, { status: 400 })
    }

    // Resolve workspace path before removing from config
    const agentWorkspace = resolveWorkspacePath(list[agentIdx], defaults)
    const defaultWorkspace = (defaults as Record<string, unknown>).workspace as string || '~/.openclaw/workspace'

    const updatedList = list.filter((a) => a.id !== agentId)
    try {
      // OpenClaw merges agents.list arrays (union, not replace) in config.patch.
      // Two-step: null the key to clear it, then re-fetch hash and set the new list.
      await adapter.patchConfig(client, { agents: { list: null } }, hash)
      const freshConfig = await adapter.getConfig(client)
      await adapter.patchConfig(client, { agents: { list: updatedList.map(sanitizeAgentEntry) } }, freshConfig.hash)
    } catch (err) {
      return NextResponse.json(
        { error: `Configuration update failed:${(err as Error).message}` },
        { status: 500 },
      )
    }


    // Delete agent workspace directory (only if agent-specific, not the shared default)
    // Best-effort: don't fail the overall deletion if workspace cleanup fails
    const instance = await getInstanceWithContainer(instanceId)
    if (instance?.containerId && agentWorkspace !== defaultWorkspace) {
      await dockerManager.removeContainerDir(instance.containerId, agentWorkspace).catch((err) => {
        console.warn(`[agents:delete] Failed to remove workspace ${agentWorkspace}:`, (err as Error).message)
      })
    }

    // Delete associated AgentMeta
    await prisma.agentMeta.deleteMany({
      where: { instanceId, agentId },
    }).catch(() => {})

    auditLog({
      userId: user.id,
      action: 'AGENT_DELETE',
      resource: 'agent',
      resourceId: params!.id as string,
      details: { agentId, instanceId },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return NextResponse.json({ status: 'deleted', agentId })
  }),
)
