import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { createSkillSchema } from '@/lib/validations/skill'
import { isSkillVisible, canCreateSkillWithCategory, getDefaultSkillCategory } from '@/lib/skills/permissions'
import { ensureSkillDir, generateDefaultSkillMd, writeSkillFile, parseFrontmatter } from '@/lib/skills/fs'
import type { SkillOverview, SkillListResponse, SkillCategory } from '@/types/skill'

// GET /api/v1/skills — List skills with pagination and filtering
export const GET = withAuth(
  withPermission('skills:develop', async (req, { user }) => {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')))
    const category = url.searchParams.get('category') as SkillCategory | null
    const source = url.searchParams.get('source') as 'LOCAL' | 'CLAWHUB' | null
    const tag = url.searchParams.get('tag')
    const search = url.searchParams.get('search')

    // Build where clause
    const where: Prisma.SkillWhereInput = {}
    if (category) where.category = category
    if (source) where.source = source
    if (tag) where.tags = { has: tag }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        include: {
          creator: { select: { name: true } },
          departments: { select: { id: true, name: true } },
          _count: { select: { installations: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.skill.count({ where }),
    ])

    // Filter by visibility
    const visibleSkills: SkillOverview[] = skills
      .filter((skill) => isSkillVisible(skill, user))
      .map((skill) => ({
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        emoji: skill.emoji,
        category: skill.category as SkillCategory,
        source: skill.source as 'LOCAL' | 'CLAWHUB',
        version: skill.version,
        tags: skill.tags,
        creatorName: skill.creator.name,
        departments: skill.departments.map((d) => ({ id: d.id, name: d.name })),
        installationCount: skill._count.installations,
        createdAt: skill.createdAt.toISOString(),
        updatedAt: skill.updatedAt.toISOString(),
      }))

    const response: SkillListResponse = {
      skills: visibleSkills,
      total,
      page,
      pageSize,
    }

    return NextResponse.json(response)
  }),
)

// POST /api/v1/skills — Create a new skill
export const POST = withAuth(
  withPermission(
    'skills:develop',
    withValidation(createSkillSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }

      const { slug, name, description, emoji, category: requestedCategory, departmentIds, tags, skillContent } = body

      // Determine category
      const category = requestedCategory || getDefaultSkillCategory(user.role)

      // Validate category permission
      if (!canCreateSkillWithCategory(user.role, category, user.departmentId, departmentIds)) {
        return NextResponse.json(
          { error: 'No permission to create skill of this category' },
          { status: 403 },
        )
      }

      // Check slug uniqueness
      const existing = await prisma.skill.findUnique({ where: { slug } })
      if (existing) {
        return NextResponse.json(
          { error: `Slug "${slug}" is already in use` },
          { status: 409 },
        )
      }

      // Resolve department IDs for DEPARTMENT category
      let connectDepts: { id: string }[] = []
      if (category === 'DEPARTMENT') {
        if (departmentIds && departmentIds.length > 0) {
          connectDepts = departmentIds.map((id) => ({ id }))
        } else if (user.departmentId) {
          connectDepts = [{ id: user.departmentId }]
        }
      }

      // Create filesystem directory + initial SKILL.md
      await ensureSkillDir(slug)
      const initialContent = skillContent || generateDefaultSkillMd(name, description ?? undefined, emoji ?? undefined)
      await writeSkillFile(slug, 'SKILL.md', initialContent)

      // Parse frontmatter for caching in DB
      const frontmatter = parseFrontmatter(initialContent)

      // Create DB record
      const skill = await prisma.skill.create({
        data: {
          slug,
          name,
          description: description ?? null,
          emoji: emoji ?? null,
          category,
          source: 'LOCAL',
          version: '0.1.0',
          creatorId: user.id,
          departments: connectDepts.length > 0 ? { connect: connectDepts } : undefined,
          tags: tags ?? [],
          frontmatter: frontmatter ? (frontmatter as Prisma.InputJsonValue) : undefined,
        },
        include: {
          creator: { select: { name: true } },
          departments: { select: { id: true, name: true } },
          _count: { select: { installations: true } },
        },
      })

      auditLog({
        userId: user.id,
        action: 'SKILL_CREATE',
        resource: 'skill',
        resourceId: skill.id,
        details: { slug, name, category },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json(
        {
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          emoji: skill.emoji,
          category: skill.category,
          source: skill.source,
          version: skill.version,
          tags: skill.tags,
          creatorName: skill.creator.name,
          departments: skill.departments.map((d) => ({ id: d.id, name: d.name })),
          installationCount: skill._count.installations,
          createdAt: skill.createdAt.toISOString(),
          updatedAt: skill.updatedAt.toISOString(),
        },
        { status: 201 },
      )
    }),
  ),
)
