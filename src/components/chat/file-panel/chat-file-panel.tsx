"use client"

import { useEffect, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useChatSessions } from "@/hooks/use-chat"
import { useChatStore } from "@/stores/chat-store"
import { useFilePanelStore } from "@/stores/file-panel-store"
import { useT } from "@/stores/language-store"
import { sessionFileKeys, useFileWatch } from "@/hooks/use-session-files"
import { resolveFilePanelSessionIds } from "@/lib/session-files/panel-scope"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FolderOpen, Download } from "lucide-react"
import { FileTree } from "./file-tree"
import { FileUploadZone } from "./file-upload-zone"
import { FileDetail } from "./file-detail"

export function ChatFilePanel({ className }: { className?: string }) {
  const t = useT()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const selectedRuntime = useChatStore((s) => s.selectedRuntime)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const reset = useFilePanelStore((s) => s.reset)
  const qc = useQueryClient()
  const { data: sessions } = useChatSessions()
  const activeSession = activeSessionId
    ? sessions?.find((session) => session.id === activeSessionId)
    : undefined
  const fileSessionIds = activeSessionId
    ? resolveFilePanelSessionIds({ activeSession, activeSessionId, selectedRuntime })
    : null

  // Reset file panel state when session changes
  useEffect(() => {
    reset()
  }, [activeSessionId, reset])

  // Layer 1: Invalidate file queries when streaming ends
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      qc.invalidateQueries({ queryKey: sessionFileKeys.lists() })
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming, qc])

  // Layer 2: SSE watch for background file changes
  useFileWatch(fileSessionIds?.watchSessionId ?? null)

  const handleDownloadAll = useCallback(() => {
    if (!fileSessionIds) return
    const url = `/api/v1/chat/sessions/${fileSessionIds.outputSessionId}/files/download-all`
    const a = document.createElement("a")
    a.href = url
    a.download = "output-files.tar.gz"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [fileSessionIds])

  if (!fileSessionIds) return null

  return (
    <div className={cn("flex flex-col bg-background", className)}>
      {/* Header — matches chat header height */}
      <div className="flex h-14 items-center gap-2 px-4">
        <FolderOpen className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("filePanel.title")}</h3>
      </div>

      <Separator />

      {/* Upper area: two columns */}
      <div className="flex h-[35%] min-h-0">
        {/* Input column */}
        <div className="flex w-1/2 flex-col border-r min-h-0">
          <div className="flex items-center px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("filePanel.input")}
            </span>
          </div>
          <FileUploadZone sessionId={fileSessionIds.inputSessionId}>
            <FileTree zone="input" sessionId={fileSessionIds.inputSessionId} />
          </FileUploadZone>
        </div>

        {/* Output / Artifacts column */}
        <div className="flex w-1/2 flex-col min-h-0">
          <div className="flex items-center px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("filePanel.output")}
            </span>
          </div>
          <div className="flex flex-col flex-1 min-h-0">
            <FileTree zone="output" sessionId={fileSessionIds.outputSessionId} />
          </div>
          <div className="flex items-center gap-1 p-1 border-t">
            <Button
              variant="ghost"
              size="xs"
              className="flex-1 bg-muted/50 hover:bg-muted"
              onClick={handleDownloadAll}
            >
              <Download className="size-3" />
              {t("filePanel.downloadAll")}
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* Lower area: file detail / preview */}
      <FileDetail sessionId={fileSessionIds.detailSessionId} />
    </div>
  )
}
