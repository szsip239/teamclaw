import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import type { AuthContext } from '@/lib/middleware/auth'
import { installSkillSchema } from '@/lib/validations/skill'
import { canInstallToAgent } from '@/lib/skills/permissions'
import { listSkillFiles, readSkillFile } from '@/lib/skills/fs'
import { dockerManager } from '@/lib/docker'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { extractAgentsConfig, resolveWorkspacePath, containerWorkspacePath } from '@/lib/agents/helpers'
import { auditLog } from '@/lib/audit'

// POST /api/v1/skills/[id]/install - Install skill to agent
export const POST = withAuth(
  withPermission(
    'skills:develop',
    withValidation(installSkillSchema, async (req, ctx) => {
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

      // Find skill
      const skill = await prisma.skill.findUnique({ where: { id } })
      if (!skill) {
        return NextResponse.json({ error: '技能不存在' }, { status: 404 })
      }

      // Check instance exists and has container
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

      // Check agent permission via AgentMeta
      const agentMeta = await prisma.agentMeta.findUnique({
        where: { instanceId_agentId: { instanceId, agentId } },
      })
      if (!canInstallToAgent(agentMeta, user)) {
        return NextResponse.json({ error: '没有权限安装到该 Agent' }, { status: 403 })
      }

      // Determine container target path
      let containerTargetDir: string
      if (installPath === 'global') {
        containerTargetDir = `/home/node/.openclaw/skills/${skill.slug}`
      } else {
        // workspace: need agent workspace path
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
        containerTargetDir = `${wsContainer}/skills/${skill.slug}`
      }

      // Read all files from skill dir on host (recursive)
      const files = await collectAllFiles(skill.slug)
      if (files.length === 0) {
        return NextResponse.json({ error: '技能目录为空，没有文件可安装' }, { status: 400 })
      }

      // Ensure target directory exists in container
      try {
        await dockerManager.ensureContainerDir(instance.containerId, containerTargetDir)
      } catch (err) {
        return NextResponse.json(
          { error: `创建目标目录失败: ${(err as Error).message}` },
          { status: 500 },
        )
      }

      // Write each file to container
      try {
        for (const file of files) {
          const containerFilePath = `${containerTargetDir}/${file.path}`
          // Ensure subdirectory exists
          const lastSlash = containerFilePath.lastIndexOf('/')
          if (lastSlash > 0) {
            const dir = containerFilePath.slice(0, lastSlash)
            await dockerManager.ensureContainerDir(instance.containerId, dir)
          }
          await dockerManager.writeContainerFile(
            instance.containerId,
            containerFilePath,
            file.content,
          )
        }
      } catch (err) {
        return NextResponse.json(
          { error: `写入文件到容器失败: ${(err as Error).message}` },
          { status: 500 },
        )
      }

      // Upsert SkillInstallation record
      const installation = await prisma.skillInstallation.upsert({
        where: {
          skillId_instanceId_agentId_installPath: { skillId: id, instanceId, agentId, installPath },
        },
        create: {
          skillId: id,
          instanceId,
          agentId,
          installedVersion: skill.version,
          installPath,
          installedById: user.id,
        },
        update: {
          installedVersion: skill.version,
          installPath,
          installedById: user.id,
          updatedAt: new Date(),
        },
      })

      auditLog({
        userId: user.id,
        action: 'SKILL_INSTALL',
        resource: 'skill',
        resourceId: id,
        details: {
          slug: skill.slug,
          instanceId,
          agentId,
          installPath,
          version: skill.version,
        },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        installation: {
          id: installation.id,
          skillId: id,
          instanceId,
          agentId,
          installedVersion: installation.installedVersion,
          installPath: installation.installPath,
          containerPath: containerTargetDir,
          filesCount: files.length,
        },
      })
    }),
  ),
)

/** Recursively collect all files from a skill directory with their content */
async function collectAllFiles(
  slug: string,
  subdir?: string,
): Promise<{ path: string; content: string }[]> {
  const entries = await listSkillFiles(slug, subdir)
  const result: { path: string; content: string }[] = []

  for (const entry of entries) {
    if (entry.type === 'directory') {
      const nested = await collectAllFiles(slug, entry.path)
      result.push(...nested)
    } else {
      try {
        const content = await readSkillFile(slug, entry.path)
        result.push({ path: entry.path, content })
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return result
}
