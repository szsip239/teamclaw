"use client"

import { use } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { SkillDetailHeader } from "@/components/skills/skill-detail-header"
import { SkillIdeLayout } from "@/components/skills/skill-ide-layout"
import { SkillInstallDialog } from "@/components/skills/skill-install-dialog"
import { SkillPublishDialog } from "@/components/skills/skill-publish-dialog"
import { SkillEditDialog } from "@/components/skills/skill-edit-dialog"
import { useSkill, useDeleteSkill, useSkillCheckUpgrade, useCheckClawHubUpdate } from "@/hooks/use-skills"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const t = useT()
  const { data: skill, isLoading } = useSkill(id)
  const { data: upgradeData } = useSkillCheckUpgrade(id)
  const deleteSkill = useDeleteSkill()
  const checkClawHub = useCheckClawHubUpdate(id, skill?.source ?? null)

  const [installOpen, setInstallOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  // Permission check
  const canEdit = !!(
    user &&
    skill &&
    (user.role === "SYSTEM_ADMIN" ||
      (skill.category === "PERSONAL" && skill.creatorName === user.name) ||
      (skill.category === "DEPARTMENT" && user.role === "DEPT_ADMIN"))
  )

  async function handleDelete() {
    if (!skill) return
    try {
      await deleteSkill.mutateAsync(skill.id)
      toast.success(t('skill.deletedMsg', { name: skill.name }))
      router.push("/skills")
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!skill) {
    return (
      <div className="flex items-center justify-center flex-1">
        <p className="text-muted-foreground">{t('skill.notFound')}</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-4 p-6 min-h-0"
    >
      <SkillDetailHeader
        skill={skill}
        canEdit={canEdit}
        upgradeableCount={upgradeData?.upgradeableCount ?? 0}
        isCheckingUpdate={checkClawHub.isPending}
        hasClawHubUpdate={checkClawHub.data?.hasUpdate ?? null}
        latestVersion={checkClawHub.data?.latestVersion}
        clawhubUrl={checkClawHub.data?.clawhubUrl}
        onBack={() => router.push("/skills")}
        onInstall={() => setInstallOpen(true)}
        onPublish={() => setPublishOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onEdit={() => setEditOpen(true)}
        onUpgrade={() => {
          const installTab = document.querySelector('[value="installations"]') as HTMLElement
          installTab?.click()
        }}
        onCheckClawHubUpdate={
          skill.source === 'CLAWHUB'
            ? () => checkClawHub.mutate()
            : undefined
        }
      />

      <SkillIdeLayout skill={skill} canEdit={canEdit} />

      {/* Install dialog */}
      <SkillInstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        skill={skill}
      />

      {/* Publish dialog */}
      <SkillPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        skillId={skill.id}
        currentVersion={skill.version}
      />

      {/* Edit dialog */}
      <SkillEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        skill={skill}
      />

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('skill.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('skill.deleteConfirmMsg', { name: skill.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSkill.isPending}
            >
              {deleteSkill.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
