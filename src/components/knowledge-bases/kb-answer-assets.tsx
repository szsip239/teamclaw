"use client"

import { Image, Table2 } from "lucide-react"
import { useT } from "@/stores/language-store"
import { markdownTableToHtml, normalizeHtmlTable } from "@/lib/knowledge-base/markdown-table"
import type { ScoredNode } from "@/types/knowledge-base"

interface KbAnswerAssetsProps {
  kbId: string
  assets: ScoredNode[]
  onImageClick: (url: string, title: string) => void
}

function resolveImageUrl(kbId: string, node: ScoredNode): string {
  if (node.image_url) {
    const artifactPath = node.image_url.replace(/^\/artifacts\//, "")
    return `/api/v1/knowledge-bases/${kbId}/artifacts/${artifactPath}`
  }
  return ""
}

export function KbAnswerAssets({ kbId, assets, onImageClick }: KbAnswerAssetsProps) {
  const t = useT()

  if (assets.length === 0) return null

  return (
    <div className="mt-3">
      <p className="text-[12px] font-medium text-muted-foreground mb-2">
        {t("kb.qaAssets")}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {assets.map((asset, i) => {
          if (asset.kind === "image") {
            const url = resolveImageUrl(kbId, asset)
            return (
              <button
                key={i}
                className="group relative rounded-lg border bg-muted/30 p-2 text-left transition-all hover:ring-2 hover:ring-primary/30"
                onClick={() => url && onImageClick(url, asset.summary || `Image p.${asset.page_no ?? "?"}`)}
              >
                {url ? (
                  <img src={url} alt={asset.summary || ""} className="w-full h-20 object-cover rounded" loading="lazy" />
                ) : (
                  <div className="flex h-20 items-center justify-center rounded bg-muted">
                    <Image className="size-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground line-clamp-1">
                    {asset.summary || asset.image_id || "Image"}
                  </p>
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    p.{asset.page_no ?? "-"}
                  </span>
                </div>
              </button>
            )
          }

          if (asset.kind === "table") {
            const semanticSummary = asset.semantic_summary || asset.summary || ""
            const tableHtml =
              asset.raw_table
                ? asset.raw_format === "html"
                  ? normalizeHtmlTable(asset.raw_table, kbId, asset.doc_id)
                  : markdownTableToHtml(asset.raw_table, kbId, asset.doc_id)
                : ""

            return (
              <div key={i} className="rounded-lg border bg-muted/30 p-2 col-span-2 sm:col-span-3 md:col-span-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Table2 className="size-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-medium">
                      {asset.caption || asset.summary || asset.table_id || "Table"}
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">p.{asset.page_no ?? "-"}</span>
                </div>
                {semanticSummary && (
                  <p className="text-[10px] text-muted-foreground mb-1.5 italic">{semanticSummary}</p>
                )}
                {tableHtml ? (
                  <div
                    className="max-h-48 overflow-auto text-[10px] [&_table]:w-full [&_table]:text-[10px] [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_th]:border [&_th]:bg-muted/50 [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:border [&_img]:max-h-16 [&_img]:inline"
                    dangerouslySetInnerHTML={{ __html: tableHtml }}
                  />
                ) : (
                  <p className="text-[10px] text-muted-foreground line-clamp-3">
                    {asset.normalized_table_text || semanticSummary}
                  </p>
                )}
              </div>
            )
          }

          // Text asset (fallback)
          return (
            <div key={i} className="rounded-lg border bg-muted/30 p-2 col-span-2">
              <p className="text-[10px] text-muted-foreground line-clamp-3">
                {asset.snippet || asset.text || ""}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
