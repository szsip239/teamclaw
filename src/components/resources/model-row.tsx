"use client"

import { Badge } from "@/components/ui/badge"
import {
  Brain,
  Eye,
  Coins,
  TextCursorInput,
} from "lucide-react"
import { useT } from "@/stores/language-store"
import type { ModelDefinition } from "@/types/resource"

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return String(n)
}

interface ModelRowProps {
  model: ModelDefinition
  actions?: React.ReactNode
}

export function ModelRow({ model, actions }: ModelRowProps) {
  const t = useT()
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{model.name || model.id}</span>
          {model.reasoning && (
            <Badge
              variant="secondary"
              className="gap-1 px-1.5 py-0 text-[10px] font-normal bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0"
            >
              <Brain className="size-2.5" />
              {t('resource.reasoning')}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
          <span>{model.id}</span>
          {model.contextWindow && (
            <span className="flex items-center gap-0.5">
              <TextCursorInput className="size-2.5" />
              {formatTokens(model.contextWindow)}
            </span>
          )}
          {model.maxTokens && (
            <span>max: {formatTokens(model.maxTokens)}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Input modalities */}
        {model.input && model.input.length > 0 && (
          <div className="flex items-center gap-1">
            {model.input.map((m) => (
              <Badge
                key={m}
                variant="outline"
                className="px-1.5 py-0 text-[10px] font-normal"
              >
                {m === "image" ? (
                  <Eye className="mr-0.5 size-2.5" />
                ) : null}
                {m}
              </Badge>
            ))}
          </div>
        )}

        {/* Cost */}
        {model.cost && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
            <Coins className="size-3" />
            <span>${model.cost.input}/{model.cost.output}</span>
          </div>
        )}

        {actions}
      </div>
    </div>
  )
}
