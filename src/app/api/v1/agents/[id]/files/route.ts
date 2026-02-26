import { NextResponse } from 'next/server'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import {
  parseAgentId,
  extractAgentsConfig,
  resolveWorkspacePath,
  containerWorkspacePath,
  getInstanceWithContainer,
} from '@/lib/agents/helpers'

// GET /api/v1/agents/[id]/files — List workspace files
export const GET = withAuth(
  withPermission('agents:view', async (req, { params }) => {
    await ensureRegistryInitialized()
    const parsed = parseAgentId(params!.id as string)
    if (!parsed) {
      return NextResponse.json({ error: '无效的 Agent ID 格式' }, { status: 400 })
    }

    const { instanceId, agentId } = parsed

    const instance = await getInstanceWithContainer(instanceId)
    if (!instance) {
      return NextResponse.json({ error: '实例不存在' }, { status: 404 })
    }
    if (!instance.containerId) {
      return NextResponse.json({ error: '实例没有关联的容器' }, { status: 400 })
    }

    // Get agent workspace path from config
    const adapter = registry.getAdapter(instanceId)
    const client = registry.getClient(instanceId)
    if (!adapter || !client) {
      return NextResponse.json({ error: '实例未连接' }, { status: 400 })
    }

    const configResult = await adapter.getConfig(client)
    const { defaults, list } = extractAgentsConfig(configResult.config)
    const agentConfig = list.find((a) => a.id === agentId)
    if (!agentConfig) {
      return NextResponse.json({ error: `Agent "${agentId}" 不存在` }, { status: 404 })
    }

    const workspace = resolveWorkspacePath(agentConfig, defaults)
    const containerPath = containerWorkspacePath(workspace)

    // Optional subdirectory
    const url = new URL(req.url)
    const dir = url.searchParams.get('dir') || ''
    if (dir.includes('..')) {
      return NextResponse.json({ error: '非法路径' }, { status: 400 })
    }

    const targetPath = dir ? `${containerPath}/${dir}` : containerPath

    try {
      const rawFiles = await dockerManager.listContainerDir(instance.containerId, targetPath)

      // Only keep direct children — listContainerDir may return recursive
      // results if the container's find lacks -maxdepth support or the
      // globalThis-cached DockerManager instance has a stale method body.
      const seen = new Map<string, (typeof rawFiles)[0]>()
      for (const f of rawFiles) {
        if (f.path.includes('/')) continue // skip nested entries
        const key = `${f.type}:${f.name}`
        if (!seen.has(key)) seen.set(key, f)
      }
      const files = [...seen.values()].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return NextResponse.json({ files, workspace, dir })
    } catch (err) {
      return NextResponse.json(
        { error: `读取目录失败: ${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)
