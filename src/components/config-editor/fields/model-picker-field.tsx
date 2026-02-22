"use client"

import { useState, useCallback } from "react"
import { Check, ChevronsUpDown, X, Pencil, Sparkles, Image, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/stores/language-store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useConfigModels, type ModelOption } from "@/hooks/use-config-entities"
import type { TranslationKey } from "@/locales/zh-CN"

// ─── Single Model Picker ──────────────────────────────────────────

interface ModelPickerFieldProps {
  path: string
  label: string
  help?: string
  value: string
  onChange: (value: string) => void
  allowCustom?: boolean
}

export function ModelPickerField({
  path,
  label,
  help,
  value,
  onChange,
  allowCustom = true,
}: ModelPickerFieldProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState("")
  const { groups, isLoading } = useConfigModels()

  // Find current selection label
  const currentOption = groups
    .flatMap((g) => g.models)
    .find((m) => m.value === value)

  const handleSelect = useCallback(
    (modelValue: string) => {
      onChange(modelValue)
      setOpen(false)
    },
    [onChange],
  )

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customValue.trim()
    if (trimmed) {
      onChange(trimmed)
      setCustomValue("")
      setCustomMode(false)
      setOpen(false)
    }
  }, [customValue, onChange])

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <Label htmlFor={path} className="text-sm font-medium whitespace-nowrap">
          {label}
        </Label>
        {help && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[300px] text-xs">
                {help}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 flex-1 min-w-0 justify-between font-mono text-xs"
          >
            <span className="truncate">
              {value
                ? currentOption?.label
                  ? `${currentOption.label} (${value})`
                  : value
                : t('config.selectModel')}
            </span>
            <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t('config.searchModel')} />
            <CommandList>
              <CommandEmpty>
                {isLoading ? t('config.loadingModels') : t('config.noMatchingModel')}
              </CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group.providerId} heading={group.providerName}>
                  {group.models.map((model) => (
                    <CommandItem
                      key={model.value}
                      value={model.value}
                      onSelect={handleSelect}
                      className="gap-2"
                    >
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          value === model.value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm truncate">{model.label}</span>
                          <ModelBadges model={model} />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {model.value}
                        </span>
                      </div>
                      <StatusDot status={model.status} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {allowCustom && (
                <CommandGroup heading={t('config.customInput')}>
                  {customMode ? (
                    <div className="flex gap-1.5 px-2 py-1.5">
                      <Input
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        placeholder="provider/model"
                        className="h-7 text-xs font-mono flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleCustomSubmit()
                          }
                          e.stopPropagation()
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleCustomSubmit}
                        disabled={!customValue.trim()}
                      >
                        {t('config.confirmButton')}
                      </Button>
                    </div>
                  ) : (
                    <CommandItem
                      onSelect={() => setCustomMode(true)}
                      className="gap-2"
                    >
                      <Pencil className="size-3.5" />
                      <span>{t('config.manualInput')}</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
          title={t('config.clearButton')}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Multi Model Picker (for fallbacks) ───────────────────────────

interface MultiModelPickerFieldProps {
  path: string
  label: string
  help?: string
  value: string[]
  onChange: (value: string[]) => void
  allowCustom?: boolean
}

export function MultiModelPickerField({
  path,
  label,
  help,
  value,
  onChange,
  allowCustom = true,
}: MultiModelPickerFieldProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState("")
  const { groups, models, isLoading } = useConfigModels()

  const toggleModel = useCallback(
    (modelValue: string) => {
      if (value.includes(modelValue)) {
        onChange(value.filter((v) => v !== modelValue))
      } else {
        onChange([...value, modelValue])
      }
    },
    [value, onChange],
  )

  const removeModel = useCallback(
    (modelValue: string) => {
      onChange(value.filter((v) => v !== modelValue))
    },
    [value, onChange],
  )

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customValue.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setCustomValue("")
      setCustomMode(false)
    }
  }, [customValue, value, onChange])

  const getModelLabel = (val: string) => {
    const found = models.find((m) => m.value === val)
    return found?.label ?? val
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={path} className="text-sm font-medium">
          {label}
        </Label>
        {help && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[300px] text-xs">
                {help}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Selected chips */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 text-xs h-6 font-mono">
            {getModelLabel(v)}
            <button
              type="button"
              onClick={() => removeModel(v)}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Add button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs w-full justify-start font-normal text-muted-foreground"
          >
            <ChevronsUpDown className="size-3.5" />
            {t('config.addFallback')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t('config.searchModel')} />
            <CommandList>
              <CommandEmpty>
                {isLoading ? t('config.loadingModels') : t('config.noMatchingModel')}
              </CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group.providerId} heading={group.providerName}>
                  {group.models.map((model) => {
                    const selected = value.includes(model.value)
                    return (
                      <CommandItem
                        key={model.value}
                        value={model.value}
                        onSelect={toggleModel}
                        className="gap-2"
                      >
                        <div
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                            selected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/30",
                          )}
                        >
                          {selected && <Check className="size-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm truncate">{model.label}</span>
                            <ModelBadges model={model} />
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {model.value}
                          </span>
                        </div>
                        <StatusDot status={model.status} />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
              {allowCustom && (
                <CommandGroup heading={t('config.customInput')}>
                  {customMode ? (
                    <div className="flex gap-1.5 px-2 py-1.5">
                      <Input
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        placeholder="provider/model"
                        className="h-7 text-xs font-mono flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleCustomSubmit()
                          }
                          e.stopPropagation()
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleCustomSubmit}
                        disabled={!customValue.trim()}
                      >
                        {t('config.addButton')}
                      </Button>
                    </div>
                  ) : (
                    <CommandItem
                      onSelect={() => setCustomMode(true)}
                      className="gap-2"
                    >
                      <Pencil className="size-3.5" />
                      <span>{t('config.manualInput')}</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ─── Shared Sub-Components ────────────────────────────────────────

function ModelBadges({ model }: { model: ModelOption }) {
  const t = useT()
  return (
    <>
      {model.reasoning && (
        <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
          <Sparkles className="size-2.5" />
          {t('resource.reasoning')}
        </Badge>
      )}
      {model.multimodal && (
        <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
          <Image className="size-2.5" />
          {t('config.multimodal')}
        </Badge>
      )}
    </>
  )
}

function StatusDot({ status }: { status?: string }) {
  const t = useT()
  if (!status) return null
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-500",
    UNTESTED: "bg-amber-400",
    ERROR: "bg-red-500",
  }
  const labelKeys: Record<string, TranslationKey> = {
    ACTIVE: "config.verified",
    UNTESTED: "config.untested",
    ERROR: "config.connectionError",
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("size-2 rounded-full shrink-0", colors[status] ?? "bg-gray-400")} />
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {labelKeys[status] ? t(labelKeys[status]) : status}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
