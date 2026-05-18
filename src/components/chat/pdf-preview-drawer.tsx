'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useT } from '@/stores/language-store'

export interface PdfPreviewState {
  kbId: string
  docRowId: string
  docName?: string
  pageIndex?: number
}

interface Props {
  preview: PdfPreviewState | null
  onClose: () => void
}

// Cache blob URLs per docRowId so reopening / page-jumping the same doc
// doesn't re-download. Keys are cleaned up when the drawer unmounts.
const blobCache = new Map<string, { blobUrl: string; bytes: number }>()

/**
 * Right-side drawer that loads a KB document's source PDF and renders it
 * via the bundled PDF.js viewer (same UX as llm-rag).
 *
 * In dev mode each request through the Next.js auth proxy costs ~600ms
 * (Turbopack route compile + Prisma + JWT). PDF.js normally issues 10-20
 * HTTP Range requests per document, multiplying that cost. We work
 * around it by fetching the whole PDF once (one proxy hit) and handing
 * the resulting Blob URL to PDF.js — all subsequent page renders/jumps
 * stay in-memory.
 */
export function PdfPreviewDrawer({ preview, onClose }: Props) {
  const t = useT()
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ESC to close
  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, onClose])

  // Fetch PDF once per docRowId, cache the blob URL across re-renders /
  // reopens. Page jumps within the same doc reuse the cached blob.
  useEffect(() => {
    if (!preview) {
      setBlobUrl(null)
      setError(null)
      return
    }
    const cached = blobCache.get(preview.docRowId)
    if (cached) {
      setBlobUrl(cached.blobUrl)
      setError(null)
      return
    }

    let cancelled = false
    setBlobUrl(null)
    setError(null)
    const fileUrl = `/api/v1/knowledge-bases/${preview.kbId}/documents/${preview.docRowId}/file`
    fetch(fileUrl, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        blobCache.set(preview.docRowId, { blobUrl: url, bytes: blob.size })
        setBlobUrl(url)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || 'load failed')
      })
    return () => {
      cancelled = true
    }
  }, [preview])

  // Free blob URLs on unmount so we don't leak memory across logouts /
  // route changes. Browser tab close handles this anyway but explicit
  // is friendlier.
  useEffect(() => {
    return () => {
      for (const { blobUrl: url } of blobCache.values()) {
        URL.revokeObjectURL(url)
      }
      blobCache.clear()
    }
  }, [])

  if (!preview) return null

  const page = preview.pageIndex && preview.pageIndex > 0 ? preview.pageIndex : 1
  const src = blobUrl
    ? `/pdfjs/web/viewer.html?file=${encodeURIComponent(blobUrl)}#page=${page}`
    : null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
      <aside className="relative flex h-full w-full max-w-[720px] flex-col bg-background shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {preview.docName || t('chat.pdfPreview.title')}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t('chat.pdfPreview.page', { n: page })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        {error ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">
            PDF 加载失败：{error}
          </div>
        ) : src ? (
          <iframe
            key={src}
            src={src}
            className="flex-1 border-0"
            title={preview.docName || 'PDF preview'}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载 PDF…
          </div>
        )}
      </aside>
    </div>
  )
}
