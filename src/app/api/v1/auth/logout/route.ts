import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { verifyRefreshToken } from '@/lib/auth/jwt'
import { auditLog } from '@/lib/audit'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const userAgent = req.headers.get('user-agent') || undefined

  const refreshTokenValue = req.cookies.get('refresh_token')?.value
  const userId = req.headers.get('x-user-id')

  // Delete refresh token from DB if present
  if (refreshTokenValue) {
    const payload = await verifyRefreshToken(refreshTokenValue)
    if (payload) {
      const tokenHash = createHash('sha256')
        .update(refreshTokenValue)
        .digest('hex')
      await prisma.refreshToken
        .delete({ where: { tokenHash } })
        .catch(() => {})
    }
  }

  // Audit log
  if (userId) {
    auditLog({
      userId,
      action: 'LOGOUT',
      resource: 'auth',
      ipAddress: ip,
      userAgent,
      result: 'SUCCESS',
    })
  }

  // Clear cookies
  const response = NextResponse.json({ success: true })

  response.cookies.set('access_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  response.cookies.set('refresh_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/v1/auth',
  })

  return response
}
