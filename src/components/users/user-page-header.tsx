"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, Users } from "lucide-react"
import { useT } from "@/stores/language-store"

interface UserPageHeaderProps {
  canManage: boolean
  onCreateClick: () => void
  search: string
  onSearchChange: (value: string) => void
}

export function UserPageHeader({
  canManage,
  onCreateClick,
  search,
  onSearchChange,
}: UserPageHeaderProps) {
  const t = useT()
  const [localSearch, setLocalSearch] = useState(search)

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch, onSearchChange])

  return (
    <div className="flex items-start justify-between">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="from-primary/20 via-primary/10 to-primary/5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            <Users className="text-primary size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('user.management')}
            </h1>
            <p className="text-muted-foreground text-[13px]">
              {t('user.managementDesc')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder={t('user.searchUsers')}
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-[220px] pl-9 text-[13px]"
          />
        </div>
        {canManage && (
          <Button onClick={onCreateClick} className="gap-2 shadow-sm">
            <Plus className="size-4" />
            {t('user.createUser')}
          </Button>
        )}
      </div>
    </div>
  )
}
