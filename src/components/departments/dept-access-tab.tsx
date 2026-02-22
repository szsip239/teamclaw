"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Shield, Trash2, Server } from "lucide-react"
import { AccessGrantDialog } from "./access-grant-dialog"
import { AccessRevokeDialog } from "./access-revoke-dialog"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"

interface AccessGrant {
  id: string
  instanceId: string
  instanceName: string
  instanceStatus: string
  agentIds: string[] | null
  grantedByName: string
  createdAt: string
}

interface DeptAccessTabProps {
  departmentId: string
  grants: AccessGrant[]
  canManage: boolean
}

const statusBadge: Record<string, { labelKey: TranslationKey; className: string }> = {
  ONLINE: {
    labelKey: "dept.accessOnline",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  OFFLINE: {
    labelKey: "dept.accessOffline",
    className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  },
  ERROR: {
    labelKey: "dept.accessError",
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  DEGRADED: {
    labelKey: "dept.accessDegraded",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
}

export function DeptAccessTab({
  departmentId,
  grants,
  canManage,
}: DeptAccessTabProps) {
  const t = useT()
  const [grantOpen, setGrantOpen] = useState(false)
  const [revokeGrant, setRevokeGrant] = useState<AccessGrant | null>(null)

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[13px]"
            onClick={() => setGrantOpen(true)}
          >
            <Plus className="size-3.5" />
            {t('dept.grantAccess')}
          </Button>
        </div>
      )}

      {grants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield className="size-8 text-muted-foreground/40" />
          <p className="mt-3 text-[13px] text-muted-foreground">
            {t('dept.noAccess')}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {grants.map((grant, index) => {
            const status = statusBadge[grant.instanceStatus] || statusBadge.OFFLINE
            return (
              <motion.div
                key={grant.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70">
                  <Server className="size-3.5 text-muted-foreground/60" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {grant.instanceName}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${status.className}`}
                    >
                      {t(status.labelKey)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[12px] text-muted-foreground">
                    <span>
                      {grant.agentIds
                        ? t('dept.agentCount', { n: grant.agentIds.length })
                        : t('dept.allAgents')}
                    </span>
                    <span className="text-muted-foreground/40">|</span>
                    <span>{t('dept.grantedBy', { name: grant.grantedByName })}</span>
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setRevokeGrant(grant)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      <AccessGrantDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        departmentId={departmentId}
      />
      <AccessRevokeDialog
        open={!!revokeGrant}
        onOpenChange={(open) => !open && setRevokeGrant(null)}
        grant={revokeGrant}
      />
    </div>
  )
}
