"use client"

import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Plus, Building2, Users, Shield } from "lucide-react"
import type { DepartmentResponse } from "@/types/department"
import { useT } from "@/stores/language-store"

interface DeptPageHeaderProps {
  canManage: boolean
  onCreateClick: () => void
  departments?: DepartmentResponse[]
}

export function DeptPageHeader({
  canManage,
  onCreateClick,
  departments = [],
}: DeptPageHeaderProps) {
  const t = useT()
  const total = departments.length
  const totalUsers = departments.reduce((sum, d) => sum + d.userCount, 0)
  const totalAccess = departments.reduce((sum, d) => sum + d.accessCount, 0)

  return (
    <div className="flex items-start justify-between">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="from-primary/20 via-primary/10 to-primary/5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            <Building2 className="text-primary size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('dept.management')}</h1>
            <p className="text-muted-foreground text-[13px]">
              {t('dept.managementDesc')}
            </p>
          </div>
        </div>

        {total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="flex items-center gap-4 pl-0.5"
          >
            <StatPill
              icon={<Building2 className="size-3" />}
              value={total}
              label={t('dept.deptCount')}
              color="text-blue-600 dark:text-blue-400"
            />
            <StatPill
              icon={<Users className="size-3" />}
              value={totalUsers}
              label={t('dept.memberCount')}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <StatPill
              icon={<Shield className="size-3" />}
              value={totalAccess}
              label={t('dept.accessCount')}
              color="text-amber-600 dark:text-amber-400"
            />
          </motion.div>
        )}
      </div>

      {canManage && (
        <Button onClick={onCreateClick} className="gap-2 shadow-sm">
          <Plus className="size-4" />
          {t('dept.createDept')}
        </Button>
      )}
    </div>
  )
}

function StatPill({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode
  value: number
  label: string
  color: string
}) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      {icon}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
