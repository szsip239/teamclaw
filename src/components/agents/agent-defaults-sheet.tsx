"use client"

import { useState, useEffect } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  Save,
  Settings,
  Cpu,
  Shield,
  Wrench,
  Users,
  MessageSquare,
} from "lucide-react"
import { toast } from "sonner"
import { useAgentDefaults, useUpdateAgentDefaults } from "@/hooks/use-agents"
import { useT } from "@/stores/language-store"
import type { UpdateAgentDefaultsInput } from "@/lib/validations/agent"

interface AgentDefaultsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: string | null
  instanceName: string
}

export function AgentDefaultsSheet({
  open,
  onOpenChange,
  instanceId,
  instanceName,
}: AgentDefaultsSheetProps) {
  const t = useT()
  const { data, isLoading } = useAgentDefaults(open ? instanceId : null)
  const updateDefaults = useUpdateAgentDefaults(instanceId ?? "")

  const [modelPrimary, setModelPrimary] = useState("")
  const [modelThinking, setModelThinking] = useState("")
  const [sandboxMode, setSandboxMode] = useState("")
  const [sandboxScope, setSandboxScope] = useState("")
  const [sandboxAccess, setSandboxAccess] = useState("")
  const [toolsAllow, setToolsAllow] = useState("")
  const [toolsDeny, setToolsDeny] = useState("")
  const [subagentModel, setSubagentModel] = useState("")
  const [subagentMaxConcurrent, setSubagentMaxConcurrent] = useState("")
  const [sessionDmScope, setSessionDmScope] = useState("")
  const [bootstrapMaxChars, setBootstrapMaxChars] = useState("")

  useEffect(() => {
    if (!data?.defaults) return
    const d = data.defaults
    setModelPrimary(d.models?.primary ?? "")
    setModelThinking(d.models?.thinking ?? "")
    setSandboxMode(d.sandbox?.mode ?? "")
    setSandboxScope(d.sandbox?.scope ?? "")
    setSandboxAccess(d.sandbox?.workspaceAccess ?? "")
    setToolsAllow(d.tools?.allow?.join(", ") ?? "")
    setToolsDeny(d.tools?.deny?.join(", ") ?? "")
    setSubagentModel(d.subagents?.model ?? "")
    setSubagentMaxConcurrent(
      d.subagents?.maxConcurrent != null
        ? String(d.subagents.maxConcurrent)
        : "",
    )
    setSessionDmScope(d.session?.dmScope ?? "")
    setBootstrapMaxChars(
      d.bootstrapMaxChars != null ? String(d.bootstrapMaxChars) : "",
    )
  }, [data?.defaults])

  async function handleSave() {
    const payload: UpdateAgentDefaultsInput = {}
    if (modelPrimary || modelThinking) {
      payload.models = {}
      if (modelPrimary) payload.models.primary = modelPrimary
      if (modelThinking)
        payload.models.thinking = modelThinking as "off" | "low" | "medium" | "high"
    }
    if (sandboxMode || sandboxScope || sandboxAccess) {
      payload.sandbox = {}
      if (sandboxMode)
        payload.sandbox.mode = sandboxMode as "off" | "non-main" | "all"
      if (sandboxScope)
        payload.sandbox.scope = sandboxScope as "session" | "agent" | "shared"
      if (sandboxAccess)
        payload.sandbox.workspaceAccess = sandboxAccess as "rw" | "ro" | "none"
    }
    if (toolsAllow || toolsDeny) {
      payload.tools = {}
      if (toolsAllow)
        payload.tools.allow = toolsAllow
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      if (toolsDeny)
        payload.tools.deny = toolsDeny
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
    }
    if (subagentModel || subagentMaxConcurrent) {
      payload.subagents = {}
      if (subagentModel) payload.subagents.model = subagentModel
      if (subagentMaxConcurrent)
        payload.subagents.maxConcurrent = Number(subagentMaxConcurrent)
    }
    if (sessionDmScope) {
      payload.session = {
        dmScope: sessionDmScope as
          | "main"
          | "per-peer"
          | "per-channel-peer"
          | "per-account-channel-peer",
      }
    }
    if (bootstrapMaxChars) {
      payload.bootstrapMaxChars = Number(bootstrapMaxChars)
    }

    try {
      await updateDefaults.mutateAsync(payload)
      toast.success(t('agent.defaultsUpdated'))
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed'),
      )
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/60 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Settings className="size-4 text-muted-foreground" />
            </div>
            <div>
              <SheetTitle className="text-base">{t('agent.defaultsTitle')}</SheetTitle>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {t('agent.defaultsInstance', { name: instanceName })}
              </p>
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Models */}
            <Section icon={<Cpu className="size-3.5" />} title={t('agent.modelConfig')}>
              <div className="space-y-2">
                <Label className="text-[13px]">{t('agent.primaryModel')}</Label>
                <Input
                  value={modelPrimary}
                  onChange={(e) => setModelPrimary(e.target.value)}
                  placeholder="anthropic/claude-opus-4-6"
                  className="font-mono text-[13px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px]">{t('agent.thinkingMode')}</Label>
                <Select value={modelThinking} onValueChange={setModelThinking}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('agent.notSet')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">off</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Section>

            <Separator />

            {/* Sandbox */}
            <Section icon={<Shield className="size-3.5" />} title={t('agent.sandboxConfig')}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[13px]">{t('agent.sandboxMode')}</Label>
                  <Select value={sandboxMode} onValueChange={setSandboxMode}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('agent.notSet')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">off</SelectItem>
                      <SelectItem value="non-main">non-main</SelectItem>
                      <SelectItem value="all">all</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">{t('agent.sandboxScope')}</Label>
                  <Select value={sandboxScope} onValueChange={setSandboxScope}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('agent.notSet')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="session">session</SelectItem>
                      <SelectItem value="agent">agent</SelectItem>
                      <SelectItem value="shared">shared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[13px]">{t('agent.workspacePermission')}</Label>
                <Select value={sandboxAccess} onValueChange={setSandboxAccess}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('agent.notSet')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rw">{t('agent.rwReadWrite')}</SelectItem>
                    <SelectItem value="ro">{t('agent.roReadOnly')}</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Section>

            <Separator />

            {/* Tools */}
            <Section icon={<Wrench className="size-3.5" />} title={t('agent.toolsConfig')}>
              <div className="space-y-2">
                <Label className="text-[13px]">{t('agent.allowTools')}</Label>
                <Input
                  value={toolsAllow}
                  onChange={(e) => setToolsAllow(e.target.value)}
                  placeholder="tool1, tool2, ..."
                  className="font-mono text-[13px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px]">{t('agent.denyTools')}</Label>
                <Input
                  value={toolsDeny}
                  onChange={(e) => setToolsDeny(e.target.value)}
                  placeholder="tool1, tool2, ..."
                  className="font-mono text-[13px]"
                />
              </div>
            </Section>

            <Separator />

            {/* Subagents */}
            <Section
              icon={<Users className="size-3.5" />}
              title={t('agent.subAgent')}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[13px]">{t('agent.subAgentModel')}</Label>
                  <Input
                    value={subagentModel}
                    onChange={(e) => setSubagentModel(e.target.value)}
                    placeholder={t('agent.notSet')}
                    className="font-mono text-[13px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">{t('agent.maxConcurrency')}</Label>
                  <Input
                    type="number"
                    value={subagentMaxConcurrent}
                    onChange={(e) => setSubagentMaxConcurrent(e.target.value)}
                    placeholder="—"
                    min={1}
                  />
                </div>
              </div>
            </Section>

            <Separator />

            {/* Session */}
            <Section
              icon={<MessageSquare className="size-3.5" />}
              title={t('agent.sessionConfig')}
            >
              <div className="space-y-2">
                <Label className="text-[13px]">{t('agent.dmScope')}</Label>
                <Select
                  value={sessionDmScope}
                  onValueChange={setSessionDmScope}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('agent.notSet')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">main</SelectItem>
                    <SelectItem value="per-peer">per-peer</SelectItem>
                    <SelectItem value="per-channel-peer">
                      per-channel-peer
                    </SelectItem>
                    <SelectItem value="per-account-channel-peer">
                      per-account-channel-peer
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Section>

            <Separator />

            {/* Bootstrap */}
            <div className="space-y-2">
              <Label className="text-[13px]">{t('agent.bootstrapMaxChars')}</Label>
              <Input
                type="number"
                value={bootstrapMaxChars}
                onChange={(e) => setBootstrapMaxChars(e.target.value)}
                placeholder={t('agent.notSet')}
                min={0}
              />
            </div>

            {/* Save */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={updateDefaults.isPending}
                className="gap-2"
              >
                {updateDefaults.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {t('agent.saveDefaults')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground">{icon}</div>
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h4>
      </div>
      <div className="space-y-3 pl-0.5">{children}</div>
    </div>
  )
}
