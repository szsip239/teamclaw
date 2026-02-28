import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { decrypt } from '@/lib/auth/encryption'

// GET /api/v1/instances/[id]/dashboard — Return dashboard URL and token
export const GET = withAuth(
  withPermission('instances:view', async (_req, { params }) => {
    const id = params!.id as string

    const instance = await prisma.instance.findUnique({ where: { id } })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    if (!instance.gatewayToken) {
      return NextResponse.json({ error: 'No Gateway Token' }, { status: 400 })
    }

    const token = decrypt(instance.gatewayToken)

    // Resolve to a URL the user's browser can reach:
    // - Docker instances: container DNS → localhost:hostPort
    // - External instances (127.0.0.1, LAN IPs): used as-is
    let browserUrl = instance.gatewayUrl
    try {
      const parsed = new URL(browserUrl.replace(/^ws/, 'http'))
      if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
        const cfg = instance.dockerConfig as Record<string, unknown> | null
        if (cfg && typeof cfg.hostPort === 'number') {
          browserUrl = `ws://127.0.0.1:${cfg.hostPort}`
        }
      }
    } catch {
      // invalid URL, use as-is
    }

    const dashboardUrl = browserUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')

    return NextResponse.json({ dashboardUrl, token })
  }),
)
