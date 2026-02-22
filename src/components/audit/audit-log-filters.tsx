"use client"

import { Search, Download } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"
import type { AuditLogParams } from "@/hooks/use-audit-logs"

interface FiltersProps {
  filters: AuditLogParams
  onChange: (filters: AuditLogParams) => void
  showExport?: boolean
  onExport?: () => void
}

const ACTION_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "audit.filterAllActions" },
  { value: "LOGIN", labelKey: "audit.filterLogin" },
  { value: "LOGOUT", labelKey: "audit.filterLogout" },
  { value: "USER_CREATE", labelKey: "audit.filterUserCreate" },
  { value: "USER_UPDATE", labelKey: "audit.filterUserUpdate" },
  { value: "USER_DELETE", labelKey: "audit.filterUserDelete" },
  { value: "PASSWORD_RESET", labelKey: "audit.filterPasswordReset" },
  { value: "INSTANCE_CREATE", labelKey: "audit.filterInstanceCreate" },
  { value: "INSTANCE_UPDATE", labelKey: "audit.filterInstanceUpdate" },
  { value: "INSTANCE_DELETE", labelKey: "audit.filterInstanceDelete" },
  { value: "INSTANCE_START", labelKey: "audit.filterInstanceStart" },
  { value: "INSTANCE_STOP", labelKey: "audit.filterInstanceStop" },
  { value: "AGENT_CLASSIFY", labelKey: "audit.filterAgentClassify" },
  { value: "SKILL_CREATE", labelKey: "audit.filterSkillCreate" },
  { value: "SKILL_UPDATE", labelKey: "audit.filterSkillUpdate" },
  { value: "SKILL_INSTALL", labelKey: "audit.filterSkillInstall" },
  { value: "RESOURCE_CREATE", labelKey: "audit.filterResourceCreate" },
  { value: "RESOURCE_UPDATE", labelKey: "audit.filterResourceUpdate" },
  { value: "RESOURCE_DELETE", labelKey: "audit.filterResourceDelete" },
]

const RESOURCE_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "audit.filterAllResources" },
  { value: "auth", labelKey: "audit.filterAuth" },
  { value: "user", labelKey: "audit.filterUser" },
  { value: "instance", labelKey: "audit.filterInstance" },
  { value: "agent", labelKey: "nav.agents" },
  { value: "skill", labelKey: "audit.filterSkill" },
  { value: "resource", labelKey: "audit.filterResource" },
  { value: "department", labelKey: "audit.filterDepartment" },
  { value: "chat", labelKey: "audit.filterChat" },
]

const RESULT_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "audit.filterAllResults" },
  { value: "SUCCESS", labelKey: "audit.filterSuccess" },
  { value: "FAILURE", labelKey: "audit.filterFailure" },
  { value: "DENIED", labelKey: "audit.filterDenied" },
]

export function AuditLogFilters({ filters, onChange, showExport, onExport }: FiltersProps) {
  const t = useT()
  function update(patch: Partial<AuditLogParams>) {
    onChange({ ...filters, ...patch, page: 1 })
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Search */}
      <div className="relative w-[220px]">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-2.5 size-3.5" />
        <input
          type="text"
          placeholder={t('audit.searchPlaceholder')}
          value={filters.search ?? ""}
          onChange={(e) => update({ search: e.target.value || undefined })}
          className="bg-card border-border focus:border-primary focus:ring-primary/20 h-8 w-full rounded-md border pl-8 pr-3 text-xs outline-none transition-colors focus:ring-2"
        />
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-white/5" />

      {/* Action */}
      <Select
        value={filters.action ?? "all"}
        onValueChange={(v) => update({ action: v === "all" ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Resource */}
      <Select
        value={filters.resource ?? "all"}
        onValueChange={(v) =>
          update({ resource: v === "all" ? undefined : v })
        }
      >
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RESOURCE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Result */}
      <Select
        value={filters.result ?? "all"}
        onValueChange={(v) => update({ result: v === "all" ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RESULT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Separator */}
      <div className="h-5 w-px bg-white/5" />

      {/* Date range */}
      <input
        type="date"
        value={filters.startDate ?? ""}
        onChange={(e) => update({ startDate: e.target.value || undefined })}
        className="bg-card border-border focus:border-primary h-8 w-[130px] rounded-md border px-2.5 font-mono text-[11px] outline-none transition-colors"
      />
      <span className="text-muted-foreground text-xs">~</span>
      <input
        type="date"
        value={filters.endDate ?? ""}
        onChange={(e) => update({ endDate: e.target.value || undefined })}
        className="bg-card border-border focus:border-primary h-8 w-[130px] rounded-md border px-2.5 font-mono text-[11px] outline-none transition-colors"
      />

      {/* Spacer + Export */}
      {showExport && (
        <>
          <div className="flex-1" />
          <button
            onClick={onExport}
            className="bg-card border-border hover:border-border/80 hover:text-foreground text-muted-foreground flex h-8 items-center gap-1.5 rounded-md border px-3.5 text-xs font-medium transition-colors"
          >
            <Download className="size-[13px]" />
            {t('audit.exportCsv')}
          </button>
        </>
      )}
    </div>
  )
}
