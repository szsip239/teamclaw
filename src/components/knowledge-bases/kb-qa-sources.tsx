"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, Image, Table2 } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { ScoredNode } from "@/types/knowledge-base"

interface KbQaSourcesProps {
  kbId: string
  sources: ScoredNode[]
  onImageClick: (url: string, title: string) => void
}

function resolveImageUrl(kbId: string, node: ScoredNode): string {
  if (node.image_url) {
    const artifactPath = node.image_url.replace(/^\/artifacts\//, "")
    return `/api/v1/knowledge-bases/${kbId}/artifacts/${artifactPath}`
  }
  return ""
}

const KIND_ICONS: Record<string, typeof FileText> = {
  text: FileText,
  image: Image,
  table: Table2,
}

export function KbQaSources({ kbId, sources, onImageClick }: KbQaSourcesProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null

  const textCount = sources.filter((s) => s.kind === "text").length
  const imageCount = sources.filter((s) => s.kind === "image").length
  const tableCount = sources.filter((s) => s.kind === "table").length

  const summary = [
    textCount > 0 ? `${textCount} text` : null,
    imageCount > 0 ? `${imageCount} image` : null,
    tableCount > 0 ? `${tableCount} table` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {t("kb.qaSources")} ({summary})
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto">
          {sources.map((source, i) => {
            const Icon = KIND_ICONS[source.kind] || FileText

            // --- Image source ---
            if (source.kind === "image") {
              const url = resolveImageUrl(kbId, source)
              return (
                <div key={i} className="rounded-md border bg-muted/30 p-3 text-[12px]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Image className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Score: {source.score.toFixed(3)}
                    </span>
                    {source.page_label && (
                      <span className="text-muted-foreground">p.{source.page_label}</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {url ? (
                      <button
                        className="shrink-0 rounded overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all"
                        onClick={() => onImageClick(url, source.summary || `Image p.${source.page_no ?? "?"}`)}
                      >
                        <img
                          src={url}
                          alt={source.summary || ""}
                          className="w-24 h-16 object-cover"
                          loading="lazy"
                        />
                      </button>
                    ) : (
                      <div className="flex w-24 h-16 items-center justify-center rounded bg-muted shrink-0">
                        <Image className="size-5 text-muted-foreground/40" />
                      </div>
                    )}
                    <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                      {source.summary || source.text || ""}
                    </p>
                  </div>
                </div>
              )
            }

            // --- Table source ---
            if (source.kind === "table") {
              return (
                <div key={i} className="rounded-md border bg-muted/30 p-3 text-[12px]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Table2 className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Score: {source.score.toFixed(3)}
                    </span>
                    {source.page_label && (
                      <span className="text-muted-foreground">p.{source.page_label}</span>
                    )}
                    {source.caption && (
                      <span className="text-muted-foreground truncate">{source.caption}</span>
                    )}
                  </div>
                  {source.raw_table ? (
                    <div
                      className="max-h-40 overflow-auto text-[10px] [&_table]:w-full [&_table]:text-[10px] [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_th]:border [&_th]:bg-muted/50 [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:border"
                      dangerouslySetInnerHTML={{
                        __html: source.raw_format === "html"
                          ? source.raw_table
                          : `<pre class="whitespace-pre-wrap text-[10px]">${source.raw_table.replace(/</g, "&lt;")}</pre>`,
                      }}
                    />
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                      {source.semantic_summary || source.normalized_table_text || source.text || ""}
                    </p>
                  )}
                </div>
              )
            }

            // --- Text source ---
            return (
              <div key={i} className="rounded-md border bg-muted/30 p-3 text-[12px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    Score: {source.score.toFixed(3)}
                  </span>
                  {source.page_label && (
                    <span className="text-muted-foreground">p.{source.page_label}</span>
                  )}
                  {source.doc_id && (
                    <span className="text-muted-foreground truncate text-[10px]">
                      {source.doc_id}
                    </span>
                  )}
                </div>
                <p className="line-clamp-4 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {source.snippet || source.text || ""}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
