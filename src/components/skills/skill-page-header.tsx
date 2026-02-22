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
import { Input } from "@/components/ui/input"
import { Plus, Puzzle, Download, Globe, Building2, UserCircle, Database, Cloud, Search } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { SkillOverview } from "@/types/skill"

interface SkillPageHeaderProps {
  canCreate: boolean
  onCreateClick: () => void
  skills: SkillOverview[]
  categoryFilter: string
  onCategoryFilterChange: (value: string) => void
  sourceFilter: string
  onSourceFilterChange: (value: string) => void
  search: string
  onSearchChange: (value: string) => void
}

export function SkillPageHeader({
  canCreate,
  onCreateClick,
  skills,
  categoryFilter,
  onCategoryFilterChange,
  sourceFilter,
  onSourceFilterChange,
  search,
  onSearchChange,
}: SkillPageHeaderProps) {
  const t = useT()
  const total = skills.length
  const installed = skills.reduce((sum, s) => sum + s.installationCount, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="from-primary/20 via-primary/10 to-primary/5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Puzzle className="text-primary size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {t('skill.management')}
              </h1>
              <p className="text-muted-foreground text-[13px]">
                {t('skill.managementDesc')}
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
                icon={<Puzzle className="size-3" />}
                value={total}
                label={t('skill.total')}
                color="text-foreground"
              />
              <StatPill
                icon={<Download className="size-3" />}
                value={installed}
                label={t('skill.installed')}
                color="text-sky-600 dark:text-sky-400"
              />
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {canCreate && (
            <Button onClick={onCreateClick} className="gap-2 shadow-sm">
              <Plus className="size-4" />
              {t('skill.createSkill')}
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('skill.searchSkills')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 text-[13px]"
          />
        </div>

        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder={t('skill.allCategories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('skill.allCategories')}</SelectItem>
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

        <Select value={sourceFilter} onValueChange={onSourceFilterChange}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder={t('skill.allSources')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('skill.allSources')}</SelectItem>
            <SelectItem value="LOCAL">
              <span className="flex items-center gap-1.5"><Database className="size-3" /> {t('skill.sourceLocal')}</span>
            </SelectItem>
            <SelectItem value="CLAWHUB">
              <span className="flex items-center gap-1.5"><Cloud className="size-3" /> ClawHub</span>
            </SelectItem>
          </SelectContent>
        </Select>
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
