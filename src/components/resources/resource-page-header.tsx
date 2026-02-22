"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Search } from "lucide-react"
import { useT } from "@/stores/language-store"

interface ResourcePageHeaderProps {
  canCreate: boolean
  onCreateClick: () => void
  typeFilter: string
  onTypeFilterChange: (value: string) => void
  search: string
  onSearchChange: (value: string) => void
  total?: number
}

export function ResourcePageHeader({
  canCreate,
  onCreateClick,
  typeFilter,
  onTypeFilterChange,
  search,
  onSearchChange,
  total,
}: ResourcePageHeaderProps) {
  const t = useT()
  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('resource.management')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('resource.managementDesc')}
            {total !== undefined && total > 0 && (
              <span className="ml-1 tabular-nums">({total})</span>
            )}
          </p>
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} size="sm">
            <Plus className="size-4" />
            {t('resource.addResource')}
          </Button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3">
        <Tabs value={typeFilter} onValueChange={onTypeFilterChange}>
          <TabsList>
            <TabsTrigger value="all">{t('resource.tabAll')}</TabsTrigger>
            <TabsTrigger value="MODEL">{t('resource.tabModel')}</TabsTrigger>
            <TabsTrigger value="TOOL">{t('resource.tabTool')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative ml-auto w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('resource.searchResources')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>
    </div>
  )
}
