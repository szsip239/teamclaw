'use client'

import { memo, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTheme } from 'next-themes'
import { AlertTriangle, Code2 } from 'lucide-react'
import { useT } from '@/stores/language-store'

const MAX_JSON_LENGTH = 51200 // 50KB

const LIGHT_COLORS = ['#1e6cb5', '#2da695', '#7c3aed', '#d4a017', '#e07b00']
const DARK_COLORS = ['#3b82f6', '#14b8a6', '#8b5cf6', '#a855f7', '#ef4444']

const LIGHT_THEME = {
  color: LIGHT_COLORS,
  backgroundColor: 'transparent',
  textStyle: { color: '#374151', fontSize: 12 },
  title: { textStyle: { color: '#111827', fontSize: 14 } },
  legend: { textStyle: { color: '#6b7280', fontSize: 11 } },
  xAxis: {
    axisLine: { lineStyle: { color: '#d1d5db' } },
    splitLine: { lineStyle: { color: '#e5e7eb' } },
    axisLabel: { color: '#6b7280' },
  },
  yAxis: {
    axisLine: { lineStyle: { color: '#d1d5db' } },
    splitLine: { lineStyle: { color: '#e5e7eb' } },
    axisLabel: { color: '#6b7280' },
    nameTextStyle: { color: '#6b7280' },
  },
}

const DARK_THEME = {
  color: DARK_COLORS,
  backgroundColor: 'transparent',
  textStyle: { color: '#d1d5db', fontSize: 12 },
  title: { textStyle: { color: '#f3f4f6', fontSize: 14 } },
  legend: { textStyle: { color: '#9ca3af', fontSize: 11 } },
  xAxis: {
    axisLine: { lineStyle: { color: '#4b5563' } },
    splitLine: { lineStyle: { color: '#374151' } },
    axisLabel: { color: '#9ca3af' },
  },
  yAxis: {
    axisLine: { lineStyle: { color: '#4b5563' } },
    splitLine: { lineStyle: { color: '#374151' } },
    axisLabel: { color: '#9ca3af' },
    nameTextStyle: { color: '#9ca3af' },
  },
}

/** Deep merge source into target (target is mutated). Source values take precedence for primitives. */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const tVal = target[key]
    const sVal = source[key]
    if (
      tVal &&
      typeof tVal === 'object' &&
      !Array.isArray(tVal) &&
      sVal &&
      typeof sVal === 'object' &&
      !Array.isArray(sVal)
    ) {
      deepMerge(tVal as Record<string, unknown>, sVal as Record<string, unknown>)
    } else {
      target[key] = sVal
    }
  }
  return target
}

/** Recursively strip function values and function-like strings */
function sanitizeOption(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'function') return undefined
  if (typeof obj === 'string') {
    const trimmed = obj.trim()
    if (trimmed.startsWith('function') || trimmed.includes('=>')) return undefined
    return obj
  }
  if (Array.isArray(obj)) return obj.map(sanitizeOption)
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const sanitized = sanitizeOption(value)
      if (sanitized !== undefined) result[key] = sanitized
    }
    return result
  }
  return obj
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Forcefully optimize ECharts layout for chat context.
 * More aggressive than "defaults only" — overrides AI-generated positions
 * that cause overlap in narrow chat containers.
 */
