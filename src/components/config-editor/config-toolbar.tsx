"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  ChevronRight,
  RotateCcw,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
} from "lucide-react"
import { useConfigEditorStore } from "@/stores/config-editor-store"
import { useT } from "@/stores/language-store"
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
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ConfigToolbarProps {
  instanceId: string
  instanceName: string
  isSaving: boolean
  onSave: () => void
  onValidate: () => void
}

export function ConfigToolbar({
  instanceId,
  instanceName,
  isSaving,
  onSave,
  onValidate,
}: ConfigToolbarProps) {
  const t = useT()
  const isDirty = useConfigEditorStore((s) => s.isDirty)
  const resetToOriginal = useConfigEditorStore((s) => s.resetToOriginal)
  const validationErrors = useConfigEditorStore((s) => s.validationErrors)
  const selectModule = useConfigEditorStore((s) => s.selectModule)
  const setFocusedField = useConfigEditorStore((s) => s.setFocusedField)

  const handleErrorClick = (path: string) => {
    // Navigate to the module containing this field
    const firstSegment = path.split(".")[0]
    if (firstSegment) {
      selectModule(firstSegment)
    }
    // Focus the field in JSON panel
    setFocusedField(path)
  }

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href="/instances"
          className="hover:text-foreground transition-colors"
        >
          {t('config.instanceManagement')}
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/instances`}
          className="hover:text-foreground transition-colors"
        >
          {instanceName}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{t('config.advancedConfig')}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isDirty && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  <span>{t('config.unsavedChanges')}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t('config.unsavedDesc')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={resetToOriginal}
          disabled={!isDirty || isSaving}
          className="h-8 gap-1.5 px-3 text-xs"
        >
          <RotateCcw className="size-3.5" />
          {t('config.resetButton')}
        </Button>

        {/* Validate button with error popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onValidate}
              disabled={isSaving}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              <CheckCircle2 className="size-3.5" />
              {t('config.validateButton')}
              {validationErrors.length > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1 h-4 min-w-4 px-1 text-[10px] leading-none"
                >
                  {validationErrors.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          {validationErrors.length > 0 && (
            <PopoverContent
              align="end"
              className="w-96 p-0"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{t('config.validationResult')}</span>
                <Badge variant="destructive" className="text-xs">
                  {t('config.issuesFound', { n: validationErrors.length })}
                </Badge>
              </div>
              <ScrollArea className="max-h-64">
                <div className="divide-y">
                  {validationErrors.map((err, i) => (
                    <button
                      key={`${err.path}-${i}`}
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                      onClick={() => handleErrorClick(err.path)}
                    >
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted-foreground">
                          {err.path || "(root)"}
                        </div>
                        <div className="text-sm">{err.message}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          )}
        </Popover>

        <Button
          size="sm"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="h-8 gap-1.5 px-3 text-xs"
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {t('config.saveChanges')}
        </Button>
      </div>
    </div>
  )
}
