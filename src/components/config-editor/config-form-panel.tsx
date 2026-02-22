"use client"

import { useCallback, useMemo } from "react"
import { useConfigEditorStore } from "@/stores/config-editor-store"
import { SchemaFormRenderer, GroupedFormRenderer } from "./schema-form-renderer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useT, useLanguageStore } from "@/stores/language-store"
import { getModuleKnowledge, getFieldGroups } from "@/lib/config-editor/config-knowledge"

interface ConfigFormPanelProps {
  instanceId: string
}

export function ConfigFormPanel({ instanceId }: ConfigFormPanelProps) {
  const selectedModule = useConfigEditorStore((s) => s.selectedModule)
  const modules = useConfigEditorStore((s) => s.modules)
  const configData = useConfigEditorStore((s) => s.configData)
  const uiHints = useConfigEditorStore((s) => s.uiHints)
  const setFieldValue = useConfigEditorStore((s) => s.setFieldValue)

  const currentModule = modules.find((m) => m.key === selectedModule)

  const handleChange = useCallback(
    (path: string, value: unknown) => {
      setFieldValue(path, value, 'form')
    },
    [setFieldValue],
  )

  const t = useT()
  const locale = useLanguageStore((s) => s.language)

  const knowledge = useMemo(
    () => selectedModule ? getModuleKnowledge(selectedModule, locale) : undefined,
    [selectedModule, locale],
  )

  const fieldGroups = useMemo(
    () => selectedModule ? getFieldGroups(selectedModule, locale) : [],
    [selectedModule, locale],
  )

  if (!currentModule) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        {t('config.selectModule')}
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-4 py-3 border-b space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{currentModule.label}</h3>
          {knowledge?.requiresRestart && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
              {t('config.needsRestart')}
            </Badge>
          )}
        </div>
        {knowledge?.description && (
          <p className="text-xs text-muted-foreground">{knowledge.description}</p>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          {fieldGroups.length > 0 ? (
            <GroupedFormRenderer
              groups={fieldGroups}
              schema={currentModule.schema}
              path={selectedModule!}
              config={configData}
              uiHints={uiHints}
              onChange={handleChange}
            />
          ) : (
            <SchemaFormRenderer
              schema={currentModule.schema}
              path={selectedModule!}
              config={configData}
              uiHints={uiHints}
              onChange={handleChange}
              depth={0}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
