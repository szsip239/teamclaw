import { NextResponse } from 'next/server'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { getProvider } from '@/lib/resources/providers'
import { getModelsForProvider } from '@/lib/resources/models-dev-adapter'

// GET /api/v1/resources/models-dev?provider=openai[&variant=cn-coding][&modelsDevId=X]
//
// Returns model definitions sourced from the models.dev catalog. Resolution
// order for the effective models.dev id:
//   1. explicit `modelsDevId` query param (trust the caller)
//   2. `variant` param → look up on the provider's variants array
//   3. provider's default `modelsDevId`
//
// 404 when nothing resolves to a models.dev id (e.g. volcengine, self-hosted
// vllm, custom catchall).
export const GET = withAuth(
  withPermission('resources:manage', async (req) => {
    const url = new URL(req.url)
    const providerId = url.searchParams.get('provider')
    const variantId = url.searchParams.get('variant')
    const explicitId = url.searchParams.get('modelsDevId')

    if (!providerId && !explicitId) {
      return NextResponse.json({ error: 'provider or modelsDevId query param is required' }, { status: 400 })
    }

    let modelsDevId = explicitId ?? undefined
    if (!modelsDevId && providerId) {
      const providerDef = getProvider(providerId)
      if (!providerDef) {
        return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 404 })
      }
      if (variantId) {
        const variant = providerDef.variants?.find((v) => v.id === variantId)
        if (!variant) {
          return NextResponse.json(
            { error: `Unknown variant "${variantId}" for provider "${providerId}"`, code: 'UNKNOWN_VARIANT' },
            { status: 404 },
          )
        }
        modelsDevId = variant.modelsDevId
      } else {
        modelsDevId = providerDef.modelsDevId
      }
      if (!modelsDevId) {
        return NextResponse.json(
          { error: `Provider "${providerId}"${variantId ? ` (variant ${variantId})` : ''} has no models.dev mapping`, code: 'NO_MODELS_DEV_MAPPING' },
          { status: 404 },
        )
      }
    }

    try {
      const models = await getModelsForProvider(modelsDevId!)
      return NextResponse.json({
        provider: providerId,
        variant: variantId,
        modelsDevId,
        count: models.length,
        models,
      })
    } catch (err) {
      const message = (err as Error).message
      return NextResponse.json(
        { error: `Failed to fetch models.dev catalog: ${message}` },
        { status: 502 },
      )
    }
  }),
)
