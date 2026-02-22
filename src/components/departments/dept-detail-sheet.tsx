"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Building2 } from "lucide-react"
import { DeptMembersTab } from "./dept-members-tab"
import { DeptAccessTab } from "./dept-access-tab"
import { useDepartment } from "@/hooks/use-departments"
import type { DepartmentResponse } from "@/types/department"
import { useT } from "@/stores/language-store"

interface DeptDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  department: DepartmentResponse | null
  canManage: boolean
}

export function DeptDetailSheet({
  open,
  onOpenChange,
  department,
  canManage,
}: DeptDetailSheetProps) {
  const t = useT()
  const { data, isLoading } = useDepartment(department?.id ?? null)
  const detail = data?.department

  if (!department) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[540px] overflow-y-auto px-6 pb-6 sm:max-w-[540px]">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/50 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Building2 className="size-4.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex items-center gap-2.5 text-base">
                <span className="truncate">{department.name}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {t('dept.memberCountLabel', { n: department.userCount })}
                </Badge>
              </SheetTitle>
              {department.description && (
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground/70">
                  {department.description}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <Tabs defaultValue="members">
            <TabsList className="w-full">
              <TabsTrigger value="members" className="flex-1 text-[13px]">
                {t('dept.membersTab')}
              </TabsTrigger>
              <TabsTrigger value="access" className="flex-1 text-[13px]">
                {t('dept.accessTab')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="members" className="mt-4">
              <DeptMembersTab members={detail.users} />
            </TabsContent>
            <TabsContent value="access" className="mt-4">
              <DeptAccessTab
                departmentId={department.id}
                grants={detail.instanceAccess}
                canManage={canManage}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground">
            {t('dept.loadFailed')}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
