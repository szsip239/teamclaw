import { NextResponse } from 'next/server'
import * as fs from 'fs/promises'
import * as path from 'path'
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

/**
 * Resolve a gateway workspace path (which may use ~) to an absolute host path.
 * Uses the instance's workspacePath (e.g. /Users/user/.openclaw) to derive the home dir.
 */
function resolveExternalPath(workspacePath: string, gatewayPath: string): string {
  if (!gatewayPath.startsWith('~')) return gatewayPath
  // workspacePath = /Users/user/.openclaw → homeDir = /Users/user
  const homeDir = path.resolve(workspacePath, '..')
  return gatewayPath.replace(/^~/, homeDir)
}

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
        return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })
      }

      const { instanceId, agentId, installPath } = body

      // Find skill
      const skill = await prisma.skill.findUnique({ where: { id } })
      if (!skill) {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
      }

      // Check instance exists
      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: { id: true, name: true, containerId: true, workspacePath: true },
      })
      if (!instance) {
        return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
      }
      if (!instance.containerId && !instance.workspacePath) {
        return NextResponse.json({ error: 'Instance has no container or workspace path configured' }, { status: 400 })
      }

      // Check agent permission via AgentMeta
      const agentMeta = await prisma.agentMeta.findUnique({
        where: { instanceId_agentId: { instanceId, agentId } },
      })
      if (!canInstallToAgent(agentMeta, user)) {
        return NextResponse.json({ error: 'No permission to install to this agent' }, { status: 403 })
      }

      // Resolve the target skill directory
      let targetDir: string
      const isExternal = !instance.containerId && !!instance.workspacePath

      if (installPath === 'global') {
        if (isExternal) {
          targetDir = `${instance.workspacePath}/skills/${skill.slug}`
        } else {
          targetDir = `/home/node/.openclaw/skills/${skill.slug}`
        }
      } else {
        // workspace: need agent workspace path from gateway config
        await ensureRegistryInitialized()
        const adapter = registry.getAdapter(instanceId)
        const client = registry.getClient(instanceId)
        if (!adapter || !client) {
          return NextResponse.json({ error: 'Instance not connected, cannot get agent workspace path' }, { status: 400 })
        }

        const configResult = await adapter.getConfig(client)
        const { defaults, list } = extractAgentsConfig(configResult.config)
        const agentConfig = list.find((a) => a.id === agentId)
        if (!agentConfig) {
          return NextResponse.json({ error: `Agent "${agentId}" not found in instance config` }, { status: 404 })
        }

        const workspace = resolveWorkspacePath(agentConfig, defaults)
        if (isExternal) {
          targetDir = `${resolveExternalPath(instance.workspacePath!, workspace)}/skills/${skill.slug}`
        } else {
          const wsContainer = containerWorkspacePath(workspace)
          targetDir = `${wsContainer}/skills/${skill.slug}`
        }
      }

      // Read all files from skill dir on host (recursive)
      const files = await collectAllFiles(skill.slug)
      if (files.length === 0) {
        return NextResponse.json({ error: 'Skill directory is empty, no files to install' }, { status: 400 })
      }

      // Write files to target (container or host filesystem)
      try {
        if (isExternal) {
          await fs.mkdir(targetDir, { recursive: true, mode: 0o755 })
          for (const file of files) {
            const filePath = path.join(targetDir, file.path)
            await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o755 })
            await fs.writeFile(filePath, file.content, { mode: 0o644 })
          }
        } else {
          await dockerManager.ensureContainerDir(instance.containerId!, targetDir)
          for (const file of files) {
            const containerFilePath = `${targetDir}/${file.path}`
            const lastSlash = containerFilePath.lastIndexOf('/')
            if (lastSlash > 0) {
              await dockerManager.ensureContainerDir(instance.containerId!, containerFilePath.slice(0, lastSlash))
            }
            await dockerManager.writeContainerFile(instance.containerId!, containerFilePath, file.content)
          }
        }
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to write skill files: ${(err as Error).message}` },
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
          external: isExternal,
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
          targetPath: targetDir,
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
