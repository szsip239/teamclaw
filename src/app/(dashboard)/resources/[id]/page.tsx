"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Loader2 } from "lucide-react"
import { ResourceDetailHeader } from "@/components/resources/resource-detail-header"
import { ResourceConfigPanel } from "@/components/resources/resource-config-panel"
import { ResourceModelPanel } from "@/components/resources/resource-model-panel"
import { ResourceEditDialog } from "@/components/resources/resource-edit-dialog"
import { ResourceDeleteDialog } from "@/components/resources/resource-delete-dialog"
import { useResource } from "@/hooks/use-resources"
import { useT } from "@/stores/language-store"

export default function ResourceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const t = useT()
  const { data: resource, isLoading } = useResource(id)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!resource) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">{t('resource.notFound')}</p>
      </div>
    )
  }

  const isModelType = resource.type === "MODEL"

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <ResourceDetailHeader
        resource={resource}
        onBack={() => router.push("/resources")}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <ResourceConfigPanel resource={resource} />

      {isModelType && <ResourceModelPanel resource={resource} />}

      {editOpen && (
        <ResourceEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          resource={resource}
        />
      )}

      {deleteOpen && (
        <ResourceDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          resource={resource}
          onDeleted={() => router.push("/resources")}
        />
      )}
    </motion.div>
  )
}
