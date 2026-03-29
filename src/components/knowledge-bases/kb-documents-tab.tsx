"use client"

import { FileText } from "lucide-react"
import { KbDocumentUpload } from "./kb-document-upload"
import { KbDocumentRow } from "./kb-document-row"
import { useDeleteDocument } from "@/hooks/use-knowledge-bases"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import type { KnowledgeDocumentInfo } from "@/types/knowledge-base"

interface KbDocumentsTabProps {
  kbId: string
  documents: KnowledgeDocumentInfo[]
  canManage: boolean
}

export function KbDocumentsTab({ kbId, documents, canManage }: KbDocumentsTabProps) {
  const t = useT()
  const deleteDoc = useDeleteDocument(kbId)

  async function handleDelete(docId: string) {
    try {
      await deleteDoc.mutateAsync(docId)
      toast.success(t('kb.docDeletedMsg'))
    } catch {
      toast.error(t('operationFailed'))
    }
  }

  function handleRetry(_docId: string) {
    // TODO: implement retry by re-uploading
    toast.info("Retry not yet implemented")
  }

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
          <div className="px-4 py-2 text-[12px] font-medium text-muted-foreground border-b">
            {t('kb.docCount', { n: documents.length })}
          </div>
          {documents.map((doc) => (
            <KbDocumentRow
              key={doc.id}
              kbId={kbId}
              doc={doc}
              canManage={canManage}
              onDelete={handleDelete}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}
    </div>
  )
}
