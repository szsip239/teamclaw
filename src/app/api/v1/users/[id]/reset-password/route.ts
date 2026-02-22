import { NextResponse } from 'next/server'
import bcryptjs from 'bcryptjs'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { resetPasswordSchema } from '@/lib/validations/user'
import { auditLog } from '@/lib/audit'

// POST /api/v1/users/[id]/reset-password — Admin resets password
export const POST = withAuth(
  withPermission(
    'users:reset_password',
    withValidation(resetPasswordSchema, async (req, ctx) => {
      const { user, params, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        params: { id: string }
        body: typeof ctx.body
      }
      const id = params.id

      const existing = await prisma.user.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 })
      }

      const passwordHash = await bcryptjs.hash(body.newPassword, 12)

      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      })

      // Invalidate all refresh tokens for security
      await prisma.refreshToken.deleteMany({ where: { userId: id } })

      auditLog({
        userId: user.id,
        action: 'USER_RESET_PASSWORD',
        resource: 'user',
        resourceId: id,
        details: { targetEmail: existing.email },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ message: '密码重置成功' })
    }),
  ),
)
