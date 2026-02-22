"use client"

import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Bot, Copy, Star, Server, Cpu, Shield, Globe, Building2, UserCircle } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { AgentOverview } from "@/types/agent"

const CATEGORY_CONFIG = {
  DEFAULT: { labelKey: "agent.categoryDefault" as const, icon: Globe, className: "text-blue-600 border-blue-500/20 dark:text-blue-400" },
  DEPARTMENT: { labelKey: "agent.categoryDepartment" as const, icon: Building2, className: "text-emerald-600 border-emerald-500/20 dark:text-emerald-400" },
  PERSONAL: { labelKey: "agent.categoryPersonal" as const, icon: UserCircle, className: "text-violet-600 border-violet-500/20 dark:text-violet-400" },
} as const

interface AgentCardProps {
  agent: AgentOverview
  index: number
  onClick: (agent: AgentOverview) => void
  onClone?: (agent: AgentOverview) => void
}

export function AgentCard({ agent, index, onClick, onClone }: AgentCardProps) {
  const t = useT()
  const modelName = agent.models?.primary
    ? agent.models.primary.split("/").pop()
    : undefined

  const categoryInfo = agent.category ? CATEGORY_CONFIG[agent.category] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="group cursor-pointer rounded-xl border bg-card p-5 ring-1 ring-black/[0.03] transition-all hover:ring-primary/20 hover:shadow-sm dark:ring-white/[0.06] dark:hover:ring-primary/30"
      onClick={() => onClick(agent)}
    >
      {/* Header: Icon + name + badge */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/60 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            <Bot className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold leading-tight">
                {agent.name}
              </span>
              {agent.isDefault && (
                <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Server className="size-2.5" />
              <span className="truncate">{agent.instanceName}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {categoryInfo && (
            <Badge
              variant="outline"
              className={`gap-1 px-2 py-0.5 text-[11px] font-normal ${categoryInfo.className}`}
            >
              <categoryInfo.icon className="size-2.5" />
              {t(categoryInfo.labelKey)}
            </Badge>
          )}
          {agent.isDefault && !categoryInfo && (
            <Badge
              variant="outline"
              className="px-2 py-0.5 text-[11px] font-normal text-amber-600 border-amber-500/20 dark:text-amber-400"
            >
              {t('agent.isDefault')}
            </Badge>
          )}
        </div>
      </div>

      {/* Category detail (department name or owner) */}
      {agent.category === "DEPARTMENT" && agent.departmentName && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Building2 className="size-2.5" />
          <span className="truncate">{agent.departmentName}</span>
        </div>
      )}
      {agent.category === "PERSONAL" && agent.ownerName && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
          <UserCircle className="size-2.5" />
          <span className="truncate">{agent.ownerName}</span>
        </div>
      )}

      {/* Info row */}
      <div className="mt-3.5 space-y-1.5 text-[12px] text-muted-foreground">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-mono opacity-60">~/</span>
          <span className="truncate font-mono">
            {agent.workspace.replace(/^~\//, "")}
          </span>
        </div>
      </div>

      {/* Tags + Clone button */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {modelName && (
            <Badge
              variant="secondary"
              className="gap-1 px-2 py-0 text-[11px] font-normal"
            >
              <Cpu className="size-2.5" />
              {modelName}
            </Badge>
          )}
          {agent.sandbox?.mode && agent.sandbox.mode !== "off" && (
            <Badge
              variant="secondary"
              className="gap-1 px-2 py-0 text-[11px] font-normal"
            >
              <Shield className="size-2.5" />
              sandbox: {agent.sandbox.mode}
            </Badge>
          )}
        </div>
        {onClone && (
          <button
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-muted hover:text-primary group-hover:opacity-100"
            title={t('agent.cloneToInstance')}
            onClick={(e) => {
              e.stopPropagation()
              onClone(agent)
            }}
          >
            <Copy className="size-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  )
}

export { CATEGORY_CONFIG }
