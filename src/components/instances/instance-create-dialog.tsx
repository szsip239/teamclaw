"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Separator } from "@/components/ui/separator"
import { Loader2, Server, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { useCreateInstance } from "@/hooks/use-instances"

interface InstanceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Mode = "docker" | "external"

export function InstanceCreateDialog({
  open,
  onOpenChange,
}: InstanceCreateDialogProps) {
  const t = useT()
  const [mode, setMode] = useState<Mode>("docker")

  // Common fields
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Docker mode fields
  const [imageName, setImageName] = useState("")
  const [useCustomApiKey, setUseCustomApiKey] = useState(false)
  const [providerName, setProviderName] = useState("anthropic")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [memoryLimit, setMemoryLimit] = useState("")
  const [restartPolicy, setRestartPolicy] = useState("unless-stopped")

  // External mode fields
  const [gatewayUrl, setGatewayUrl] = useState("")
  const [gatewayToken, setGatewayToken] = useState("")

  const createInstance = useCreateInstance()

  function reset() {
    setMode("docker")
    setName("")
    setDescription("")
    setImageName("")
    setUseCustomApiKey(false)
    setProviderName("anthropic")
    setApiKey("")
    setBaseUrl("")
    setShowAdvanced(false)
    setMemoryLimit("")
    setRestartPolicy("unless-stopped")
    setGatewayUrl("")
    setGatewayToken("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const payload: Record<string, unknown> = {
      name,
      description: description || undefined,
      mode,
    }

    if (mode === "docker") {
      // Docker-specific payload
      const docker: Record<string, unknown> = {}
      if (imageName) docker.imageName = imageName
      if (memoryLimit) docker.memoryLimit = parseInt(memoryLimit, 10) * 1024 * 1024 // MB → bytes
      if (restartPolicy !== "unless-stopped") docker.restartPolicy = restartPolicy
      if (Object.keys(docker).length > 0) payload.docker = docker

      if (useCustomApiKey && apiKey) {
        payload.modelProvider = {
          name: providerName,
          apiKey,
          api: providerName === "anthropic" ? "anthropic-messages" : undefined,
          baseUrl: baseUrl || undefined,
        }
      }
    } else {
      // External-specific payload
      payload.gatewayUrl = gatewayUrl
      payload.gatewayToken = gatewayToken
    }

    try {
      await createInstance.mutateAsync(payload as unknown as Parameters<typeof createInstance.mutateAsync>[0])
      toast.success(t('instance.createSuccess'), {
        description:
          mode === "docker"
            ? t('instance.dockerStarting')
            : t('instance.externalConnected'),
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('instance.createFailed')
      toast.error(message)
    }
  }

  const isDockerValid = name.length >= 2
  const isExternalValid = name.length >= 2 && gatewayUrl.length > 0 && gatewayToken.length > 0
  const isValid = mode === "docker" ? isDockerValid : isExternalValid

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Server className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('instance.createTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('instance.createDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Mode Tabs */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="docker">{t('instance.dockerContainer')}</TabsTrigger>
              <TabsTrigger value="external">{t('instance.externalGateway')}</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Common Fields */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[13px]">
              {t('instance.instanceName')}
            </Label>
            <Input
              id="name"
              placeholder="prod-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <p className="text-[12px] text-muted-foreground">
              {t('instance.nameHint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-[13px]">
              {t('description')}
              <span className="ml-1 text-muted-foreground">{t('optional')}</span>
            </Label>
            <Textarea
              id="description"
              placeholder={t('instance.productionMain')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <Separator />

          {/* Docker Mode Fields */}
          {mode === "docker" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="imageName" className="text-[13px]">
                  {t('instance.dockerImage')}
                </Label>
                <Input
                  id="imageName"
                  placeholder="alpine/openclaw:latest"
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  className="font-mono text-[13px]"
                />
                <p className="text-[12px] text-muted-foreground">
                  {t('instance.dockerImageHint')}
                </p>
              </div>

              {/* Model Provider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[13px]">{t('instance.modelConfig')}</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="custom-key" className="text-[12px] text-muted-foreground">
                      {t('instance.customApiKey')}
                    </Label>
                    <Switch
                      id="custom-key"
                      checked={useCustomApiKey}
                      onCheckedChange={setUseCustomApiKey}
                    />
                  </div>
                </div>
                {!useCustomApiKey && (
                  <p className="text-[12px] text-muted-foreground">
                    {t('instance.useGlobalKey')}
                  </p>
                )}
                {useCustomApiKey && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="space-y-2">
                      <Label htmlFor="provider" className="text-[12px]">
                        Provider
                      </Label>
                      <Select value={providerName} onValueChange={setProviderName}>
                        <SelectTrigger className="text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="custom">{t('custom')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiKey" className="text-[12px]">
                        API Key
                      </Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="sk-ant-..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="font-mono text-[13px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="baseUrl" className="text-[12px]">
                        Base URL
                        <span className="ml-1 text-muted-foreground">{t('optional')}</span>
                      </Label>
                      <Input
                        id="baseUrl"
                        placeholder="https://api.anthropic.com"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        className="font-mono text-[13px]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Advanced Options */}
              <button
                type="button"
                className="flex w-full items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <ChevronDown
                  className={`size-3.5 transition-transform ${showAdvanced ? "rotate-0" : "-rotate-90"}`}
                />
                {t('instance.advancedOptions')}
              </button>
              {showAdvanced && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-2">
                    <Label htmlFor="memoryLimit" className="text-[12px]">
                      {t('instance.memoryLimit')}
                    </Label>
                    <Input
                      id="memoryLimit"
                      type="number"
                      placeholder="512"
                      min={128}
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(e.target.value)}
                      className="text-[13px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="restartPolicy" className="text-[12px]">
                      {t('instance.restartPolicy')}
                    </Label>
                    <Select value={restartPolicy} onValueChange={setRestartPolicy}>
                      <SelectTrigger className="text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unless-stopped">unless-stopped</SelectItem>
                        <SelectItem value="always">always</SelectItem>
                        <SelectItem value="on-failure">on-failure</SelectItem>
                        <SelectItem value="no">no</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* External Mode Fields */}
          {mode === "external" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gatewayUrl" className="text-[13px]">
                  Gateway URL
                </Label>
                <Input
                  id="gatewayUrl"
                  placeholder="ws://10.0.1.1:18789"
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  className="font-mono text-[13px]"
                  required={mode === "external"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gatewayToken" className="text-[13px]">
                  Gateway Token
                </Label>
                <Input
                  id="gatewayToken"
                  type="password"
                  placeholder={t('instance.gatewayTokenPlaceholder')}
                  value={gatewayToken}
                  onChange={(e) => setGatewayToken(e.target.value)}
                  required={mode === "external"}
                />
              </div>
              <p className="text-[12px] text-muted-foreground">
                {t('instance.externalGatewayHint')}
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createInstance.isPending || !isValid}
            >
              {createInstance.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {mode === "docker" ? t('instance.createAndDeploy') : t('instance.connect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
