"use client"

import { MessageSquare, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useQueryClient } from "@tanstack/react-query"
import { useChatSessions, useDeleteChatSession, chatKeys } from "@/hooks/use-chat"
import { useChatStore } from "@/stores/chat-store"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ChatSessionResponse } from "@/types/chat"

export function ChatSessionList() {
  const t = useT()
  const { data: sessions, isLoading } = useChatSessions()
  const deleteMutation = useDeleteChatSession()
  const setSelectedAgent = useChatStore((s) => s.setSelectedAgent)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const setActiveSessionId = useChatStore((s) => s.setActiveSessionId)
  const qc = useQueryClient()

  function handleSelect(session: ChatSessionResponse) {
    clearMessages()
    qc.invalidateQueries({ queryKey: chatKeys.history(session.id) })
    setActiveSessionId(session.id)
    setSelectedAgent({
      instanceId: session.instanceId,
      instanceName: session.instanceName,
      agentId: session.agentId,
      agentName: session.agentName ?? session.agentId,
      status: "active",
    })
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success(t('chat.sessionDeleted'))
        if (activeSessionId === id) {
          clearMessages()
        }
      },
      onError: () => toast.error(t('operationFailed')),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-3 text-xs">
        {t('chat.noSessions')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {sessions.map((session) => {
        const isCurrentSession = activeSessionId === session.id
        return (
          <div
            key={session.id}
            className={cn(
              "hover:bg-accent group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
              isCurrentSession && "bg-accent",
            )}
            onClick={() => handleSelect(session)}
          >
            <MessageSquare className="text-muted-foreground size-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={cn(
                  "truncate text-sm",
                  !session.isActive && "text-muted-foreground",
                )}>
                  {session.title || session.agentName || session.agentId}
                </p>
                {session.isActive && (
                  <span className="size-1.5 shrink-0 rounded-full bg-green-500" />
                )}
              </div>
              <p className="text-muted-foreground truncate text-[10px]">
                {session.instanceName}
                {session.lastMessageAt && (
                  <> &middot; {formatRelative(session.lastMessageAt, t)}</>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => handleDelete(session.id, e)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

function formatRelative(isoStr: string, t: (key: import("@/locales/zh-CN").TranslationKey, params?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t('time.justNow')
  if (mins < 60) return t('time.minutesAgo', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('time.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return t('time.daysAgo', { n: days })
}
