"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { InstancePageHeader } from "@/components/instances/instance-page-header"
import { InstanceTable } from "@/components/instances/instance-table"
import { InstanceTableSkeleton } from "@/components/instances/instance-table-skeleton"
import { InstanceEmptyState } from "@/components/instances/instance-empty-state"
import { InstanceCreateDialog } from "@/components/instances/instance-create-dialog"
import { InstanceEditDialog } from "@/components/instances/instance-edit-dialog"
import { InstanceDeleteDialog } from "@/components/instances/instance-delete-dialog"
import { InstanceDetailSheet } from "@/components/instances/instance-detail-sheet"
import {
  useInstances,
  useStartInstance,
  useStopInstance,
  useRestartInstance,
} from "@/hooks/use-instances"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import { hasPermission } from "@/lib/auth/permissions"
import type { InstanceResponse } from "@/types/instance"

export default function InstancesPage() {
  const t = useT()
  const user = useAuthStore((s) => s.user)
  const canManage = user ? hasPermission(user.role, "instances:manage") : false

  const { data, isLoading } = useInstances()
  const startInstance = useStartInstance()
  const stopInstance = useStopInstance()
  const restartInstance = useRestartInstance()

  const [createOpen, setCreateOpen] = useState(false)
  const [editInstance, setEditInstance] = useState<InstanceResponse | null>(null)
  const [deleteInstance, setDeleteInstance] = useState<InstanceResponse | null>(null)
  const [detailInstance, setDetailInstance] = useState<InstanceResponse | null>(null)

  function handleStart(id: string) {
    startInstance.mutate(id, {
      onSuccess: () => toast.success(t('instance.starting')),
      onError: (err) =>
        toast.error(
          (err as { data?: { error?: string } })?.data?.error || t('instance.startFailed'),
        ),
    })
  }

  function handleStop(id: string) {
    stopInstance.mutate(id, {
      onSuccess: () => toast.success(t('instance.stopped')),
      onError: (err) =>
        toast.error(
          (err as { data?: { error?: string } })?.data?.error || t('instance.stopFailed'),
        ),
    })
  }

  function handleRestart(id: string) {
    restartInstance.mutate(id, {
      onSuccess: () => toast.success(t('instance.restarting')),
      onError: (err) =>
        toast.error(
          (err as { data?: { error?: string } })?.data?.error || t('instance.restartFailed'),
        ),
    })
  }

  const instances = data?.instances ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <InstancePageHeader
        canManage={canManage}
        onCreateClick={() => setCreateOpen(true)}
        instances={instances}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <InstanceTableSkeleton />
          ) : instances.length === 0 ? (
            <InstanceEmptyState />
          ) : (
            <InstanceTable
              instances={instances}
              canManage={canManage}
              onDetail={setDetailInstance}
              onEdit={setEditInstance}
              onDelete={setDeleteInstance}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <InstanceCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <InstanceEditDialog
        open={!!editInstance}
        onOpenChange={(open) => !open && setEditInstance(null)}
        instance={editInstance}
      />
      <InstanceDeleteDialog
        open={!!deleteInstance}
        onOpenChange={(open) => !open && setDeleteInstance(null)}
        instance={deleteInstance}
      />
      <InstanceDetailSheet
        open={!!detailInstance}
        onOpenChange={(open) => !open && setDetailInstance(null)}
        instance={detailInstance}
        canManage={canManage}
      />
    </motion.div>
  )
}
