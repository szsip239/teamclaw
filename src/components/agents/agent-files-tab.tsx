"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  FileText,
  FolderOpen,
  Plus,
  ChevronRight,
  ArrowLeft,
} from "lucide-react"
import { useAgentFiles, useAgentFileContent, useSaveAgentFile } from "@/hooks/use-agents"
import { AgentFileEditor } from "./agent-file-editor"
import { useT, useLanguageStore } from "@/stores/language-store"
import { toast } from "sonner"

interface AgentFilesTabProps {
  compositeId: string
}

/** Well-known workspace files with quick-create templates (bilingual) */
const QUICK_FILES = [
  { name: "AGENTS.md", descKey: "agent.fileAgentsMd" as const, en: "# Agent Instructions\n\n## Instructions\n\n- \n\n## Constraints\n\n- \n", zh: "# Agent Instructions\n\n## 指令\n\n- \n\n## 约束\n\n- \n" },
  { name: "SOUL.md", descKey: "agent.fileSoulMd" as const, en: "# Soul\n\n## Personality\n\n\n## Tone\n\n\n## Boundaries\n\n", zh: "# Soul\n\n## 人格\n\n\n## 语气\n\n\n## 边界\n\n" },
  { name: "MEMORY.md", descKey: "agent.fileMemoryMd" as const, en: "# Memory\n\n", zh: "# Memory\n\n" },
  { name: "IDENTITY.md", descKey: "agent.fileIdentityMd" as const, en: "# Identity\n\n## Name\n\n\n## Style\n\n", zh: "# Identity\n\n## 名称\n\n\n## 风格\n\n" },
  { name: "USER.md", descKey: "agent.fileUserMd" as const, en: "# User Preferences\n\n", zh: "# User Preferences\n\n" },
  { name: "TOOLS.md", descKey: "agent.fileToolsMd" as const, en: "# Tools Documentation\n\n", zh: "# Tools Documentation\n\n" },
  { name: "HEARTBEAT.md", descKey: "agent.fileHeartbeatMd" as const, en: "# Heartbeat Checklist\n\n- [ ] \n", zh: "# Heartbeat Checklist\n\n- [ ] \n" },
  { name: "BOOT.md", descKey: "agent.fileBootMd" as const, en: "# Boot Sequence\n\n- [ ] \n", zh: "# Boot Sequence\n\n- [ ] \n" },
] as const

export function AgentFilesTab({ compositeId }: AgentFilesTabProps) {
  const t = useT()
  const locale = useLanguageStore((s) => s.language)
  const [currentDir, setCurrentDir] = useState<string | undefined>(undefined)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const { data: filesData, isLoading: filesLoading } = useAgentFiles(
    compositeId,
    currentDir,
  )
  const {
    data: fileContent,
    isLoading: contentLoading,
    refetch: refetchContent,
  } = useAgentFileContent(compositeId, selectedFile)
  const saveFile = useSaveAgentFile(compositeId)

  const files = filesData?.files ?? []
  const existingNames = new Set(files.map((f) => f.name))

  function handleFileClick(name: string, type: string) {
    if (type === "directory") {
      const next = currentDir ? `${currentDir}/${name}` : name
      setCurrentDir(next)
      setSelectedFile(null)
    } else {
      const path = currentDir ? `${currentDir}/${name}` : name
      setSelectedFile(path)
    }
  }

  function handleBack() {
    if (!currentDir) return
    const parts = currentDir.split("/")
    parts.pop()
    setCurrentDir(parts.length ? parts.join("/") : undefined)
    setSelectedFile(null)
  }

  async function handleQuickCreate(name: string, template: { en: string; zh: string }) {
    const content = locale === 'zh-CN' ? template.zh : template.en
    try {
      await saveFile.mutateAsync({ path: name, content })
      toast.success(t('agent.fileCreatedMsg', { name }))
      setSelectedFile(name)
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed'),
      )
    }
  }

  async function handleSave(content: string) {
    if (!selectedFile) return
    try {
      await saveFile.mutateAsync({ path: selectedFile, content })
      toast.success(t('agent.fileSaved'))
      refetchContent()
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error || t('agent.fileSaveFailed'),
      )
    }
  }

  // If a file is selected, show the editor
  if (selectedFile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setSelectedFile(null)}
          >
            <ArrowLeft className="size-3" />
            {t('back')}
          </Button>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {selectedFile}
          </span>
        </div>
        {contentLoading ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-4 py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">{t('loading')}</span>
          </div>
        ) : (
          <AgentFileEditor
            content={fileContent?.content ?? ""}
            onSave={handleSave}
            saving={saveFile.isPending}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Quick create buttons */}
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <Plus className="size-3.5 text-muted-foreground" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {t('agent.quickCreate')}
          </h4>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_FILES.filter((f) => !existingNames.has(f.name)).map((f) => (
            <Button
              key={f.name}
              variant="ghost"
              size="sm"
              className="h-auto justify-start gap-2 px-2.5 py-2 text-left"
              onClick={() => handleQuickCreate(f.name, { en: f.en, zh: f.zh })}
              disabled={saveFile.isPending}
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-mono text-xs">{f.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {t(f.descKey)}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* File browser */}
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <FolderOpen className="size-3.5 text-muted-foreground" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {t('agent.workspace')}
          </h4>
          {currentDir && (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              /{currentDir}
            </span>
          )}
        </div>

        {currentDir && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={handleBack}
          >
            <ArrowLeft className="size-3" />
            {t('agent.parentDir')}
          </Button>
        )}

        {filesLoading ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-4 py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">{t('loading')}</span>
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center">
            <p className="text-[13px] text-muted-foreground">{t('agent.dirEmpty')}</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {files.map((file, i) => (
              <motion.button
                key={`${file.type}:${file.path}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: i * 0.02 }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50"
                onClick={() => handleFileClick(file.name, file.type)}
              >
                {file.type === "directory" ? (
                  <FolderOpen className="size-3.5 shrink-0 text-sky-500" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {file.name}
                </span>
                {file.type === "directory" && (
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                )}
                {file.type === "file" && file.size > 0 && (
                  <span className="text-[11px] tabular-nums text-muted-foreground/60">
                    {formatFileSize(file.size)}
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
