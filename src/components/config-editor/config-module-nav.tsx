"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useConfigEditorStore } from "@/stores/config-editor-store"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useT, useLanguageStore } from "@/stores/language-store"
import {
  MODULE_CATEGORIES,
  MODULE_KNOWLEDGE,
  getModuleIcon,
  getCategoryLabel,
} from "@/lib/config-editor/config-knowledge"
import type { ConfigModule } from "@/types/config-editor"

export function ConfigModuleNav() {
  const t = useT()
  const locale = useLanguageStore((s) => s.language)
  const modules = useConfigEditorStore((s) => s.modules)
  const selectedModule = useConfigEditorStore((s) => s.selectedModule)
  const selectModule = useConfigEditorStore((s) => s.selectModule)

  // Build a set of all module keys that are covered by categories
  const { categorized, uncategorized } = useMemo(() => {
    const allCategorizedKeys = new Set(
      MODULE_CATEGORIES.flatMap((cat) => cat.modules),
    )
    const moduleMap = new Map(modules.map((m) => [m.key, m]))

    const cats = MODULE_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.modules
        .map((key) => moduleMap.get(key))
        .filter((m): m is ConfigModule => m !== undefined),
    })).filter((cat) => cat.items.length > 0)

    const rest = modules.filter((m) => !allCategorizedKeys.has(m.key))

    return { categorized: cats, uncategorized: rest }
  }, [modules])

  return (
    <div className="w-[220px] shrink-0 border-r">
      <div className="px-3 py-2.5 border-b">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {t('config.modules')}
        </h3>
      </div>
      <ScrollArea className="h-[calc(100%-37px)]">
        <div className="p-2">
          {categorized.map((cat) => (
            <div key={cat.id}>
              <div className="px-3 pt-3 pb-1 first:pt-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  {getCategoryLabel(cat, locale)}
                </span>
              </div>
              <div className="space-y-0.5">
                {cat.items.map((mod) => (
                  <ModuleButton
                    key={mod.key}
                    mod={mod}
                    isSelected={selectedModule === mod.key}
                    onSelect={selectModule}
                  />
                ))}
              </div>
            </div>
          ))}

          {uncategorized.length > 0 && (
            <div>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  {t('config.other')}
                </span>
              </div>
              <div className="space-y-0.5">
                {uncategorized.map((mod) => (
                  <ModuleButton
                    key={mod.key}
                    mod={mod}
                    isSelected={selectedModule === mod.key}
                    onSelect={selectModule}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ModuleButton({
  mod,
  isSelected,
  onSelect,
}: {
  mod: ConfigModule
  isSelected: boolean
  onSelect: (key: string) => void
}) {
  const t = useT()
  const needsRestart = MODULE_KNOWLEDGE[mod.key]?.requiresRestart

  return (
    <button
      onClick={() => onSelect(mod.key)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        isSelected
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="text-base leading-none">
        {getModuleIcon(mod.key)}
      </span>
      <span className="flex-1 truncate">{mod.label}</span>
      {needsRestart && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-amber-500 shrink-0">↻</span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {t('config.requiresRestart')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <span
        className={cn(
          "size-2 rounded-full shrink-0",
          mod.isActive
            ? "bg-emerald-500"
            : "bg-zinc-300 dark:bg-zinc-600",
        )}
      />
    </button>
  )
}
