import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { auditLog } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { buildProviderEntries, mergeProvidersIntoPatch } from '@/lib/config-editor/provider-sync'
import type { ConfigGetResult } from '@/types/gateway'

const patchSchema = z.object({
  patch: z.record(z.string(), z.unknown()),
  baseHash: z.string().min(1),
  missingProviders: z.array(z.string()).optional(),
})

// POST /api/v1/instances/[id]/config-patch — Incremental config update via gateway
export const POST = withAuth(
  withPermission(
    'instances:manage',
    withValidation(patchSchema, async (req, ctx) => {
      const user = ctx.user!
      const body = ctx.body
      const id = (ctx.params?.id as string) ?? ''
      await ensureRegistryInitialized()

      if (!registry.isConnected(id)) {
        return NextResponse.json(
          { error: 'Instance not connected' },
          { status: 400 },
        )
      }

      const instance = await prisma.instance.findUnique({
        where: { id },
        select: { name: true },
      })

      try {
        // Enrich patch with provider API keys from Resource DB (best-effort)
        let finalPatch = body.patch
        if (body.missingProviders?.length) {
          try {
            const entries = await buildProviderEntries(body.missingProviders)
            finalPatch = mergeProvidersIntoPatch(body.patch, entries)
          } catch (err) {
            console.warn('[config-patch] Provider sync failed:', err)
          }
        }

        await registry.request(id, 'config.patch', {
          raw: JSON.stringify(finalPatch),
          baseHash: body.baseHash,
        })

        // Re-fetch to get the new hash
        const updated = await registry.request(id, 'config.get') as ConfigGetResult

        auditLog({
          userId: user!.id,
          action: 'INSTANCE_CONFIG_PATCH',
          resource: 'instance',
          resourceId: id,
          details: {
            name: instance?.name ?? id,
            patchKeys: Object.keys(body.patch).join(', '),
          },
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent') || undefined,
          result: 'SUCCESS',
        })

        return NextResponse.json({
          status: 'patched',
          hash: updated.hash,
          config: updated.config,
        })
      } catch (err) {
        const message = (err as Error).message

        // Hash conflict detection — gateway returns "[INVALID_REQUEST] config changed..."
        // Only match hash-specific messages; don't catch all INVALID_REQUEST errors
        // which could be patch validation failures (e.g., invalid provider entry format).
        if (message.includes('config changed') || message.includes('baseHash') || message.includes('hash mismatch')) {
          return NextResponse.json(
            { error: 'Configuration has been modified by another user, please refresh and retry', code: 'HASH_CONFLICT' },
            { status: 409 },
          )
        }

        console.error('[config-patch] Gateway error:', message)
        return NextResponse.json(
          { error: `Configuration update failed:${message}` },
          { status: 500 },
        )
      }
    }),
  ),
)
