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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Tag } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { usePublishSkillVersion } from "@/hooks/use-skills"

interface SkillPublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skillId: string
  currentVersion: string
}

export function SkillPublishDialog({
  open,
  onOpenChange,
  skillId,
  currentVersion,
}: SkillPublishDialogProps) {
  const t = useT()
  const [version, setVersion] = useState("")
  const [changelog, setChangelog] = useState("")

  const publishVersion = usePublishSkillVersion(skillId)

  function reset() {
    setVersion("")
    setChangelog("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await publishVersion.mutateAsync({
        version,
        changelog: changelog || undefined,
      })
      toast.success(t('skill.publishedMsg', { version }))
      reset()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('skill.publishFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Tag className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('skill.publishTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('skill.publishCurrentVersion', { version: currentVersion })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label className="text-[13px]">{t('skill.versionNumber')}</Label>
            <Input
              placeholder="1.0.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="font-mono text-[13px]"
              pattern="\d+\.\d+\.\d+"
              required
            />
            <p className="text-[12px] text-muted-foreground">
              {t('skill.versionHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px]">{t('skill.changelog')}</Label>
            <Textarea
              placeholder={t('skill.changelogPlaceholder')}
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              className="text-[13px] min-h-[100px]"
              maxLength={5000}
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
              disabled={publishVersion.isPending || !version}
            >
              {publishVersion.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('skill.publishButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
