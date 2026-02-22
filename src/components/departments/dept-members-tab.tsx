"use client"

import { motion } from "motion/react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Users } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"

interface Member {
  id: string
  name: string
  email: string
  role: string
  status: string
  avatar: string | null
}

interface DeptMembersTabProps {
  members: Member[]
}

const roleLabelKeys: Record<string, TranslationKey> = {
  SYSTEM_ADMIN: "user.roleSystemAdmin",
  DEPT_ADMIN: "user.roleDeptAdmin",
  USER: "user.roleUser",
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  INACTIVE: "bg-zinc-500/10 text-zinc-500",
  SUSPENDED: "bg-red-500/10 text-red-600 dark:text-red-400",
}

export function DeptMembersTab({ members }: DeptMembersTabProps) {
  const t = useT()

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="size-8 text-muted-foreground/40" />
        <p className="mt-3 text-[13px] text-muted-foreground">{t('dept.noMembers')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {members.map((member, index) => (
        <motion.div
          key={member.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: index * 0.03 }}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40"
        >
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium bg-muted">
              {member.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {member.name}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${statusColors[member.status] || ""}`}
              >
                {member.status === "ACTIVE" ? t('dept.memberActive') : member.status === "INACTIVE" ? t('dept.memberInactive') : t('dept.memberDisabled')}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[12px] text-muted-foreground truncate">
                {member.email}
              </span>
              <span className="text-[11px] text-muted-foreground/60">
                {roleLabelKeys[member.role] ? t(roleLabelKeys[member.role]) : member.role}
              </span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
