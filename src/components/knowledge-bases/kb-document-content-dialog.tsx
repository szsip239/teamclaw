"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, Loader2, ScrollText } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useT } from "@/stores/language-store"
import { splitOcrMarkdownSegments } from "@/lib/knowledge-base/ocr-markdown"
import type { KnowledgeDocumentInfo } from "@/types/knowledge-base"

interface KbDocumentContentDialogProps {
  kbId: string
  doc: KnowledgeDocumentInfo
  open: boolean
  onOpenChange: (open: boolean) => void
}

const markdownComponents: Components = {
  table({ children }) {
    return (
      <div className="my-3 overflow-auto rounded-md border">
        <table className="w-full min-w-max text-xs">{children}</table>
      </div>
    )
  },
  thead({ children }) {
    return <thead className="sticky top-0 z-[1] border-b bg-muted">{children}</thead>
  },
  th({ children }) {
    return <th className="border px-2 py-1.5 text-left font-semibold">{children}</th>
  },
  td({ children }) {
    return <td className="border px-2 py-1.5 align-top">{children}</td>
  },
  img({ src, alt }) {
    if (!src) return null
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ""}
        className="mx-auto my-3 max-h-[520px] max-w-full rounded-md border bg-background object-contain"
        loading="lazy"
      />
    )
  },
  h1({ children }) {
    return <h1 className="mt-5 mb-2 text-xl font-bold first:mt-0">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="mt-5 mb-2 text-lg font-semibold first:mt-0">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="mt-4 mb-1.5 text-base font-semibold first:mt-0">{children}</h3>
  },
  p({ children }) {
    return <p className="my-2 first:mt-0 last:mb-0">{children}</p>
  },
  ul({ children }) {
    return <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>
  },
  ol({ children }) {
    return <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>
  },
  code({ children }) {
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
  },
  pre({ children }) {
    return <pre className="my-3 overflow-auto rounded-md border bg-muted p-3 text-xs">{children}</pre>
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary underline underline-offset-2"
      >
        {children}
      </a>
    )
  },
}

export function KbDocumentContentDialog({
  kbId,
  doc,
  open,
  onOpenChange,
}: KbDocumentContentDialogProps) {
  const t = useT()
  const contentQuery = useQuery({
    queryKey: ["knowledge-bases", "ocr-content", kbId, doc.id],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/v1/knowledge-bases/${kbId}/documents/${doc.id}/content`, {
        credentials: "include",
        signal,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body && typeof body === "object" && "error" in body
          ? String(body.error)
          : t('kb.ocrLoadFailed')
        throw new Error(message)
      }
      return res.text()
    },
    enabled: open,
    staleTime: 60_000,
  })

  const content = contentQuery.data ?? ""
  const error = contentQuery.error instanceof Error ? contentQuery.error.message : null
  const renderedSegments = useMemo(
    () => splitOcrMarkdownSegments(content, kbId, doc.docId),
    [content, kbId, doc.docId],
  )

  function handleDownload() {
    if (!content) return
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = doc.fileName.replace(/\.pdf$/i, ".md")
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            <DialogTitle className="text-base">{t('kb.ocrOriginal')}</DialogTitle>
          </div>
          <DialogDescription className="truncate">{doc.fileName}</DialogDescription>
        </DialogHeader>

        <div className="min-h-[360px] rounded-md border bg-muted/30">
          {contentQuery.isLoading ? (
            <div className="flex h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('loading')}
            </div>
          ) : error ? (
            <div className="flex h-[360px] items-center justify-center px-6 text-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="h-[520px] overflow-auto bg-background p-5">
              {renderedSegments.length > 0 ? (
                <div className="min-w-0 text-sm leading-7">
                  {renderedSegments.map((segment, index) =>
                    segment.type === 'markdown' ? (
                      <ReactMarkdown
                        key={index}
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {segment.content}
                      </ReactMarkdown>
                    ) : (
                      <div
                        key={index}
                        className="my-3 overflow-auto rounded-md border text-xs [&_img]:mx-auto [&_img]:max-h-[520px] [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_table]:w-full [&_table]:min-w-max [&_td]:border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_tr:nth-child(even)]:bg-muted/30"
                        dangerouslySetInnerHTML={{ __html: segment.html }}
                      />
                    ),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noData')}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleDownload}
            disabled={!content}
          >
            <Download className="size-3.5" />
            {t('kb.downloadMarkdown')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
