"use client"

import { motion } from "motion/react"
import { BookOpen, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/stores/language-store"
import type { KnowledgeBaseOverview } from "@/types/knowledge-base"

interface KbPageHeaderProps {
  canCreate: boolean
  onCreateClick: () => void
  knowledgeBases: KnowledgeBaseOverview[]
  scopeFilter: string
  onScopeFilterChange: (value: string) => void
  search: string
  onSearchChange: (value: string) => void
}

export function KbPageHeader({
  canCreate,
  onCreateClick,
  knowledgeBases,
  scopeFilter,
  onScopeFilterChange,
  search,
  onSearchChange,
}: KbPageHeaderProps) {
  const t = useT()

  return (
    <div className="space-y-4">
      {/* Title row */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            <BookOpen className="size-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {t('kb.title')}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {t('kb.titleDesc')}
            </p>
          </div>
          <div className="ml-3 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]">
              {knowledgeBases.length}
            </span>
          </div>
        </div>
        {canCreate && (
          <Button size="sm" onClick={onCreateClick} className="gap-1.5">
            <Plus className="size-3.5" />
            {t('kb.create')}
          </Button>
        )}
      </motion.div>

      {/* Filter row */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex flex-wrap items-center gap-3"
      >
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 text-[13px] h-9"
          />
        </div>
        <Select value={scopeFilter} onValueChange={onScopeFilterChange}>
          <SelectTrigger className="w-[140px] h-9 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('kb.all')}</SelectItem>
            <SelectItem value="GLOBAL">{t('kb.scopeGlobal')}</SelectItem>
            <SelectItem value="DEPARTMENT">{t('kb.scopeDepartment')}</SelectItem>
            <SelectItem value="PERSONAL">{t('kb.scopePersonal')}</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>
    </div>
  )
}
