import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  withAuth,
  withPermission,
  withValidation,
  param,
  type AuthContext,
} from '@/lib/middleware/auth'
import { updatePendingStatusSchema } from '@/lib/validations/regulation'
import { serializePendingUpdate } from '@/lib/regulation/check'

async function loadOwned(ctx: AuthContext) {
  const id = param(ctx, 'id')
  const row = await prisma.pendingUpdate.findUnique({
    where: { id },
    include: { tracker: true },
  })
  if (!row || row.tracker.userId !== ctx.user.id) return null
  return row
}

// PATCH /api/v1/regulations/pending/[id] — change status
export const PATCH = withAuth(
  withPermission(
    'knowledge:view',
    withValidation(updatePendingStatusSchema, async (_req, ctx) => {
      const row = await loadOwned(ctx as unknown as AuthContext)
      if (!row) {
        return NextResponse.json({ error: '记录不存在' }, { status: 404 })
      }
      const updated = await prisma.pendingUpdate.update({
        where: { id: row.id },
        data: {
          status: ctx.body.status,
          reviewedAt: ctx.body.status === 'NEW' ? null : new Date(),
        },
      })
      return NextResponse.json(serializePendingUpdate(updated))
    }),
  ),
)

// DELETE /api/v1/regulations/pending/[id]
export const DELETE = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const row = await loadOwned(ctx)
    if (!row) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    }
    await prisma.pendingUpdate.delete({ where: { id: row.id } })
    return NextResponse.json({ status: 'ok' })
  }),
)
