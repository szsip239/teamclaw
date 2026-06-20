import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { createInstanceSchema } from '@/lib/validations/instance'
import { encrypt } from '@/lib/auth/encryption'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import {
  generateGatewayToken,
  initializeInstanceFiles,
  cleanupInstanceFiles,
} from '@/lib/docker/config-generator'
import type { ModelProviderConfig } from '@/lib/docker/config-generator'
import { buildProviderEntries, resolveOpenClawProviderId } from '@/lib/config-editor/provider-sync'
import {
  buildOpenClawGatewayCommandWithPiWrapper,
  buildPiWrapperBind,
  derivePiHostPort,
  PI_WRAPPER_CONTAINER_PORT,
} from '@/lib/docker/pi-wrapper'
import { auditLog } from '@/lib/audit'
import type { InstanceStatus, Prisma } from '@/generated/prisma'
import type { ResourceConfig } from '@/types/resource'

const GATEWAY_PORT = 18789 // Container-internal gateway port (fixed)
const BASE_HOST_PORT = 18800 // Host port range starts here (avoids conflict with local OpenClaw on 18789)
const FALLBACK_OPENCLAW_IMAGE = 'alpine/openclaw:2026.6.6-browser'

// Simple mutex to prevent port race conditions during concurrent instance creation
let portLock: Promise<void> = Promise.resolve()

