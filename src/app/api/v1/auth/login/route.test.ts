import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  checkLoginLockout: vi.fn(),
  checkRateLimit: vi.fn(),
  clearLoginFailures: vi.fn(),
  prisma: {
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  recordLoginFailure: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyPassword: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  auditLog: mocks.auditLog,
}))

vi.mock('@/lib/auth/jwt', () => ({
  signAccessToken: mocks.signAccessToken,
  signRefreshToken: mocks.signRefreshToken,
}))

vi.mock('@/lib/auth/password', () => ({
  verifyPassword: mocks.verifyPassword,
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/redis', () => ({
  checkLoginLockout: mocks.checkLoginLockout,
  checkRateLimit: mocks.checkRateLimit,
  clearLoginFailures: mocks.clearLoginFailures,
  recordLoginFailure: mocks.recordLoginFailure,
}))

import { POST } from './route'

function createLoginRequest() {
  return new NextRequest('http://localhost/api/v1/auth/login', {
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'secret1',
    }),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
    },
    method: 'POST',
  })
}

describe('login route refresh token storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.checkRateLimit.mockResolvedValue({ allowed: true })
    mocks.checkLoginLockout.mockResolvedValue({ locked: false })
    mocks.clearLoginFailures.mockResolvedValue(undefined)
    mocks.prisma.user.findUnique.mockResolvedValue({
      avatar: null,
      department: null,
      departmentId: null,
      email: 'user@example.com',
      id: 'user-1',
      name: 'Test User',
      passwordHash: 'hashed-password',
      role: 'USER',
      status: 'ACTIVE',
    })
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.signAccessToken.mockResolvedValue('access-token')
    mocks.signRefreshToken.mockResolvedValue('refresh-token')
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })
    mocks.prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-token-1' })
    mocks.prisma.user.update.mockResolvedValue({})
  })

  it('deletes existing refresh tokens before creating the login token', async () => {
    const response = await POST(createLoginRequest())

    expect(response.status).toBe(200)
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
    expect(mocks.prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        expiresAt: expect.any(Date),
        tokenHash: createHash('sha256').update('refresh-token').digest('hex'),
        userId: 'user-1',
      },
    })
    expect(
      mocks.prisma.refreshToken.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.prisma.refreshToken.create.mock.invocationCallOrder[0],
    )
  })

  it('retries once when the refresh token hash hits a unique constraint', async () => {
    const uniqueConstraintError = Object.assign(
      new Error('Unique constraint failed'),
      { code: 'P2002' },
    )
    mocks.prisma.refreshToken.create
      .mockRejectedValueOnce(uniqueConstraintError)
      .mockResolvedValueOnce({ id: 'refresh-token-2' })

    const response = await POST(createLoginRequest())

    expect(response.status).toBe(200)
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledTimes(2)
    expect(mocks.prisma.refreshToken.create).toHaveBeenCalledTimes(2)
  })
})
