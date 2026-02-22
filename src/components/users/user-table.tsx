"use client"

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UserTableRow } from "./user-table-row"
import type { UserResponse } from "@/types/user"
import { useT } from "@/stores/language-store"

interface UserTableProps {
  users: UserResponse[]
  canManage: boolean
  currentUserId: string
  onEdit: (user: UserResponse) => void
  onDelete: (user: UserResponse) => void
  onResetPassword: (user: UserResponse) => void
}

const headClass =
  "text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60"

export function UserTable({
  users,
  canManage,
  currentUserId,
  onEdit,
  onDelete,
  onResetPassword,
}: UserTableProps) {
  const t = useT()

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b-0">
          <TableHead className={`${headClass} pl-4`}>{t('user.tableUser')}</TableHead>
          <TableHead className={headClass}>{t('user.tableEmail')}</TableHead>
          <TableHead className={`${headClass} w-28`}>{t('user.tableRole')}</TableHead>
          <TableHead className={headClass}>{t('user.tableDepartment')}</TableHead>
          <TableHead className={`${headClass} w-20`}>{t('user.tableStatus')}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user, index) => (
          <UserTableRow
            key={user.id}
            user={user}
            index={index}
            canManage={canManage}
            isSelf={user.id === currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            onResetPassword={onResetPassword}
          />
        ))}
      </TableBody>
    </Table>
  )
}
