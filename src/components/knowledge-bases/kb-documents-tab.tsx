"use client"

import { useState } from "react"
import { FileText, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KbDocumentUpload } from "./kb-document-upload"
import { KbDocumentRow } from "./kb-document-row"
import { useDeleteDocument } from "@/hooks/use-knowledge-bases"
import { useT } from "@/stores/language-store"
import { api } from "@/lib/api-client"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { kbKeys } from "@/hooks/use-knowledge-bases"
import type { KnowledgeDocumentInfo } from "@/types/knowledge-base"

interface KbDocumentsTabProps {
  kbId: string
  documents: KnowledgeDocumentInfo[]
  canManage: boolean
}

export function KbDocumentsTab({ kbId, documents, canManage }: KbDocumentsTabProps) {
  const t = useT()
  const qc = useQueryClient()
  const deleteDoc = useDeleteDocument(kbId)
  const [retrying, setRetrying] = useState<Set<string>>(new Set())
  const [cleaning, setCleaning] = useState(false)

  async function handleDelete(docId: string) {
    try {
      await deleteDoc.mutateAsync(docId)
      toast.success(t('kb.docDeletedMsg'))
      qc.invalidateQueries({ queryKey: kbKeys.detail(kbId) })
    } catch {
      toast.error(t('operationFailed'))
    }
  }

  async function handleRetry(docId: string) {
    setRetrying((s) => new Set(s).add(docId))
    try {
      const res = await api.post<{ jobId: string; status: string }>(
        `/api/v1/knowledge-bases/${kbId}/documents/${docId}/retry`,
      )
      toast.success('Re-indexing started')
      qc.invalidateQueries({ queryKey: kbKeys.detail(kbId) })
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error || 'Retry failed',
      )
    } finally {
      setRetrying((s) => {
        const next = new Set(s)
        next.delete(docId)
        return next
      })
    }
  }

  async function handleCleanFailed() {
    setCleaning(true)
    try {
      // Delete all FAILED docs one by one
      const failedDocs = documents.filter((d) => d.status === 'FAILED')
      for (const doc of failedDocs) {
        try {
          await deleteDoc.mutateAsync(doc.id)
        } catch { /* skip individual failures */ }
      }
      toast.success(`Cleaned ${failedDocs.length} failed documents`)
      qc.invalidateQueries({ queryKey: kbKeys.detail(kbId) })
    } catch {
      toast.error('Cleanup failed')
    } finally {
      setCleaning(false)
    }
  }

  const failedCount = documents.filter((d) => d.status === 'FAILED').length

  return (
    <div className="space-y-4">
      {canManage && <KbDocumentUpload kbId={kbId} />}

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="size-8 text-muted-foreground/40" />
          <h3 className="mt-3 text-sm font-medium">{t('kb.noDocuments')}</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {t('kb.noDocumentsHint')}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <div className="px-4 py-2 flex items-center justify-between border-b">
            <span className="text-[12px] font-medium text-muted-foreground">
              {t('kb.docCount', { n: documents.length })}
            </span>
            {canManage && failedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                onClick={handleCleanFailed}
                disabled={cleaning}
              >
                {cleaning ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="size-3 mr-1" />
                )}
                Clear {failedCount} failed
              </Button>
            )}
          </div>
          {documents.map((doc) => (
            <KbDocumentRow
              key={doc.id}
              kbId={kbId}
              doc={doc}
              canManage={canManage}
              onDelete={handleDelete}
              onRetry={handleRetry}
              isRetrying={retrying.has(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
