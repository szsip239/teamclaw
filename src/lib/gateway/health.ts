import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { registry, ensureRegistryInitialized } from './registry'

const CHECK_INTERVAL_MS = 60_000
const HEALTH_TIMEOUT_MS = 10_000
const MAX_CONCURRENT = 5
const FAILURE_THRESHOLD = 3

let intervalTimer: ReturnType<typeof setInterval> | null = null
let running = false

async function checkInstance(instanceId: string): Promise<void> {
  const failureKey = `health_failures:${instanceId}`

  try {
    if (!registry.isConnected(instanceId)) {
      throw new Error('Not connected')
    }

    // Race the health check against timeout
    const health = await Promise.race([
      registry.checkHealth(instanceId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timed out')), HEALTH_TIMEOUT_MS),
      ),
    ]) as Record<string, unknown>

    // Success: update DB + reset failure counter
    await Promise.all([
      prisma.instance.update({
        where: { id: instanceId },
        data: {
          status: 'ONLINE',
          lastHealthCheck: new Date(),
          healthData: health as Prisma.InputJsonValue,
          version: (health.version as string) || undefined,
        },
      }),
      redis.del(failureKey),
    ])
  } catch {
    // Failure: increment counter
    const failures = await redis.incr(failureKey)
    await redis.expire(failureKey, 600) // 10 min TTL

    const newStatus = failures >= FAILURE_THRESHOLD ? 'OFFLINE' : 'DEGRADED'

    await prisma.instance.update({
      where: { id: instanceId },
      data: {
        status: newStatus,
        lastHealthCheck: new Date(),
      },
    })
  }
}

async function checkAll(): Promise<void> {
  const instances = await prisma.instance.findMany({
    where: { status: { in: ['ONLINE', 'DEGRADED'] } },
    select: { id: true },
  })

  if (instances.length === 0) {
    stopHealthChecks()
    return
  }

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < instances.length; i += MAX_CONCURRENT) {
    const batch = instances.slice(i, i + MAX_CONCURRENT)
    await Promise.allSettled(batch.map((inst) => checkInstance(inst.id)))
  }
}

function startHealthChecks(): void {
  if (intervalTimer) return
  intervalTimer = setInterval(() => {
    checkAll().catch(console.error)
  }, CHECK_INTERVAL_MS)
}

function stopHealthChecks(): void {
  if (intervalTimer) {
    clearInterval(intervalTimer)
    intervalTimer = null
  }
}

let ensured = false

export async function ensureHealthChecks(): Promise<void> {
  if (ensured) return
  ensured = true

  await ensureRegistryInitialized()

  // Run an initial check
  await checkAll().catch(console.error)

  // Start periodic checks
  if (!running) {
    running = true
    startHealthChecks()
  }
}
