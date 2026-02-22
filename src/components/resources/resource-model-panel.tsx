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
import { Plus, Pencil, Trash2 } from "lucide-react"
import { ModelRow } from "./model-row"
import { ResourceModelDialog } from "./resource-model-dialog"
import { useUpdateResource } from "@/hooks/use-resources"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import type { ResourceDetail, ResourceConfig, ModelDefinition } from "@/types/resource"

interface ResourceModelPanelProps {
  resource: ResourceDetail
}

export function ResourceModelPanel({ resource }: ResourceModelPanelProps) {
  const t = useT()
  const config = resource.config as ResourceConfig | null
  const models = config?.models ?? []
  const updateMutation = useUpdateResource(resource.id)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelDefinition | null>(null)

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

  function handleAdd() {
    setEditingModel(null)
    setDialogOpen(true)
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
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="size-3.5" />
              {t('resource.addModel')}
            </Button>
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
              {models.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  actions={
                    <div className="flex items-center gap-1">
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
              ))}
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
    </>
  )
}
