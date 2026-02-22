"use client"

import { useCallback, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { Loader2, AlertCircle } from "lucide-react"
import { useState } from "react"
import { useTheme } from "next-themes"
import { useConfigEditorStore } from "@/stores/config-editor-store"
import { useT } from "@/stores/language-store"
import { findLineForPath } from "@/lib/config-editor/schema-utils"

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
)

// Minimal types for Monaco editor API we use
interface MonacoEditor {
  getValue: () => string
  setValue: (v: string) => void
  revealLineInCenter: (lineNumber: number) => void
  deltaDecorations: (oldDecorations: string[], newDecorations: MonacoDecoration[]) => string[]
  getModel: () => { getLineMaxColumn: (lineNumber: number) => number } | null
}

interface MonacoDecoration {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
  options: { isWholeLine: boolean; className: string }
}

// ─── Custom Monaco Themes ───────────────────────────────────────────
// Colors derived from app's oklch CSS variables in globals.css
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defineCustomThemes(monaco: any) {
  // Light theme — matches app's card background and muted tones
  monaco.editor.defineTheme('tc-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '1a56db' },     // primary-ish blue for keys
      { token: 'string.value.json', foreground: '166534' },   // green for string values
      { token: 'number', foreground: 'b45309' },              // amber for numbers
      { token: 'keyword', foreground: '7c3aed' },             // purple for true/false/null
    ],
    colors: {
      'editor.background': '#FAFAFA',                          // --background light ≈ oklch(0.99)
      'editor.foreground': '#1e293b',                          // --foreground light
      'editor.lineHighlightBackground': '#f1f5f9',            // subtle line highlight
      'editor.selectionBackground': '#bfdbfe80',              // blue selection
      'editorLineNumber.foreground': '#94a3b8',               // muted line numbers
      'editorLineNumber.activeForeground': '#475569',         // active line number
      'editorIndentGuide.background': '#e2e8f0',              // indent guides
      'editorIndentGuide.activeBackground': '#cbd5e1',
      'editor.inactiveSelectionBackground': '#e2e8f050',
      'editorCursor.foreground': '#3b82f6',                   // blue cursor
      'editorBracketMatch.background': '#dbeafe',
      'editorBracketMatch.border': '#93c5fd',
    },
  })

  // Dark theme — matches app's dark card background
  monaco.editor.defineTheme('tc-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '93c5fd' },     // light blue for keys
      { token: 'string.value.json', foreground: '86efac' },   // light green for values
      { token: 'number', foreground: 'fbbf24' },              // amber for numbers
      { token: 'keyword', foreground: 'c4b5fd' },             // light purple for true/false/null
    ],
    colors: {
      'editor.background': '#1e1d26',                          // --card dark ≈ oklch(0.18)
      'editor.foreground': '#e2e8f0',                          // --foreground dark
      'editor.lineHighlightBackground': '#262530',            // subtle line highlight
      'editor.selectionBackground': '#3b82f640',              // blue selection
      'editorLineNumber.foreground': '#64748b',               // muted line numbers
      'editorLineNumber.activeForeground': '#94a3b8',         // active line number
      'editorIndentGuide.background': '#334155',              // indent guides
      'editorIndentGuide.activeBackground': '#475569',
      'editor.inactiveSelectionBackground': '#33415540',
      'editorCursor.foreground': '#60a5fa',                   // blue cursor
      'editorBracketMatch.background': '#1e3a5f',
      'editorBracketMatch.border': '#3b82f680',
    },
  })
}

export function ConfigJsonPanel() {
  const t = useT()
  const configData = useConfigEditorStore((s) => s.configData)
  const lastEditSource = useConfigEditorStore((s) => s.lastEditSource)
  const setConfigFromJson = useConfigEditorStore((s) => s.setConfigFromJson)
  const focusedFieldPath = useConfigEditorStore((s) => s.focusedFieldPath)
  const setFocusedField = useConfigEditorStore((s) => s.setFocusedField)
  const { resolvedTheme } = useTheme()

  const [parseError, setParseError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<MonacoEditor | null>(null)
  const decorationsRef = useRef<string[]>([])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Sync store → Monaco when source is NOT monaco
  const jsonString = JSON.stringify(configData, null, 2)

  useEffect(() => {
    if (lastEditSource === 'monaco') return
    if (!editorRef.current) return

    const currentValue = editorRef.current.getValue()
    if (currentValue !== jsonString) {
      editorRef.current.setValue(jsonString)
    }
  }, [jsonString, lastEditSource])

  // ─── Form → JSON focus sync ────────────────────────────────────────
  useEffect(() => {
    if (!focusedFieldPath || !editorRef.current) return

    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return

    const lineNumber = findLineForPath(editor.getValue(), focusedFieldPath)
    if (!lineNumber) {
      setFocusedField(null)
      return
    }

    // Scroll to line
    editor.revealLineInCenter(lineNumber)

    // Highlight with fade animation
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [{
      range: {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: model.getLineMaxColumn(lineNumber),
      },
      options: {
        isWholeLine: true,
        className: 'json-field-highlight',
      },
    }])

    // Clear decoration after animation completes
    const timer = setTimeout(() => {
      if (editorRef.current) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [])
      }
    }, 2200)

    // Reset focused path
    setFocusedField(null)

    return () => clearTimeout(timer)
  }, [focusedFieldPath, setFocusedField])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBeforeMount = useCallback((monaco: any) => {
    defineCustomThemes(monaco)
  }, [])

  const handleEditorMount = useCallback(
    (editor: MonacoEditor) => {
      editorRef.current = editor
    },
    [],
  )

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!value) return
      // Skip if the change was triggered by store sync
      if (useConfigEditorStore.getState().lastEditSource === 'form') return

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(() => {
        try {
          const parsed = JSON.parse(value)
          setParseError(null)
          setConfigFromJson(parsed, 'monaco')
        } catch (e) {
          setParseError((e as Error).message)
        }
      }, 300)
    },
    [setConfigFromJson],
  )

  const monacoTheme = resolvedTheme === 'dark' ? 'tc-dark' : 'tc-light'

  return (
    <div className="w-[520px] shrink-0 border-l flex flex-col bg-background">
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          JSON
        </h3>
        {parseError && (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3" />
            <span className="truncate max-w-[280px]">{t('config.jsonError')}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <MonacoEditor
          language="json"
          theme={monacoTheme}
          value={jsonString}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            formatOnPaste: true,
            automaticLayout: true,
            readOnly: false,
            renderLineHighlight: "gutter",
            guides: { indentation: true, bracketPairs: true },
            bracketPairColorization: { enabled: true },
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </div>
  )
}
