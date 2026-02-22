import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, paramArray } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { writeSkillFileSchema } from '@/lib/validations/skill'
import { isSkillVisible, canEditSkill } from '@/lib/skills/permissions'
import { isSkillPathSafe, readSkillFile, writeSkillFile, deleteSkillFile } from '@/lib/skills/fs'

/** Resolve skill + path segments, checking existence and permissions */
async function resolveSkillFile(
  id: string,
  pathSegments: string[],
) {
  const skill = await prisma.skill.findUnique({
    where: { id },
    include: { departments: { select: { id: true } } },
  })
  if (!skill) return { error: 'Skill 不存在', status: 404 }

  const relativePath = pathSegments.join('/')
  if (!relativePath) return { error: '缺少文件路径', status: 400 }

  if (!isSkillPathSafe(skill.slug, relativePath)) {
    return { error: '非法路径', status: 400 }
  }

  return { skill, relativePath }
}

// GET /api/v1/skills/[id]/files/[...path] — Read file content
export const GET = withAuth(
  withPermission('skills:develop', async (_req, ctx) => {
    const id = (Array.isArray(ctx.params?.id) ? ctx.params.id[0] : ctx.params?.id) ?? ''
    const pathSegments = paramArray(ctx, 'path')

    const result = await resolveSkillFile(id, pathSegments)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { skill, relativePath } = result

    // Visibility check
    if (!isSkillVisible(skill, ctx.user)) {
      return NextResponse.json({ error: '无权访问此 Skill' }, { status: 403 })
    }

    try {
      const content = await readSkillFile(skill.slug, relativePath)
      return NextResponse.json({ path: relativePath, content })
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('ENOENT') || message.includes('no such file')) {
        return NextResponse.json({ error: '文件不存在' }, { status: 404 })
      }
      return NextResponse.json(
        { error: `读取文件失败: ${message}` },
        { status: 500 },
      )
    }
  }),
)

// PUT /api/v1/skills/[id]/files/[...path] — Write file content
export const PUT = withAuth(
  withPermission(
    'skills:develop',
    withValidation(writeSkillFileSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string; path: string | string[] }
        body: typeof ctx.body
      }
      const id = (Array.isArray(ctx.params?.id) ? ctx.params.id[0] : ctx.params?.id) ?? ''
      const pathSegments = Array.isArray(ctx.params?.path)
        ? (ctx.params.path as string[])
        : ((ctx.params?.path || '') as string).split('/')

      const result = await resolveSkillFile(id, pathSegments)
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      const { skill, relativePath } = result

      // Edit permission check
      if (!canEditSkill(skill, user)) {
        return NextResponse.json({ error: '无权编辑此 Skill' }, { status: 403 })
      }

      try {
        await writeSkillFile(skill.slug, relativePath, body.content)

        auditLog({
          userId: user.id,
          action: 'SKILL_FILE_WRITE',
          resource: 'skill',
          resourceId: id,
          details: { slug: skill.slug, path: relativePath },
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent') || undefined,
          result: 'SUCCESS',
        })

        return NextResponse.json({ success: true, path: relativePath })
      } catch (err) {
        return NextResponse.json(
          { error: `写入文件失败: ${(err as Error).message}` },
          { status: 500 },
        )
      }
    }),
  ),
)

// DELETE /api/v1/skills/[id]/files/[...path] — Delete a file (SKILL.md protected)
export const DELETE = withAuth(
  withPermission('skills:develop', async (req, { user, params }) => {
    const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? ''
    const pathSegments = Array.isArray(params?.path)
      ? (params.path as string[])
      : ((params?.path || '') as string).split('/')

    const result = await resolveSkillFile(id, pathSegments)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { skill, relativePath } = result

    // Edit permission check
    if (!canEditSkill(skill, user)) {
      return NextResponse.json({ error: '无权编辑此 Skill' }, { status: 403 })
    }

    // Prohibit deleting SKILL.md
    if (relativePath === 'SKILL.md') {
      return NextResponse.json(
        { error: '不允许删除 SKILL.md 文件' },
        { status: 400 },
      )
    }

    try {
      await deleteSkillFile(skill.slug, relativePath)

      auditLog({
        userId: user.id,
        action: 'SKILL_FILE_DELETE',
        resource: 'skill',
        resourceId: id,
        details: { slug: skill.slug, path: relativePath },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ status: 'deleted' })
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('ENOENT') || message.includes('no such file')) {
        return NextResponse.json({ error: '文件不存在' }, { status: 404 })
      }
      return NextResponse.json(
        { error: `删除文件失败: ${message}` },
        { status: 500 },
      )
    }
  }),
)
