import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath } from '@/lib/session-files/helpers'
import { mkdirSchema } from '@/lib/validations/session-files'

// POST /api/v1/chat/sessions/[id]/files/mkdir — create folder in input/
export const POST = withAuth(
  withPermission('chat:use', async (req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
    }

    const result = mkdirSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        {
          error: '参数验证失败',
          details: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      )
    }

    const session = await prisma.chatSession.findUnique({ where: { id } })
    if (!session) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }
    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: '无权访问此会话' }, { status: 403 })
    }

    const instance = await prisma.instance.findUnique({ where: { id: session.instanceId } })
    if (!instance?.containerId) {
      return NextResponse.json({ error: '实例未就绪' }, { status: 400 })
    }

    const fullPath = resolveSessionFilePath(
      session.agentId, session.userId, session.id, 'input', result.data.dir,
    )

    await dockerManager.ensureContainerDir(instance.containerId, fullPath)

    return NextResponse.json({ success: true })
  }),
)
