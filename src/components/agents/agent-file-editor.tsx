"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, RotateCcw } from "lucide-react"
import { useT } from "@/stores/language-store"

interface AgentFileEditorProps {
  content: string
  onSave: (content: string) => void
  saving: boolean
}

export function AgentFileEditor({
  content,
  onSave,
  saving,
}: AgentFileEditorProps) {
  const t = useT()
  const [text, setText] = useState(content)
  const isDirty = text !== content

  // Reset editor when content changes from outside (refetch)
  useEffect(() => {
    setText(content)
  }, [content])

  return (
    <div className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[360px] font-mono text-xs leading-relaxed"
        placeholder={t('agent.fileContentEmpty')}
      />
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
          {isDirty ? (
            <span className="text-amber-600 dark:text-amber-400">
              {t('agent.unsavedChanges')}
            </span>
          ) : (
            <span>{t('saved')}</span>
          )}
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setText(content)}
            >
              <RotateCcw className="size-3" />
              {t('undo')}
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 gap-1 px-3 text-xs"
            disabled={!isDirty || saving}
            onClick={() => onSave(text)}
          >
            {saving ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
