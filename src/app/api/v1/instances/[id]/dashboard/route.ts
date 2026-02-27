import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { decrypt } from '@/lib/auth/encryption'

// GET /api/v1/instances/[id]/dashboard — Return dashboard URL and token
// Frontend opens the URL and posts the token via form submission to avoid
// exposing the decrypted gateway token in URL query parameters.
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

    // Convert ws://host:port → http://host:port
    const dashboardUrl = instance.gatewayUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')

    return NextResponse.json({ dashboardUrl, token })
  }),
)
