"use client"

import { useState } from "react"
import { Bot, Loader2, Plus, Globe, Building2, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useQueryClient } from "@tanstack/react-query"
import { useChatAgents, useChatSessions, useNewConversation, chatKeys } from "@/hooks/use-chat"
import { useChatStore } from "@/stores/chat-store"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useT } from "@/stores/language-store"
import type { ChatAgentInfo } from "@/types/chat"

const CATEGORY_ICONS = {
  DEFAULT: Globe,
  DEPARTMENT: Building2,
  PERSONAL: UserCircle,
} as const

export function ChatAgentList() {
  const t = useT()
  const { data: agents, isLoading } = useChatAgents()
  const { data: sessions } = useChatSessions()
  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const setSelectedAgent = useChatStore((s) => s.setSelectedAgent)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const qc = useQueryClient()
  const newConversation = useNewConversation()
  const [confirmAgent, setConfirmAgent] = useState<ChatAgentInfo | null>(null)

  function handleSelect(agent: ChatAgentInfo) {
    if (
      selectedAgent?.instanceId !== agent.instanceId ||
      selectedAgent?.agentId !== agent.agentId
    ) {
      clearMessages()
      // Find active session for this agent
      const activeSession = sessions?.find(
        (s) =>
          s.instanceId === agent.instanceId &&
          s.agentId === agent.agentId &&
          s.isActive,
      )
      if (activeSession) {
        qc.invalidateQueries({
          queryKey: chatKeys.history(activeSession.id),
        })
      }
    }
    setSelectedAgent(agent)
  }

  function handleNewConversation() {
    if (!confirmAgent) return
    newConversation.mutate(
      { instanceId: confirmAgent.instanceId, agentId: confirmAgent.agentId },
      {
        onSuccess: (data) => {
          clearMessages()
          setSelectedAgent(confirmAgent)
          useChatStore.getState().setActiveSessionId(data.session.id)
          setConfirmAgent(null)
          toast.success(t('chat.newConversationCreated'))
        },
        onError: () => {
          toast.error(t('chat.newConversationFailed'))
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
      </div>
    )
  }

  if (!agents || agents.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-3 text-xs">
        {t('chat.noAgents')}
      </p>
    )
  }

  // Group agents by instance
  const grouped = new Map<string, ChatAgentInfo[]>()
  for (const agent of agents) {
    const list = grouped.get(agent.instanceId) ?? []
    list.push(agent)
    grouped.set(agent.instanceId, list)
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {Array.from(grouped.entries()).map(([instanceId, instanceAgents]) => (
          <div key={instanceId}>
            <p className="text-muted-foreground mb-1 truncate px-2 text-xs">
              {instanceAgents[0].instanceName}
            </p>
            {instanceAgents.map((agent) => {
              const isSelected =
                selectedAgent?.instanceId === agent.instanceId &&
                selectedAgent?.agentId === agent.agentId
              return (
                <div
                  key={`${agent.instanceId}:${agent.agentId}`}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isSelected
                      ? "bg-secondary text-secondary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                  onClick={() => handleSelect(agent)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSelect(agent) }}
                >
                  <Bot className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{agent.agentName}</span>
                  {agent.category && agent.category !== "DEFAULT" && (() => {
                    const Icon = CATEGORY_ICONS[agent.category]
                    return <span className="shrink-0" aria-label={agent.category === "DEPARTMENT" ? t('chat.department') : t('chat.personal')}><Icon className="size-3 text-muted-foreground/60" /></span>
                  })()}
                  {agent.status === "active" && (
                    <span className="relative ml-1 flex size-1.5 shrink-0" title={t('chat.onlineStatus')}>
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={-1}
                    className="ml-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    title={t('chat.newConversation')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmAgent(agent)
                    }}
                  >
                    +
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Dialog open={!!confirmAgent} onOpenChange={(open) => !open && setConfirmAgent(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('chat.newConversationTitle')}</DialogTitle>
            <DialogDescription>
              {t('chat.newConversationDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAgent(null)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleNewConversation}
              disabled={newConversation.isPending}
            >
              {newConversation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('chat.confirmCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
