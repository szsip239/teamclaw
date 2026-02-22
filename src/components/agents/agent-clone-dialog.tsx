"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Loader2, Copy } from "lucide-react"
import { toast } from "sonner"
import { useCloneAgent } from "@/hooks/use-agents"
import { useT } from "@/stores/language-store"
import type { AgentOverview } from "@/types/agent"

interface AgentCloneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceAgent: AgentOverview | null
  instances: { id: string; name: string; isDocker: boolean }[]
}

export function AgentCloneDialog({
  open,
  onOpenChange,
  sourceAgent,
  instances,
}: AgentCloneDialogProps) {
  const t = useT()
  const [targetInstanceId, setTargetInstanceId] = useState("")
  const [newAgentId, setNewAgentId] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [copyFiles, setCopyFiles] = useState(true)

  const cloneAgent = useCloneAgent()
  const userEditedWorkspace = useRef(false)

  // Reset form when source agent changes
  useEffect(() => {
    if (sourceAgent) {
      setNewAgentId(sourceAgent.id + "-copy")
      setWorkspace("")
      setTargetInstanceId("")
      setCopyFiles(true)
      userEditedWorkspace.current = false
    }
  }, [sourceAgent])

  // Available target instances (exclude source)
  const targetInstances = instances.filter(
    (inst) => inst.id !== sourceAgent?.instanceId,
  )

  // Determine if target instance is Docker
  const targetInstance = instances.find((i) => i.id === targetInstanceId)
  const isDocker = targetInstance?.isDocker ?? false

  // Compute suggested workspace path
  const suggestedWorkspace = useMemo(() => {
    if (!newAgentId || !targetInstanceId) return ""
    return isDocker ? `/workspace/${newAgentId}` : `~/.openclaw/workspace-${newAgentId}`
  }, [newAgentId, targetInstanceId, isDocker])

  // Auto-fill workspace when suggestion changes
  useEffect(() => {
    if (!userEditedWorkspace.current && suggestedWorkspace) {
      setWorkspace(suggestedWorkspace)
    }
  }, [suggestedWorkspace])

  const idValid = /^[a-z0-9][a-z0-9_-]*$/.test(newAgentId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sourceAgent) return

    const sourceId = `${sourceAgent.instanceId}:${sourceAgent.id}`

    try {
      const result = await cloneAgent.mutateAsync({
        sourceId,
        targetInstanceId,
        newAgentId,
        workspace: workspace || undefined,
        copyFiles,
      })
      const filesMsg = result.filesCopied ? t('agent.withFiles') : ""
      toast.success(t('agent.clonedMsg', { name: newAgentId, files: filesMsg }))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('agent.cloneFailed')
      toast.error(message)
    }
  }

  if (!sourceAgent) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Copy className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('agent.cloneTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('agent.cloneDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Source (read-only) */}
          <div className="space-y-2">
            <Label className="text-[13px]">{t('agent.sourceAgent')}</Label>
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-[13px] font-mono text-muted-foreground">
              {sourceAgent.instanceName} / {sourceAgent.id}
            </div>
          </div>

          {/* Target instance */}
          <div className="space-y-2">
            <Label htmlFor="targetInstance" className="text-[13px]">
              {t('agent.targetInstance')}
            </Label>
            {targetInstances.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                {t('agent.noOtherInstances')}
              </p>
            ) : (
              <Select
                value={targetInstanceId}
                onValueChange={setTargetInstanceId}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('agent.selectTargetInstance')} />
                </SelectTrigger>
                <SelectContent>
                  {targetInstances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* New agent ID */}
          <div className="space-y-2">
            <Label htmlFor="newAgentId" className="text-[13px]">
              {t('agent.newAgentId')}
            </Label>
            <Input
              id="newAgentId"
              placeholder="my-agent-copy"
              value={newAgentId}
              onChange={(e) => setNewAgentId(e.target.value)}
              className="font-mono text-[13px]"
              required
            />
            {newAgentId && !idValid && (
              <p className="text-[12px] text-destructive">
                {t('agent.agentIdValidation')}
              </p>
            )}
          </div>

          {/* Workspace override */}
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
              {newAgentId && targetInstanceId
                ? t('agent.workspaceSuggest', { path: isDocker ? `/workspace/${newAgentId}` : `~/.openclaw/workspace-${newAgentId}` })
                : t('agent.workspaceHintAutoRecommend')}
            </p>
          </div>

          {/* Copy files toggle */}
          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <Label htmlFor="copyFiles" className="text-[13px] font-medium">
                {t('agent.copyWorkFiles')}
              </Label>
              <p className="text-[12px] text-muted-foreground">
                {t('agent.copyWorkFilesDesc')}
              </p>
            </div>
            <Switch
              id="copyFiles"
              checked={copyFiles}
              onCheckedChange={setCopyFiles}
            />
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
              disabled={
                cloneAgent.isPending ||
                !targetInstanceId ||
                !newAgentId ||
                !idValid ||
                targetInstances.length === 0
              }
            >
              {cloneAgent.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('agent.clone')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
