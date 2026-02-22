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
      return NextResponse.json({ error: '缺少资源 ID' }, { status: 400 })
    }

    const resource = await prisma.resource.findUnique({ where: { id } })
    if (!resource) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 })
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

    // Auto-merge multimodal detection into config.models
    if (result.ok && result.details?.detectedModels?.length) {
      const existingModels = config?.models ?? []
      if (existingModels.length > 0) {
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
