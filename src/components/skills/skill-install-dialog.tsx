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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Download, Server, Bot, FolderOpen, Globe } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { useInstallSkill } from "@/hooks/use-skills"
import { useInstances } from "@/hooks/use-instances"
import { useAgents } from "@/hooks/use-agents"
import type { SkillDetail } from "@/types/skill"

interface SkillInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skill: SkillDetail | null
}

export function SkillInstallDialog({ open, onOpenChange, skill }: SkillInstallDialogProps) {
  const t = useT()
  const [instanceId, setInstanceId] = useState("")
  const [agentId, setAgentId] = useState("")
  const [installPath, setInstallPath] = useState<"workspace" | "global">("workspace")

  const installSkill = useInstallSkill(skill?.id ?? "")
  const { data: instancesData } = useInstances()
  const { data: agentsData } = useAgents(instanceId || undefined)

  const instances = instancesData?.instances ?? []
  const agents = instanceId ? (agentsData?.agents ?? []) : []

  function reset() {
    setInstanceId("")
    setAgentId("")
    setInstallPath("workspace")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!skill) return

    try {
      await installSkill.mutateAsync({ instanceId, agentId, installPath })
      toast.success(t('skill.installedMsg', { name: skill.name }))
      reset()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('skill.installFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Download className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('skill.installTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('skill.installDesc', { name: skill?.name ?? "Skill", version: skill?.version ?? '' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label className="text-[13px] flex items-center gap-1.5">
              <Server className="size-3.5" />
              {t('skill.targetInstance')}
            </Label>
            <Select
              value={instanceId}
              onValueChange={(v) => {
                setInstanceId(v)
                setAgentId("")
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('agent.selectInstance')} />
              </SelectTrigger>
              <SelectContent>
                {instances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] flex items-center gap-1.5">
              <Bot className="size-3.5" />
              {t('skill.targetAgent')}
            </Label>
            <Select value={agentId} onValueChange={setAgentId} disabled={!instanceId}>
              <SelectTrigger>
                <SelectValue placeholder={instanceId ? t('skill.selectAgent') : t('skill.selectInstanceFirst')} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={`${agent.instanceId}:${agent.id}`} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px]">{t('skill.installPath')}</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                  installPath === "workspace"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "hover:border-muted-foreground/30 hover:bg-muted/50"
                }`}
                onClick={() => setInstallPath("workspace")}
              >
                <FolderOpen className={`size-4 ${installPath === "workspace" ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[12px] font-medium ${installPath === "workspace" ? "text-primary" : ""}`}>
                  {t('skill.installWorkspace')}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {t('skill.installWorkspaceHint')}
                </span>
              </button>
              <button
                type="button"
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                  installPath === "global"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "hover:border-muted-foreground/30 hover:bg-muted/50"
                }`}
                onClick={() => setInstallPath("global")}
              >
                <Globe className={`size-4 ${installPath === "global" ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[12px] font-medium ${installPath === "global" ? "text-primary" : ""}`}>
                  {t('skill.installGlobal')}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {t('skill.installGlobalHint')}
                </span>
              </button>
            </div>
          </div>

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
              disabled={installSkill.isPending || !instanceId || !agentId}
            >
              {installSkill.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('install')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
