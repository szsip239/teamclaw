import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { createSkillSchema } from '@/lib/validations/skill'
import {
  canCreateSkillWithCategory,
  getDefaultSkillCategory,
} from '@/lib/skills/permissions'
import {
  ensureSkillDir,
  generateDefaultSkillMd,
  writeSkillFile,
  parseFrontmatter,
} from '@/lib/skills/fs'
import {
  normalizeImportedSkillFiles,
  readImportedSkillText,
  writeImportedSkillFiles,
} from '@/lib/skills/import'
import type { SkillOverview, SkillListResponse, SkillCategory, SkillSource } from '@/types/skill'

/** Scan external instance workspaces for skill directories not yet in the DB,
 *  auto-register them, and return as SkillOverview items. */
async function discoverInstanceSkills(
  dbSlugs: Set<string>,
  creatorId: string,
): Promise<SkillOverview[]> {
  const result: SkillOverview[] = []
  const instances = await prisma.instance.findMany({
    where: { workspacePath: { not: null } },
    select: { workspacePath: true },
  })

  const scanDirs = new Set<string>()
  for (const inst of instances) {
    if (inst.workspacePath) {
      scanDirs.add(join(inst.workspacePath, 'skills'))
      scanDirs.add(join(inst.workspacePath, 'workspace', 'skills'))
    }
  }

  for (const dir of scanDirs) {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const slug of entries) {
      if (dbSlugs.has(slug)) continue

      let raw: string
      try {
        raw = await readFile(join(dir, slug, 'SKILL.md'), 'utf-8')
      } catch {
        // Not a skill directory — skip
        continue
      }
      const fm = parseFrontmatter(raw)
      const name = (fm?.name as string) || slug
      const description = (fm?.description as string) || ''

      // Auto-register so it appears on subsequent requests without re-scanning.
      let skill: { id: string; slug: string; name: string; description: string | null; emoji: string | null; category: string; source: string; version: string; tags: string[]; createdAt: Date; updatedAt: Date }
      const existing = await prisma.skill.findUnique({ where: { slug } })
      if (existing) {
        dbSlugs.add(slug)
        continue
      }
      skill = await prisma.skill.create({
        data: {
          slug,
          name: String(name),
          description: String(description || '').slice(0, 500) || null,
          category: 'DEFAULT',
          source: 'INSTANCE',
          version: '0.1.0',
          creatorId,
          tags: [],
        },
      })

      result.push({
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        emoji: null,
        category: 'DEFAULT',
        source: 'INSTANCE',
        version: skill.version,
        tags: [],
        creatorName: '',
        departments: [],
        installationCount: 0,
        createdAt: skill.createdAt.toISOString(),
        updatedAt: skill.updatedAt.toISOString(),
      })
      dbSlugs.add(slug)
    }
  }

  return result
}

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

    // Build where clause with visibility baked in (so pagination works correctly)
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

    // Visibility filter at DB level: SYSTEM_ADMIN sees all, others see DEFAULT + own DEPARTMENT + own PERSONAL
    if (user.role !== 'SYSTEM_ADMIN') {
      const visibilityConditions: Prisma.SkillWhereInput[] = [
        { category: 'DEFAULT' },
        { category: 'PERSONAL', creatorId: user.id },
      ]
      if (user.departmentId) {
        visibilityConditions.push({
          category: 'DEPARTMENT',
          departments: { some: { id: user.departmentId } },
        })
      }
      // Merge with existing search OR conditions
      if (where.OR) {
        // search + visibility: AND(OR(search conditions), OR(visibility conditions))
        const searchConditions = where.OR
        delete where.OR
        where.AND = [{ OR: searchConditions }, { OR: visibilityConditions }]
      } else {
        where.OR = visibilityConditions
      }
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

    const visibleSkills: SkillOverview[] = skills.map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      emoji: skill.emoji,
      category: skill.category as SkillCategory,
      source: skill.source as SkillSource,
      version: skill.version,
      tags: skill.tags,
      creatorName: skill.creator.name,
      departments: skill.departments.map((d) => ({ id: d.id, name: d.name })),
      installationCount: skill._count.installations,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    }))

    // Discover skills from connected instance workspaces that are not yet in
    // the DB (e.g. skills installed via OpenClaw CLI / ClawHub / chat agent).
    const dbSlugs = new Set(skills.map((s) => s.slug))
    const discovered = await discoverInstanceSkills(dbSlugs, user.id)

    const allSkills = [...visibleSkills, ...discovered]

    const response: SkillListResponse = {
      skills: allSkills,
      total: total + discovered.length,
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

      const {
        slug,
        name,
        description,
        emoji,
        category: requestedCategory,
        departmentIds,
        tags,
        skillContent,
        importFiles,
      } = body

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
        return NextResponse.json({ error: `Slug "${slug}" is already in use` }, { status: 409 })
      }

      let normalizedImportFiles: ReturnType<typeof normalizeImportedSkillFiles> | null = null
      let importedSkillMdContent: string | null = null

      if (importFiles && importFiles.length > 0) {
        try {
          normalizedImportFiles = normalizeImportedSkillFiles(importFiles)
          const importedSkillMd = normalizedImportFiles.find((file) => file.path === 'SKILL.md')
          importedSkillMdContent = importedSkillMd ? readImportedSkillText(importedSkillMd) : null
        } catch (err) {
          return NextResponse.json(
            { error: (err as Error).message || 'Invalid imported skill folder' },
            { status: 400 },
          )
        }
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
      const initialContent =
        importedSkillMdContent ??
        skillContent ??
        generateDefaultSkillMd(name, description ?? undefined, emoji ?? undefined)

      if (normalizedImportFiles) {
        await writeImportedSkillFiles(slug, normalizedImportFiles)
      } else {
        await writeSkillFile(slug, 'SKILL.md', initialContent)
      }

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
        details: {
          slug,
          name,
          category,
          importFileCount: normalizedImportFiles?.length ?? 0,
        },
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
