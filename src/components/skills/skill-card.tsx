"use client"

import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Building2, Download, Tag } from "lucide-react"
import { SkillCategoryBadge } from "./skill-category-badge"
import { SkillSourceBadge } from "./skill-source-badge"
import { useT } from "@/stores/language-store"
import type { SkillOverview } from "@/types/skill"

interface SkillCardProps {
  skill: SkillOverview
  index: number
  onClick: (skill: SkillOverview) => void
}

export function SkillCard({ skill, index, onClick }: SkillCardProps) {
  const t = useT()
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="group cursor-pointer rounded-xl border bg-card p-5 ring-1 ring-black/[0.03] transition-all hover:ring-primary/20 hover:shadow-sm dark:ring-white/[0.06] dark:hover:ring-primary/30"
      onClick={() => onClick(skill)}
    >
      {/* Header: Emoji + Name + Badges */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/60 text-lg ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            {skill.emoji || "🧩"}
          </div>
          <div className="min-w-0">
            <span className="truncate text-sm font-semibold leading-tight">
              {skill.name}
            </span>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <span className="truncate">{skill.slug}</span>
              <span className="shrink-0">v{skill.version}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <SkillCategoryBadge category={skill.category} />
          <SkillSourceBadge source={skill.source} />
        </div>
      </div>

      {/* Description */}
      {skill.description && (
        <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {skill.description}
        </p>
      )}

      {/* Departments (for DEPARTMENT category) */}
      {skill.category === "DEPARTMENT" && skill.departments.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Building2 className="size-3 shrink-0" />
          {skill.departments.length === 1 ? (
            <span className="truncate">{skill.departments[0].name}</span>
          ) : (
            <span>{t('skill.departmentCount', { n: skill.departments.length })}</span>
          )}
        </div>
      )}

      {/* Tags + Install count */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {skill.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 px-2 py-0 text-[11px] font-normal"
            >
              <Tag className="size-2.5" />
              {tag}
            </Badge>
          ))}
          {skill.tags.length > 3 && (
            <span className="text-[11px] text-muted-foreground">
              +{skill.tags.length - 3}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Download className="size-3" />
          <span className="tabular-nums">{skill.installationCount}</span>
        </div>
      </div>
    </motion.div>
  )
}
