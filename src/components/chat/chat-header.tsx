"use client"

import { useState, useCallback } from "react"
import { PanelLeftClose, PanelLeft, RotateCcw, Bot, Loader2, Download, X } from "lucide-react"
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
import { useIsMobile } from "@/hooks/use-mobile"
import { toast } from "sonner"
import { buildExportHtml, MAX_EXPORT_MESSAGES } from "@/lib/chat/export-utils"

export function ChatHeader() {
  const t = useT()
  const isMobile = useIsMobile()
  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen)
  const mobileSidebarOpen = useChatStore((s) => s.mobileSidebarOpen)
  const setMobileSidebarOpen = useChatStore((s) => s.setMobileSidebarOpen)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const clearContext = useClearContext()
  const exportMode = useChatStore((s) => s.exportMode)
  const setExportMode = useChatStore((s) => s.setExportMode)
  const messages = useChatStore((s) => s.messages)
  const selectedExportIds = useChatStore((s) => s.selectedExportIds)
  const overLimit = selectedExportIds.length > MAX_EXPORT_MESSAGES

  function handleToggleSidebar() {
    if (isMobile) {
      setMobileSidebarOpen(!mobileSidebarOpen)
    } else {
      setSidebarOpen(!sidebarOpen)
    }
  }

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

  const handleExport = useCallback(() => {
    if (selectedExportIds.length === 0) return

    const idSet = new Set(selectedExportIds)
    const selected = messages
      .filter((m) => idSet.has(m.id))
      .slice(-MAX_EXPORT_MESSAGES)

    if (selected.length === 0) return

    const meta = {
      agentName: selectedAgent?.agentName ?? 'chat',
      instanceName: selectedAgent?.instanceName,
      labelPng: t('chat.exportPng'),
      labelPdf: t('chat.exportPdf'),
      labelDonePng: t('chat.exportDonePng'),
      labelDonePdf: t('chat.exportDonePdf'),
      labelFailed: t('chat.exportFailed'),
    }

    let html: string
    try {
      html = buildExportHtml(selected, meta)
    } catch (e) {
      toast.error('Export failed: ' + ((e as Error)?.message || 'unknown error').slice(0, 100))
      return
    }
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.download = `teamclaw-${meta.agentName}-${new Date().toISOString().slice(0, 10)}.html`
      a.href = url
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('HTML file downloaded (pop-up was blocked)')
      return
    }
    w.document.write(html)
    w.document.close()
    w.focus()
  }, [selectedExportIds, messages, selectedAgent])

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={handleToggleSidebar}
        >
          {(isMobile ? mobileSidebarOpen : sidebarOpen) ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeft className="size-4" />
          )}
        </Button>

        {selectedAgent ? (
          <>
            <Bot className="text-muted-foreground size-4" />
            <span className={`text-sm font-medium ${isMobile ? "max-w-[120px] truncate" : ""}`}>
              {selectedAgent.agentName}
            </span>
            {!isMobile && (
              <Badge variant="outline" className="text-xs">
                {selectedAgent.instanceName}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              {isMobile ? (
                <>
                  {exportMode && (
                    <>
                      <span className="text-xs text-muted-foreground tabular-nums">{String(selectedExportIds.length)}</span>
                      <Button
                        variant="default"
                        size="icon"
                        className="size-8"
                        disabled={selectedExportIds.length === 0 || overLimit}
                        onClick={handleExport}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!activeSessionId}
                    onClick={() => setExportMode(!exportMode)}
                  >
                    {exportMode ? (
                      <X className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!activeSessionId || clearContext.isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {clearContext.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {exportMode && (
                    <>
                      <span className="text-sm text-muted-foreground tabular-nums">{t('chat.exportSelected', { n: String(selectedExportIds.length) })}</span>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={selectedExportIds.length === 0 || overLimit}
                        onClick={handleExport}
                      >
                        <Download className="mr-1 size-3.5" />
                        {t('chat.export')}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!activeSessionId}
                    onClick={() => setExportMode(!exportMode)}
                  >
                    {exportMode ? (
                      <X className="mr-1 size-3.5" />
                    ) : (
                      <Download className="mr-1 size-3.5" />
                    )}
                    {exportMode ? t('chat.exportCancel') : t('chat.export')}
                  </Button>
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
                </>
              )}
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
