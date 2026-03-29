"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, Image, Table2 } from "lucide-react"
import { useT } from "@/stores/language-store"
import { markdownTableToHtml, normalizeHtmlTable } from "@/lib/knowledge-base/markdown-table"
import type { ScoredNode } from "@/types/knowledge-base"

interface KbQaSourcesProps {
  kbId: string
  /** Answer sources — the nodes actually used to generate the answer */
  answerSources: ScoredNode[]
  /** Raw retrieval results grouped by type */
  retrievalGroups?: {
    text_results: ScoredNode[]
    image_results: ScoredNode[]
    table_results: ScoredNode[]
  }
  onImageClick: (url: string, title: string) => void
}

function resolveImageUrl(kbId: string, node: ScoredNode): string {
  if (node.image_url) {
    const artifactPath = node.image_url.replace(/^\/artifacts\//, "")
    return `/api/v1/knowledge-bases/${kbId}/artifacts/${artifactPath}`
  }
  return ""
}

// ── Answer Source Pill ────────────────────────────────
function SourcePill({ node }: { node: ScoredNode }) {
  const detail =
    node.kind === "image"
      ? node.summary || node.image_id || ""
      : node.kind === "table"
        ? node.semantic_summary || node.caption || node.summary || node.table_id || ""
        : node.snippet || node.text || ""

  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
        {node.kind}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] line-clamp-2">{detail}</p>
        <p className="text-[9px] text-muted-foreground mt-0.5">
          doc: {(node.doc_id || "-").slice(0, 12)} / p.{node.page_no ?? "-"}
        </p>
      </div>
    </div>
  )
}

// ── Text Result Card ─────────────────────────────────
function TextCard({ node }: { node: ScoredNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-[11px]">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="size-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Score: {node.score.toFixed(3)}</span>
        <span className="text-muted-foreground">p.{node.page_no ?? "-"} / {node.page_label || "-"}</span>
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap leading-relaxed">{node.snippet || node.text || ""}</p>
      <p className="text-[9px] text-muted-foreground mt-1">doc: {node.doc_id || "-"}</p>
    </div>
  )
}

// ── Image Result Card ────────────────────────────────
function ImageCard({ node, kbId, onImageClick }: { node: ScoredNode; kbId: string; onImageClick: (url: string, title: string) => void }) {
  const url = resolveImageUrl(kbId, node)
  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-[11px]">
      <div className="flex items-center gap-2 mb-1">
        <Image className="size-3 text-muted-foreground shrink-0" />
        <span className="font-medium">{node.summary || node.image_id || "Image"}</span>
        <span className="text-muted-foreground ml-auto">Score: {node.score.toFixed(3)}</span>
      </div>
      <p className="text-[9px] text-muted-foreground mb-1.5">doc: {node.doc_id || "-"} / p.{node.page_no ?? "-"}</p>
      {url ? (
        <button
          className="rounded overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all"
          onClick={() => onImageClick(url, node.summary || `Image p.${node.page_no ?? "?"}`)}
        >
          <img src={url} alt={node.summary || ""} className="max-h-32 object-contain" loading="lazy" />
        </button>
      ) : (
        <div className="flex h-16 items-center justify-center rounded bg-muted">
          <Image className="size-5 text-muted-foreground/40" />
        </div>
      )}
    </div>
  )
}

