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
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Shield, X } from "lucide-react"
import { toast } from "sonner"
import { useInstances } from "@/hooks/use-instances"
import { useGrantAccess } from "@/hooks/use-instance-access"
import { useT } from "@/stores/language-store"

interface AccessGrantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departmentId: string
}

export function AccessGrantDialog({
  open,
  onOpenChange,
  departmentId,
}: AccessGrantDialogProps) {
  const [instanceId, setInstanceId] = useState("")
  const [limitAgents, setLimitAgents] = useState(false)
  const [agentInput, setAgentInput] = useState("")
  const [agentIds, setAgentIds] = useState<string[]>([])

  const t = useT()
  const { data: instanceData } = useInstances()
  const grantAccess = useGrantAccess()

  const instances = instanceData?.instances ?? []

  function reset() {
    setInstanceId("")
    setLimitAgents(false)
    setAgentInput("")
    setAgentIds([])
  }

  function addAgent() {
    const id = agentInput.trim()
    if (id && !agentIds.includes(id)) {
      setAgentIds([...agentIds, id])
      setAgentInput("")
    }
  }

  function removeAgent(id: string) {
    setAgentIds(agentIds.filter((a) => a !== id))
  }

  function handleAgentKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      addAgent()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      await grantAccess.mutateAsync({
        departmentId,
        instanceId,
        agentIds: limitAgents ? agentIds : null,
      })
      toast.success(t('dept.grantSuccess'))
      reset()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('dept.grantFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Shield className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('dept.grantAccessTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('dept.grantAccessDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label className="text-[13px]">{t('dept.selectInstanceLabel')}</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger className="text-[13px]">
                <SelectValue placeholder={t('dept.selectInstancePlaceholder')} />
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[13px]">{t('dept.agentScope')}</Label>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="limit-agents"
                  className="text-[12px] text-muted-foreground"
                >
                  {t('dept.limitSpecificAgents')}
                </Label>
                <Switch
                  id="limit-agents"
                  checked={limitAgents}
                  onCheckedChange={setLimitAgents}
                />
              </div>
            </div>
            {!limitAgents && (
              <p className="text-[12px] text-muted-foreground">
                {t('dept.allAgentsAccess')}
              </p>
            )}
            {limitAgents && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                  <Input
                    placeholder={t('dept.agentIdPlaceholder')}
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onKeyDown={handleAgentKeyDown}
                    className="text-[13px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAgent}
                    disabled={!agentInput.trim()}
                  >
                    {t('add')}
                  </Button>
                </div>
                {agentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {agentIds.map((id) => (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="gap-1 pr-1 text-[12px]"
                      >
                        {id}
                        <button
                          type="button"
                          onClick={() => removeAgent(id)}
                          className="rounded-sm hover:bg-muted"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              disabled={grantAccess.isPending || !instanceId}
            >
              {grantAccess.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('dept.confirmGrant')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
