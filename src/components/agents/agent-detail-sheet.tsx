"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AgentOverviewTab } from "./agent-overview-tab"
import { AgentFilesTab } from "./agent-files-tab"
import { CATEGORY_CONFIG } from "./agent-card"
import { useAgent, useClassifyAgent } from "@/hooks/use-agents"
import { useAuthStore } from "@/stores/auth-store"
import { hasPermission } from "@/lib/auth/permissions"
import { Bot, Copy, Loader2, Star, Trash2, Tags } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import type { AgentOverview, AgentCategory } from "@/types/agent"

interface AgentDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: AgentOverview | null
  canManage: boolean
  onDelete: (agent: AgentOverview) => void
  onClone: (agent: AgentOverview) => void
}

export function AgentDetailSheet({
  open,
  onOpenChange,
  agent,
  canManage,
  onDelete,
  onClone,
}: AgentDetailSheetProps) {
  const t = useT()
  const compositeId = agent ? `${agent.instanceId}:${agent.id}` : ""
  const { data: detail, isLoading } = useAgent(agent ? compositeId : null)
  const classify = useClassifyAgent(compositeId)
  const currentUser = useAuthStore((s) => s.user)
  const canClassify = currentUser ? hasPermission(currentUser.role, "agents:classify") : false

  const [classifyOpen, setClassifyOpen] = useState(false)
  const [newCategory, setNewCategory] = useState<AgentCategory | "">("")

  if (!agent) return null

  const currentCategory = (detail as unknown as Record<string, unknown> | undefined)?.category as AgentCategory | undefined
  const categoryInfo = currentCategory ? CATEGORY_CONFIG[currentCategory] : null

  async function handleClassify() {
    if (!newCategory) return
    try {
      await classify.mutateAsync({ category: newCategory })
      toast.success(t('agent.categoryUpdated'))
      setClassifyOpen(false)
      setNewCategory("")
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || t('operationFailed'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[720px] overflow-y-auto sm:max-w-[720px]">
        <SheetHeader className="px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/60 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Bot className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex items-center gap-2.5 text-base">
                <span className="truncate">{agent.name}</span>
                {agent.isDefault && (
                  <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                )}
                {categoryInfo && (
                  <Badge
                    variant="outline"
                    className={`gap-1 px-2 py-0.5 text-[11px] font-normal ${categoryInfo.className}`}
                  >
                    <categoryInfo.icon className="size-2.5" />
                    {t(categoryInfo.labelKey)}
                  </Badge>
                )}
              </SheetTitle>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {agent.instanceName}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {canClassify && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                  onClick={() => setClassifyOpen(!classifyOpen)}
                  title={t('agent.classifyTitle')}
                >
                  <Tags className="size-4" />
                </Button>
              )}
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                  onClick={() => onClone(agent)}
                  title={t('agent.cloneToInstance')}
                >
                  <Copy className="size-4" />
                </Button>
              )}
              {canManage && !agent.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(agent)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Classify inline panel */}
          {classifyOpen && canClassify && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v as AgentCategory)}>
                <SelectTrigger size="sm" className="w-[140px]">
                  <SelectValue placeholder={t('agent.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEFAULT">{t('agent.categoryDefault')}</SelectItem>
                  <SelectItem value="DEPARTMENT">{t('agent.categoryDepartment')}</SelectItem>
                  <SelectItem value="PERSONAL">{t('agent.categoryPersonal')}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleClassify}
                disabled={!newCategory || classify.isPending}
              >
                {classify.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
                {t('confirm')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setClassifyOpen(false); setNewCategory("") }}
              >
                {t('cancel')}
              </Button>
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center px-5 py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <Tabs defaultValue="overview" className="mt-5 px-5">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1 text-[13px]">
                {t('agent.overviewTab')}
              </TabsTrigger>
              <TabsTrigger value="files" className="flex-1 text-[13px]">
                {t('agent.filesTab')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <AgentOverviewTab agent={detail} canManage={canManage} instanceId={agent.instanceId} />
            </TabsContent>
            <TabsContent value="files" className="mt-4">
              <AgentFilesTab compositeId={compositeId} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="mx-5 rounded-lg border border-dashed px-4 py-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              {t('agent.cannotLoadDetails')}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
