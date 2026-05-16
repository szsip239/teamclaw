"use client"

import { useState } from "react"
import { FileText, Trash2, RotateCw, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KbDocumentStatusBadge } from "./kb-document-status-badge"
import { KbIngestionLog } from "./kb-ingestion-log"
import { KbDocumentContentDialog } from "./kb-document-content-dialog"
import { useT } from "@/stores/language-store"
import type { KnowledgeDocumentInfo } from "@/types/knowledge-base"

interface KbDocumentRowProps {
  kbId: string
  doc: KnowledgeDocumentInfo
  canManage: boolean
  onDelete: (docId: string) => void
  onRetry: (docId: string) => void
  isRetrying?: boolean
}

export function KbDocumentRow({ kbId, doc, canManage, onDelete, onRetry, isRetrying }: KbDocumentRowProps) {
  const t = useT()
  const [contentOpen, setContentOpen] = useState(false)

  const sizeStr = doc.fileSize < 1024 * 1024
    ? `${(doc.fileSize / 1024).toFixed(1)} KB`
    : `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`

  const timeAgo = formatTimeAgo(doc.createdAt)

  return (
    <div className="border-b last:border-b-0 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <FileText className="size-5 shrink-0 text-muted-foreground/50" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium truncate">{doc.fileName}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{sizeStr}</span>
              {doc.pageCount && (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {t('kb.pages', { n: doc.pageCount })}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <KbDocumentStatusBadge status={doc.status} />
              <span>{timeAgo}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2">
          {doc.status === "SUCCEEDED" && doc.hasOcrContent && (
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={() => setContentOpen(true)}
              title={t('kb.viewOcrOriginal')}
            >
              <ScrollText className="size-3.5" />
            </Button>
          )}
          {canManage && (
            <>
              {doc.status === "FAILED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  onClick={() => onRetry(doc.id)}
                  disabled={isRetrying}
                  title={t('kb.retry')}
                >
                  <RotateCw className={`size-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(doc.id)}
                title={t('kb.deleteDoc')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Show ingestion log for PROCESSING documents */}
      {doc.status === "PROCESSING" && doc.jobId && (
        <KbIngestionLog kbId={kbId} docId={doc.id} jobId={doc.jobId} />
      )}

      {/* Show error for FAILED documents */}
      {doc.status === "FAILED" && doc.errorMessage && (
        <p className="mt-1.5 text-[11px] text-destructive">
          {doc.errorMessage}
        </p>
      )}

      <KbDocumentContentDialog
        kbId={kbId}
        doc={doc}
        open={contentOpen}
        onOpenChange={setContentOpen}
      />
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}
