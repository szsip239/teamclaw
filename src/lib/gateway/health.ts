import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { decrypt } from '@/lib/auth/encryption'
import { registry, ensureRegistryInitialized } from './registry'

const CHECK_INTERVAL_MS = 60_000
const RECOVERY_INTERVAL_MS = 120_000 // Try to recover ERROR/OFFLINE every 2 min
const HEALTH_TIMEOUT_MS = 10_000
const MAX_CONCURRENT = 5
const FAILURE_THRESHOLD = 3

const globalForHealth = globalThis as unknown as {
  healthIntervalTimer?: ReturnType<typeof setInterval> | null
  healthRecoveryTimer?: ReturnType<typeof setInterval> | null
  healthRunning?: boolean
  healthEnsured?: boolean
}

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
          version: (health.version as string) || registry.getServerVersion(instanceId) || undefined,
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

/**
 * Attempt to reconnect ERROR/OFFLINE instances.
 * These instances are not checked by `checkAll` because they have no active
 * WebSocket connection. This function tries to re-establish the connection
 * and, if successful, runs a health check to bring the instance back ONLINE.
 */
async function recoverInstances(): Promise<void> {
  const instances = await prisma.instance.findMany({
    where: { status: { in: ['ERROR', 'OFFLINE'] } },
    select: { id: true, name: true, gatewayUrl: true, gatewayToken: true },
  })

  if (instances.length === 0) return

  for (let i = 0; i < instances.length; i += MAX_CONCURRENT) {
    const batch = instances.slice(i, i + MAX_CONCURRENT)
    await Promise.allSettled(
      batch.map(async (inst) => {
        try {
          // If already connected (e.g. registry init succeeded but DB status
          // wasn't updated yet), just run the health check directly.
          if (!registry.isConnected(inst.id)) {
            // Disconnect stale connection if any
            if (registry.getStatus(inst.id)) {
              await registry.disconnect(inst.id)
            }
            await registry.connect(inst.id, inst.gatewayUrl, decrypt(inst.gatewayToken))
          }
          // Connection succeeded — run health check to update status to ONLINE
          await checkInstance(inst.id)
          console.log(`[health] Recovered instance ${inst.name} (${inst.id})`)
        } catch {
          // Still unreachable — leave in current state, will retry next cycle
        }
      }),
    )
  }
}

async function checkAll(): Promise<void> {
  const instances = await prisma.instance.findMany({
    where: { status: { in: ['ONLINE', 'DEGRADED'] } },
    select: { id: true },
  })

  if (instances.length === 0) {
    stopHealthChecks()
    stopRecoveryChecks()
    globalForHealth.healthRunning = false
    return
  }

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < instances.length; i += MAX_CONCURRENT) {
    const batch = instances.slice(i, i + MAX_CONCURRENT)
    await Promise.allSettled(batch.map((inst) => checkInstance(inst.id)))
  }
}

function startHealthChecks(): void {
  if (globalForHealth.healthIntervalTimer) return
  globalForHealth.healthIntervalTimer = setInterval(() => {
    checkAll().catch(console.error)
  }, CHECK_INTERVAL_MS)
}

function startRecoveryChecks(): void {
  if (globalForHealth.healthRecoveryTimer) return
  globalForHealth.healthRecoveryTimer = setInterval(() => {
    recoverInstances().catch(console.error)
  }, RECOVERY_INTERVAL_MS)
}

function stopHealthChecks(): void {
  if (globalForHealth.healthIntervalTimer) {
    clearInterval(globalForHealth.healthIntervalTimer)
    globalForHealth.healthIntervalTimer = null
  }
}

function stopRecoveryChecks(): void {
  if (globalForHealth.healthRecoveryTimer) {
    clearInterval(globalForHealth.healthRecoveryTimer)
    globalForHealth.healthRecoveryTimer = null
  }
}

export async function ensureHealthChecks(): Promise<void> {
  if (globalForHealth.healthEnsured) return
  globalForHealth.healthEnsured = true

  await ensureRegistryInitialized()

  // Run initial checks: first regular health, then recover ERROR/OFFLINE
  await checkAll().catch(console.error)
  await recoverInstances().catch(console.error)

  // Start periodic checks
  if (!globalForHealth.healthRunning) {
    globalForHealth.healthRunning = true
    startHealthChecks()
    startRecoveryChecks()
  }
}
