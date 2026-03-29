'use client'

import { Image, Table2 } from 'lucide-react'
import { useT } from '@/stores/language-store'
import type { ScoredNode } from '@/types/knowledge-base'

interface KbAnswerAssetsProps {
  kbId: string
  assets: ScoredNode[]
  onImageClick: (url: string, title: string) => void
}

function resolveImageUrl(kbId: string, node: ScoredNode): string {
  // image_url from web_helpers: /artifacts/{doc_id}/images/...
  // Proxy through TeamClaw: /api/v1/knowledge-bases/{kbId}/artifacts/{doc_id}/images/...
  if (node.image_url) {
    const artifactPath = node.image_url.replace(/^\/artifacts\//, '')
    return `/api/v1/knowledge-bases/${kbId}/artifacts/${artifactPath}`
  }
  return ''
}

export function KbAnswerAssets({ kbId, assets, onImageClick }: KbAnswerAssetsProps) {
  const t = useT()

  if (assets.length === 0) return null

  return (
    <div className="mt-3">
      <p className="text-[12px] font-medium text-muted-foreground mb-2">{t('kb.qaAssets')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {assets.map((asset, i) => {
          if (asset.kind === 'image') {
            const url = resolveImageUrl(kbId, asset)
            return (
              <button
                key={i}
                className="group relative rounded-lg border bg-muted/30 p-2 text-left transition-all hover:ring-2 hover:ring-primary/30"
                onClick={() =>
                  url && onImageClick(url, asset.summary || `Image p.${asset.page_no ?? '?'}`)
                }
              >
                {url ? (
                  <img
                    src={url}
                    alt={asset.summary || ''}
                    className="w-full h-20 object-cover rounded"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-20 items-center justify-center rounded bg-muted">
                    <Image className="size-6 text-muted-foreground/40" />
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-muted-foreground line-clamp-2">
                  {asset.summary || `Page ${asset.page_no ?? '?'}`}
                </p>
              </button>
            )
          }

          if (asset.kind === 'table') {
            return (
              <div key={i} className="rounded-lg border bg-muted/30 p-2 col-span-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Table2 className="size-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {asset.caption || asset.summary || `Table p.${asset.page_no ?? '?'}`}
                  </span>
                </div>
                {asset.raw_table ? (
                  <div
                    className="max-h-32 overflow-auto text-[10px] [&_table]:w-full [&_table]:text-[10px] [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_th]:border [&_th]:bg-muted/50 [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:border"
                    dangerouslySetInnerHTML={{
                      __html:
                        asset.raw_format === 'html'
                          ? asset.raw_table
                          : `<pre class="whitespace-pre-wrap text-[10px]">${asset.raw_table.replace(/</g, '&lt;')}</pre>`,
                    }}
                  />
                ) : (
                  <p className="text-[10px] text-muted-foreground line-clamp-3">
                    {asset.normalized_table_text || asset.summary}
                  </p>
                )}
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