const instanceSelectFields = {
  id: true,
  name: true,
  description: true,
  gatewayUrl: true,
  containerId: true,
  containerName: true,
  imageName: true,
  dockerConfig: true,
  status: true,
  lastHealthCheck: true,
  healthData: true,
  version: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const

// ─── Helpers ─────────────────────────────────────────────────────────

/** Find the next available host port for gateway binding (serialized to prevent races). */
async function findNextAvailablePort(): Promise<number> {
  // Serialize access: wait for any in-flight port allocation, then hold the lock
  // until our DB record is created (caller must resolve the lock).
  let release!: () => void
  const prev = portLock
  portLock = new Promise<void>((r) => {
    release = r
  })
  await prev

  try {
    const instances = await prisma.instance.findMany({
      where: { containerId: { not: null } },
      select: { gatewayUrl: true, dockerConfig: true },
    })

    let maxPort = BASE_HOST_PORT - 1
    for (const inst of instances) {
      // Check dockerConfig.hostPort (Docker-mode instances store host port here)
      const cfg = inst.dockerConfig as Record<string, unknown> | null
      if (cfg && typeof cfg.hostPort === 'number' && cfg.hostPort > maxPort) {
        maxPort = cfg.hostPort
      }
      // Also check gatewayUrl for backward compatibility (host-mode instances)
      try {
        const url = new URL(inst.gatewayUrl.replace(/^ws/, 'http'))
        const port = parseInt(url.port, 10)
        if (port > maxPort) maxPort = port
      } catch {
        // skip invalid URLs
      }
    }

    return maxPort + 1
  } finally {
    release()
  }
}

/** Build the gateway WebSocket URL based on deployment environment. */
function buildGatewayUrl(containerName: string, hostPort: number): string {
  if (process.env.DOCKER_NETWORK) {
    // Running inside Docker — use container DNS name + internal port
    return `ws://${containerName}:${GATEWAY_PORT}`
  }
  // Running on host — use host port mapping
  return `ws://127.0.0.1:${hostPort}`
}

/**
 * Poll for gateway readiness in the background, then update DB status.
 * Retries every 3s for up to 300s. Provider config is pre-seeded in
 * openclaw.json so no config.patch restart is needed after connect.
 */
async function connectToGateway(
  instanceId: string,
  gatewayUrl: string,
  gatewayToken: string,
  instanceName: string,
): Promise<void> {
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    try {
      await registry.connect(instanceId, gatewayUrl, gatewayToken)
      await prisma.instance.update({
        where: { id: instanceId },
        data: { status: 'ONLINE' },
      })
      console.log(`[instance:create] Gateway connected: ${instanceName}`)
      return
    } catch (err) {
      if (Date.now() + 3000 >= deadline) {
        console.error(
          `[instance:create] Gateway connect timed out for ${instanceName}:`,
          (err as Error).message,
        )
        await prisma.instance
          .update({
            where: { id: instanceId },
            data: { status: 'OFFLINE' },
          })
          .catch(() => {})
        return
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

/** Resolve model provider from request body or environment defaults. */
function resolveModelProvider(input?: {
  name: string
  apiKey: string
  api?: string
  baseUrl?: string
}): ModelProviderConfig | undefined {
  if (input) {
    return input
  }

  // Fall back to system defaults
  const name = process.env.DEFAULT_MODEL_PROVIDER
  const apiKey = process.env.DEFAULT_MODEL_API_KEY
  if (name && apiKey) {
    return {
      name,
      apiKey,
      api: process.env.DEFAULT_MODEL_API_TYPE || undefined,
      baseUrl: process.env.DEFAULT_MODEL_BASE_URL || undefined,
    }
  }

  return undefined
}

// ─── GET /api/v1/instances — List instances ──────────────────────────

export const GET = withAuth(
  withPermission('instances:view', async (req, { user }) => {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')))
    const statusFilter = url.searchParams.get('status') as InstanceStatus | null
    const search = url.searchParams.get('search') || ''

    // Non-SYSTEM_ADMIN: restrict to instances accessible via InstanceAccess
    let accessibleFilter: { id?: { in: string[] } } = {}
    if (user.role !== 'SYSTEM_ADMIN') {
      if (!user.departmentId) {
        return NextResponse.json({ instances: [], total: 0, page, pageSize })
      }
      const accessGrants = await prisma.instanceAccess.findMany({
        where: { departmentId: user.departmentId },
        select: { instanceId: true },
      })
      accessibleFilter = { id: { in: accessGrants.map((a) => a.instanceId) } }
    }

    const where = {
      ...accessibleFilter,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    }

    const [instances, total] = await Promise.all([
      prisma.instance.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: instanceSelectFields,
      }),
      prisma.instance.count({ where }),
    ])

    return NextResponse.json({ instances, total, page, pageSize })
  }),
)

// ─── POST /api/v1/instances — Create instance ───────────────────────

export const POST = withAuth(
  withPermission(
    'instances:manage',
    withValidation(createInstanceSchema, async (req, ctx) => {
      const { user, body } = ctx as { user: NonNullable<typeof ctx.user>; body: typeof ctx.body }
      const { name } = body
      const mode = body.mode || 'docker'

      // Eagerly initialize registry so it doesn't block the connection test later
      ensureRegistryInitialized().catch(console.error)

      // Check name uniqueness
      const existing = await prisma.instance.findUnique({ where: { name } })
      if (existing) {
        return NextResponse.json({ error: 'Instance name already exists' }, { status: 409 })
      }

      if (mode === 'docker') {
        return await createDockerInstance(req, user, body)
      } else {
        return await createExternalInstance(req, user, body)
      }
    }),
  ),
)

// ─── Docker Mode ─────────────────────────────────────────────────────

async function createDockerInstance(
  req: NextRequest,
  user: { id: string; name: string },
  body: {
    name: string
    description?: string
    docker?: {
      imageName?: string
      pullLatest?: boolean
      env?: Record<string, string>
      restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure'
      memoryLimit?: number
    }
    modelProvider?: { name: string; apiKey: string; api?: string; baseUrl?: string }
    defaultAgentId?: string
  },
) {
  const { name, description } = body

  // 1. Generate gateway token
  const gatewayToken = generateGatewayToken()

  // 2. Resolve model provider
  const modelProvider = resolveModelProvider(body.modelProvider)

  // 2b. Pre-build provider entries from default Resources in DB.
  // Writing them into the initial openclaw.json avoids a config.patch after
  // startup, which would otherwise trigger a gateway restart.
  let providerEntries: Record<string, Record<string, unknown>> | undefined
  let defaultModelRef: string | undefined
  if (!modelProvider) {
    try {
      const defaults = await prisma.resource.findMany({
        where: { type: 'MODEL', isDefault: true, status: { not: 'ERROR' } },
        select: { provider: true, isDefaultModel: true, config: true },
      })
      if (defaults.length > 0) {
        const providerIds = [...new Set(defaults.map((r) => r.provider))]
        const entries = await buildProviderEntries(providerIds)
        if (Object.keys(entries).length > 0) {
          providerEntries = entries as unknown as Record<string, Record<string, unknown>>
          const primarySeed = defaults.find((r) => {
            if (!r.isDefaultModel) return false
            const cfg = r.config as { defaultModelId?: string } | null
            return !!cfg?.defaultModelId
          })
          if (primarySeed) {
            const cfg = primarySeed.config as { defaultModelId?: string }
            const providerRef = resolveOpenClawProviderId(
              primarySeed.provider,
              primarySeed.config as ResourceConfig | null,
            )
            defaultModelRef = `${providerRef}/${cfg.defaultModelId}`
          }
        }
      }
    } catch (err) {
      // Non-fatal: instance will be seeded via initInstanceWithDefaultResources later
      console.warn(
        '[instance:create] Failed to pre-build provider entries:',
        (err as Error).message,
      )
    }
  }

  // 3. Initialize host files (openclaw.json + directory structure)
  let dataDir: string
  try {
    const result = await initializeInstanceFiles({
      instanceName: name,
      gatewayToken,
      gatewayPort: GATEWAY_PORT,
      modelProvider,
      defaultAgentId: body.defaultAgentId || 'main',
      env: body.docker?.env,
      hostDataDir: 'resolve', // resolved to dataDir inside initializeInstanceFiles
      providerEntries,
      defaultModelRef,
    })
    dataDir = result.dataDir
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to initialize instance files:${(err as Error).message}` },
      { status: 500 },
    )
  }

  // 4. Determine Docker image
  const imageName =
    body.docker?.imageName || process.env.DEFAULT_OPENCLAW_IMAGE || FALLBACK_OPENCLAW_IMAGE

  // 5. Pull image if not present, or if user requested latest
  const exists = await dockerManager.imageExists(imageName)
  const pullLatest = body.docker?.pullLatest ?? false
  if (!exists) {
    try {
      await dockerManager.pullImage(imageName)
    } catch (err) {
      await cleanupInstanceFiles(name).catch(() => {})
      return NextResponse.json(
        { error: `Failed to pull image: ${(err as Error).message}` },
        { status: 500 },
      )
    }
  } else if (pullLatest) {
    try {
      await dockerManager.pullImage(imageName)
    } catch {
      // pull failed but local image exists — continue with cached version
    }
  }

  // 6. Find next available host port
  const hostPort = await findNextAvailablePort()
  const hostPiPort = derivePiHostPort(hostPort)

  // 6b. Patch allowedOrigins with hostPort so the browser Control UI can connect
  try {
    const configPath = path.join(dataDir, 'openclaw.json')
    const configRaw = await fs.readFile(configPath, 'utf-8')
    const configObj = JSON.parse(configRaw)
    const origins: string[] = configObj.gateway?.controlUi?.allowedOrigins || []
    origins.push(`http://127.0.0.1:${hostPort}`, `http://localhost:${hostPort}`)
    configObj.gateway.controlUi.allowedOrigins = origins
    await fs.writeFile(configPath, JSON.stringify(configObj, null, 2), 'utf-8')
  } catch {
    // non-fatal — Control UI may prompt origin error but gateway still works
  }

  // 7. Create container
  const containerName = `teamclaw-${name}`
  let containerId: string
  try {
    const workspaceHostPath = path.join(dataDir, 'workspace')
    containerId = await dockerManager.createContainer({
      name: containerName,
      imageName,
      volumes: {
        [dataDir]: '/home/node/.openclaw',
        [workspaceHostPath]: '/workspace',
      },
      // Extra binds for sandbox support (Docker-in-Docker):
      // 1. Mount workspace at its host path so OpenClaw sandbox can bind-mount
      //    workspace into sandbox containers using host-resolvable paths.
      // 2. Mount Docker socket for sandbox container management.
      extraBinds: [
        `${workspaceHostPath}:${workspaceHostPath}`,
        '/var/run/docker.sock:/var/run/docker.sock',
        buildPiWrapperBind(),
      ],
      portBindings: {
        [`${GATEWAY_PORT}`]: String(hostPort),
        [`${PI_WRAPPER_CONTAINER_PORT}`]: {
          hostIp: '127.0.0.1',
          hostPort: String(hostPiPort),
        },
      },
      command: buildOpenClawGatewayCommandWithPiWrapper(),
      env: {
        // Docker bridge networks don't reliably forward mDNS multicast
        // (224.0.0.251:5353), causing the bonjour plugin's CIAO probe to
        // hang and throw an unhandled rejection that kills the gateway.
        // OpenClaw's official compose preset disables it for the same reason.
        OPENCLAW_DISABLE_BONJOUR: '1',
        ...body.docker?.env,
        OPENCLAW_GATEWAY_TOKEN: gatewayToken,
      },
      restartPolicy: body.docker?.restartPolicy || 'unless-stopped',
      memoryLimit: body.docker?.memoryLimit,
    })
  } catch (err) {
    await cleanupInstanceFiles(name).catch(() => {})
    return NextResponse.json(
      { error: `Failed to create container:${(err as Error).message}` },
      { status: 500 },
    )
  }

  // 8. Start container
  try {
    await dockerManager.startContainer(containerId)
  } catch (err) {
    // Keep container for debugging — create DB record with ERROR status
    const gatewayUrl = buildGatewayUrl(containerName, hostPort)
    const instance = await prisma.instance.create({
      data: {
        name,
        description,
        gatewayUrl,
        gatewayToken: encrypt(gatewayToken),
        containerId,
        containerName,
        imageName,
        dockerConfig: { ...body.docker, hostPort, hostPiPort } as Prisma.InputJsonValue,
        status: 'ERROR',
        createdById: user.id,
      },
      select: instanceSelectFields,
    })

    auditLog({
      userId: user.id,
      action: 'INSTANCE_CREATE',
      resource: 'instance',
      resourceId: instance.id,
      details: { name, error: `Failed to start container:${(err as Error).message}` },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'FAILURE',
    })

    return NextResponse.json(
      { instance, warning: `Container created but failed to start:${(err as Error).message}` },
      { status: 201 },
    )
  }

  // 9. Fire-and-forget: sandbox init (Docker CLI install + group changes).
  // Non-critical — gateway works without it. We intentionally skip the
  // container restart to avoid killing the gateway mid-flight.  Sandbox
  // mode won't work until the instance is manually restarted once (needs
  // docker group permissions applied via new login session).
  ;(async () => {
    await dockerManager.initContainerEnv(containerId).catch(() => {})
    try {
      await dockerManager.initSandboxSupport(containerId)
      // restartContainer intentionally skipped — see comment above
    } catch (err) {
      console.warn(`[instance:create] Sandbox init failed for ${name}:`, (err as Error).message)
    }
  })().catch(() => {})

  // 10. Compute gateway URL and create DB record
  const gatewayUrl = buildGatewayUrl(containerName, hostPort)

  const instance = await prisma.instance.create({
    data: {
      name,
      description,
      gatewayUrl,
      gatewayToken: encrypt(gatewayToken),
      containerId,
      containerName,
      imageName,
      dockerConfig: { ...body.docker, hostPort, hostPiPort } as Prisma.InputJsonValue,
      status: 'INITIALIZING',
      createdById: user.id,
    },
    select: instanceSelectFields,
  })

  // 11. Connect to gateway in background with polling (3s interval, 300s timeout).
  const connectPromise = connectToGateway(instance.id, gatewayUrl, gatewayToken, name)

  auditLog({
    userId: user.id,
    action: 'INSTANCE_CREATE',
    resource: 'instance',
    resourceId: instance.id,
    details: { name, mode: 'docker', imageName, gatewayUrl, status: 'INITIALIZING' },
    ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    userAgent: req.headers.get('user-agent') || undefined,
    result: 'SUCCESS',
  })

  // Don't await sandbox or connect — return immediately so the UI responds.
  // Attach a noop .catch to prevent unhandled rejection warnings.
  connectPromise.catch(() => {})

  return NextResponse.json({ instance }, { status: 201 })
}

// ─── External Mode ───────────────────────────────────────────────────

async function createExternalInstance(
  req: NextRequest,
  user: { id: string; name: string },
  body: {
    name: string
    description?: string
    gatewayUrl?: string
    gatewayToken?: string
    docker?: {
      imageName?: string
    }
  },
) {
  const { name, description, gatewayUrl, gatewayToken } = body

  // External mode: gatewayUrl and gatewayToken are required (validated by refine)
  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json(
      { error: 'Gateway URL and Token are required in external mode' },
      { status: 400 },
    )
  }

  // Create DB record first (OFFLINE), then try connecting
  const instance = await prisma.instance.create({
    data: {
      name,
      description,
      gatewayUrl,
      gatewayToken: encrypt(gatewayToken),
      imageName: body.docker?.imageName || FALLBACK_OPENCLAW_IMAGE,
      status: 'OFFLINE',
      createdById: user.id,
    },
    select: instanceSelectFields,
  })

  // Try connecting with the real instance ID directly
  try {
    await registry.connect(instance.id, gatewayUrl, gatewayToken)
    await prisma.instance.update({
      where: { id: instance.id },
      data: { status: 'ONLINE' },
    })
  } catch (err) {
    console.error(
      `[instance:create] External gateway connect failed for ${name}:`,
      (err as Error).message,
    )
  }

  const updated = await prisma.instance.findUnique({
    where: { id: instance.id },
    select: instanceSelectFields,
  })

  auditLog({
    userId: user.id,
    action: 'INSTANCE_CREATE',
    resource: 'instance',
    resourceId: instance.id,
    details: { name, mode: 'external', gatewayUrl, status: updated?.status ?? 'OFFLINE' },
    ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    userAgent: req.headers.get('user-agent') || undefined,
    result: 'SUCCESS',
  })

  return NextResponse.json({ instance: updated ?? instance }, { status: 201 })
}
