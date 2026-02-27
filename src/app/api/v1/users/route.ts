import { NextResponse } from 'next/server'
import bcryptjs from 'bcryptjs'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { createUserSchema } from '@/lib/validations/user'
import { auditLog } from '@/lib/audit'

const userSelectFields = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  departmentId: true,
  department: { select: { name: true } },
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const

// GET /api/v1/users — Paginated list with search
export const GET = withAuth(
  withPermission('users:list', async (req, { user }) => {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')))
    const search = url.searchParams.get('search') || ''
    const statusFilter = url.searchParams.get('status') || ''
    const departmentId = url.searchParams.get('departmentId') || ''

    const where: Record<string, unknown> = {}

    // DEPT_ADMIN can only see users in their own department
    if (user.role === 'DEPT_ADMIN') {
      where.departmentId = user.departmentId
    }

    if (statusFilter) {
      where.status = statusFilter
    }

    if (departmentId && user.role !== 'DEPT_ADMIN') {
      where.departmentId = departmentId
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: userSelectFields,
      }),
      prisma.user.count({ where }),
    ])

    const mapped = users.map((u) => ({
      ...u,
      departmentName: u.department?.name ?? null,
      department: undefined,
    }))

    return NextResponse.json({ users: mapped, total, page, pageSize })
  }),
)

// POST /api/v1/users — Create user
export const POST = withAuth(
  withPermission(
    'users:create',
    withValidation(createUserSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }

      // Check email uniqueness
      const existing = await prisma.user.findUnique({
        where: { email: body.email },
      })
      if (existing) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
      }

      // Validate departmentId if provided
      if (body.departmentId) {
        const dept = await prisma.department.findUnique({
          where: { id: body.departmentId },
        })
        if (!dept) {
          return NextResponse.json({ error: 'Department not found' }, { status: 400 })
        }
      }

      const passwordHash = await bcryptjs.hash(body.password, 12)

      const created = await prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash,
          role: body.role,
          departmentId: body.departmentId || null,
        },
        select: userSelectFields,
      })

      const mapped = {
        ...created,
        departmentName: created.department?.name ?? null,
        department: undefined,
      }

      auditLog({
        userId: user.id,
        action: 'USER_CREATE',
        resource: 'user',
        resourceId: created.id,
        details: { email: body.email, name: body.name, role: body.role },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: 'SUCCESS',
      })

      return NextResponse.json({ user: mapped }, { status: 201 })
    }),
  ),
)
