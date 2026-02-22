"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { useSkillFileContent, useSaveSkillFile } from "@/hooks/use-skills"

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

// ─── Custom Monaco Themes for Skill Editor ──────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defineSkillThemes(monaco: any) {
  monaco.editor.defineTheme('skill-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#FAFAFA',
      'editor.foreground': '#1e293b',
      'editor.lineHighlightBackground': '#f1f5f9',
      'editor.selectionBackground': '#bfdbfe80',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#475569',
      'editorIndentGuide.background': '#e2e8f0',
      'editorIndentGuide.activeBackground': '#cbd5e1',
      'editor.inactiveSelectionBackground': '#e2e8f050',
      'editorCursor.foreground': '#3b82f6',
    },
  })

  monaco.editor.defineTheme('skill-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1d26',
      'editor.foreground': '#e2e8f0',
      'editor.lineHighlightBackground': '#262530',
      'editor.selectionBackground': '#3b82f640',
      'editorLineNumber.foreground': '#64748b',
      'editorLineNumber.activeForeground': '#94a3b8',
      'editorIndentGuide.background': '#334155',
      'editorIndentGuide.activeBackground': '#475569',
      'editor.inactiveSelectionBackground': '#33415540',
      'editorCursor.foreground': '#60a5fa',
    },
  })
}

interface SkillEditorProps {
  skillId: string
  filePath: string | null
  canEdit: boolean
}

export function SkillEditor({ skillId, filePath, canEdit }: SkillEditorProps) {
  const t = useT()
  const { data, isLoading } = useSkillFileContent(skillId, filePath)
  const saveFile = useSaveSkillFile(skillId)
  const [localContent, setLocalContent] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const { resolvedTheme } = useTheme()

  // When file data loads, reset local state
  const fileContent = data?.content ?? ""

  const handleChange = useCallback((value: string | undefined) => {
    setLocalContent(value ?? "")
    setIsDirty(true)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBeforeMount = useCallback((monaco: any) => {
    defineSkillThemes(monaco)
  }, [])

  async function handleSave() {
    if (!filePath || localContent === null) return
    try {
      await saveFile.mutateAsync({ path: filePath, content: localContent })
      setIsDirty(false)
      toast.success(t('skill.fileSaved'))
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error || t('skill.fileSaveFailed')
      toast.error(message)
    }
  }

  // Detect language from file extension
  const language = filePath ? getLanguage(filePath) : "markdown"
  const monacoTheme = resolvedTheme === 'dark' ? 'skill-dark' : 'skill-light'

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
        {t('skill.selectFileToEdit')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-mono text-muted-foreground">{filePath}</span>
          {isDirty && (
            <span className="text-amber-500 text-[10px]">{t('skill.unsavedIndicator')}</span>
          )}
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            disabled={!isDirty || saveFile.isPending}
            onClick={handleSave}
            className="h-7 gap-1.5 text-[12px]"
          >
            {saveFile.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            {t('save')}
          </Button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={language}
          value={isDirty ? (localContent ?? fileContent) : fileContent}
          onChange={handleChange}
          beforeMount={handleBeforeMount}
          theme={monacoTheme}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            padding: { top: 8 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            readOnly: !canEdit,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  const map: Record<string, string> = {
    md: "markdown",
    json: "json",
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    sh: "shell",
    bash: "shell",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
  }
  return map[ext ?? ""] ?? "plaintext"
}
