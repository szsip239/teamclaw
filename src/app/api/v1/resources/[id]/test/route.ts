import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { testConnection } from '@/lib/resources/test-connection'
import { isKnownMultimodal } from '@/lib/resources/model-capabilities'
import type { ResourceConfig, ModelDefinition } from '@/types/resource'

// POST /api/v1/resources/[id]/test — Test resource connectivity
export const POST = withAuth(
  withPermission('resources:manage', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing resource ID' }, { status: 400 })
    }

    const resource = await prisma.resource.findUnique({ where: { id } })
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    const config = resource.config as ResourceConfig | null
    const result = await testConnection(
      resource.provider,
      resource.credentials,
      config,
    )

    // Build update data
    const updateData: Prisma.ResourceUpdateInput = {
      status: result.ok ? 'ACTIVE' : 'ERROR',
      lastTestedAt: new Date(),
      lastTestError: result.error ?? null,
    }

    // Fallback: if API response didn't return a model list (POST-based tests),
    // use known model patterns to detect multimodal from existing config.models
    if (result.ok && !result.details?.detectedModels?.length) {
      const existingModels = config?.models ?? []
      if (existingModels.length > 0) {
        const fallbackDetected = existingModels
          .map((model) => {
            const multimodal = isKnownMultimodal(model.id)
            return multimodal !== undefined ? { id: model.id, multimodal } : null
          })
          .filter((dm): dm is { id: string; multimodal: boolean } => dm !== null)

        if (fallbackDetected.length > 0) {
          if (!result.details) result.details = {}
          result.details.detectedModels = fallbackDetected
        }
      }
    }

    // Auto-save or merge detected models into config.models
    if (result.ok && result.details?.detectedModels?.length) {
      const existingModels = config?.models ?? []

      if (existingModels.length === 0) {
        // No existing models — save detected models as ModelDefinitions
        const newModels: ModelDefinition[] = result.details.detectedModels.map((dm) => ({
          id: dm.id,
          name: dm.id,
          reasoning: false,
          input: dm.multimodal ? ['text', 'image'] : ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200000,
          maxTokens: 8192,
        }))
        updateData.config = {
          ...config,
          models: newModels,
        } as unknown as Prisma.InputJsonValue
      } else {
        // Merge multimodal detection into existing models
        const detectedMap = new Map(
          result.details.detectedModels
            .filter((dm) => dm.multimodal !== undefined)
            .map((dm) => [dm.id, dm.multimodal]),
        )

        let updated = false
        const mergedModels: ModelDefinition[] = existingModels.map((model) => {
          const detectedMultimodal = detectedMap.get(model.id)
          if (detectedMultimodal === undefined) return model

          const currentHasImage = model.input?.includes('image') ?? false
          if (detectedMultimodal && !currentHasImage) {
            updated = true
            return { ...model, input: [...(model.input ?? ['text']), 'image'] }
          }
          if (!detectedMultimodal && currentHasImage) {
            updated = true
            return { ...model, input: (model.input ?? []).filter((i) => i !== 'image') }
          }
          return model
        })

        if (updated) {
          updateData.config = {
            ...config,
            models: mergedModels,
          } as unknown as Prisma.InputJsonValue
        }
      }
    }

    await prisma.resource.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(result)
  }),
)
