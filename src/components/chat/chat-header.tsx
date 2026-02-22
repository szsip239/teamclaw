"use client"

import { useState } from "react"
import { PanelLeftClose, PanelLeft, RotateCcw, Bot, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useChatStore } from "@/stores/chat-store"
import { useClearContext } from "@/hooks/use-chat"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"

export function ChatHeader() {
  const t = useT()
  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const clearContext = useClearContext()

  function handleClearContext() {
    if (!activeSessionId) return
    clearContext.mutate(activeSessionId, {
      onSuccess: () => {
        toast.success(t('chat.contextCleared'))
        setConfirmOpen(false)
      },
      onError: () => {
        toast.error(t('chat.clearContextFailed'))
      },
    })
  }

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeft className="size-4" />
          )}
        </Button>

        {selectedAgent ? (
          <>
            <Bot className="text-muted-foreground size-4" />
            <span className="text-sm font-medium">
              {selectedAgent.agentName}
            </span>
            <Badge variant="outline" className="text-xs">
              {selectedAgent.instanceName}
            </Badge>
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                disabled={!activeSessionId || clearContext.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {clearContext.isPending ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1 size-3.5" />
                )}
                {t('chat.clearContext')}
              </Button>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground text-sm">{t('chat.selectAgentHint')}</span>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('chat.clearContextTitle')}</DialogTitle>
            <DialogDescription>
              {t('chat.clearContextDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleClearContext}
              disabled={clearContext.isPending}
            >
              {clearContext.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('chat.confirmClear')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
