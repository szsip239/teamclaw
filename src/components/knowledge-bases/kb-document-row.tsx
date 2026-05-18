"use client"

import { useState } from "react"
import { FileText, Info, RotateCw, ScrollText, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KbDocumentStatusBadge } from "./kb-document-status-badge"
import { KbIngestionLog } from "./kb-ingestion-log"
import { KbDocumentContentDialog } from "./kb-document-content-dialog"
import { KbDocumentOriginalSheet } from "./kb-document-original-sheet"
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
  const [originalOpen, setOriginalOpen] = useState(false)
  const [indexInfoOpen, setIndexInfoOpen] = useState(doc.status === "PROCESSING")

  const sizeStr = doc.fileSize < 1024 * 1024
    ? `${(doc.fileSize / 1024).toFixed(1)} KB`
    : `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`

  const timeAgo = formatTimeAgo(doc.createdAt)
  const canRebuild = canManage && doc.status !== "PROCESSING"
  const indexInfo = doc.indexInfo
  const indexedPageLabel = indexInfo
    ? `${indexInfo.indexedPageCount}/${indexInfo.pageCount ?? doc.pageCount ?? "—"}`
    : "—"
  const profileStatusLabel = formatProfileStatus(indexInfo?.profileStatus)

  return (
    <div className="border-b last:border-b-0 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:ml-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2 text-[12px]"
            onClick={() => setIndexInfoOpen((v) => !v)}
          >
            <Info className="size-3.5" />
            {indexInfoOpen ? t('kb.hideIndexInfo') : t('kb.indexInfo')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2 text-[12px]"
            onClick={() => setOriginalOpen(true)}
          >
            <FileText className="size-3.5" />
            {t('kb.viewOriginal')}
          </Button>
          {doc.status === "SUCCEEDED" && doc.hasOcrContent && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[12px]"
              onClick={() => setContentOpen(true)}
              title={t('kb.viewOcrOriginal')}
            >
              <ScrollText className="size-3.5" />
              OCR
            </Button>
          )}
          {canManage && (
            <>
              {canRebuild && (
                <Button
                  variant={doc.status === "FAILED" ? "destructive" : "outline"}
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-[12px]"
                  onClick={() => onRetry(doc.id)}
                  disabled={isRetrying}
                  title={t('kb.rebuildIndex')}
                >
                  <RotateCw className={`size-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  {t('kb.rebuildIndex')}
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

      {indexInfoOpen && (
        <div className="mt-3 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
            <InfoItem label="索引状态" value={statusLabel(doc.status, t)} />
            <InfoItem label="画像状态" value={profileStatusLabel} />
            <InfoItem label="文档类型" value={indexInfo?.docType || "—"} />
            <InfoItem label="页级索引" value={indexedPageLabel} />
            <InfoItem label="索引行数" value={indexInfo ? String(indexInfo.indexRowCount) : "—"} />
            <InfoItem label="向量行数" value={indexInfo ? String(indexInfo.embeddedRowCount) : "—"} />
            <InfoItem label="大小" value={sizeStr} />
            <InfoItem label="更新时间" value={formatTimeAgo(indexInfo?.updatedAt || doc.updatedAt)} />
          </div>

          {indexInfo?.summary && (
            <InfoBlock label="摘要" value={indexInfo.summary} />
          )}
          {indexInfo?.chapterSummary && (
            <InfoBlock label="内容分布" value={indexInfo.chapterSummary} preWrap />
          )}
          {indexInfo?.keywords?.length ? (
            <TagList label="关键词" values={indexInfo.keywords} />
          ) : null}
          {indexInfo?.titleAliases?.length ? (
            <TagList label="别名" values={indexInfo.titleAliases} />
          ) : null}
          {indexInfo?.profileDetail && (
            <InfoBlock label="画像详情" value={indexInfo.profileDetail} />
          )}
          {doc.status === "SUCCEEDED" && !indexInfo?.profileDetail && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('kb.indexReadyDetail')}
            </p>
          )}
          {doc.status === "PENDING" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('kb.indexWaitingDetail')}
            </p>
          )}
          {doc.jobId && (
            <KbIngestionLog
              kbId={kbId}
              docId={doc.id}
              jobId={doc.jobId}
              defaultExpanded
            />
          )}
        </div>
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
      <KbDocumentOriginalSheet
        kbId={kbId}
        doc={doc}
        open={originalOpen}
        onOpenChange={setOriginalOpen}
      />
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground/70">{label}</span>
      <div className="truncate text-foreground/80">{value}</div>
    </div>
  )
}

function InfoBlock({ label, value, preWrap = false }: { label: string; value: string; preWrap?: boolean }) {
  return (
    <div className="mt-3 text-[11px]">
      <div className="mb-1 text-muted-foreground/70">{label}</div>
      <div className={`text-foreground/80 ${preWrap ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </div>
    </div>
  )
}

function TagList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-3 text-[11px]">
      <div className="mb-1 text-muted-foreground/70">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-md border bg-background px-1.5 py-0.5 text-foreground/80"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

function statusLabel(status: KnowledgeDocumentInfo["status"], t: ReturnType<typeof useT>) {
  if (status === "SUCCEEDED") return t('kb.docSucceeded')
  if (status === "PROCESSING") return t('kb.docProcessing')
  if (status === "FAILED") return t('kb.docFailed')
  return t('kb.docPending')
}

function formatProfileStatus(status?: string | null) {
  if (status === "done") return "已生成"
  if (status === "processing") return "生成中"
  if (status === "failed") return "失败"
  return "待生成"
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
