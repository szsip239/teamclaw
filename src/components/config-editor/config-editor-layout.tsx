"use client"

import { ConfigModuleNav } from "./config-module-nav"
import { ConfigFormPanel } from "./config-form-panel"
import { ConfigJsonPanel } from "./config-json-panel"
import { ConfigToolbar } from "./config-toolbar"

interface ConfigEditorLayoutProps {
  instanceId: string
  instanceName: string
  isSaving: boolean
  onSave: () => void
  onValidate: () => void
}

export function ConfigEditorLayout({
  instanceId,
  instanceName,
  isSaving,
  onSave,
  onValidate,
}: ConfigEditorLayoutProps) {
  return (
    <div className="flex h-full flex-col">
      <ConfigToolbar
        instanceId={instanceId}
        instanceName={instanceName}
        isSaving={isSaving}
        onSave={onSave}
        onValidate={onValidate}
      />
      <div className="flex flex-1 overflow-hidden">
        <ConfigModuleNav />
        <ConfigFormPanel instanceId={instanceId} />
        <ConfigJsonPanel />
      </div>
    </div>
  )
}
