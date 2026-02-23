import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { cloneAgentSchema } from '@/lib/validations/agent'
import { auditLog } from '@/lib/audit'
import {
  parseAgentId,
  extractAgentsConfig,
  resolveWorkspacePath,
  buildAgentId,
  containerWorkspacePath,
  sanitizeAgentEntry,
} from '@/lib/agents/helpers'
import { DockerManager, dockerManager } from '@/lib/docker'
import type { GatewayAgent } from '@/types/gateway'

// POST /api/v1/agents/clone — Clone an agent to another instance
export const POST = withAuth(
  withPermission(
    'agents:manage',
    withValidation(cloneAgentSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }
      await ensureRegistryInitialized()

      const { sourceId, targetInstanceId, newAgentId, workspace, copyFiles } = body

      // 1. Parse source agent
      const parsed = parseAgentId(sourceId)
      if (!parsed) {
        return NextResponse.json({ error: '无效的源 Agent ID 格式' }, { status: 400 })
      }
      const { instanceId: srcInstanceId, agentId: srcAgentId } = parsed

      // 2. Get source instance adapter + config
      const srcAdapter = registry.getAdapter(srcInstanceId)
      const srcClient = registry.getClient(srcInstanceId)
      if (!srcAdapter || !srcClient) {
        return NextResponse.json({ error: '源实例未连接' }, { status: 400 })
      }

      const [srcConfigResult, srcAgentsResult] = await Promise.all([
        srcAdapter.getConfig(srcClient),
        srcAdapter.getAgents(srcClient).catch((): { agents: GatewayAgent[]; defaultId: string | null } => ({ agents: [], defaultId: null })),
      ])
      const srcLiveAgents = srcAgentsResult.agents
      const { defaults: srcDefaults, list: srcList } = extractAgentsConfig(srcConfigResult.config)

      // Find source agent in config or live agents
      const srcAgentConfig = srcList.find((a) => a.id === srcAgentId)
      const srcLive = srcLiveAgents.find((a) => a.id === srcAgentId)
      if (!srcAgentConfig && !srcLive) {
        return NextResponse.json({ error: `源 Agent "${srcAgentId}" 不存在` }, { status: 404 })
      }

      // 3. Get target instance adapter + config
      const tgtAdapter = registry.getAdapter(targetInstanceId)
      const tgtClient = registry.getClient(targetInstanceId)
      if (!tgtAdapter || !tgtClient) {
        return NextResponse.json({ error: '目标实例未连接' }, { status: 400 })
      }

      const tgtConfigResult = await tgtAdapter.getConfig(tgtClient)
      const { list: tgtList } = extractAgentsConfig(tgtConfigResult.config)

      // Check for duplicate agent ID on target
      if (tgtList.some((a) => a.id === newAgentId)) {
        return NextResponse.json(
          { error: `Agent "${newAgentId}" 已存在于目标实例中` },
          { status: 409 },
        )
      }

      // 4. Build new agent config entry (clone fields from source, exclude id/default)
      const newAgent: Record<string, unknown> = { id: newAgentId }

      if (srcAgentConfig) {
        // Copy all config fields except id and default
        const { id: _id, default: _def, ...rest } = srcAgentConfig
        Object.assign(newAgent, rest)
      }

      // Override workspace if specified
      if (workspace) {
        newAgent.workspace = workspace
      }

      // 5. Phase 1: Patch config to add agent to target
      // config.patch does union merge for arrays — sending only the new entry
      // adds it without sending back redacted values from existing entries.
      try {
        await tgtAdapter.patchConfig(
          tgtClient,
          { agents: { list: [sanitizeAgentEntry(newAgent)] } },
          tgtConfigResult.hash,
        )
      } catch (err) {
        return NextResponse.json(
          { error: `配置更新失败: ${(err as Error).message}` },
          { status: 500 },
        )
      }

      // 6. Phase 2: Copy workspace files if requested and both have containers
      let filesCopied = false
      if (copyFiles) {
        const [srcInstance, tgtInstance] = await Promise.all([
          prisma.instance.findUnique({
            where: { id: srcInstanceId },
            select: { containerId: true },
          }),
          prisma.instance.findUnique({
            where: { id: targetInstanceId },
            select: { containerId: true },
          }),
        ])

        if (srcInstance?.containerId && tgtInstance?.containerId) {
          const srcWorkspace = srcAgentConfig
            ? resolveWorkspacePath(srcAgentConfig, srcDefaults)
            : srcLive?.workspace || '~/.openclaw/workspace'
          const tgtWorkspace = (workspace || srcWorkspace)

          const srcContainerPath = containerWorkspacePath(srcWorkspace)
          const tgtContainerPath = containerWorkspacePath(tgtWorkspace)

          try {
            // Hot-reload compat: cached singleton may lack new methods
            const dm = typeof dockerManager.copyDirBetweenContainers === 'function'
              ? dockerManager
              : new DockerManager()
            await dm.copyDirBetweenContainers(
              srcInstance.containerId,
              srcContainerPath,
              tgtInstance.containerId,
              tgtContainerPath,
            )
            filesCopied = true
          } catch (copyErr) {
            // Phase 2 failed — rollback Phase 1 (remove agent from target config)
            // Two-step null-then-set to handle union merge + redacted values
            try {
              const freshConfig = await tgtAdapter.getConfig(tgtClient)
              const { list: freshList } = extractAgentsConfig(freshConfig.config)
              const rolledBackList = freshList.filter((a) => a.id !== newAgentId)
              await tgtAdapter.patchConfig(tgtClient, { agents: { list: null } }, freshConfig.hash)
              const afterNull = await tgtAdapter.getConfig(tgtClient)
              await tgtAdapter.patchConfig(
                tgtClient,
                { agents: { list: rolledBackList.map(sanitizeAgentEntry) } },
                afterNull.hash,
              )
            } catch {
              // Rollback failed — log but don't hide original error
            }
            return NextResponse.json(
              { error: `文件复制失败: ${(copyErr as Error).message}` },
              { status: 500 },
            )
          }
        }
      }

      // Clone AgentMeta from source (inherit category) or create DEFAULT
      const sourceMeta = await prisma.agentMeta.findUnique({
        where: { instanceId_agentId: { instanceId: srcInstanceId, agentId: srcAgentId } },
      })

      await prisma.agentMeta.create({
        data: {
          instanceId: targetInstanceId,
          agentId: newAgentId,
          category: sourceMeta?.category ?? 'DEFAULT',
          departmentId: sourceMeta?.departmentId ?? null,
          ownerId: sourceMeta?.ownerId ?? null,
          createdById: user.id,
        },
      }).catch(() => {}) // Ignore if duplicate

      auditLog({
        userId: user.id,
        action: 'AGENT_CLONE',
        resource: 'agent',
        resourceId: buildAgentId(targetInstanceId, newAgentId),
        details: {
          sourceId,
          targetInstanceId,
          newAgentId,
          filesCopied,
        },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json(
        {
          id: buildAgentId(targetInstanceId, newAgentId),
          agentId: newAgentId,
          instanceId: targetInstanceId,
          filesCopied,
        },
        { status: 201 },
      )
    }),
  ),
)
