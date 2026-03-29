'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Image, Table2 } from 'lucide-react'
import { useT } from '@/stores/language-store'
import type { RetrievalSource } from '@/types/knowledge-base'

interface KbQaSourcesProps {
  sources: RetrievalSource[]
}

const SOURCE_ICONS: Record<string, typeof FileText> = {
  text: FileText,
  image: Image,
  table: Table2,
}

export function KbQaSources({ sources }: KbQaSourcesProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null

  const textCount = sources.filter((s) => s.source_type === 'text').length
  const imageCount = sources.filter((s) => s.source_type === 'image').length
  const tableCount = sources.filter((s) => s.source_type === 'table').length

  const summary = [
    textCount > 0 ? `${textCount} text` : null,
    imageCount > 0 ? `${imageCount} image` : null,
    tableCount > 0 ? `${tableCount} table` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {t('kb.qaSources')} ({summary})
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto">
          {sources.map((source, i) => {
            const Icon = SOURCE_ICONS[source.source_type] || FileText
            return (
              <div key={i} className="rounded-md border bg-muted/30 p-3 text-[12px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Score: {source.score.toFixed(3)}</span>
                  {source.metadata.file_name != null && (
                    <span className="text-muted-foreground truncate">
                      {String(source.metadata.file_name)}
                    </span>
                  )}
                </div>
                <p className="line-clamp-4 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {source.text}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
