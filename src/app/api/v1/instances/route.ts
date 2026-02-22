import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
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
import { auditLog } from '@/lib/audit'
import type { InstanceStatus, Prisma } from '@/generated/prisma'

const GATEWAY_PORT = 18789          // Container-internal gateway port (fixed)
const BASE_HOST_PORT = 18800        // Host port range starts here (avoids conflict with local OpenClaw on 18789)

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

/** Find the next available host port for gateway binding. */
async function findNextAvailablePort(): Promise<number> {
  const instances = await prisma.instance.findMany({
    where: { containerId: { not: null } },
    select: { gatewayUrl: true },
  })

  let maxPort = BASE_HOST_PORT - 1
  for (const inst of instances) {
    try {
      const url = new URL(inst.gatewayUrl.replace(/^ws/, 'http'))
      const port = parseInt(url.port, 10)
      if (port > maxPort) maxPort = port
    } catch {
      // skip invalid URLs
    }
  }

  return maxPort + 1
}

/** Resolve model provider from request body or environment defaults. */
function resolveModelProvider(
  input?: { name: string; apiKey: string; api?: string; baseUrl?: string },
): ModelProviderConfig | undefined {
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

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
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
      const { name, description } = body
      const mode = body.mode || 'docker'

      // Eagerly initialize registry so it doesn't block the connection test later
      ensureRegistryInitialized().catch(console.error)

      // Check name uniqueness
      const existing = await prisma.instance.findUnique({ where: { name } })
      if (existing) {
        return NextResponse.json({ error: '实例名称已存在' }, { status: 409 })
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
    })
    dataDir = result.dataDir
  } catch (err) {
    return NextResponse.json(
      { error: `初始化实例文件失败: ${(err as Error).message}` },
      { status: 500 },
    )
  }

  // 4. Determine Docker image
  const imageName =
    body.docker?.imageName ||
    process.env.DEFAULT_OPENCLAW_IMAGE ||
    'alpine/openclaw:latest'

  // 5. Pull image if not present
  const exists = await dockerManager.imageExists(imageName)
  if (!exists) {
    try {
      await dockerManager.pullImage(imageName)
    } catch (err) {
      await cleanupInstanceFiles(name).catch(() => {})
      return NextResponse.json(
        { error: `拉取镜像失败: ${(err as Error).message}` },
        { status: 500 },
      )
    }
  }

  // 6. Find next available host port
  const hostPort = await findNextAvailablePort()

  // 7. Create container
  const containerName = `teamclaw-${name}`
  let containerId: string
  try {
    containerId = await dockerManager.createContainer({
      name: containerName,
      imageName,
      volumes: {
        [dataDir]: '/home/node/.openclaw',
        [path.join(dataDir, 'workspace')]: '/workspace',
      },
      portBindings: {
        [`${GATEWAY_PORT}`]: String(hostPort),
      },
      env: {
        OPENCLAW_GATEWAY_TOKEN: gatewayToken,
        ...body.docker?.env,
      },
      restartPolicy: body.docker?.restartPolicy || 'unless-stopped',
      memoryLimit: body.docker?.memoryLimit,
    })
  } catch (err) {
    await cleanupInstanceFiles(name).catch(() => {})
    return NextResponse.json(
      { error: `创建容器失败: ${(err as Error).message}` },
      { status: 500 },
    )
  }

  // 8. Start container
  try {
    await dockerManager.startContainer(containerId)
  } catch (err) {
    // Keep container for debugging — create DB record with ERROR status
    const gatewayUrl = `ws://127.0.0.1:${hostPort}`
    const instance = await prisma.instance.create({
      data: {
        name,
        description,
        gatewayUrl,
        gatewayToken: encrypt(gatewayToken),
        containerId,
        containerName,
        imageName,
        dockerConfig: (body.docker || {}) as Prisma.InputJsonValue,
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
      details: { name, error: `启动容器失败: ${(err as Error).message}` },
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      result: 'FAILURE',
    })

    return NextResponse.json(
      { instance, warning: `容器已创建但启动失败: ${(err as Error).message}` },
      { status: 201 },
    )
  }

  // 9. Compute gateway URL and create DB record (initially OFFLINE)
  const gatewayUrl = `ws://127.0.0.1:${hostPort}`

  const instance = await prisma.instance.create({
    data: {
      name,
      description,
      gatewayUrl,
      gatewayToken: encrypt(gatewayToken),
      containerId,
      containerName,
      imageName,
      dockerConfig: (body.docker || {}) as Prisma.InputJsonValue,
      status: 'OFFLINE',
      createdById: user.id,
    },
    select: instanceSelectFields,
  })

  // 10. Wait for gateway to initialize, then connect with the real instance ID
  await new Promise((r) => setTimeout(r, 3000))

  try {
    await registry.connect(instance.id, gatewayUrl, gatewayToken)
    await prisma.instance.update({
      where: { id: instance.id },
      data: { status: 'ONLINE' },
    })
  } catch (err) {
    // Container is running but gateway connection failed — stays OFFLINE
    // The start endpoint or health service can recover later
    console.error(`[instance:create] Gateway connect failed for ${name}:`, (err as Error).message)
  }

  // Re-fetch to get the latest status after potential ONLINE update
  const updated = await prisma.instance.findUnique({
    where: { id: instance.id },
    select: instanceSelectFields,
  })

  auditLog({
    userId: user.id,
    action: 'INSTANCE_CREATE',
    resource: 'instance',
    resourceId: instance.id,
    details: { name, mode: 'docker', imageName, gatewayUrl, status: updated?.status ?? 'OFFLINE' },
    ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    userAgent: req.headers.get('user-agent') || undefined,
    result: 'SUCCESS',
  })

  return NextResponse.json({ instance: updated ?? instance }, { status: 201 })
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
      { error: '外部模式下 Gateway URL 和 Token 为必填' },
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
      imageName: body.docker?.imageName || 'alpine/openclaw:latest',
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
    console.error(`[instance:create] External gateway connect failed for ${name}:`, (err as Error).message)
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
