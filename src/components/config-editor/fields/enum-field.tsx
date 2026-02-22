"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { JsonSchema } from "@/types/config-editor"
import { extractAnyOfValues, extractAnyOfDescriptions } from "@/lib/config-editor/schema-utils"
import { getEnumDescriptions, isDeprecatedEnumOption } from "@/lib/config-editor/config-knowledge"
import { useLanguageStore } from "@/stores/language-store"
import { useT } from "@/stores/language-store"

interface EnumFieldProps {
  path: string
  value: string
  schema: JsonSchema
  onChange: (value: string | undefined) => void
}

export function EnumField({ path, value, schema, onChange }: EnumFieldProps) {
  const locale = useLanguageStore((s) => s.language)
  const t = useT()
  const options = extractAnyOfValues(schema)

  // Merge descriptions: knowledge base takes priority, then schema fallback
  const descriptions = useMemo(() => {
    const knowledgeDescs = getEnumDescriptions(path, locale) ?? {}
    const schemaDescs = extractAnyOfDescriptions(schema)
    // Merge: knowledge base overrides schema
    const merged = { ...schemaDescs, ...knowledgeDescs }
    return Object.keys(merged).length > 0 ? merged : null
  }, [path, schema, locale])

  // Sort: deprecated/alias options go to the end
  const sortedOptions = useMemo(() => {
    return [...options].sort((a, b) => {
      const aDeprecated = isDeprecatedEnumOption(path, String(a))
      const bDeprecated = isDeprecatedEnumOption(path, String(b))
      if (aDeprecated === bDeprecated) return 0
      return aDeprecated ? 1 : -1
    })
  }, [options, path])

  // Toggle: clicking the selected option deselects it
  const handleSelect = (optStr: string) => {
    if (String(value ?? "") === optStr) {
      onChange(undefined) // deselect → remove field
    } else {
      onChange(optStr)
    }
  }

  // With descriptions → responsive multi-column radio cards
  if (descriptions) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5">
        {sortedOptions.map((opt) => {
          const optStr = String(opt)
          const isSelected = String(value ?? "") === optStr
          const desc = descriptions[optStr]
          const isDeprecated = isDeprecatedEnumOption(path, optStr)

          return (
            <button
              key={optStr}
              type="button"
              onClick={() => handleSelect(optStr)}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : isDeprecated
                    ? "border-dashed border-border/60 hover:bg-muted/30"
                    : "border-border hover:bg-muted/50",
                isDeprecated && !isSelected && "opacity-50",
              )}
            >
              <div
                className={cn(
                  "mt-0.5 size-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                  isSelected
                    ? "border-primary"
                    : "border-muted-foreground/30",
                )}
              >
                {isSelected && (
                  <div className="size-2 rounded-full bg-primary" />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-mono text-xs">
                  {optStr}
                  {isDeprecated && (
                    <span className="ml-1.5 text-[10px] font-sans text-muted-foreground/70 font-normal">
                      {locale === 'en' ? 'legacy' : '旧版'}
                    </span>
                  )}
                </span>
                {desc && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2" title={desc}>
                    {desc}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  // Without descriptions → horizontal toggle buttons
  return (
    <div className="flex flex-wrap gap-1">
      {sortedOptions.map((opt) => {
        const optStr = String(opt)
        const isSelected = String(value ?? "") === optStr
        const isDeprecated = isDeprecatedEnumOption(path, optStr)

        return (
          <button
            key={optStr}
            type="button"
            onClick={() => handleSelect(optStr)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-mono transition-colors",
              isSelected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              isDeprecated && !isSelected && "opacity-50 border-dashed",
            )}
          >
            {optStr}
            {isDeprecated && (
              <span className="ml-1 text-[10px] font-sans opacity-70">
                {locale === 'en' ? 'legacy' : '旧'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
