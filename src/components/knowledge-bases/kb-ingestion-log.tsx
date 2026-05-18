'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useJobStatus, kbKeys } from '@/hooks/use-knowledge-bases'
import { useT } from '@/stores/language-store'

interface KbIngestionLogProps {
  kbId: string
  docId: string
  jobId: string
  defaultExpanded?: boolean
}

export function KbIngestionLog({
  kbId,
  docId,
  jobId,
  defaultExpanded = true,
}: KbIngestionLogProps) {
  const t = useT()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const logRef = useRef<HTMLDivElement>(null)

  const { data: jobStatus } = useJobStatus(kbId, docId, jobId)

  // When job completes or fails, refresh the KB detail to update document status
  useEffect(() => {
    if (jobStatus?.status === 'completed' || jobStatus?.status === 'failed') {
      qc.invalidateQueries({ queryKey: kbKeys.detail(kbId) })
      qc.invalidateQueries({ queryKey: kbKeys.documents(kbId) })
      qc.invalidateQueries({ queryKey: kbKeys.lists() })
    }
  }, [jobStatus?.status, kbId, qc])

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current && expanded) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [jobStatus?.logs, expanded])

  if (!jobStatus) return null

  const logs = jobStatus.logs ?? []
  const progress = jobStatus.progress ?? 0
  const boundedProgress = Math.max(0, Math.min(100, progress))
  const progressLabel = jobStatus.status === 'failed'
    ? t('kb.ingestionLogFailed', { n: Math.round(boundedProgress) })
    : jobStatus.status === 'completed'
      ? t('kb.ingestionLogCompleted')
      : t('kb.processing', { n: Math.round(boundedProgress) })

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {progressLabel}
      </button>

      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            jobStatus.status === 'failed'
              ? 'bg-destructive'
              : jobStatus.status === 'completed'
                ? 'bg-emerald-500'
                : 'bg-primary'
          }`}
          style={{ width: `${boundedProgress}%` }}
        />
      </div>

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
