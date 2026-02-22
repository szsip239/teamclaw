import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import type { AuthContext } from '@/lib/middleware/auth'
import { uninstallSkillSchema } from '@/lib/validations/skill'
import { dockerManager } from '@/lib/docker'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { extractAgentsConfig, resolveWorkspacePath, containerWorkspacePath } from '@/lib/agents/helpers'
import { auditLog } from '@/lib/audit'

// POST /api/v1/skills/[id]/uninstall - Uninstall skill from agent
export const POST = withAuth(
  withPermission(
    'skills:develop',
    withValidation(uninstallSkillSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = param(ctx as unknown as AuthContext, 'id')
      if (!id) {
        return NextResponse.json({ error: '缺少技能 ID' }, { status: 400 })
      }

      const { instanceId, agentId, installPath } = body

      // Find installation record
      const installation = await prisma.skillInstallation.findUnique({
        where: {
          skillId_instanceId_agentId_installPath: { skillId: id, instanceId, agentId, installPath },
        },
        include: {
          skill: { select: { slug: true, name: true } },
        },
      })
      if (!installation) {
        return NextResponse.json({ error: '未找到该技能的安装记录' }, { status: 404 })
      }

      // Check instance has container
      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: { id: true, name: true, containerId: true },
      })
      if (!instance) {
        return NextResponse.json({ error: '实例不存在' }, { status: 404 })
      }
      if (!instance.containerId) {
        return NextResponse.json({ error: '该实例没有关联的容器' }, { status: 400 })
      }

      // Determine container skill dir based on install path
      let containerSkillDir: string
      if (installation.installPath === 'global') {
        containerSkillDir = `/home/node/.openclaw/skills/${installation.skill.slug}`
      } else {
        // workspace: need agent workspace path from gateway config
        await ensureRegistryInitialized()
        const adapter = registry.getAdapter(instanceId)
        const client = registry.getClient(instanceId)
        if (!adapter || !client) {
          return NextResponse.json({ error: '实例未连接，无法获取 Agent 工作区路径' }, { status: 400 })
        }

        const configResult = await adapter.getConfig(client)
        const { defaults, list } = extractAgentsConfig(configResult.config)
        const agentConfig = list.find((a) => a.id === agentId)
        if (!agentConfig) {
          return NextResponse.json({ error: `Agent "${agentId}" 在实例配置中不存在` }, { status: 404 })
        }

        const workspace = resolveWorkspacePath(agentConfig, defaults)
        const wsContainer = containerWorkspacePath(workspace)
        containerSkillDir = `${wsContainer}/skills/${installation.skill.slug}`
      }

      // Delete container files (rm -rf on the skill dir)
      try {
        await dockerManager.removeContainerDir(instance.containerId, containerSkillDir)
      } catch (err) {
        return NextResponse.json(
          { error: `删除容器中的技能文件失败: ${(err as Error).message}` },
          { status: 500 },
        )
      }

      // Delete DB record
      await prisma.skillInstallation.delete({
        where: { id: installation.id },
      })

      auditLog({
        userId: user.id,
        action: 'SKILL_UNINSTALL',
        resource: 'skill',
        resourceId: id,
        details: {
          slug: installation.skill.slug,
          instanceId,
          agentId,
          containerPath: containerSkillDir,
        },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        status: 'uninstalled',
        skillId: id,
        instanceId,
        agentId,
      })
    }),
  ),
)
