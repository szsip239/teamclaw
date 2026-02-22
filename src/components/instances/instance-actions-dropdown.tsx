"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  MoreHorizontal,
  Play,
  Square,
  RotateCcw,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react"
import { useT } from "@/stores/language-store"
import type { InstanceResponse } from "@/types/instance"

interface InstanceActionsDropdownProps {
  instance: InstanceResponse
  canManage: boolean
  onDetail: () => void
  onEdit: () => void
  onDelete: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
}

export function InstanceActionsDropdown({
  instance,
  canManage,
  onDetail,
  onEdit,
  onDelete,
  onStart,
  onStop,
  onRestart,
}: InstanceActionsDropdownProps) {
  const t = useT()
  const isOnline = instance.status === "ONLINE"
  const isOffline = instance.status === "OFFLINE"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-md text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="size-3.5" />
          <span className="sr-only">{t('actions')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onDetail} className="gap-2 text-[13px]">
          <ExternalLink className="size-3.5 opacity-60" />
          {t('viewDetails')}
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            {isOffline && (
              <DropdownMenuItem onClick={onStart} className="gap-2 text-[13px]">
                <Play className="size-3.5 opacity-60" />
                {t('start')}
              </DropdownMenuItem>
            )}
            {isOnline && (
              <DropdownMenuItem onClick={onStop} className="gap-2 text-[13px]">
                <Square className="size-3.5 opacity-60" />
                {t('stop')}
              </DropdownMenuItem>
            )}
            {(isOnline || instance.status === "DEGRADED" || instance.status === "ERROR") && (
              <DropdownMenuItem onClick={onRestart} className="gap-2 text-[13px]">
                <RotateCcw className="size-3.5 opacity-60" />
                {t('restart')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEdit} className="gap-2 text-[13px]">
              <Pencil className="size-3.5 opacity-60" />
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="gap-2 text-[13px] text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5 opacity-60" />
              {t('delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