// ── Table Result Card ────────────────────────────────
function TableCard({ node, kbId }: { node: ScoredNode; kbId: string }) {
  const semanticSummary = node.semantic_summary || node.summary || ""
  const tableHtml = node.raw_table
    ? node.raw_format === "html"
      ? normalizeHtmlTable(node.raw_table, kbId, node.doc_id)
      : markdownTableToHtml(node.raw_table, kbId, node.doc_id)
    : ""

  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-[11px]">
      <div className="flex items-center gap-2 mb-1">
        <Table2 className="size-3 text-muted-foreground shrink-0" />
        <span className="font-medium">{node.caption || node.summary || node.table_id || "Table"}</span>
        <span className="text-muted-foreground ml-auto">Score: {node.score.toFixed(3)}</span>
      </div>
      <p className="text-[9px] text-muted-foreground mb-1">doc: {node.doc_id || "-"} / p.{node.page_no ?? "-"}</p>
      {semanticSummary && <p className="text-[10px] text-muted-foreground mb-1.5 italic">{semanticSummary}</p>}
      {tableHtml ? (
        <div
          className="max-h-40 overflow-auto text-[10px] [&_table]:w-full [&_table]:text-[10px] [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_th]:border [&_th]:bg-muted/50 [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:border [&_img]:max-h-16 [&_img]:inline"
          dangerouslySetInnerHTML={{ __html: tableHtml }}
        />
      ) : (
        <p className="text-[10px] leading-relaxed text-muted-foreground line-clamp-4 whitespace-pre-wrap">
          {node.normalized_table_text || semanticSummary}
        </p>
      )}
    </div>
  )
}

// ── Main Sources Component ───────────────────────────
export function KbQaSources({ kbId, answerSources, retrievalGroups, onImageClick }: KbQaSourcesProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  const totalSources = answerSources.length
  const hasRetrieval = retrievalGroups && (
    retrievalGroups.text_results.length > 0 ||
    retrievalGroups.image_results.length > 0 ||
    retrievalGroups.table_results.length > 0
  )

  if (totalSources === 0 && !hasRetrieval) return null

  const textCount = retrievalGroups?.text_results.length ?? answerSources.filter((s) => s.kind === "text").length
  const imageCount = retrievalGroups?.image_results.length ?? answerSources.filter((s) => s.kind === "image").length
  const tableCount = retrievalGroups?.table_results.length ?? answerSources.filter((s) => s.kind === "table").length

  const summary = [
    textCount > 0 ? `${textCount} text` : null,
    imageCount > 0 ? `${imageCount} image` : null,
    tableCount > 0 ? `${tableCount} table` : null,
  ].filter(Boolean).join(" · ")

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
        <div className="mt-2 space-y-4 max-h-[500px] overflow-y-auto">
          {/* Layer 1: Answer Sources (pills) */}
          {answerSources.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                {t("kb.qaSources")}
              </h4>
              <div className="space-y-1.5">
                {answerSources.map((node, i) => (
                  <SourcePill key={i} node={node} />
                ))}
              </div>
            </div>
          )}

          {/* Layer 2: Retrieval Results (grouped by type) */}
          {hasRetrieval && (
            <div className="space-y-3">
              <h4 className="text-[11px] font-semibold text-muted-foreground border-t pt-2">
                Retrieval Results
              </h4>

              {/* Text results */}
              {retrievalGroups!.text_results.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-medium text-muted-foreground mb-1">
                    Text ({retrievalGroups!.text_results.length})
                  </h5>
                  <div className="space-y-1.5">
                    {retrievalGroups!.text_results.map((node, i) => (
                      <TextCard key={i} node={node} />
                    ))}
                  </div>
                </div>
              )}

              {/* Image results */}
              {retrievalGroups!.image_results.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-medium text-muted-foreground mb-1">
                    Images ({retrievalGroups!.image_results.length})
                  </h5>
                  <div className="grid grid-cols-2 gap-1.5">
                    {retrievalGroups!.image_results.map((node, i) => (
                      <ImageCard key={i} node={node} kbId={kbId} onImageClick={onImageClick} />
                    ))}
                  </div>
                </div>
              )}

              {/* Table results */}
              {retrievalGroups!.table_results.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-medium text-muted-foreground mb-1">
                    Tables ({retrievalGroups!.table_results.length})
                  </h5>
                  <div className="space-y-1.5">
                    {retrievalGroups!.table_results.map((node, i) => (
                      <TableCard key={i} node={node} kbId={kbId} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
