"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft, Download, Tag, Trash2, ExternalLink, Pencil, ArrowUpCircle, RefreshCw, Loader2 } from "lucide-react"
import { SkillCategoryBadge } from "./skill-category-badge"
import { SkillSourceBadge } from "./skill-source-badge"
import { useT } from "@/stores/language-store"
import type { SkillDetail } from "@/types/skill"

const CLAWHUB_REGISTRY_URL = process.env.NEXT_PUBLIC_CLAWHUB_REGISTRY_URL || 'https://clawhub.ai'

interface SkillDetailHeaderProps {
  skill: SkillDetail
  canEdit: boolean
  upgradeableCount?: number
  isCheckingUpdate?: boolean
  hasClawHubUpdate?: boolean | null
  latestVersion?: string
  clawhubUrl?: string
  onBack: () => void
  onInstall: () => void
  onPublish: () => void
  onDelete: () => void
  onEdit: () => void
  onUpgrade?: () => void
  onCheckClawHubUpdate?: () => void
}

export function SkillDetailHeader({
  skill,
  canEdit,
  upgradeableCount = 0,
  isCheckingUpdate,
  hasClawHubUpdate,
  latestVersion,
  clawhubUrl,
  onBack,
  onInstall,
  onPublish,
  onDelete,
  onEdit,
  onUpgrade,
  onCheckClawHubUpdate,
}: SkillDetailHeaderProps) {
  const t = useT()
  // Derive ClawHub link: prefer check result URL, then homepage, then clawhubSlug (only if it has owner/)
  const clawhubLink = clawhubUrl
    || skill.homepage
    || (skill.source === 'CLAWHUB' && skill.clawhubSlug?.includes('/')
      ? `${CLAWHUB_REGISTRY_URL}/${skill.clawhubSlug}`
      : null)

  return (
    <div className="border-b pb-4 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/60 text-xl ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            {skill.emoji || "🧩"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{skill.name}</h1>
              <span className="text-[12px] font-mono text-muted-foreground">
                v{skill.version}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <SkillCategoryBadge category={skill.category} />
              <SkillSourceBadge source={skill.source} />
              {clawhubLink && (
                <a
                  href={clawhubLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="size-3" />
                  ClawHub
                </a>
              )}
              {skill.source === 'CLAWHUB' && onCheckClawHubUpdate && (
                <button
                  onClick={onCheckClawHubUpdate}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                >
                  {isCheckingUpdate ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {hasClawHubUpdate === true
                    ? t('skill.hasNewVersion', { version: latestVersion ?? '' })
                    : hasClawHubUpdate === false
                      ? t('skill.upToDate')
                      : t('skill.checkUpdate')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {upgradeableCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUpgrade}
              className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950"
            >
              <ArrowUpCircle className="size-3.5" />
              {t('skill.upgradeCount', { n: upgradeableCount })}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onInstall} className="gap-1.5">
            <Download className="size-3.5" />
            {t('install')}
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
                <Pencil className="size-3.5" />
                {t('skill.editButton')}
              </Button>
              <Button variant="outline" size="sm" onClick={onPublish} className="gap-1.5">
                <Tag className="size-3.5" />
                {t('skill.publishVersion')}
              </Button>
              <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      {skill.description && (
        <p className="text-[13px] text-muted-foreground line-clamp-2">
          {skill.description}
        </p>
      )}
    </div>
  )
}
