import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { redis: Redis }

export const redis =
  globalForRedis.redis ||
  (globalForRedis.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379'))

const LOGIN_LOCKOUT_MAX_FAILURES = 5
const LOGIN_LOCKOUT_WINDOW_SEC = 5 * 60 // 5 minutes

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000)
  const windowKey = `${key}:${Math.floor(now / windowSec)}`

  const multi = redis.multi()
  multi.incr(windowKey)
  multi.expire(windowKey, windowSec)
  const results = await multi.exec()

  const count = (results?.[0]?.[1] as number) || 0
  const remaining = Math.max(0, limit - count)
  const resetAt = (Math.floor(now / windowSec) + 1) * windowSec

  return {
    allowed: count <= limit,
    remaining,
    resetAt,
  }
}

export async function checkLoginLockout(
  email: string
): Promise<{ locked: boolean; attemptsLeft: number }> {
  const key = `login_failures:${email}`
  const failures = await redis.get(key)
  const count = failures ? parseInt(failures, 10) : 0

  return {
    locked: count >= LOGIN_LOCKOUT_MAX_FAILURES,
    attemptsLeft: Math.max(0, LOGIN_LOCKOUT_MAX_FAILURES - count),
  }
}

export async function recordLoginFailure(email: string): Promise<void> {
  const key = `login_failures:${email}`
  const multi = redis.multi()
  multi.incr(key)
  multi.expire(key, LOGIN_LOCKOUT_WINDOW_SEC)
  await multi.exec()
}

export async function clearLoginFailures(email: string): Promise<void> {
  const key = `login_failures:${email}`
  await redis.del(key)
}
