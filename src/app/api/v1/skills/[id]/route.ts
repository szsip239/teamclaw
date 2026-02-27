import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { updateSkillSchema } from '@/lib/validations/skill'
import { isSkillVisible, canEditSkill, canCreateSkillWithCategory } from '@/lib/skills/permissions'
import { deleteSkillDir, renameSkillDir } from '@/lib/skills/fs'
import type { SkillDetail, SkillCategory, SkillSource } from '@/types/skill'

// GET /api/v1/skills/[id] — Skill detail
export const GET = withAuth(
  withPermission('skills:develop', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })
    }

    const skill = await prisma.skill.findUnique({
      where: { id },
      include: {
        creator: { select: { name: true } },
        departments: { select: { id: true, name: true } },
        versions: {
          include: { publishedBy: { select: { name: true } } },
          orderBy: { publishedAt: 'desc' },
        },
        _count: { select: { installations: true } },
      },
    })

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    // Visibility check
    if (!isSkillVisible(skill, ctx.user)) {
      return NextResponse.json({ error: 'No access to this skill' }, { status: 403 })
    }

    const detail: SkillDetail = {
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
      homepage: skill.homepage,
      clawhubSlug: skill.clawhubSlug,
      frontmatter: skill.frontmatter as Record<string, unknown> | null,
      versions: skill.versions.map((v) => ({
        id: v.id,
        version: v.version,
        changelog: v.changelog,
        publishedByName: v.publishedBy.name,
        publishedAt: v.publishedAt.toISOString(),
      })),
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    }

    return NextResponse.json(detail)
  }),
)

// PUT /api/v1/skills/[id] — Update skill metadata
export const PUT = withAuth(
  withPermission(
    'skills:develop',
    withValidation(updateSkillSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = ctx.params?.id as string
      if (!id) {
        return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })
      }

      const skill = await prisma.skill.findUnique({
        where: { id },
        include: { departments: { select: { id: true } } },
      })
      if (!skill) {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
      }

      // Edit permission check
      if (!canEditSkill(skill, user)) {
        return NextResponse.json({ error: 'No permission to edit this skill' }, { status: 403 })
      }

      // Handle category change with permission check
      if (body.category !== undefined && body.category !== skill.category) {
        if (!canCreateSkillWithCategory(user.role, body.category, user.departmentId, body.departmentIds)) {
          return NextResponse.json(
            { error: 'No permission to change skill category to this type' },
            { status: 403 },
          )
        }
        if (body.category === 'DEPARTMENT') {
          const deptIds = body.departmentIds || (user.departmentId ? [user.departmentId] : [])
          if (deptIds.length === 0) {
            return NextResponse.json({ error: 'Department-level skills require specifying a department' }, { status: 400 })
          }
          // Validate all department IDs exist
          const deptCount = await prisma.department.count({
            where: { id: { in: deptIds } },
          })
          if (deptCount !== deptIds.length) {
            return NextResponse.json({ error: 'Some specified departments do not exist' }, { status: 404 })
          }
        }
      }

      // Handle slug change: check uniqueness + rename directory
      if (body.slug !== undefined && body.slug !== skill.slug) {
        const existing = await prisma.skill.findUnique({ where: { slug: body.slug } })
        if (existing) {
          return NextResponse.json(
            { error: `Slug "${body.slug}" is already in use` },
            { status: 409 },
          )
        }
        try {
          await renameSkillDir(skill.slug, body.slug)
        } catch (err) {
          return NextResponse.json(
            { error: `Failed to rename skill directory:${(err as Error).message}` },
            { status: 500 },
          )
        }
      }

      // Build update data
      const updateData: Record<string, unknown> = {}
      if (body.slug !== undefined) updateData.slug = body.slug
      if (body.name !== undefined) updateData.name = body.name
      if (body.description !== undefined) updateData.description = body.description
      if (body.emoji !== undefined) updateData.emoji = body.emoji
      if (body.tags !== undefined) updateData.tags = body.tags
      if (body.homepage !== undefined) updateData.homepage = body.homepage
      if (body.category !== undefined) {
        updateData.category = body.category
        if (body.category === 'DEPARTMENT') {
          const deptIds = body.departmentIds || (user.departmentId ? [user.departmentId] : [])
          updateData.departments = { set: deptIds.map((id: string) => ({ id })) }
        } else {
          // Non-DEPARTMENT: disconnect all departments
          updateData.departments = { set: [] }
        }
      } else if (body.departmentIds !== undefined) {
        // Update departments without changing category
        updateData.departments = { set: body.departmentIds.map((id: string) => ({ id })) }
      }

      const updated = await prisma.skill.update({
        where: { id },
        data: updateData,
        include: {
          creator: { select: { name: true } },
          departments: { select: { id: true, name: true } },
          _count: { select: { installations: true } },
        },
      })

      auditLog({
        userId: user.id,
        action: 'SKILL_UPDATE',
        resource: 'skill',
        resourceId: id,
        details: { slug: updated.slug, name: updated.name },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        emoji: updated.emoji,
        category: updated.category,
        source: updated.source,
        version: updated.version,
        tags: updated.tags,
        creatorName: updated.creator.name,
        departments: updated.departments.map((d) => ({ id: d.id, name: d.name })),
        installationCount: updated._count.installations,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      })
    }),
  ),
)

// DELETE /api/v1/skills/[id] — Delete skill
export const DELETE = withAuth(
  withPermission('skills:develop', async (req, { user, params }) => {
    const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? ''
    if (!id) {
      return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })
    }

    const skill = await prisma.skill.findUnique({
      where: { id },
      include: { departments: { select: { id: true } } },
    })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    // Edit permission check (same as edit — owner/admin only)
    if (!canEditSkill(skill, user)) {
      return NextResponse.json({ error: 'No permission to delete this skill' }, { status: 403 })
    }

    // Delete DB records (cascade deletes versions + installations)
    await prisma.skill.delete({ where: { id } })

    // Delete filesystem directory
    await deleteSkillDir(skill.slug).catch((err) => {
      console.error(`Failed to delete skill dir for ${skill.slug}:`, err)
    })

    auditLog({
      userId: user.id,
      action: 'SKILL_DELETE',
      resource: 'skill',
      resourceId: id,
      details: { slug: skill.slug, name: skill.name },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return NextResponse.json({ status: 'deleted' })
  }),
)
