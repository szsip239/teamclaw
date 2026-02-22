import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { clawHubPullSchema } from '@/lib/validations/skill'
import { pullClawHubSkill, parseClawHubSlug, parseClawHubFullPath } from '@/lib/skills/clawhub'
import { ensureSkillDir, readSkillFile, parseFrontmatter } from '@/lib/skills/fs'
import { auditLog } from '@/lib/audit'
import type { Prisma } from '@/generated/prisma'

// POST /api/v1/skills/clawhub/pull - Pull skill from ClawHub
export const POST = withAuth(
  withPermission(
    'skills:manage_global',
    withValidation(clawHubPullSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }

      const { category, departmentIds } = body
      const rawInput = body.slug.trim()
      // Normalize slug: accept URLs like https://clawhub.ai/owner/name
      const slug = parseClawHubSlug(rawInput)

      // Extract full path (owner/slug) for link construction
      const fullPath = parseClawHubFullPath(rawInput)

      // Derive homepage URL from user input
      let homepage: string | null = null
      if (rawInput.includes('clawhub')) {
        homepage = rawInput.startsWith('http') ? rawInput : `https://${rawInput}`
      } else if (fullPath) {
        homepage = `https://clawhub.ai/${fullPath}`
      }

      // Check if skill with same slug already exists
      const existing = await prisma.skill.findUnique({ where: { slug } })
      if (existing) {
        return NextResponse.json(
          { error: `技能 slug "${slug}" 已存在，请先删除或使用不同的 slug` },
          { status: 409 },
        )
      }

      // Ensure target directory
      const targetDir = await ensureSkillDir(slug)

      // Pull from ClawHub
      const pullResult = await pullClawHubSkill(slug, targetDir)
      if (!pullResult) {
        return NextResponse.json(
          { error: '从 ClawHub 拉取技能失败，请确认 slug 正确且 ClawHub 可访问' },
          { status: 502 },
        )
      }

      // Parse frontmatter from downloaded SKILL.md
      let frontmatter: Record<string, unknown> | null = null
      try {
        const skillMd = await readSkillFile(slug, 'SKILL.md')
        frontmatter = parseFrontmatter(skillMd)
      } catch {
        // SKILL.md may not exist in the downloaded package
      }

      // Determine category (default to DEFAULT for CLAWHUB pulls)
      const skillCategory = category || 'DEFAULT'

      // Validate departmentIds if category is DEPARTMENT
      if (skillCategory === 'DEPARTMENT') {
        if (!departmentIds || departmentIds.length === 0) {
          return NextResponse.json(
            { error: '部门级技能需要指定部门' },
            { status: 400 },
          )
        }
        const deptCount = await prisma.department.count({
          where: { id: { in: departmentIds } },
        })
        if (deptCount !== departmentIds.length) {
          return NextResponse.json({ error: '部分指定的部门不存在' }, { status: 404 })
        }
      }

      // Build department connections
      const connectDepts = skillCategory === 'DEPARTMENT' && departmentIds
        ? { connect: departmentIds.map((id: string) => ({ id })) }
        : undefined

      // Create Skill DB record
      const skill = await prisma.skill.create({
        data: {
          slug,
          name: pullResult.name || frontmatter?.name as string || slug,
          description: pullResult.description || frontmatter?.description as string || null,
          emoji: frontmatter?.emoji as string || null,
          category: skillCategory,
          source: 'CLAWHUB',
          clawhubSlug: fullPath || slug,
          homepage,
          version: pullResult.version || '1.0.0',
          creatorId: user.id,
          departments: connectDepts,
          tags: frontmatter?.tags
            ? (Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : [])
            : [],
          frontmatter: frontmatter as Prisma.InputJsonValue ?? undefined,
        },
      })

      // Create initial version record
      await prisma.skillVersion.create({
        data: {
          skillId: skill.id,
          version: skill.version,
          changelog: '从 ClawHub 拉取',
          publishedById: user.id,
        },
      })

      auditLog({
        userId: user.id,
        action: 'SKILL_CLAWHUB_PULL',
        resource: 'skill',
        resourceId: skill.id,
        details: { slug, version: skill.version, source: 'CLAWHUB' },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        skill: {
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          version: skill.version,
          category: skill.category,
          source: skill.source,
          clawhubSlug: skill.clawhubSlug,
          frontmatter: skill.frontmatter,
          createdAt: skill.createdAt.toISOString(),
        },
      })
    }),
  ),
)
