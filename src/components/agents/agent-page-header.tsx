"use client"

import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Bot, Server, Globe, Building2, UserCircle } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { AgentOverview, AgentCategory } from "@/types/agent"

interface AgentPageHeaderProps {
  canCreate: boolean
  onCreateClick: () => void
  agents: AgentOverview[]
  instanceFilter: string
  onInstanceFilterChange: (value: string) => void
  categoryFilter: string
  onCategoryFilterChange: (value: string) => void
  instanceNames: { id: string; name: string; isDocker: boolean }[]
}

export function AgentPageHeader({
  canCreate,
  onCreateClick,
  agents,
  instanceFilter,
  onInstanceFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  instanceNames,
}: AgentPageHeaderProps) {
  const t = useT()
  const total = agents.length
  const instanceCount = new Set(agents.map((a) => a.instanceId)).size

  return (
    <div className="flex items-start justify-between">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="from-primary/20 via-primary/10 to-primary/5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            <Bot className="text-primary size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('agent.management')}
            </h1>
            <p className="text-muted-foreground text-[13px]">
              {t('agent.managementDesc')}
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
              icon={<Bot className="size-3" />}
              value={total}
              label={t('agent.total')}
              color="text-foreground"
            />
            <StatPill
              icon={<Server className="size-3" />}
              value={instanceCount}
              label={t('agent.instances')}
              color="text-sky-600 dark:text-sky-400"
            />
          </motion.div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder={t('agent.allCategories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('agent.allCategories')}</SelectItem>
            <SelectItem value="DEFAULT">
              <span className="flex items-center gap-1.5"><Globe className="size-3" /> {t('agent.categoryDefault')}</span>
            </SelectItem>
            <SelectItem value="DEPARTMENT">
              <span className="flex items-center gap-1.5"><Building2 className="size-3" /> {t('agent.categoryDepartment')}</span>
            </SelectItem>
            <SelectItem value="PERSONAL">
              <span className="flex items-center gap-1.5"><UserCircle className="size-3" /> {t('agent.categoryPersonal')}</span>
            </SelectItem>
          </SelectContent>
        </Select>
        {instanceNames.length > 1 && (
          <Select value={instanceFilter} onValueChange={onInstanceFilterChange}>
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder={t('agent.allInstances')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('agent.allInstances')}</SelectItem>
              {instanceNames.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {canCreate && (
          <Button onClick={onCreateClick} className="gap-2 shadow-sm">
            <Plus className="size-4" />
            {t('agent.createAgent')}
          </Button>
        )}
      </div>
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
