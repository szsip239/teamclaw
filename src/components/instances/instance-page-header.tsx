"use client"

import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Plus, Activity, Server, Power, AlertTriangle } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { InstanceResponse } from "@/types/instance"

interface InstancePageHeaderProps {
  canManage: boolean
  onCreateClick: () => void
  instances?: InstanceResponse[]
}

export function InstancePageHeader({
  canManage,
  onCreateClick,
  instances = [],
}: InstancePageHeaderProps) {
  const t = useT()
  const onlineCount = instances.filter((i) => i.status === "ONLINE").length
  const offlineCount = instances.filter((i) => i.status === "OFFLINE").length
  const errorCount = instances.filter(
    (i) => i.status === "ERROR" || i.status === "DEGRADED",
  ).length
  const total = instances.length

  return (
    <div className="flex items-start justify-between">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="from-primary/20 via-primary/10 to-primary/5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            <Server className="text-primary size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('instance.management')}</h1>
            <p className="text-muted-foreground text-[13px]">
              {t('instance.managementDesc')}
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
              icon={<Activity className="size-3" />}
              value={onlineCount}
              label={t('instance.online')}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <StatPill
              icon={<Power className="size-3" />}
              value={offlineCount}
              label={t('instance.offline')}
              color="text-zinc-500 dark:text-zinc-400"
            />
            {errorCount > 0 && (
              <StatPill
                icon={<AlertTriangle className="size-3" />}
                value={errorCount}
                label={t('instance.abnormal')}
                color="text-amber-600 dark:text-amber-400"
              />
            )}
          </motion.div>
        )}
      </div>

      {canManage && (
        <Button onClick={onCreateClick} className="gap-2 shadow-sm">
          <Plus className="size-4" />
          {t('instance.create')}
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
