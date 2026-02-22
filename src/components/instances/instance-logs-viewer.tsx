"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, Terminal } from "lucide-react"
import { useT } from "@/stores/language-store"
import { useInstanceLogs } from "@/hooks/use-instances"

interface InstanceLogsViewerProps {
  instanceId: string
}

export function InstanceLogsViewer({ instanceId }: InstanceLogsViewerProps) {
  const t = useT()
  const { data, isLoading, error, refetch, isFetching } =
    useInstanceLogs(instanceId, 300)
  const scrollRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [data?.logs])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center">
        <p className="text-[13px] text-muted-foreground">
          {(error as { data?: { error?: string } })?.data?.error ||
            t('instance.logsError')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="size-3.5 text-muted-foreground/60" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            {t('instance.logsRecent')}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          {isFetching ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          {t('refresh')}
        </Button>
      </div>
      <pre
        ref={scrollRef}
        className="max-h-[420px] overflow-auto rounded-lg border bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap break-words dark:bg-zinc-950/80 dark:ring-1 dark:ring-white/[0.06]"
      >
        {data?.logs || t('instance.noLogs')}
      </pre>
    </div>
  )
}
