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
import { Badge } from "@/components/ui/badge"
import { Loader2, ChevronDown, ChevronRight, Brain, Eye, Coins, TextCursorInput } from "lucide-react"
import { ResourceProviderSelect } from "./resource-provider-select"
import { useCreateResource, useProviders } from "@/hooks/use-resources"
import { API_TYPES } from "@/lib/resources/providers"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import type { ProviderInfo, ModelDefinition } from "@/types/resource"

interface ResourceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return String(n)
}

export function ResourceCreateDialog({
  open,
  onOpenChange,
}: ResourceCreateDialogProps) {
  const t = useT()
  const { data: providersData } = useProviders()
  const createMutation = useCreateResource()
  const providers = providersData?.providers ?? []

  const [selectedProvider, setSelectedProvider] = useState("")
  const [name, setName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [envVarName, setEnvVarName] = useState("")
  const [apiType, setApiType] = useState("")
  const [description, setDescription] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [modelsExpanded, setModelsExpanded] = useState(false)

  // Get the selected provider info
  const providerInfo: ProviderInfo | undefined = providers.find(
    (p) => p.id === selectedProvider,
  )

  // Auto-fill from provider when selection changes
  useEffect(() => {
    if (providerInfo) {
      setBaseUrl(providerInfo.baseUrl ?? "")
      setEnvVarName(providerInfo.envVarName ?? "")
      setApiType(providerInfo.apiType ?? "openai-completions")
      setModelsExpanded(false)
    }
  }, [providerInfo])

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setSelectedProvider("")
      setName("")
      setApiKey("")
      setBaseUrl("")
      setEnvVarName("")
      setApiType("")
      setDescription("")
      setIsDefault(false)
      setModelsExpanded(false)
    }
  }, [open])

  const isCustomProvider = providerInfo?.id === "custom" || providerInfo?.id === "custom-tool" || providerInfo?.id === "opencode"
  const needsEnvVar = providerInfo?.configFields?.some(
    (f) => f.key === "envVarName",
  )
  const isModelType = providerInfo?.type === "MODEL"
  const defaultModels = providerInfo?.defaultModels ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProvider || !name || !apiKey) return

    try {
      await createMutation.mutateAsync({
        name,
        type: providerInfo?.type ?? "MODEL",
        provider: selectedProvider,
        apiKey,
        config: {
          baseUrl: baseUrl || undefined,
          apiType: apiType || providerInfo?.apiType || undefined,
          envVarName: envVarName || providerInfo?.envVarName || undefined,
          models: defaultModels.length > 0 ? defaultModels : undefined,
        },
        description: description || undefined,
        isDefault,
      })
      toast.success(t('resource.createSuccess'))
      onOpenChange(false)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t('operationFailed')
      toast.error(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('resource.createTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          {/* Provider selection — always visible */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <ResourceProviderSelect
              providers={providers}
              value={selectedProvider}
              onValueChange={setSelectedProvider}
            />
          </div>

          {/* Rest of form — only after provider selected */}
          {selectedProvider && (
            <>
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="resource-name">{t('resource.resourceName')}</Label>
                <Input
                  id="resource-name"
                  placeholder={t('resource.resourceNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label htmlFor="resource-key">API Key</Label>
                <Input
                  id="resource-key"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono text-sm"
                  autoComplete="new-password"
                />
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
                  {providerInfo?.apiType && apiType !== providerInfo.apiType && (
                    <p className="text-xs text-muted-foreground">
                      {t('resource.apiTypeDefault', { type: API_TYPES.find((at) => at.value === providerInfo.apiType)?.label ?? providerInfo.apiType })}
                    </p>
                  )}
                </div>
              )}

              {/* Base URL */}
              <div className="space-y-2">
                <Label htmlFor="resource-base-url">
                  {t('resource.apiUrl')}
                  {isCustomProvider && !baseUrl && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <Input
                  id="resource-base-url"
                  placeholder={
                    providerInfo?.configFields?.find((f) => f.key === "baseUrl")
                      ?.placeholder ?? "https://..."
                  }
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="font-mono text-sm"
                  autoComplete="off"
                />
                {providerInfo?.baseUrl && baseUrl !== providerInfo.baseUrl && (
                  <p className="text-xs text-muted-foreground">
                    {t('resource.apiUrlDefault', { url: providerInfo.baseUrl })}
                  </p>
                )}
                {providerInfo?.baseUrlHint && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t(`resource.baseUrlHint.${providerInfo.baseUrlHint}` as 'resource.baseUrlHint.zai')}
                  </p>
                )}
              </div>

              {/* Env Var Name (conditional — only for custom providers) */}
              {needsEnvVar && (
                <div className="space-y-2">
                  <Label htmlFor="resource-env">{t('resource.envVarName')}</Label>
                  <Input
                    id="resource-env"
                    placeholder="CUSTOM_API_KEY"
                    value={envVarName}
                    onChange={(e) => setEnvVarName(e.target.value)}
                    className="font-mono text-sm uppercase"
                    autoComplete="off"
                  />
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="resource-desc">{t('resource.descriptionOptional')}</Label>
                <Textarea
                  id="resource-desc"
                  placeholder={t('resource.descriptionPlaceholder')}
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

              {/* Default models preview (collapsible) */}
              {defaultModels.length > 0 && (
                <div className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-3 text-sm hover:bg-muted/50 transition-colors"
                    onClick={() => setModelsExpanded(!modelsExpanded)}
                  >
                    <span className="font-medium">
                      {t('resource.presetModels')}
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                        ({defaultModels.length})
                      </span>
                    </span>
                    {modelsExpanded ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  {modelsExpanded && (
                    <div className="border-t px-3 pb-3 space-y-1.5">
                      <p className="text-[11px] text-muted-foreground pt-2 pb-1">
                        {t('resource.manageModelsLater')}
                      </p>
                      {defaultModels.map((model) => (
                        <ModelPreviewRow key={model.id} model={model} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                createMutation.isPending ||
                !selectedProvider ||
                !name ||
                !apiKey
              }
            >
              {createMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ModelPreviewRow({ model }: { model: ModelDefinition }) {
  const t = useT()
  return (
    <div className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-medium truncate">{model.name || model.id}</span>
        {model.reasoning && (
          <Badge
            variant="secondary"
            className="gap-0.5 px-1 py-0 text-[9px] font-normal bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0"
          >
            <Brain className="size-2" />
            {t('resource.reasoning')}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
        {model.input?.includes("image") && (
          <Eye className="size-3" />
        )}
        {model.contextWindow && (
          <span className="flex items-center gap-0.5 tabular-nums">
            <TextCursorInput className="size-2.5" />
            {formatTokens(model.contextWindow)}
          </span>
        )}
        {model.cost && (
          <span className="flex items-center gap-0.5 tabular-nums">
            <Coins className="size-2.5" />
            ${model.cost.input}/{model.cost.output}
          </span>
        )}
      </div>
    </div>
  )
}
