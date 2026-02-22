import { NextResponse } from 'next/server'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import { writeFileSchema } from '@/lib/validations/agent'
import { auditLog } from '@/lib/audit'
import {
  parseAgentId,
  extractAgentsConfig,
  resolveWorkspacePath,
  containerWorkspacePath,
  isPathSafe,
  getInstanceWithContainer,
} from '@/lib/agents/helpers'

/** Resolve container-absolute file path for a given agent + relative path */
async function resolveFilePath(
  compositeId: string,
  pathSegments: string[],
): Promise<
  | { error: string; status: number }
  | { containerId: string; fullPath: string; instanceId: string; agentId: string }
> {
  const parsed = parseAgentId(compositeId)
  if (!parsed) return { error: '无效的 Agent ID 格式', status: 400 }

  const { instanceId, agentId } = parsed
  const relativePath = pathSegments.join('/')

  if (!isPathSafe(relativePath)) {
    return { error: '非法路径', status: 400 }
  }

  const instance = await getInstanceWithContainer(instanceId)
  if (!instance) return { error: '实例不存在', status: 404 }
  if (!instance.containerId) return { error: '实例没有关联的容器', status: 400 }

  const adapter = registry.getAdapter(instanceId)
  const client = registry.getClient(instanceId)
  if (!adapter || !client) return { error: '实例未连接', status: 400 }

  const configResult = await adapter.getConfig(client)
  const { defaults, list } = extractAgentsConfig(configResult.config)
  const agentConfig = list.find((a) => a.id === agentId)
  if (!agentConfig) return { error: `Agent "${agentId}" 不存在`, status: 404 }

  const workspace = resolveWorkspacePath(agentConfig, defaults)
  const containerPath = containerWorkspacePath(workspace)
  const fullPath = `${containerPath}/${relativePath}`

  return { containerId: instance.containerId, fullPath, instanceId, agentId }
}

// GET /api/v1/agents/[id]/files/[...path] — Read a workspace file
export const GET = withAuth(
  withPermission('agents:view', async (_req, { params }) => {
    await ensureRegistryInitialized()

    const pathSegments = Array.isArray(params!.path)
      ? (params!.path as string[])
      : ((params!.path || '') as string).split('/')

    const result = await resolveFilePath(params!.id as string, pathSegments)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    try {
      const content = await dockerManager.readContainerFile(result.containerId, result.fullPath)
      return NextResponse.json({ path: pathSegments.join('/'), content })
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('No such file')) {
        return NextResponse.json({ error: '文件不存在' }, { status: 404 })
      }
      return NextResponse.json(
        { error: `读取文件失败: ${message}` },
        { status: 500 },
      )
    }
  }),
)

// PUT /api/v1/agents/[id]/files/[...path] — Write a workspace file
export const PUT = withAuth(
  withPermission(
    'agents:manage',
    withValidation(writeFileSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string; path: string | string[] }
        body: typeof ctx.body
      }
      await ensureRegistryInitialized()

      const pathSegments = Array.isArray(params.path)
        ? params.path
        : (params.path || '').split('/')

      const result = await resolveFilePath(params.id, pathSegments)
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      try {
        // Ensure parent directory exists
        const lastSlash = result.fullPath.lastIndexOf('/')
        if (lastSlash > 0) {
          const parentDir = result.fullPath.slice(0, lastSlash)
          await dockerManager.ensureContainerDir(result.containerId, parentDir)
        }

        await dockerManager.writeContainerFile(result.containerId, result.fullPath, body.content)

        auditLog({
          userId: user.id,
          action: 'AGENT_FILE_WRITE',
          resource: 'agent',
          resourceId: params.id,
          details: {
            agentId: result.agentId,
            instanceId: result.instanceId,
            path: pathSegments.join('/'),
          },
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent') || undefined,
          result: 'SUCCESS',
        })

        return NextResponse.json({ success: true, path: pathSegments.join('/') })
      } catch (err) {
        return NextResponse.json(
          { error: `写入文件失败: ${(err as Error).message}` },
          { status: 500 },
        )
      }
    }),
  ),
)
