import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { hasPermission } from '@/lib/auth/permissions'
import type { AuthUser } from '@/types/auth'

export type RouteParams = Record<string, string | string[]>

export type AuthContext = {
  user: AuthUser
  params?: RouteParams
}

/** Safely extract a single string param (for [id] routes, not [...slug]) */
export function param(ctx: AuthContext, key: string): string {
  const val = ctx.params?.[key]
  return (Array.isArray(val) ? val[0] : val) ?? ''
}

/** Extract catch-all path segments as string[] */
export function paramArray(ctx: AuthContext, key: string): string[] {
  const val = ctx.params?.[key]
  if (Array.isArray(val)) return val
  return val ? val.split('/') : []
}

export type AuthHandler = (
  req: NextRequest,
  ctx: AuthContext,
) => Promise<NextResponse>

/**
 * Extract user ID from request headers or JWT token.
 * Used by both `withAuth` wrapper and standalone SSE routes that need
 * inline auth before constructing a streaming response.
 */
export async function resolveRequestUserId(req: NextRequest): Promise<string | null> {
  const headerUserId = req.headers.get('x-user-id')
  if (headerUserId) return headerUserId

  const authHeader = req.headers.get('authorization')
  const cookieToken = req.cookies.get('access_token')?.value
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken
  if (!token) return null

  const payload = await verifyAccessToken(token)
  return payload?.userId ?? null
}

/**
 * Wraps a route handler with authentication.
 * Reads user from middleware-injected headers, falling back to JWT verification.
 * Returns a standard Next.js route handler function.
 */
export function withAuth(handler: AuthHandler) {
  return async (
    req: NextRequest,
    segmentData?: { params?: Promise<RouteParams> },
  ) => {
    const userId = await resolveRequestUserId(req)

    if (!userId) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    })

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: '用户不存在或已禁用' }, { status: 401 })
    }

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role, // Always use DB role, never trust header
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      avatar: user.avatar,
    }

    const params = segmentData?.params ? await segmentData.params : undefined

    return handler(req, { user: authUser, params })
  }
}

/**
 * Wraps a handler with Zod request body validation.
 */
export function withValidation<T extends z.ZodType>(
  schema: T,
  handler: (
    req: NextRequest,
    ctx: { user?: AuthUser; params?: RouteParams; body: z.infer<T> },
  ) => Promise<NextResponse>,
) {
  return async (
    req: NextRequest,
    ctx?: { user?: AuthUser; params?: RouteParams },
  ) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
    }

    const result = schema.safeParse(body)
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

    return handler(req, { ...ctx, body: result.data })
  }
}

/**
 * Wraps an AuthHandler with RBAC permission checking.
 */
export function withPermission(permission: string, handler: AuthHandler): AuthHandler {
  return async (req: NextRequest, ctx: AuthContext) => {
    if (!hasPermission(ctx.user.role, permission)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }
    return handler(req, ctx)
  }
}
