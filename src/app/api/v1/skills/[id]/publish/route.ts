import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import type { AuthContext } from '@/lib/middleware/auth'
import { publishVersionSchema } from '@/lib/validations/skill'
import { canEditSkill } from '@/lib/skills/permissions'
import { readSkillFile, parseFrontmatter } from '@/lib/skills/fs'
import { auditLog } from '@/lib/audit'
import type { Prisma } from '@/generated/prisma'

// POST /api/v1/skills/[id]/publish - Publish a new version
export const POST = withAuth(
  withPermission(
    'skills:develop',
    withValidation(publishVersionSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = param(ctx as unknown as AuthContext, 'id')
      if (!id) {
        return NextResponse.json({ error: '缺少技能 ID' }, { status: 400 })
      }

      // Find skill
      const skill = await prisma.skill.findUnique({
        where: { id },
        include: { departments: { select: { id: true } } },
      })
      if (!skill) {
        return NextResponse.json({ error: '技能不存在' }, { status: 404 })
      }

      // Permission check
      if (!canEditSkill(skill, user)) {
        return NextResponse.json({ error: '没有权限编辑此技能' }, { status: 403 })
      }

      // Check version doesn't already exist
      const existingVersion = await prisma.skillVersion.findUnique({
        where: { skillId_version: { skillId: id, version: body.version } },
      })
      if (existingVersion) {
        return NextResponse.json(
          { error: `版本 ${body.version} 已存在，请使用不同的版本号` },
          { status: 409 },
        )
      }

      // Re-parse SKILL.md frontmatter and cache
      let frontmatter: Record<string, unknown> | null = null
      try {
        const skillMd = await readSkillFile(skill.slug, 'SKILL.md')
        frontmatter = parseFrontmatter(skillMd)
      } catch {
        // SKILL.md may not exist — that's okay
      }

      // Update skill version and create version record in a transaction
      const [updatedSkill, version] = await prisma.$transaction([
        prisma.skill.update({
          where: { id },
          data: {
            version: body.version,
            frontmatter: frontmatter as Prisma.InputJsonValue ?? undefined,
            updatedAt: new Date(),
          },
        }),
        prisma.skillVersion.create({
          data: {
            skillId: id,
            version: body.version,
            changelog: body.changelog ?? null,
            publishedById: user.id,
          },
        }),
      ])

      auditLog({
        userId: user.id,
        action: 'SKILL_PUBLISH',
        resource: 'skill',
        resourceId: id,
        details: { slug: skill.slug, version: body.version },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        skill: {
          id: updatedSkill.id,
          slug: updatedSkill.slug,
          version: updatedSkill.version,
          frontmatter: updatedSkill.frontmatter,
        },
        version: {
          id: version.id,
          version: version.version,
          changelog: version.changelog,
          publishedAt: version.publishedAt.toISOString(),
        },
      })
    }),
  ),
)
