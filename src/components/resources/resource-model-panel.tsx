"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, Download, Loader2, Star, Send } from "lucide-react"
import { ModelRow } from "./model-row"
import { ResourceModelDialog } from "./resource-model-dialog"
import { ModelPushDialog } from "./model-push-dialog"
import { useUpdateResource, useProviders } from "@/hooks/use-resources"
import { api } from "@/lib/api-client"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import type { ResourceDetail, ResourceConfig, ModelDefinition, ProviderInfo } from "@/types/resource"

interface ResourceModelPanelProps {
  resource: ResourceDetail
}

interface ModelsDevResponse {
  provider: string
  modelsDevId: string
  count: number
  models: ModelDefinition[]
}

export function ResourceModelPanel({ resource }: ResourceModelPanelProps) {
  const t = useT()
  const config = resource.config as ResourceConfig | null
  const models = config?.models ?? []
  const updateMutation = useUpdateResource(resource.id)
  const { data: providerList } = useProviders("MODEL")
  const providerDef = providerList?.providers.find((p: ProviderInfo) => p.id === resource.provider)

  // Resolve the effective models.dev id by matching the Resource's config.baseUrl
  // against the provider's variants. Falls back to the provider's default.
  const effectiveBaseUrl = config?.baseUrl ?? providerDef?.baseUrl
  const matchingVariant = providerDef?.variants?.find((v) => v.baseUrl === effectiveBaseUrl)
  const effectiveModelsDevId = matchingVariant?.modelsDevId ?? providerDef?.modelsDevId
  const hasModelsDevMapping = Boolean(effectiveModelsDevId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelDefinition | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pushDialogOpen, setPushDialogOpen] = useState(false)
  const [pushingModel, setPushingModel] = useState<ModelDefinition | null>(null)

  async function saveModels(newModels: ModelDefinition[]) {
    try {
      await updateMutation.mutateAsync({
        config: { ...config, models: newModels },
      })
      toast.success(t('resource.modelsUpdated'))
    } catch {
      toast.error(t('operationFailed'))
    }
  }

  const currentDefaultModelId =
    resource.isDefaultModel ? (config?.defaultModelId ?? null) : null

  async function toggleDefaultModel(modelId: string) {
    const willBeDefault = currentDefaultModelId !== modelId
    try {
      await updateMutation.mutateAsync({
        config: { ...config, defaultModelId: willBeDefault ? modelId : undefined },
        isDefaultModel: willBeDefault,
      })
      toast.success(
        willBeDefault
          ? t('resource.defaultModelSet', { name: modelId })
          : t('resource.defaultModelCleared'),
      )
    } catch {
      toast.error(t('operationFailed'))
    }
  }

  function handleAdd() {
    setEditingModel(null)
    setDialogOpen(true)
  }

  async function handleSyncFromModelsDev() {
    if (pulling) return
    setPulling(true)
    try {
      // Pass explicit modelsDevId (derived from baseUrl-variant match) so the
      // backend doesn't have to repeat the resolution.
      const qs = effectiveModelsDevId
        ? `modelsDevId=${encodeURIComponent(effectiveModelsDevId)}`
        : `provider=${encodeURIComponent(resource.provider)}`
      const data = await api.get<ModelsDevResponse>(
        `/api/v1/resources/models-dev?${qs}`,
      )
      if (!data.models?.length) {
        toast.warning(t("resource.modelsDevEmpty"))
        return
      }
      // Merge: models.dev entries override matching ids, existing unique models kept
      const byId = new Map<string, ModelDefinition>()
      for (const m of models) byId.set(m.id, m)
      for (const m of data.models) byId.set(m.id, m)
      const merged = Array.from(byId.values())
      await saveModels(merged)
      toast.success(t("resource.modelsDevSynced", { count: data.models.length }))
    } catch (err) {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? t("operationFailed")
      toast.error(msg)
    } finally {
      setPulling(false)
    }
  }

  function handleEdit(model: ModelDefinition) {
    setEditingModel(model)
    setDialogOpen(true)
  }

  function handleDelete(modelId: string) {
    const newModels = models.filter((m) => m.id !== modelId)
    saveModels(newModels)
  }

  function handleSave(model: ModelDefinition) {
    if (editingModel) {
      // Update existing
      const newModels = models.map((m) => (m.id === editingModel.id ? model : m))
      saveModels(newModels)
    } else {
      // Check for duplicate
      if (models.some((m) => m.id === model.id)) {
        toast.error(t('resource.modelExists', { id: model.id }))
        return
      }
      saveModels([...models, model])
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">
                {t('resource.modelDefinitions')}
                <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                  ({models.length})
                </span>
              </CardTitle>
              <CardDescription>
                {t('resource.modelDefinitionsDesc')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasModelsDevMapping && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncFromModelsDev}
                  disabled={pulling || updateMutation.isPending}
                  title={t('resource.syncFromModelsDevHint')}
                >
                  {pulling ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {t('resource.syncFromModelsDev')}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleAdd}>
                <Plus className="size-3.5" />
                {t('resource.addModel')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
              <p>{t('resource.noModels')}</p>
              <Button size="sm" variant="ghost" onClick={handleAdd}>
                <Plus className="size-3.5" />
                {t('resource.addFirstModel')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {models.map((model) => {
                const isDefaultModel = currentDefaultModelId === model.id
                return (
                  <ModelRow
                    key={model.id}
                    model={model}
                    actions={
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={
                            isDefaultModel
                              ? 'size-7 text-amber-500 hover:text-amber-600'
                              : 'size-7 text-muted-foreground/40 hover:text-amber-500'
                          }
                          onClick={() => toggleDefaultModel(model.id)}
                          title={
                            isDefaultModel
                              ? t('resource.defaultModelActive')
                              : t('resource.setAsDefaultModel')
                          }
                        >
                          <Star
                            className={isDefaultModel ? 'size-3.5 fill-current' : 'size-3.5'}
                          />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-primary/70 hover:text-primary"
                          onClick={() => {
                            setPushingModel(model)
                            setPushDialogOpen(true)
                          }}
                          title={t('resource.pushModel')}
                        >
                          <Send className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => handleEdit(model)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(model.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    }
                  />
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ResourceModelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        model={editingModel}
        onSave={handleSave}
      />

      <ModelPushDialog
        open={pushDialogOpen}
        onOpenChange={setPushDialogOpen}
        resourceId={resource.id}
        resourceProvider={resource.provider}
        model={pushingModel}
      />
    </>
  )
}
