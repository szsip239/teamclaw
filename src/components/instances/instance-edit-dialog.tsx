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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useUpdateInstance } from "@/hooks/use-instances"
import { useT } from "@/stores/language-store"
import type { InstanceResponse } from "@/types/instance"

interface InstanceEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instance: InstanceResponse | null
}

export function InstanceEditDialog({
  open,
  onOpenChange,
  instance,
}: InstanceEditDialogProps) {
  const t = useT()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [gatewayUrl, setGatewayUrl] = useState("")
  const [gatewayToken, setGatewayToken] = useState("")

  const updateInstance = useUpdateInstance(instance?.id ?? "")

  useEffect(() => {
    if (instance) {
      setName(instance.name)
      setDescription(instance.description || "")
      setGatewayUrl(instance.gatewayUrl)
      setGatewayToken("")
    }
  }, [instance])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!instance) return

    try {
      await updateInstance.mutateAsync({
        name,
        description: description || undefined,
        gatewayUrl,
        ...(gatewayToken ? { gatewayToken } : {}),
      })
      toast.success(t('instance.updateSuccess'))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('instance.updateFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Pencil className="size-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('instance.editTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('instance.editDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-[13px]">
              {t('instance.instanceName')}
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-[13px]">
              {t('description')}
              <span className="ml-1 text-muted-foreground">{t('optional')}</span>
            </Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-gatewayUrl" className="text-[13px]">
              Gateway URL
            </Label>
            <Input
              id="edit-gatewayUrl"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              className="font-mono text-[13px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-gatewayToken" className="text-[13px]">
              Gateway Token
            </Label>
            <Input
              id="edit-gatewayToken"
              type="password"
              placeholder={t('instance.tokenKeepEmpty')}
              value={gatewayToken}
              onChange={(e) => setGatewayToken(e.target.value)}
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
            <Button type="submit" disabled={updateInstance.isPending}>
              {updateInstance.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
