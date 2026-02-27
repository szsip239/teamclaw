import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/lib/auth/jwt'

function isSecure(req: NextRequest): boolean {
  return req.headers.get('x-forwarded-proto') === 'https'
}

export async function POST(req: NextRequest) {
  const refreshTokenValue = req.cookies.get('refresh_token')?.value

  if (!refreshTokenValue) {
    return NextResponse.json(
      { error: 'No refresh token provided' },
      { status: 401 }
    )
  }

  // Verify JWT signature
  const payload = await verifyRefreshToken(refreshTokenValue)
  if (!payload) {
    return NextResponse.json(
      { error: 'Invalid refresh token' },
      { status: 401 }
    )
  }

  const tokenHash = createHash('sha256')
    .update(refreshTokenValue)
    .digest('hex')

  // Find token in DB
  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  })

  if (!storedToken) {
    // Reuse detection: token is valid JWT but not in DB
    // Delete ALL tokens for this user (security measure)
    await prisma.refreshToken.deleteMany({
      where: { userId: payload.userId },
    })
    return NextResponse.json(
      { error: 'Refresh token reuse detected. All sessions invalidated.' },
      { status: 401 }
    )
  }

  // Check expiry
  if (storedToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } })
    return NextResponse.json(
      { error: 'Refresh token expired' },
      { status: 401 }
    )
  }

  // Load user
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  })

  if (!user || user.status !== 'ACTIVE') {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } })
    return NextResponse.json(
      { error: 'User not found or disabled' },
      { status: 401 }
    )
  }

  // Token rotation: delete old, create new
  await prisma.refreshToken.delete({ where: { id: storedToken.id } })

  const newAccessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
  })
  const newRefreshToken = await signRefreshToken(user.id)
  const newTokenHash = createHash('sha256')
    .update(newRefreshToken)
    .digest('hex')

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: newTokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  const response = NextResponse.json({ success: true })

  response.cookies.set('access_token', newAccessToken, {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: 'lax',
    maxAge: 900,
    path: '/',
  })

  response.cookies.set('refresh_token', newRefreshToken, {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: 'lax',
    maxAge: 604800,
    path: '/api/v1/auth',
  })

  return response
}
