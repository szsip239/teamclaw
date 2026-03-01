import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt'
import { verifyPassword } from '@/lib/auth/password'
import { loginSchema } from '@/lib/validations/auth'
import {
  checkRateLimit,
  checkLoginLockout,
  recordLoginFailure,
  clearLoginFailures,
} from '@/lib/redis'
import { auditLog } from '@/lib/audit'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

function isSecure(req: NextRequest): boolean {
  // Only set Secure cookies when the client actually connected via HTTPS
  // (indicated by reverse proxy's x-forwarded-proto header).
  // Never base this on NODE_ENV — production can be accessed via HTTP locally.
  return req.headers.get('x-forwarded-proto') === 'https'
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const userAgent = req.headers.get('user-agent') || undefined

  // Rate limit: 10 per minute per IP
  const rateResult = await checkRateLimit(`rate:${ip}:login`, 10, 60)
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    )
  }

  const { email, password } = parsed.data

  // Check login lockout
  const lockout = await checkLoginLockout(email)
  if (lockout.locked) {
    return NextResponse.json(
      { error: 'Account temporarily locked due to too many failed attempts. Try again later.' },
      { status: 423 }
    )
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: { department: true },
  })

  if (!user) {
    await recordLoginFailure(email)
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    )
  }

  if (user.status !== 'ACTIVE') {
    auditLog({
      userId: user.id,
      action: 'LOGIN',
      resource: 'auth',
      ipAddress: ip,
      userAgent,
      result: 'FAILURE',
      details: { reason: 'Account not active' },
    })
    return NextResponse.json(
      { error: 'Account is disabled or pending activation' },
      { status: 403 }
    )
  }

  // Verify password
  const passwordValid = await verifyPassword(password, user.passwordHash)
  if (!passwordValid) {
    await recordLoginFailure(email)
    auditLog({
      userId: user.id,
      action: 'LOGIN',
      resource: 'auth',
      ipAddress: ip,
      userAgent,
      result: 'FAILURE',
      details: { reason: 'Invalid password' },
    })
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    )
  }

  // Success: clear failures, generate tokens
  await clearLoginFailures(email)

  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
  })
  const refreshToken = await signRefreshToken(user.id)
  const tokenHash = createHash('sha256').update(refreshToken).digest('hex')

  // Store refresh token in DB
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  // Update lastLoginAt
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  // Audit log
  auditLog({
    userId: user.id,
    action: 'LOGIN',
    resource: 'auth',
    ipAddress: ip,
    userAgent,
    result: 'SUCCESS',
  })

  // Set cookies and return
  const response = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      avatar: user.avatar,
    },
  })

  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: 'lax',
    maxAge: 10800, // 180 minutes
    path: '/',
  })

  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: 'lax',
    maxAge: 604800, // 7 days
    path: '/api/v1/auth',
  })

  return response
}
