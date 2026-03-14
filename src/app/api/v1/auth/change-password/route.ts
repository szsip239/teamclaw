import { NextResponse } from 'next/server'
import bcryptjs from 'bcryptjs'
import { prisma } from '@/lib/db'
import { withAuth, withValidation } from '@/lib/middleware/auth'
import { changePasswordSchema } from '@/lib/validations/user'
import { auditLog } from '@/lib/audit'

// POST /api/v1/auth/change-password — User changes own password
export const POST = withAuth(
  withValidation(changePasswordSchema, async (req, ctx) => {
    const { user, body } = ctx as {
      user: NonNullable<typeof ctx.user>
      body: typeof ctx.body
    }

    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const valid = await bcryptjs.compare(body.currentPassword, existing.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    const passwordHash = await bcryptjs.hash(body.newPassword, 12)

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    // Invalidate all refresh tokens — force re-login on other devices
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } })

    auditLog({
      userId: user.id,
      action: 'USER_CHANGE_PASSWORD',
      resource: 'user',
      resourceId: user.id,
      details: { self: true },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'SUCCESS',
    })

    return NextResponse.json({ message: 'Password changed successfully' })
  }),
)
