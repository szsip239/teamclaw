"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { Card, CardContent } from "@/components/ui/card"
import { DeptPageHeader } from "@/components/departments/dept-page-header"
import { DeptTable } from "@/components/departments/dept-table"
import { DeptTableSkeleton } from "@/components/departments/dept-table-skeleton"
import { DeptEmptyState } from "@/components/departments/dept-empty-state"
import { DeptCreateDialog } from "@/components/departments/dept-create-dialog"
import { DeptEditDialog } from "@/components/departments/dept-edit-dialog"
import { DeptDeleteDialog } from "@/components/departments/dept-delete-dialog"
import { DeptDetailSheet } from "@/components/departments/dept-detail-sheet"
import { useDepartments } from "@/hooks/use-departments"
import { useAuthStore } from "@/stores/auth-store"
import { hasPermission } from "@/lib/auth/permissions"
import type { DepartmentResponse } from "@/types/department"

export default function DepartmentsPage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user ? hasPermission(user.role, "departments:manage") : false

  const { data, isLoading } = useDepartments()

  const [createOpen, setCreateOpen] = useState(false)
  const [editDept, setEditDept] = useState<DepartmentResponse | null>(null)
  const [deleteDept, setDeleteDept] = useState<DepartmentResponse | null>(null)
  const [detailDept, setDetailDept] = useState<DepartmentResponse | null>(null)

  const departments = data?.departments ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <DeptPageHeader
        canManage={canManage}
        onCreateClick={() => setCreateOpen(true)}
        departments={departments}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <DeptTableSkeleton />
          ) : departments.length === 0 ? (
            <DeptEmptyState />
          ) : (
            <DeptTable
              departments={departments}
              canManage={canManage}
              onDetail={setDetailDept}
              onEdit={setEditDept}
              onDelete={setDeleteDept}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <DeptCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <DeptEditDialog
        open={!!editDept}
        onOpenChange={(open) => !open && setEditDept(null)}
        department={editDept}
      />
      <DeptDeleteDialog
        open={!!deleteDept}
        onOpenChange={(open) => !open && setDeleteDept(null)}
        department={deleteDept}
      />
      <DeptDetailSheet
        open={!!detailDept}
        onOpenChange={(open) => !open && setDetailDept(null)}
        department={detailDept}
        canManage={canManage}
      />
    </motion.div>
  )
}
