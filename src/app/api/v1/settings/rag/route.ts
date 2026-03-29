import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, type AuthContext } from '@/lib/middleware/auth'
import { encrypt } from '@/lib/auth/encryption'
import { maskCredential } from '@/lib/resources/credential-utils'

// GET /api/v1/settings/rag — get RAG configuration (SYSTEM_ADMIN only)
export const GET = withAuth(
  withPermission('config:manage', async () => {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { startsWith: 'rag.' } },
    })

    const result: Record<string, unknown> = {}
    for (const c of configs) {
      const val = c.value
      // Mask API keys for display
      if (c.key.endsWith('.apiKey') && typeof val === 'string' && val) {
        try {
          // Try to decrypt and mask
          const { decrypt: dec } = await import('@/lib/auth/encryption')
          const parsed = JSON.parse(dec(val)) as { apiKey: string }
          result[c.key] = parsed.apiKey ? maskCredential(parsed.apiKey) : ''
        } catch {
          // If decryption fails, mask raw value
          result[c.key] = val ? maskCredential(val) : ''
        }
      } else {
        result[c.key] = val
      }
    }

    return NextResponse.json(result)
  }),
)

// PUT /api/v1/settings/rag — update RAG configuration (SYSTEM_ADMIN only)
export const PUT = withAuth(
  withPermission('config:manage', async (req: NextRequest, _ctx: AuthContext) => {
    let body: Record<string, unknown>
    try {
      body = await req.json() as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const allowedKeys = [
      'rag.llm.baseUrl', 'rag.llm.apiKey', 'rag.llm.model',
      'rag.embedding.baseUrl', 'rag.embedding.apiKey', 'rag.embedding.model',
      'rag.rerank.enabled', 'rag.rerank.baseUrl', 'rag.rerank.apiKey', 'rag.rerank.model',
      'rag.ocr.model', 'rag.ocr.workers',
    ]

    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.includes(key)) continue

      let storeValue: unknown = value

      // Encrypt API keys
      if (key.endsWith('.apiKey') && typeof value === 'string' && value) {
        // Skip if it looks like a masked value (contains ***)
        if (value.includes('***')) continue
        storeValue = encrypt(JSON.stringify({ apiKey: value }))
      }

      await prisma.systemConfig.upsert({
        where: { key },
        update: { value: storeValue as never },
        create: {
          key,
          value: storeValue as never,
          description: `RAG config: ${key}`,
        },
      })
    }

    return NextResponse.json({ status: 'saved' })
  }),
)
