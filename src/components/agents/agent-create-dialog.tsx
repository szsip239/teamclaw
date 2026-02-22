"use client"

import { useState, useMemo, useEffect, useRef } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Bot, Globe, Building2, UserCircle } from "lucide-react"
import { toast } from "sonner"
import { useCreateAgent } from "@/hooks/use-agents"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import type { AgentCategory } from "@/types/agent"

const CATEGORY_OPTIONS: { value: AgentCategory; labelKey: "agent.categoryDefault" | "agent.categoryDepartment" | "agent.categoryPersonal"; icon: typeof Globe; descKey: "agent.categoryDefaultDesc" | "agent.categoryDepartmentDesc" | "agent.categoryPersonalDesc"; roles: string[] }[] = [
  { value: "DEFAULT", labelKey: "agent.categoryDefault", icon: Globe, descKey: "agent.categoryDefaultDesc", roles: ["SYSTEM_ADMIN"] },
  { value: "DEPARTMENT", labelKey: "agent.categoryDepartment", icon: Building2, descKey: "agent.categoryDepartmentDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN"] },
  { value: "PERSONAL", labelKey: "agent.categoryPersonal", icon: UserCircle, descKey: "agent.categoryPersonalDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN", "USER"] },
]

interface AgentCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instances: { id: string; name: string; isDocker: boolean }[]
}

export function AgentCreateDialog({
  open,
  onOpenChange,
  instances,
}: AgentCreateDialogProps) {
  const t = useT()
  const user = useAuthStore((s) => s.user)
  const [instanceId, setInstanceId] = useState("")
  const [agentId, setAgentId] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [category, setCategory] = useState<AgentCategory | "">("")
  const userEditedWorkspace = useRef(false)

  const createAgent = useCreateAgent()

  // Determine if selected instance is Docker
  const selectedInstance = instances.find((i) => i.id === instanceId)
  const isDocker = selectedInstance?.isDocker ?? false

  // Compute suggested workspace path
  const suggestedWorkspace = useMemo(() => {
    if (!agentId) return ""
    return isDocker ? `/workspace/${agentId}` : `~/.openclaw/workspace-${agentId}`
  }, [agentId, isDocker])

  // Auto-fill workspace when suggestion changes (only if user hasn't manually edited)
  useEffect(() => {
    if (!userEditedWorkspace.current) {
      setWorkspace(suggestedWorkspace)
    }
  }, [suggestedWorkspace])

  // Filter available categories by user role
  const availableCategories = CATEGORY_OPTIONS.filter(
    (opt) => user && opt.roles.includes(user.role),
  )

  function reset() {
    setInstanceId("")
    setAgentId("")
    setWorkspace("")
    setCategory("")
    userEditedWorkspace.current = false
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      await createAgent.mutateAsync({
        instanceId,
        id: agentId,
        workspace: workspace || undefined,
        category: category || undefined,
      })
      toast.success(t('agent.createdMsg', { name: agentId }))
      reset()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Bot className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('agent.createTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('agent.createDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="instanceId" className="text-[13px]">
              {t('agent.targetInstance')}
            </Label>
            <Select value={instanceId} onValueChange={setInstanceId} required>
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
            <Label htmlFor="agentId" className="text-[13px]">
              Agent ID
            </Label>
            <Input
              id="agentId"
              placeholder="my-agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="font-mono text-[13px]"
              required
            />
            <p className="text-[12px] text-muted-foreground">
              {t('agent.agentIdHint')}
            </p>
          </div>
          {availableCategories.length > 1 && (
            <div className="space-y-2">
              <Label className="text-[13px]">{t('agent.visibilityScope')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {availableCategories.map((opt) => {
                  const isSelected = category === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "hover:border-muted-foreground/30 hover:bg-muted/50"
                      }`}
                      onClick={() => setCategory(opt.value)}
                    >
                      <opt.icon className={`size-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-[12px] font-medium ${isSelected ? "text-primary" : ""}`}>
                        {t(opt.labelKey)}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {t(opt.descKey)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="workspace" className="text-[13px]">
              {t('agent.workspace')}
              <span className="ml-1 text-muted-foreground">{t('optional')}</span>
            </Label>
            <Input
              id="workspace"
              placeholder={isDocker ? "/workspace/my-agent" : "~/.openclaw/workspace-my-agent"}
              value={workspace}
              onChange={(e) => {
                userEditedWorkspace.current = true
                setWorkspace(e.target.value)
              }}
              className="font-mono text-[13px]"
            />
            <p className="text-[12px] text-muted-foreground">
              {agentId
                ? t('agent.workspaceSuggest', { path: isDocker ? `/workspace/${agentId}` : `~/.openclaw/workspace-${agentId}` })
                : t('agent.workspaceHintAutoRecommend')}
            </p>
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
              disabled={createAgent.isPending || !instanceId || !agentId}
            >
              {createAgent.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
