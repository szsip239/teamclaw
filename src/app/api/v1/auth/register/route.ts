import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt'
import { hashPassword } from '@/lib/auth/password'
import { registerSchema } from '@/lib/validations/auth'
import { checkRateLimit } from '@/lib/redis'
import { auditLog } from '@/lib/audit'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

function isSecure(): boolean {
  return process.env.NODE_ENV === 'production'
}

export async function POST(req: NextRequest) {
  // Guard: registration can be disabled via env (enterprise deployments)
  if (process.env.REGISTRATION_DISABLED === 'true') {
    return NextResponse.json(
      { error: '注册功能已关闭，请联系管理员创建账号' },
      { status: 403 },
    )
  }

  const ip = getClientIp(req)
  const userAgent = req.headers.get('user-agent') || undefined

  // Rate limit: 5 per minute per IP
  const rateResult = await checkRateLimit(`rate:${ip}:register`, 5, 60)
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

  const parsed = registerSchema.safeParse(body)
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

  const { email, password, name } = parsed.data

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'Email already registered' },
      { status: 409 }
    )
  }

  // Create user
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: 'USER',
    },
  })

  // Generate tokens
  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
  })
  const refreshToken = await signRefreshToken(user.id)
  const tokenHash = createHash('sha256').update(refreshToken).digest('hex')

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  // Audit log
  auditLog({
    userId: user.id,
    action: 'REGISTER',
    resource: 'auth',
    resourceId: user.id,
    ipAddress: ip,
    userAgent,
    result: 'SUCCESS',
  })

  // Set cookies and return
  const response = NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        departmentName: null,
        avatar: user.avatar,
      },
    },
    { status: 201 }
  )

  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    maxAge: 900,
    path: '/',
  })

  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    maxAge: 604800,
    path: '/api/v1/auth',
  })

  return response
}
