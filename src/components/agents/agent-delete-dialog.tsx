"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { useDeleteAgent } from "@/hooks/use-agents"
import { useT } from "@/stores/language-store"
import type { AgentOverview } from "@/types/agent"

interface AgentDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: AgentOverview | null
}

export function AgentDeleteDialog({
  open,
  onOpenChange,
  agent,
}: AgentDeleteDialogProps) {
  const t = useT()
  const deleteAgent = useDeleteAgent()

  async function handleDelete() {
    if (!agent) return

    const compositeId = `${agent.instanceId}:${agent.id}`

    try {
      await deleteAgent.mutateAsync(compositeId)
      toast.success(t('agent.deletedMsg', { name: agent.name }))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('agent.deleteTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('agent.deleteDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed text-foreground/80">
          {t('agent.deleteConfirmMsg', { name: agent?.name ?? '', instance: agent?.instanceName ?? '' })}
        </div>
        <DialogFooter className="pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteAgent.isPending}
          >
            {deleteAgent.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {t('confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
