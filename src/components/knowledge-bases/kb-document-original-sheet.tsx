'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ExternalLink, FileText, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useT } from '@/stores/language-store'
import type { KnowledgeDocumentInfo } from '@/types/knowledge-base'

interface KbDocumentOriginalSheetProps {
  kbId: string
  doc: KnowledgeDocumentInfo
  open: boolean
  page?: number | null
  onOpenChange: (open: boolean) => void
}

// Cache blob URLs per document so reopening the same doc is instant.
// Cleared on full page unmount inside the effect below.
const blobCache = new Map<string, string>()

export function KbDocumentOriginalSheet({
  kbId,
  doc,
  open,
  page,
  onOpenChange,
}: KbDocumentOriginalSheetProps) {
  const t = useT()
  const titleId = useId()
  const descriptionId = useId()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fetchedDocIdRef = useRef<string | null>(null)
  const originalUrl = `/api/v1/knowledge-bases/${kbId}/documents/${doc.id}/file`
  const targetPage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1
  // PDF.js bundled viewer (~10× faster than the browser's built-in reader
  // for big PDFs because it does HTTP Range + virtual scrolling). We
  // pre-fetch the whole file as a Blob and hand PDF.js a blob URL so the
  // dev-mode Next.js proxy isn't hit per Range request.
  const pdfUrl = blobUrl
    ? `/pdfjs/web/viewer.html?file=${encodeURIComponent(blobUrl)}#page=${targetPage}&toolbar=1&view=FitH`
    : null
  const shouldRenderContent = open || !!blobUrl || !!error

  // Pre-fetch the PDF as a Blob the first time the sheet opens for this doc.
  useEffect(() => {
    if (!open) return
    if (fetchedDocIdRef.current === doc.id && blobUrl) return

    const cached = blobCache.get(doc.id)
    if (cached) {
      fetchedDocIdRef.current = doc.id
      // Hydrate the cached blob URL after the effect has subscribed to the
      // current document/open state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlobUrl(cached)
      setError(null)
      return
    }

    let cancelled = false
    fetchedDocIdRef.current = doc.id
    setBlobUrl(null)
    setError(null)
    fetch(originalUrl, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        blobCache.set(doc.id, url)
        setBlobUrl(url)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || 'load failed')
      })
    return () => {
      cancelled = true
    }
  }, [open, doc.id, originalUrl, blobUrl])

  // Free cached blob URLs on full component unmount (route change /
  // logout) so we don't leak memory.
  useEffect(() => {
    return () => {
      for (const url of blobCache.values()) {
        URL.revokeObjectURL(url)
      }
      blobCache.clear()
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onOpenChange, open])

  function handleOpenInNewTab() {
    window.open(originalUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label={t('kb.closeOriginalPreview')}
          className="fixed inset-0 z-40 cursor-default bg-black/50"
          onClick={() => onOpenChange(false)}
        />
      )}

      <div
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={open ? titleId : undefined}
        aria-describedby={open ? descriptionId : undefined}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[min(100vw,680px)] transform-gpu flex-col border-l bg-background shadow-lg transition-transform will-change-transform sm:w-[min(41vw,680px)]',
          open ? 'translate-x-0 duration-200 ease-out' : 'translate-x-full duration-150 ease-in',
        )}
      >
        <div className="border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3 pr-1">
            <div className="flex min-w-0 items-start gap-2.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-sm font-semibold">
                  {t('kb.originalPreview')}
                </h2>
                <p id={descriptionId} className="truncate text-[12px] text-muted-foreground">
                  {doc.fileName}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2 text-[12px]"
                onClick={handleOpenInNewTab}
                disabled={!open}
              >
                <ExternalLink className="size-3.5" />
                {t('kb.openOriginalInNewTab')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                aria-label={t('kb.closeOriginalPreview')}
                onClick={() => onOpenChange(false)}
                disabled={!open}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 bg-muted/30">
          {shouldRenderContent && error ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">
              PDF 加载失败：{error}
            </div>
          ) : shouldRenderContent && pdfUrl ? (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title={`${t('kb.originalPreview')} - ${doc.fileName}`}
              className="h-full min-h-0 flex-1 border-0 bg-background"
            />
          ) : shouldRenderContent ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在加载 PDF…
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