function applyLayoutDefaults(opt: Record<string, any>): Record<string, any> {
  const titleObj = Array.isArray(opt.title) ? opt.title[0] : opt.title
  const hasTitle = !!titleObj?.text
  const hasSubtitle = !!titleObj?.subtext
  const hasLegend = opt.legend !== false && opt.legend !== undefined
  const isPie =
    Array.isArray(opt.series) && opt.series.some((s: any) => s.type === 'pie' || s.type === 'radar')
  const hasDataZoom = Array.isArray(opt.dataZoom) && opt.dataZoom.length > 0

  // 1. Title: reduce subtitle font to save vertical space
  if (hasSubtitle && titleObj) {
    if (!titleObj.subtitleTextStyle) titleObj.subtitleTextStyle = {}
    if (!titleObj.subtitleTextStyle.fontSize) titleObj.subtitleTextStyle.fontSize = 11
    if (!titleObj.itemGap) titleObj.itemGap = 4
  }

  // 2. Toolbox: keep only saveAsImage + dataZoom, strip the rest
  if (opt.toolbox && typeof opt.toolbox === 'object') {
    const feat = opt.toolbox.feature || {}
    const kept: Record<string, any> = {}
    if (feat.saveAsImage) kept.saveAsImage = feat.saveAsImage
    else kept.saveAsImage = { title: '' }
    if (feat.dataZoom) kept.dataZoom = feat.dataZoom
    opt.toolbox = { feature: kept, right: 8, top: hasTitle && hasSubtitle ? 28 : hasTitle ? 4 : 0 }
  }

  // 2. Legend: FORCE to bottom horizontal — top area reserved for title,
  // and vertical orient would overlap a pie/grid chart in narrow chat containers.
  if (hasLegend && typeof opt.legend === 'object' && !Array.isArray(opt.legend)) {
    opt.legend.type = opt.legend.type || 'scroll'
    delete opt.legend.top
    delete opt.legend.left
    delete opt.legend.right
    opt.legend.bottom = hasDataZoom ? 36 : 0
    opt.legend.orient = 'horizontal'
  }

  // 3. Y-axis name: move inside axis to avoid clashing with title/subtitle
  const yAxes = opt.yAxis ? (Array.isArray(opt.yAxis) ? opt.yAxis : [opt.yAxis]) : []
  for (const y of yAxes) {
    if (y.name) {
      y.nameLocation = 'middle'
      y.nameGap = 40
      y.nameRotate = y.position === 'right' ? -90 : 90
    }
  }

  // 4. Grid (skip for pie/radar)
  if (!isPie && (opt.xAxis || opt.yAxis)) {
    if (!opt.grid) opt.grid = {}
    const grid = opt.grid
    grid.containLabel = true
    if (grid.left === undefined) grid.left = 12
    if (grid.right === undefined) grid.right = 16
    grid.top = hasTitle && hasSubtitle ? 68 : hasTitle ? 36 : 16
    // bottom: legend(28) + dataZoom(36) + padding
    grid.bottom = (hasLegend ? 32 : 8) + (hasDataZoom ? 40 : 0)
  }

  // 5. DataZoom: pin to very bottom
  if (hasDataZoom) {
    for (const dz of opt.dataZoom) {
      if (dz.type === 'slider' || dz.show !== false) {
        dz.bottom = 0
        dz.height = 20
      }
    }
  }

  // 6. Tooltip: confine to chart area
  if (!opt.tooltip) opt.tooltip = {}
  if (typeof opt.tooltip === 'object' && !Array.isArray(opt.tooltip)) {
    opt.tooltip.confine = true
  }

  // 7. Pie/Radar: FORCE center & radius to leave room for title + bottom legend
  //    Without this, AI-generated center: ['50%','50%'] overlaps the legend.
  if (isPie && Array.isArray(opt.series)) {
    const centerY =
      hasLegend && hasTitle ? '46%' : hasLegend ? '44%' : hasTitle ? '52%' : '50%'
    for (const s of opt.series) {
      if (s.type === 'pie') {
        s.center = ['50%', centerY]
        if (Array.isArray(s.radius) && s.radius.length === 2) {
          s.radius = ['32%', '58%']
        } else {
          s.radius = '60%'
        }
      } else if (s.type === 'radar') {
        s.center = ['50%', centerY]
      }
    }
  }

  return opt
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ChatChartBlockProps {
  optionJson: string
}

export const ChatChartBlock = memo(function ChatChartBlock({ optionJson }: ChatChartBlockProps) {
  const t = useT()
  const { resolvedTheme } = useTheme()
  const [showRaw, setShowRaw] = useState(false)

  const { option, error } = useMemo(() => {
    if (optionJson.length > MAX_JSON_LENGTH) {
      return { option: null, error: 'chat.chartTooLarge' as const }
    }
    try {
      const parsed = JSON.parse(optionJson)
      const sanitized = sanitizeOption(parsed) as Record<string, unknown>
      return { option: sanitized, error: null }
    } catch {
      // LLMs often output literal newlines inside JSON string values
      // (e.g. ECharts tooltip formatters). JSON forbids unescaped control
      // characters.  Repair all bare control chars inside quoted strings once
      // before reporting the error.  Avoids negative lookbehind (?<!\\) for
      // Safari compatibility.
      try {
        const repaired = optionJson.replace(
          /"([^"\\]*(\\.[^"\\]*)*)"/g,
          (match: string) => match.replace(/\n/g, '\\n').replace(/\t/g, '\\t'),
        )
        const parsed = JSON.parse(repaired)
        const sanitized = sanitizeOption(parsed) as Record<string, unknown>
        return { option: sanitized, error: null }
      } catch {
        return { option: null, error: 'chat.chartJsonInvalid' as const }
      }
    }

  }, [optionJson])

  if (error || !option || showRaw) {
    return (
      <div className="my-2">
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t(error)}
          </div>
        )}
        <div>
          <div className="bg-muted text-muted-foreground rounded-t-md border border-b-0 px-3 py-1 text-[10px] font-mono flex items-center justify-between">
            <span>echarts</span>
            {!error && (
              <button
                onClick={() => setShowRaw(false)}
                className="text-primary hover:underline cursor-pointer"
              >
                {t('chat.chartLoading').replace('...', '').replace('…', '')}
              </button>
            )}
          </div>
          <pre className="bg-muted overflow-x-auto rounded-md rounded-t-none border p-3 text-xs">
            <code>{optionJson}</code>
          </pre>
        </div>
      </div>
    )
  }

  // Deep merge: theme base ← user option (user values win, theme fills gaps)
  const isDark = resolvedTheme === 'dark'
  const themeBase = JSON.parse(JSON.stringify(isDark ? DARK_THEME : LIGHT_THEME))
  const merged = deepMerge(themeBase, option as Record<string, unknown>)
  const final = applyLayoutDefaults(merged)

  return (
    <div className="chat-chart-block my-2">
      <div className="rounded-md border bg-card overflow-hidden">
        <ReactECharts
          option={final}
          opts={{ renderer: 'svg' }}
          style={{ height: 400, width: '100%' }}
          notMerge
        />
        <div className="flex justify-end px-2 pb-1">
          <button
            onClick={() => setShowRaw(true)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Code2 className="h-3 w-3" />
            {t('chat.chartShowRaw')}
          </button>
        </div>
      </div>
    </div>
  )
})
