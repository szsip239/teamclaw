"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Loader2, Send } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { chatKeys } from "@/hooks/use-chat"
import { useInstances } from "@/hooks/use-instances"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"
import { toast } from "sonner"
import type { ModelDefinition } from "@/types/resource"

type PushRole = "primary" | "fallbacks" | "imageModel" | "imageGenerationModel"
type PushTarget = "openclaw" | "pi"

interface PushOutcome {
  instanceId: string
  ok: boolean
  error?: string
  piOk?: boolean
  piError?: string
}

interface PushResponse {
  modelRef: string
  role: PushRole
  targets: PushTarget[]
  outcomes: PushOutcome[]
  successCount: number
  failedCount: number
}

interface ModelPushDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceId: string
  resourceProvider: string
  model: ModelDefinition | null
}

export function ModelPushDialog({
  open,
  onOpenChange,
  resourceId,
  resourceProvider,
  model,
}: ModelPushDialogProps) {
  const t = useT()
  const qc = useQueryClient()
  const { data: instancesData, isLoading: instancesLoading } = useInstances({
    pageSize: 100,
    status: "ONLINE",
  })
  const instances = instancesData?.instances ?? []

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedTargets, setSelectedTargets] = useState<Set<PushTarget>>(
    new Set(["openclaw", "pi"]),
  )
  const [role, setRole] = useState<PushRole>("primary")
  const [submitting, setSubmitting] = useState(false)

  // Reset selection whenever the dialog reopens or the target model changes.
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set())
      setSelectedTargets(new Set(["openclaw", "pi"]))
      setRole("primary")
    }
  }, [open, model?.id])

  function toggleInstance(id: string, checked: boolean) {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    setSelectedIds(next)
  }

  function toggleTarget(target: PushTarget, checked: boolean) {
    const next = new Set(selectedTargets)
    if (checked) next.add(target)
    else next.delete(target)
    setSelectedTargets(next)
  }

  async function handleSubmit() {
    if (!model) return
    if (selectedIds.size === 0) {
      toast.error(t('resource.pushModelSelectAtLeastOne'))
      return
    }
    if (selectedTargets.size === 0) {
      toast.error(t('resource.pushModelSelectAtLeastOneTarget'))
      return
    }
    setSubmitting(true)
    try {
      const result = await api.post<PushResponse>(
        `/api/v1/resources/${resourceId}/push`,
        {
          modelId: model.id,
          instanceIds: Array.from(selectedIds),
          targets: Array.from(selectedTargets),
          role: selectedTargets.has("openclaw") ? role : undefined,
        },
      )
      if (result.successCount > 0) {
        void qc.invalidateQueries({ queryKey: [...chatKeys.all, "model"] })
      }
      if (result.failedCount === 0) {
        toast.success(
          t('resource.pushModelSuccess', { count: String(result.successCount) }),
        )
        onOpenChange(false)
      } else if (result.successCount === 0) {
        const firstErr = result.outcomes.find((o) => !o.ok)?.error
        toast.error(`${t('resource.pushModelAllFailed')}${firstErr ? `: ${firstErr}` : ''}`)
      } else {
        toast.warning(
          t('resource.pushModelPartial', {
            success: String(result.successCount),
            failed: String(result.failedCount),
          }),
        )
      }
    } catch (err) {
      const data = (err as { data?: { error?: string } })?.data
      toast.error(data?.error ?? (err as Error).message ?? t('operationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const roleOptions: Array<{ value: PushRole; labelKey: TranslationKey; hintKey: TranslationKey }> = [
    {
      value: "primary",
      labelKey: "resource.pushModelRolePrimary",
      hintKey: "resource.pushModelRolePrimaryHint",
    },
    {
      value: "fallbacks",
      labelKey: "resource.pushModelRoleFallbacks",
      hintKey: "resource.pushModelRoleFallbacksHint",
    },
    {
      value: "imageModel",
      labelKey: "resource.pushModelRoleImageModel",
      hintKey: "resource.pushModelRoleImageModelHint",
    },
    {
      value: "imageGenerationModel",
      labelKey: "resource.pushModelRoleImageGen",
      hintKey: "resource.pushModelRoleImageGenHint",
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4" />
            {t('resource.pushModelTitle')}
          </DialogTitle>
          {model && (
            <DialogDescription>
              {t('resource.pushModelDesc', {
                model: `${resourceProvider}/${model.id}`,
              })}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-5">
          {/* Targets */}
          <div className="space-y-2">
            <Label className="text-[13px] font-medium">
              {t('resource.pushModelTargetLabel')}
            </Label>
            <div className="space-y-1.5">
              {([
                {
                  value: "openclaw" as const,
                  labelKey: "resource.pushModelTargetOpenClaw" as const,
                  hintKey: "resource.pushModelTargetOpenClawHint" as const,
                },
                {
                  value: "pi" as const,
                  labelKey: "resource.pushModelTargetPi" as const,
                  hintKey: "resource.pushModelTargetPiHint" as const,
                },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedTargets.has(opt.value)}
                    onCheckedChange={(c) => toggleTarget(opt.value, !!c)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block text-[13px] font-medium">
                      {t(opt.labelKey)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t(opt.hintKey)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Role */}
          {selectedTargets.has("openclaw") && (
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">
                {t('resource.pushModelRoleLabel')}
              </Label>
              <div className="space-y-1.5">
                {roleOptions.map((opt) => {
                  const isSelected = role === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium">
                          {t(opt.labelKey)}
                        </span>
                        <div
                          className={`size-3.5 rounded-full border-2 ${
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/30"
                          }`}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(opt.hintKey)}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Target instances */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-medium">
                {t('resource.pushModelInstancesLabel')}
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {selectedIds.size} / {instances.length}
              </span>
            </div>
            {instancesLoading ? (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t('resource.loadingInstances')}
              </div>
            ) : instances.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                {t('resource.pushModelInstancesEmpty')}
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-md border p-1.5">
                {instances.map((inst) => (
                  <label
                    key={inst.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-[13px]"
                  >
                    <Checkbox
                      checked={selectedIds.has(inst.id)}
                      onCheckedChange={(c) => toggleInstance(inst.id, !!c)}
                    />
                    <span className="flex-1">{inst.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting || selectedIds.size === 0 || selectedTargets.size === 0 || !model
            }
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t('resource.pushModelSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
