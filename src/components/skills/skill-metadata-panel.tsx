"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, User, Tag, Download, Clock, ChevronDown, Loader2, Building2, Check, X } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { useUpdateSkill } from "@/hooks/use-skills"
import { useDepartments } from "@/hooks/use-departments"
import { useAuthStore } from "@/stores/auth-store"
import { SkillCategoryBadge } from "./skill-category-badge"
import type { SkillDetail, SkillCategory } from "@/types/skill"
import type { TranslationKey } from "@/locales/zh-CN"

const CATEGORY_OPTIONS: { value: SkillCategory; labelKey: TranslationKey; roles: string[] }[] = [
  { value: "DEFAULT", labelKey: "agent.categoryDefault", roles: ["SYSTEM_ADMIN"] },
  { value: "DEPARTMENT", labelKey: "agent.categoryDepartment", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN"] },
  { value: "PERSONAL", labelKey: "agent.categoryPersonal", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN", "USER"] },
]

interface SkillMetadataPanelProps {
  skill: SkillDetail
  skillId: string
  canEdit: boolean
}

export function SkillMetadataPanel({ skill, skillId, canEdit }: SkillMetadataPanelProps) {
  const t = useT()
  const user = useAuthStore((s) => s.user)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)
  const [showDeptEditor, setShowDeptEditor] = useState(false)
  const updateSkill = useUpdateSkill(skillId)

  const availableCategories = CATEGORY_OPTIONS.filter(
    (opt) => user && opt.roles.includes(user.role) && opt.value !== skill.category,
  )

  // Can edit departments: SYSTEM_ADMIN for DEPARTMENT skills
  const canEditDepartments = canEdit && user?.role === "SYSTEM_ADMIN" && skill.category === "DEPARTMENT"

  async function handleCategoryChange(category: SkillCategory) {
    setShowCategoryMenu(false)
    try {
      await updateSkill.mutateAsync({ category })
      const opt = CATEGORY_OPTIONS.find((o) => o.value === category)
      toast.success(t('skill.categoryUpdatedMsg', { name: opt ? t(opt.labelKey) : '' }))
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('skill.categoryUpdateFailed')
      toast.error(message)
    }
  }

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="space-y-3">
        <h3 className="text-[13px] font-semibold">{t('skill.basicInfo')}</h3>
        <div className="space-y-2.5 text-[12px]">
          <InfoRow icon={<User className="size-3" />} label={t('skill.creator')}>
            {skill.creatorName}
          </InfoRow>
          <InfoRow icon={<Calendar className="size-3" />} label={t('skill.createdTime')}>
            {new Date(skill.createdAt).toLocaleDateString("zh-CN")}
          </InfoRow>
          <InfoRow icon={<Clock className="size-3" />} label={t('skill.lastUpdated')}>
            {new Date(skill.updatedAt).toLocaleDateString("zh-CN")}
          </InfoRow>
          <InfoRow icon={<Download className="size-3" />} label={t('skill.installCount')}>
            <span className="tabular-nums">{skill.installationCount}</span>
          </InfoRow>
          {/* Category with edit */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Tag className="size-3" />
              {t('skill.category')}
            </span>
            <div className="relative">
              {canEdit && availableCategories.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  disabled={updateSkill.isPending}
                >
                  {updateSkill.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <>
                      <SkillCategoryBadge category={skill.category} />
                      <ChevronDown className="size-3 text-muted-foreground" />
                    </>
                  )}
                </button>
              ) : (
                <SkillCategoryBadge category={skill.category} />
              )}
              {showCategoryMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowCategoryMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 w-28 rounded-md border bg-popover p-1 shadow-md">
                    {availableCategories.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-[12px] hover:bg-accent transition-colors"
                        onClick={() => handleCategoryChange(opt.value)}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Departments */}
          {skill.category === "DEPARTMENT" && (
            <div className="flex items-start justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
                <Building2 className="size-3" />
                {t('skill.belongDepartment')}
              </span>
              <div className="flex flex-col items-end gap-1">
                {skill.departments.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-1">
                    {skill.departments.map((dept) => (
                      <Badge
                        key={dept.id}
                        variant="outline"
                        className="px-1.5 py-0 text-[11px] font-normal"
                      >
                        {dept.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-[11px]">{t('skill.notAssigned')}</span>
                )}
                {canEditDepartments && (
                  <button
                    type="button"
                    onClick={() => setShowDeptEditor(true)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    {t('skill.editDepartment')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Department editor popover */}
      {showDeptEditor && (
        <DepartmentEditor
          skillId={skillId}
          currentDeptIds={skill.departments.map((d) => d.id)}
          onClose={() => setShowDeptEditor(false)}
        />
      )}

      {/* Tags */}
      {skill.tags.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold">{t('skill.tags')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {skill.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 px-2 py-0.5 text-[11px] font-normal"
              >
                <Tag className="size-2.5" />
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Version history */}
      {skill.versions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold">{t('skill.versionHistory')}</h3>
          <div className="space-y-2">
            {skill.versions.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border p-2.5 text-[12px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium">v{v.version}</span>
                  <span className="text-muted-foreground">
                    {new Date(v.publishedAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                {v.changelog && (
                  <p className="mt-1 text-muted-foreground line-clamp-2">
                    {v.changelog}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  by {v.publishedByName}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span>{children}</span>
    </div>
  )
}

function DepartmentEditor({
  skillId,
  currentDeptIds,
  onClose,
}: {
  skillId: string
  currentDeptIds: string[]
  onClose: () => void
}) {
  const t = useT()
  const { data: deptsData } = useDepartments()
  const updateSkill = useUpdateSkill(skillId)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentDeptIds))

  const departments = deptsData?.departments ?? []

  function toggleDept(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  async function handleSave() {
    try {
      await updateSkill.mutateAsync({ departmentIds: Array.from(selectedIds) })
      toast.success(t('skill.departmentsUpdated'))
      onClose()
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('skill.departmentsUpdateFailed')
      toast.error(message)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[12px] font-medium">{t('skill.selectDepartments')}</h4>
        <button type="button" onClick={onClose}>
          <X className="size-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
      {departments.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-2">{t('skill.noDepartments')}</p>
      ) : (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {departments.map((dept) => {
            const isSelected = selectedIds.has(dept.id)
            return (
              <button
                key={dept.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                  isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent"
                }`}
                onClick={() => toggleDept(dept.id)}
              >
                <div
                  className={`flex size-4 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <Check className="size-2.5" />}
                </div>
                {dept.name}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={onClose}
        >
          {t('cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-[11px]"
          disabled={updateSkill.isPending}
          onClick={handleSave}
        >
          {updateSkill.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
          {t('save')}
        </Button>
      </div>
    </div>
  )
}
