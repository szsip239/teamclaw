"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"
import { useUpdateResource } from "@/hooks/use-resources"
import { API_TYPES } from "@/lib/resources/providers"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import type { ResourceDetail, ResourceConfig } from "@/types/resource"

interface ResourceEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource: ResourceDetail
}

export function ResourceEditDialog({
  open,
  onOpenChange,
  resource,
}: ResourceEditDialogProps) {
  const t = useT()
  const updateMutation = useUpdateResource(resource.id)
  const config = resource.config as ResourceConfig | null
  const isModelType = resource.type === "MODEL"

  const [name, setName] = useState(resource.name)
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "")
  const [apiType, setApiType] = useState(config?.apiType ?? "")
  const [description, setDescription] = useState(resource.description ?? "")
  const [isDefault, setIsDefault] = useState(resource.isDefault)

  useEffect(() => {
    if (open) {
      const cfg = resource.config as ResourceConfig | null
      setName(resource.name)
      setApiKey("")
      setBaseUrl(cfg?.baseUrl ?? "")
      setApiType(cfg?.apiType ?? "")
      setDescription(resource.description ?? "")
      setIsDefault(resource.isDefault)
    }
  }, [open, resource])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const data: Record<string, unknown> = {}
    if (name !== resource.name) data.name = name
    if (apiKey) data.apiKey = apiKey
    if (description !== (resource.description ?? ""))
      data.description = description || null
    if (isDefault !== resource.isDefault) data.isDefault = isDefault

    // Check config changes
    const currentBaseUrl = config?.baseUrl ?? ""
    const currentApiType = config?.apiType ?? ""
    if (baseUrl !== currentBaseUrl || apiType !== currentApiType) {
      data.config = {
        ...config,
        baseUrl: baseUrl || undefined,
        apiType: apiType || undefined,
      }
    }

    if (Object.keys(data).length === 0) {
      onOpenChange(false)
      return
    }

    try {
      await updateMutation.mutateAsync(data)
      toast.success(t('resource.updateSuccess'))
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('operationFailed')
      toast.error(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('resource.editTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t('resource.resourceName')}</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* New API Key */}
          <div className="space-y-2">
            <Label htmlFor="edit-key">{t('resource.apiKeyKeepEmpty')}</Label>
            <Input
              id="edit-key"
              type="password"
              placeholder={t('resource.apiKeyKeepPlaceholder')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('resource.currentKey', { key: resource.maskedKey })}
            </p>
          </div>

          {/* API Type — only for MODEL resources */}
          {isModelType && (
            <div className="space-y-2">
              <Label>{t('resource.apiType')}</Label>
              <Select value={apiType} onValueChange={setApiType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('resource.selectApiType')} />
                </SelectTrigger>
                <SelectContent>
                  {API_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="edit-base-url">{t('resource.apiUrlOptional')}</Label>
            <Input
              id="edit-base-url"
              placeholder="https://..."
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-desc">{t('description')}</Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Default toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>{t('resource.setDefault')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('resource.setDefaultHint')}
              </p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !name}>
              {updateMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
