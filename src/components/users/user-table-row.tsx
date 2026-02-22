"use client"

import { motion } from "motion/react"
import { TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Pencil, Ban, KeyRound } from "lucide-react"
import type { UserResponse } from "@/types/user"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"

interface UserTableRowProps {
  user: UserResponse
  index: number
  canManage: boolean
  isSelf: boolean
  onEdit: (user: UserResponse) => void
  onDelete: (user: UserResponse) => void
  onResetPassword: (user: UserResponse) => void
}

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  SYSTEM_ADMIN: "user.roleSystemAdmin",
  DEPT_ADMIN: "user.roleDeptAdmin",
  USER: "user.roleUser",
}

const ROLE_COLORS: Record<string, string> = {
  SYSTEM_ADMIN: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  DEPT_ADMIN: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  USER: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function UserTableRow({
  user,
  index,
  canManage,
  isSelf,
  onEdit,
  onDelete,
  onResetPassword,
}: UserTableRowProps) {
  const t = useT()
  const isActive = user.status === "ACTIVE"

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      className="group border-b transition-colors hover:bg-muted/40"
    >
      {/* User avatar + name */}
      <TableCell className="py-3 pl-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${getAvatarColor(user.name)}`}
          >
            {getInitial(user.name)}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-none tracking-tight">
              {user.name}
            </span>
            {isSelf && (
              <span className="text-muted-foreground/50 text-[11px]">
                {t('user.self')}
              </span>
            )}
          </div>
        </div>
      </TableCell>

      {/* Email */}
      <TableCell className="py-3">
        <span className="text-muted-foreground text-[13px]">{user.email}</span>
      </TableCell>

      {/* Role */}
      <TableCell className="py-3">
        <Badge
          variant="outline"
          className={`text-[11px] font-medium ${ROLE_COLORS[user.role] ?? ""}`}
        >
          {ROLE_LABEL_KEYS[user.role] ? t(ROLE_LABEL_KEYS[user.role]) : user.role}
        </Badge>
      </TableCell>

      {/* Department */}
      <TableCell className="py-3">
        <span className="text-muted-foreground text-[13px]">
          {user.departmentName || "—"}
        </span>
      </TableCell>

      {/* Status */}
      <TableCell className="py-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`size-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span className="text-xs text-muted-foreground">
            {isActive ? t('user.statusActive') : t('user.statusDisabled')}
          </span>
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3 pr-2" onClick={(e) => e.stopPropagation()}>
        {canManage && (
          <div className="opacity-0 transition-opacity group-hover:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="size-7 p-0">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEdit(user)}>
                  <Pencil className="mr-2 size-3.5" />
                  {t('edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onResetPassword(user)}>
                  <KeyRound className="mr-2 size-3.5" />
                  {t('user.resetPassword')}
                </DropdownMenuItem>
                {!isSelf && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(user)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="mr-2 size-3.5" />
                      {t('user.disable')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </TableCell>
    </motion.tr>
  )
}
