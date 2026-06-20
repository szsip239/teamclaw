import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { auditLog } from '@/lib/audit'
import {
  buildProviderEntryFromResource,
  resolveOpenClawProviderId,
  sanitizeProviderPatch,
  type ProviderEntry,
} from '@/lib/config-editor/provider-sync'
import { syncPiProviderConfig } from '@/lib/config-editor/pi-provider-sync'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import type { ResourceConfig, ModelDefinition } from '@/types/resource'

const PUSH_ROLES = ['primary', 'fallbacks', 'imageModel', 'imageGenerationModel'] as const
type ModelPushRole = (typeof PUSH_ROLES)[number]
const PUSH_TARGETS = ['openclaw', 'pi'] as const
type ModelPushTarget = (typeof PUSH_TARGETS)[number]

// Map non-fallback roles to the agents.defaults.<key>.primary slot.
const PRIMARY_SLOT_KEY: Record<Exclude<ModelPushRole, 'fallbacks'>, string> = {
  primary: 'model',
  imageModel: 'imageModel',
  imageGenerationModel: 'imageGenerationModel',
}

const pushSchema = z.object({
  modelId: z.string().min(1),
  instanceIds: z.array(z.string().min(1)).min(1),
  role: z.enum(PUSH_ROLES).optional().default('primary'),
  targets: z.array(z.enum(PUSH_TARGETS)).min(1).optional().default(['openclaw']),
})

interface ConfigGetResult {
  config?: Record<string, unknown>
  hash?: string
}

/**
 * fallbacks needs the existing chain so we can append-if-missing without
 * dropping the user's prior entries; primary/imageModel/imageGenerationModel
 * are pure overwrites that don't read current state.
 */
function buildRolePatch(params: {
  role: ModelPushRole
  modelRef: string
  currentConfig: Record<string, unknown> | undefined
}): Record<string, unknown> {
  const { role, modelRef, currentConfig } = params

  if (role !== 'fallbacks') {
    return { agents: { defaults: { [PRIMARY_SLOT_KEY[role]]: { primary: modelRef } } } }
  }

  const defaults = (currentConfig?.agents as Record<string, unknown> | undefined)
    ?.defaults as Record<string, unknown> | undefined
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
  piOk?: boolean
  piError?: string
}

async function pushPiModelsConfig(params: {
  instanceId: string
  providerId: string
  providerEntry: ProviderEntry
  modelId?: string
  required?: boolean
}): Promise<Pick<PushOutcome, 'piOk' | 'piError'>> {
  const result = await syncPiProviderConfig({
    instanceId: params.instanceId,
    entries: { [params.providerId]: params.providerEntry },
    defaultProviderId: params.modelId ? params.providerId : undefined,
    defaultModelId: params.modelId,
  })
  if (result.skipped) {
    return params.required
      ? { piOk: false, piError: 'Pi runtime is not enabled for this instance' }
      : {}
  }
  if (result.ok) {
    return { piOk: true }
  }
  if (result.error) {
    console.warn(
      `[resource-push] Pi model sync failed for instance ${params.instanceId}:`,
      result.error,
    )
    return { piOk: false, piError: result.error }
  }
  return {}
}

export const POST = withAuth(
  withPermission(
    'resources:manage',
    withValidation(pushSchema, async (req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: typeof ctx.body
      }
      const id = ctx.params?.id as string
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

      const openClawProviderId = resolveOpenClawProviderId(resource.provider, config)
      const modelRef = `${openClawProviderId}/${body.modelId}`
      const builtProvider = buildProviderEntryFromResource(resource)
      if (!builtProvider || builtProvider.providerId !== openClawProviderId) {
        return NextResponse.json(
          { error: `Could not build provider entry for "${resource.provider}" — ensure the resource has a baseUrl, apiKey, and at least one model` },
          { status: 400 },
        )
      }
      const providerEntry = builtProvider.entry

      const targets = Array.from(new Set(body.targets)) as ModelPushTarget[]
      const wantsOpenClaw = targets.includes('openclaw')
      const wantsPi = targets.includes('pi')
      let connected = new Set<string>()
      if (wantsOpenClaw) {
        await ensureRegistryInitialized()
        connected = new Set(registry.getConnectedIds())
      }

      const outcomes: PushOutcome[] = await Promise.all(
        body.instanceIds.map(async (instanceId): Promise<PushOutcome> => {
          if (wantsOpenClaw && !connected.has(instanceId)) {
            return { instanceId, ok: false, error: 'Instance not connected' }
          }
          try {
            if (wantsOpenClaw) {
              // config.get is required to obtain baseHash — OpenClaw rejects
              // config.patch without it. fallbacks additionally consumes
              // cur.config to append-if-missing; overwrite roles ignore it.
              const cur = (await registry.request(instanceId, 'config.get')) as ConfigGetResult
              const rolePatch = buildRolePatch({
                role: body.role as ModelPushRole,
                modelRef,
                currentConfig: cur.config,
              })
              const patch = {
                models: { providers: { [openClawProviderId]: providerEntry } },
                ...rolePatch,
              }
              const sanitized = sanitizeProviderPatch(patch)
              await registry.request(instanceId, 'config.patch', {
                raw: JSON.stringify(sanitized),
                baseHash: cur.hash,
              })
            }
            const piResult = await pushPiModelsConfig({
              instanceId,
              providerId: openClawProviderId,
              providerEntry,
              modelId: wantsPi ? body.modelId : undefined,
              required: wantsPi,
            })
            const ok = wantsPi && piResult.piOk !== true ? false : true
            return {
              instanceId,
              ok,
              error: ok ? undefined : piResult.piError,
              ...piResult,
            }
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
          targets: targets.join(','),
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
        targets,
        outcomes,
        successCount: successIds.length,
        failedCount: failedOutcomes.length,
      })
    }),
  ),
)
