"use client"

import { motion } from "motion/react"
import { TableCell } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { InstanceStatusBadge } from "./instance-status-badge"
import { InstanceActionsDropdown } from "./instance-actions-dropdown"
import { Bot, Clock, ExternalLink, MessageSquare, Radio } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { useT } from "@/stores/language-store"
import type { InstanceResponse } from "@/types/instance"

async function openDashboard(instanceId: string, errorMsg: string) {
  // Open window synchronously to avoid popup blocker (must be in user click context)
  const win = window.open("about:blank", "_blank")
  try {
    const data = await api.get<{ dashboardUrl: string; token: string }>(
      `/api/v1/instances/${instanceId}/dashboard`
    )
    // Navigate to dashboard with token in hash params — not sent to server
    // Control UI reads: new URLSearchParams(hash.slice(1)).get("token")
    if (win) {
      win.location.href = `${data.dashboardUrl}/#token=${encodeURIComponent(data.token)}`
    }
  } catch {
    win?.close()
    toast.error(errorMsg)
  }
}

interface InstanceTableRowProps {
  instance: InstanceResponse
  index: number
  canManage: boolean
  onDetail: (instance: InstanceResponse) => void
  onEdit: (instance: InstanceResponse) => void
  onDelete: (instance: InstanceResponse) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onRestart: (id: string) => void
}

function useFormatRelativeTime() {
  const t = useT()
  return (dateStr: string | null): string => {
    if (!dateStr) return "—"
    const date = new Date(dateStr)
    const now = Date.now()
    const diffSec = Math.floor((now - date.getTime()) / 1000)

    if (diffSec < 60) return t('time.justNow')
    if (diffSec < 3600) return t('time.minutesAgo', { n: Math.floor(diffSec / 60) })
    if (diffSec < 86400) return t('time.hoursAgo', { n: Math.floor(diffSec / 3600) })
    return t('time.daysAgo', { n: Math.floor(diffSec / 86400) })
  }
}

function getAgentCount(healthData: Record<string, unknown> | null): number | null {
  if (!healthData) return null
  const agents = healthData.agents
  if (Array.isArray(agents)) return agents.length
  return null
}

function getSessionCount(healthData: Record<string, unknown> | null): number | null {
  if (!healthData) return null
  const sessions = healthData.sessions
  if (sessions && typeof sessions === "object" && "count" in (sessions as object)) {
    return (sessions as { count: number }).count
  }
  if (typeof sessions === "number") return sessions
  return null
}

function getChannelCount(healthData: Record<string, unknown> | null): number | null {
  if (!healthData) return null
  const channelOrder = healthData.channelOrder
  if (Array.isArray(channelOrder)) return channelOrder.length
  const channels = healthData.channels
  if (channels && typeof channels === "object") {
    return Object.keys(channels as object).length
  }
  return null
}

function getVersionDisplay(instance: InstanceResponse): string | null {
  return instance.version || null
}

export function InstanceTableRow({
  instance,
  index,
  canManage,
  onDetail,
  onEdit,
  onDelete,
  onStart,
  onStop,
  onRestart,
}: InstanceTableRowProps) {
  const t = useT()
  const formatRelativeTime = useFormatRelativeTime()
  const agentCount = getAgentCount(instance.healthData)
  const sessionCount = getSessionCount(instance.healthData)
  const channelCount = getChannelCount(instance.healthData)
  const versionDisplay = getVersionDisplay(instance)
  const isOnline = instance.status === "ONLINE"

  const dimText = "text-muted-foreground/40 text-xs"

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      className="group border-b transition-colors hover:bg-muted/40 cursor-pointer"
      onClick={() => onDetail(instance)}
    >
      {/* Name + description */}
      <TableCell className="py-3 pl-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium leading-none tracking-tight">
            {instance.name}
          </span>
          <span className="text-muted-foreground/50 text-[11px] leading-relaxed">
            {instance.gatewayUrl}
          </span>
        </div>
      </TableCell>

      {/* Status */}
      <TableCell className="py-3">
        <InstanceStatusBadge status={instance.status} />
      </TableCell>

      {/* Agent count */}
      <TableCell className="py-3 text-center">
        {agentCount !== null ? (
          <div className="inline-flex items-center gap-1 text-sm tabular-nums">
            <Bot className="size-3.5 text-muted-foreground/50" />
            <span className="font-medium">{agentCount}</span>
          </div>
        ) : (
          <span className={dimText}>—</span>
        )}
      </TableCell>

      {/* Session count */}
      <TableCell className="py-3 text-center">
        {sessionCount !== null ? (
          <div className="inline-flex items-center gap-1 text-sm tabular-nums">
            <MessageSquare className="size-3.5 text-muted-foreground/50" />
            <span className="font-medium">{sessionCount}</span>
          </div>
        ) : (
          <span className={dimText}>—</span>
        )}
      </TableCell>

      {/* Channel count */}
      <TableCell className="py-3 text-center">
        {channelCount !== null ? (
          <div className="inline-flex items-center gap-1 text-sm tabular-nums">
            <Radio className="size-3.5 text-muted-foreground/50" />
            <span className="font-medium">{channelCount}</span>
          </div>
        ) : (
          <span className={dimText}>—</span>
        )}
      </TableCell>

      {/* Version */}
      <TableCell className="py-3">
        <span className="text-muted-foreground font-mono text-xs">
          {versionDisplay || "—"}
        </span>
      </TableCell>

      {/* Last health check */}
      <TableCell className="py-3">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {instance.lastHealthCheck && (
            <Clock className="size-3 shrink-0 opacity-40" />
          )}
          <span>{formatRelativeTime(instance.lastHealthCheck)}</span>
        </div>
      </TableCell>

      {/* Dashboard connect button */}
      <TableCell className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
        {isOnline ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => openDashboard(instance.id, t('instance.cannotOpenConsole'))}
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <ExternalLink className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('instance.openConsole')}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={dimText}>—</span>
        )}
      </TableCell>

      {/* Actions dropdown */}
      <TableCell className="py-3 pr-2" onClick={(e) => e.stopPropagation()}>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <InstanceActionsDropdown
            instance={instance}
            canManage={canManage}
            onDetail={() => onDetail(instance)}
            onEdit={() => onEdit(instance)}
            onDelete={() => onDelete(instance)}
            onStart={() => onStart(instance.id)}
            onStop={() => onStop(instance.id)}
            onRestart={() => onRestart(instance.id)}
          />
        </div>
      </TableCell>
    </motion.tr>
  )
}
