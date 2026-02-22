"use client"

import { useState, useCallback } from "react"
import { motion } from "motion/react"
import { Card, CardContent } from "@/components/ui/card"
import { UserPageHeader } from "@/components/users/user-page-header"
import { UserTable } from "@/components/users/user-table"
import { UserTableSkeleton } from "@/components/users/user-table-skeleton"
import { UserEmptyState } from "@/components/users/user-empty-state"
import { UserCreateDialog } from "@/components/users/user-create-dialog"
import { UserEditDialog } from "@/components/users/user-edit-dialog"
import { UserDeleteDialog } from "@/components/users/user-delete-dialog"
import { UserResetPasswordDialog } from "@/components/users/user-reset-password-dialog"
import { useUsers } from "@/hooks/use-users"
import { useAuthStore } from "@/stores/auth-store"
import { hasPermission } from "@/lib/auth/permissions"
import type { UserResponse } from "@/types/user"

export default function UsersPage() {
  const authUser = useAuthStore((s) => s.user)
  const canManage = authUser ? hasPermission(authUser.role, "users:create") : false

  const [search, setSearch] = useState("")
  const { data, isLoading } = useUsers({ search: search || undefined })

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserResponse | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserResponse | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<UserResponse | null>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [])

  const users = data?.users ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <UserPageHeader
        canManage={canManage}
        onCreateClick={() => setCreateOpen(true)}
        search={search}
        onSearchChange={handleSearchChange}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <UserTableSkeleton />
          ) : users.length === 0 ? (
            <UserEmptyState />
          ) : (
            <UserTable
              users={users}
              canManage={canManage}
              currentUserId={authUser?.id ?? ""}
              onEdit={setEditUser}
              onDelete={setDeleteUser}
              onResetPassword={setResetPasswordUser}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <UserCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <UserEditDialog
        open={!!editUser}
        onOpenChange={(open) => !open && setEditUser(null)}
        user={editUser}
      />
      <UserDeleteDialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
        user={deleteUser}
      />
      <UserResetPasswordDialog
        open={!!resetPasswordUser}
        onOpenChange={(open) => !open && setResetPasswordUser(null)}
        user={resetPasswordUser}
      />
    </motion.div>
  )
}
