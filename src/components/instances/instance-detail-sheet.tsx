"use client"

import { motion } from "motion/react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { InstanceStatusBadge } from "./instance-status-badge"
import { InstanceLogsViewer } from "./instance-logs-viewer"
import { useInstanceHealth } from "@/hooks/use-instances"
import {
  Loader2,
  Globe,
  Box,
  Calendar,
  Clock,
  Cpu,
  Container,
  ImageIcon,
  Heart,
  Bot,
  MessageSquare,
  ExternalLink,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { useT } from "@/stores/language-store"
import type { InstanceResponse } from "@/types/instance"

async function openDashboard(instanceId: string, errorMsg: string) {
  try {
    const data = await api.get<{ dashboardUrl: string; token: string }>(
      `/api/v1/instances/${instanceId}/dashboard`
    )
    // Open via hidden form POST to avoid exposing token in URL
    const form = document.createElement("form")
    form.method = "POST"
    form.action = data.dashboardUrl + "/"
    form.target = "_blank"
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = "token"
    input.value = data.token
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  } catch {
    toast.error(errorMsg)
  }
}

interface InstanceDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instance: InstanceResponse | null
  canManage: boolean
}

// ─── Info Item Component ──────────────────────────────────────────

function InfoItem({
  icon,
  label,
  value,
  mono,
  delay = 0,
}: {
  icon: React.ReactNode
  label: string
  value: string | null | undefined
  mono?: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay }}
      className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-muted/40"
    >
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground/70">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {label}
        </div>
        <div
          className={`mt-0.5 truncate text-[13px] leading-tight ${
            mono ? "font-mono text-xs" : ""
          } ${value ? "" : "text-muted-foreground/40"}`}
        >
          {value || "—"}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Health Metric Card ───────────────────────────────────────────

function HealthMetric({
  label,
  value,
  icon,
  mono,
  accent,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  mono?: boolean
  accent?: boolean
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-3.5 py-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div className="flex items-center gap-1.5">
        {icon && (
          <span className="text-muted-foreground/50">{icon}</span>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {label}
        </span>
      </div>
      <div
        className={`mt-1 text-sm font-semibold leading-tight ${
          mono ? "font-mono text-xs" : ""
        } ${accent ? "text-primary" : ""}`}
      >
        {value}
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({
  instance,
  canManage,
}: {
  instance: InstanceResponse
  canManage: boolean
}) {
  const t = useT()
  const { data: health, isLoading } = useInstanceHealth(instance.id)
  const isOnline = instance.status === "ONLINE"

  function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return t('time.uptimeDaysHours', { d, h })
    if (h > 0) return t('time.uptimeHoursMinutes', { h, m })
    return t('time.uptimeMinutes', { m })
  }

  return (
    <div className="space-y-5">
      {/* Quick action links */}
      {isOnline && (
        <div className="space-y-2">
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => openDashboard(instance.id, t('instance.cannotOpenConsole'))}
            className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/[0.08]"
          >
            <span>{t('instance.openConsole')}</span>
            <ExternalLink className="size-4" />
          </motion.button>
          {canManage && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.04 }}
            >
              <Link
                href={`/instances/${instance.id}/config`}
                className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/[0.08]"
              >
                <span>{t('instance.openConfigEditor')}</span>
                <Settings className="size-4" />
              </Link>
            </motion.div>
          )}
        </div>
      )}

      {/* Connection & system info — 2-column grid */}
      <div className="grid grid-cols-2 gap-1">
        <div className="col-span-2">
          <InfoItem
            icon={<Globe className="size-3" />}
            label={t('instance.connectionAddr')}
            value={instance.gatewayUrl}
            mono
            delay={0}
          />
        </div>
        <InfoItem
          icon={<Cpu className="size-3" />}
          label={t('version')}
          value={instance.version}
          delay={0.04}
        />
        <InfoItem
          icon={<ImageIcon className="size-3" />}
          label={t('instance.image')}
          value={instance.imageName}
          mono
          delay={0.08}
        />
        <InfoItem
          icon={<Container className="size-3" />}
          label={t('instance.containerId')}
          value={instance.containerId ? instance.containerId.substring(0, 12) : t('instance.externalManaged')}
          mono
          delay={0.12}
        />
        <InfoItem
          icon={<Calendar className="size-3" />}
          label={t('instance.createdAt')}
          value={new Date(instance.createdAt).toLocaleString()}
          delay={0.16}
        />
        <div className="col-span-2">
          <InfoItem
            icon={<Clock className="size-3" />}
            label={t('instance.lastCheck')}
            value={
              instance.lastHealthCheck
                ? new Date(instance.lastHealthCheck).toLocaleString()
                : null
            }
            delay={0.2}
          />
        </div>
      </div>

      <Separator className="my-1" />

      {/* Health section */}
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <Heart className="size-3.5 text-muted-foreground/60" />
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            {t('instance.healthStatus')}
          </h4>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-4 py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">{t('instance.checking')}</span>
          </div>
        ) : health ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="grid grid-cols-2 gap-2"
          >
            <HealthMetric
              label={t('status')}
              value={
                health.status ||
                ((health as unknown as { ok?: boolean }).ok ? t('instance.normal') : t('instance.abnormal'))
              }
            />
            {health.uptime !== undefined && (
              <HealthMetric
                label={t('instance.uptime')}
                value={formatUptime(health.uptime)}
              />
            )}
            {health.version && (
              <HealthMetric label={t('version')} value={health.version} mono />
            )}
            {health.agents && (
              <HealthMetric
                label="Agents"
                value={String(health.agents.length)}
                icon={<Bot className="size-3" />}
                accent
              />
            )}
            {health.sessions !== undefined && (
              <HealthMetric
                label={t('instance.sessionCount')}
                value={String(
                  typeof health.sessions === "object"
                    ? health.sessions?.count ?? 0
                    : health.sessions
                )}
                icon={<MessageSquare className="size-3" />}
              />
            )}
          </motion.div>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-[13px] text-muted-foreground/60">{t('instance.noHealthData')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Sheet ───────────────────────────────────────────────────

export function InstanceDetailSheet({
  open,
  onOpenChange,
  instance,
  canManage,
}: InstanceDetailSheetProps) {
  const t = useT()
  if (!instance) return null

  const hasContainer = !!instance.containerId

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[540px] overflow-y-auto px-6 pb-6 sm:max-w-[540px]">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/50 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Box className="size-4.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex items-center gap-2.5 text-base">
                <span className="truncate">{instance.name}</span>
                <InstanceStatusBadge status={instance.status} />
              </SheetTitle>
              {instance.description && (
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground/70">
                  {instance.description}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1 text-[13px]">
              {t('instance.overviewTab')}
            </TabsTrigger>
            {hasContainer && (
              <TabsTrigger value="logs" className="flex-1 text-[13px]">
                {t('instance.logsTab')}
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <OverviewTab instance={instance} canManage={canManage} />
          </TabsContent>
          {hasContainer && (
            <TabsContent value="logs" className="mt-4">
              <InstanceLogsViewer instanceId={instance.id} />
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
