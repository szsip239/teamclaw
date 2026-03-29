"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useJobStatus } from "@/hooks/use-knowledge-bases"
import { useT } from "@/stores/language-store"

interface KbIngestionLogProps {
  kbId: string
  docId: string
  jobId: string
}

export function KbIngestionLog({ kbId, docId, jobId }: KbIngestionLogProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)

  const { data: jobStatus } = useJobStatus(kbId, docId, jobId)

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current && expanded) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [jobStatus?.logs, expanded])

  if (!jobStatus) return null

  const logs = jobStatus.logs ?? []
  const progress = jobStatus.progress ?? 0

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {t('kb.processing', { n: Math.round(progress) })}
      </button>

      {expanded && logs.length > 0 && (
        <div
          ref={logRef}
          className="mt-1.5 max-h-[120px] overflow-y-auto rounded-md bg-muted/50 border p-2 font-mono text-[10px] leading-relaxed text-muted-foreground"
        >
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}
