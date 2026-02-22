"use client"

import { use, useEffect } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { ConfigEditorLayout } from "@/components/config-editor/config-editor-layout"
import { ConfigEditorSkeleton } from "@/components/config-editor/config-editor-skeleton"
import { useConfigEditorInit, usePatchConfig } from "@/hooks/use-config-editor"
import { useInstance } from "@/hooks/use-instances"
import { useT } from "@/stores/language-store"
import { useConfigEditorStore } from "@/stores/config-editor-store"
import { extractReferencedProviders } from "@/lib/config-editor/schema-utils"
import { resourceKeys } from "@/hooks/use-resources"
import { api } from "@/lib/api-client"
import type { JsonSchema } from "@/types/config-editor"
import type { ResourceListResponse, ProviderListResponse } from "@/types/resource"

export default function InstanceConfigPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const t = useT()
  const queryClient = useQueryClient()
  const { data: instanceData } = useInstance(id)
  const { data: initData, isLoading, error } = useConfigEditorInit(id)
  const patchConfig = usePatchConfig(id)

  // Prefetch resource/provider data for model pickers (parallel with config init)
  useEffect(() => {
    const params = { type: 'MODEL', pageSize: '100' }
    queryClient.prefetchQuery({
      queryKey: resourceKeys.list(params),
      queryFn: () => api.get<ResourceListResponse>('/api/v1/resources?type=MODEL&pageSize=100'),
    })
    queryClient.prefetchQuery({
      queryKey: resourceKeys.providers(),
      queryFn: () => api.get<ProviderListResponse>('/api/v1/resources/providers?type=MODEL'),
    })
  }, [queryClient])

  const initialize = useConfigEditorStore((s) => s.initialize)
  const applyPatchResult = useConfigEditorStore((s) => s.applyPatchResult)
  const getPatch = useConfigEditorStore((s) => s.getPatch)
  const baseHash = useConfigEditorStore((s) => s.baseHash)

  // Initialize store when data arrives
  useEffect(() => {
    if (!initData) return
    initialize(
      initData.schema as JsonSchema,
      initData.uiHints,
      initData.config,
      initData.hash,
    )
  }, [initData, initialize])

  const handleValidate = () => {
    const errors = useConfigEditorStore.getState().validate()
    if (errors.length === 0) {
      toast.success(t('config.validationPassed'))
    }
    // Errors are displayed by the toolbar Popover
  }

  const handleSave = async () => {
    // Validate before saving
    const validationErrors = useConfigEditorStore.getState().validate()
    if (validationErrors.length > 0) {
      toast.warning(t('config.validationWarning', { n: validationErrors.length }))
      return
    }

    const patch = getPatch()
    if (Object.keys(patch).length === 0) {
      toast.info(t('config.noPendingChanges'))
      return
    }

    // Detect model references that need provider API keys synced
    const configData = useConfigEditorStore.getState().configData
    const { referenced, existing } = extractReferencedProviders(configData)
    const missingProviders = [...referenced].filter(p => !existing.has(p))

    try {
      const result = await patchConfig.mutateAsync({
        patch,
        baseHash,
        missingProviders: missingProviders.length > 0 ? missingProviders : undefined,
      })
      applyPatchResult(result.config ?? {}, result.hash ?? "")
      toast.success(t('config.saved'))
    } catch (err) {
      const data = (err as { data?: { error?: string; code?: string } })?.data
      if (data?.code === 'HASH_CONFLICT') {
        toast.error(t('config.hashConflict'))
      } else {
        toast.error(data?.error ?? t('config.saveFailed'))
      }
    }
  }

  // Full-height layout, counter dashboard padding
  const wrapper = "h-[calc(100vh-3.5rem)] -m-6"

  if (isLoading) {
    return (
      <div className={wrapper}>
        <ConfigEditorSkeleton />
      </div>
    )
  }

  if (error) {
    const errorMsg =
      (error as { data?: { error?: string } })?.data?.error ??
      t('config.loadFailed')

    return (
      <div className={`${wrapper} flex items-center justify-center`}>
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <p className="text-xs text-muted-foreground">
            {t('config.ensureRunning')}
          </p>
        </div>
      </div>
    )
  }

  const instanceName =
    (instanceData as { instance?: { name?: string } })?.instance?.name ?? id

  return (
    <div className={wrapper}>
      <ConfigEditorLayout
        instanceId={id}
        instanceName={instanceName}
        isSaving={patchConfig.isPending}
        onSave={handleSave}
        onValidate={handleValidate}
      />
    </div>
  )
}
