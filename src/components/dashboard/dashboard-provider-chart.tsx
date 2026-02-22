"use client"

import { useT } from "@/stores/language-store"
import type { ProviderDistribution } from "@/types/dashboard"

interface ProviderChartProps {
  data: ProviderDistribution[]
}

const BAR_GRADIENTS = [
  "bg-gradient-to-r from-indigo-500 to-indigo-400",
  "bg-gradient-to-r from-emerald-600 to-emerald-400",
  "bg-gradient-to-r from-cyan-600 to-cyan-400",
  "bg-gradient-to-r from-amber-600 to-amber-400",
  "bg-gradient-to-r from-violet-600 to-violet-400",
  "bg-gradient-to-r from-rose-600 to-rose-400",
]

export function DashboardProviderChart({ data }: ProviderChartProps) {
  const t = useT()

  if (data.length === 0) return null

  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="bg-card rounded-[10px] border p-5 opacity-0 animate-[cardIn_0.5s_ease_0.36s_forwards]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-semibold">
          <svg
            className="text-muted-foreground size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
          {t('dashboard.providerUsage')}
        </span>
        <span className="bg-muted rounded px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {t('dashboard.today')}
        </span>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        {data.map((item, i) => {
          const pct = (item.count / max) * 100
          return (
            <div key={item.provider} className="flex items-center gap-2.5">
              <span className="w-20 shrink-0 text-right text-xs font-medium text-muted-foreground">
                {item.providerName}
              </span>
              <div className="h-[22px] flex-1 overflow-hidden rounded bg-muted dark:bg-black/30">
                <div
                  className={`relative h-full rounded transition-all duration-1000 ${BAR_GRADIENTS[i % BAR_GRADIENTS.length]}`}
                  style={{ width: `${Math.max(pct, 8)}%` }}
                >
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] font-semibold text-white/90">
                    {item.count}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
