import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, param } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import { buildProviderEntries, sanitizeProviderPatch } from '@/lib/config-editor/provider-sync'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import type { ResourceConfig, ModelDefinition } from '@/types/resource'

// Each role maps to one canonical config path on the instance side. fallbacks
// is the only "append" target; everything else is overwrite-on-push.
type ModelPushRole = 'primary' | 'fallbacks' | 'imageModel' | 'imageGenerationModel'

const pushSchema = z.object({
  modelId: z.string().min(1),
  instanceIds: z.array(z.string().min(1)).min(1),
  role: z.enum(['primary', 'fallbacks', 'imageModel', 'imageGenerationModel']),
})

interface ConfigGetResult {
  config?: Record<string, unknown>
  hash?: string
}

/**
 * Build a deep merge-patch fragment that lands the model in the requested
 * role-target on a single instance.
 *
 * For role=fallbacks the existing fallbacks array is read from `currentConfig`,
 * appended with the new ref (only if not already present), and emitted whole —
 * this keeps the user's existing chain intact. Other roles overwrite the
 * single primary slot.
 */
function buildRolePatch(params: {
  role: ModelPushRole
  modelRef: string
  currentConfig: Record<string, unknown> | undefined
}): Record<string, unknown> {
  const { role, modelRef, currentConfig } = params
  const defaults = (currentConfig?.agents as Record<string, unknown> | undefined)
    ?.defaults as Record<string, unknown> | undefined

  if (role === 'primary') {
    return { agents: { defaults: { model: { primary: modelRef } } } }
  }
  if (role === 'imageModel') {
    return { agents: { defaults: { imageModel: { primary: modelRef } } } }
  }
  if (role === 'imageGenerationModel') {
    return { agents: { defaults: { imageGenerationModel: { primary: modelRef } } } }
  }
  // role === 'fallbacks' → append-if-missing semantics
  const existing = (defaults?.model as Record<string, unknown> | undefined)?.fallbacks
  const existingArr =
    Array.isArray(existing) && existing.every((x) => typeof x === 'string')
      ? (existing as string[])
      : []
  const next = existingArr.includes(modelRef) ? existingArr : [...existingArr, modelRef]
  return { agents: { defaults: { model: { fallbacks: next } } } }
}

interface PushOutcome {
  instanceId: string
  ok: boolean
  error?: string
}

// POST /api/v1/resources/[id]/push — Push a single model to multiple instances
//   under a chosen role. Provider entry is co-pushed so brand new instances
//   that lack the provider key auto-receive the credentials/baseUrl/models.
export const POST = withAuth(
  withPermission(
    'resources:manage',
    withValidation(pushSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }
      const id = param(ctx, 'id')
      if (!id) {
        return NextResponse.json({ error: 'Missing resource ID' }, { status: 400 })
      }

      const resource = await prisma.resource.findUnique({ where: { id } })
      if (!resource) {
        return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
      }
      if (resource.type !== 'MODEL') {
        return NextResponse.json(
          { error: 'Only MODEL resources can be pushed as agent models' },
          { status: 400 },
        )
      }
      const config = resource.config as ResourceConfig | null
      const modelDef: ModelDefinition | undefined = config?.models?.find(
        (m) => m.id === body.modelId,
      )
      if (!modelDef) {
        return NextResponse.json(
          { error: `Model id "${body.modelId}" not found in resource config.models[]` },
          { status: 400 },
        )
      }

      const modelRef = `${resource.provider}/${body.modelId}`
      const providerEntries = await buildProviderEntries([resource.provider])
      const providerEntry = providerEntries[resource.provider]
      if (!providerEntry) {
        return NextResponse.json(
          { error: `Could not build provider entry for "${resource.provider}" — ensure the resource has a baseUrl, apiKey, and at least one model` },
          { status: 400 },
        )
      }

      await ensureRegistryInitialized()
      const connected = new Set(registry.getConnectedIds())

      const outcomes: PushOutcome[] = await Promise.all(
        body.instanceIds.map(async (instanceId): Promise<PushOutcome> => {
          if (!connected.has(instanceId)) {
            return { instanceId, ok: false, error: 'Instance not connected' }
          }
          try {
            const cur = (await registry.request(instanceId, 'config.get')) as ConfigGetResult
            const rolePatch = buildRolePatch({
              role: body.role as ModelPushRole,
              modelRef,
              currentConfig: cur.config,
            })
            const patch = {
              models: { providers: { [resource.provider]: providerEntry } },
              ...rolePatch,
            }
            const sanitized = sanitizeProviderPatch(patch)
            await registry.request(instanceId, 'config.patch', {
              raw: JSON.stringify(sanitized),
              baseHash: cur.hash,
            })
            return { instanceId, ok: true }
          } catch (err) {
            return {
              instanceId,
              ok: false,
              error: (err as Error).message ?? 'unknown',
            }
          }
        }),
      )

      const successIds = outcomes.filter((o) => o.ok).map((o) => o.instanceId)
      const failedOutcomes = outcomes.filter((o) => !o.ok)

      auditLog({
        userId: user.id,
        action: 'RESOURCE_MODEL_PUSH',
        resource: 'resource',
        resourceId: id,
        details: {
          modelRef,
          role: body.role,
          successInstanceIds: successIds.join(','),
          failedInstanceIds: failedOutcomes.map((o) => o.instanceId).join(','),
        },
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        result: failedOutcomes.length === 0 ? 'SUCCESS' : 'FAILURE',
      })

      return NextResponse.json({
        modelRef,
        role: body.role,
        outcomes,
        successCount: successIds.length,
        failedCount: failedOutcomes.length,
      })
    }),
  ),
)
