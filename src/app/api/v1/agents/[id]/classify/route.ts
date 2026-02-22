import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { classifyAgentSchema } from '@/lib/validations/agent'
import { auditLog } from '@/lib/audit'
import { parseAgentId } from '@/lib/agents/helpers'

// PATCH /api/v1/agents/[id]/classify — Change agent classification (SYSTEM_ADMIN only)
export const PATCH = withAuth(
  withPermission(
    'agents:classify',
    withValidation(classifyAgentSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }

      const parsed = parseAgentId(params.id)
      if (!parsed) {
        return NextResponse.json({ error: '无效的 Agent ID 格式' }, { status: 400 })
      }

      const { instanceId, agentId } = parsed
      const { category, departmentId, ownerId } = body

      // Validate category-specific fields
      if (category === 'DEPARTMENT' && !departmentId) {
        return NextResponse.json(
          { error: '部门分类需要指定部门 ID' },
          { status: 400 },
        )
      }
      if (category === 'PERSONAL' && !ownerId) {
        return NextResponse.json(
          { error: '个人分类需要指定用户 ID' },
          { status: 400 },
        )
      }

      // Upsert AgentMeta (may not exist for legacy agents)
      const meta = await prisma.agentMeta.upsert({
        where: { instanceId_agentId: { instanceId, agentId } },
        update: {
          category,
          departmentId: category === 'DEPARTMENT' ? departmentId : null,
          ownerId: category === 'PERSONAL' ? ownerId : null,
        },
        create: {
          instanceId,
          agentId,
          category,
          departmentId: category === 'DEPARTMENT' ? departmentId : null,
          ownerId: category === 'PERSONAL' ? ownerId : null,
          createdById: user.id,
        },
        include: {
          department: { select: { name: true } },
          owner: { select: { name: true } },
        },
      })

      auditLog({
        userId: user.id,
        action: 'AGENT_CLASSIFY',
        resource: 'agent',
        resourceId: params.id,
        details: { agentId, instanceId, category },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({
        status: 'updated',
        category: meta.category,
        departmentName: meta.department?.name ?? null,
        ownerName: meta.owner?.name ?? null,
      })
    }),
  ),
)
