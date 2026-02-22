"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { File, Folder, FolderOpen, Plus, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { useSkillFiles, useSaveSkillFile, useDeleteSkillFile } from "@/hooks/use-skills"
import type { SkillFileEntry } from "@/types/skill"

interface SkillFileTreeProps {
  skillId: string
  selectedPath: string | null
  onSelectFile: (path: string) => void
  canEdit: boolean
}

export function SkillFileTree({ skillId, selectedPath, onSelectFile, canEdit }: SkillFileTreeProps) {
  const t = useT()
  const [currentDir, setCurrentDir] = useState<string | undefined>(undefined)
  const [isCreating, setIsCreating] = useState(false)
  const [newFileName, setNewFileName] = useState("")

  const { data, isLoading } = useSkillFiles(skillId, currentDir)
  const saveFile = useSaveSkillFile(skillId)
  const deleteFile = useDeleteSkillFile(skillId)

  const files = data?.files ?? []

  async function handleCreateFile(e: React.FormEvent) {
    e.preventDefault()
    if (!newFileName.trim()) return

    const filePath = currentDir ? `${currentDir}/${newFileName}` : newFileName
    try {
      await saveFile.mutateAsync({ path: filePath, content: "" })
      toast.success(t('skill.fileCreated', { name: newFileName }))
      setNewFileName("")
      setIsCreating(false)
      onSelectFile(filePath)
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  async function handleDelete(entry: SkillFileEntry) {
    if (entry.name === "SKILL.md") {
      toast.error(t('skill.cannotDeleteSkillMd'))
      return
    }
    try {
      await deleteFile.mutateAsync(entry.path)
      toast.success(t('skill.fileDeleted', { name: entry.name }))
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('skill.files')}
        </span>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Breadcrumb for subdirectory */}
      {currentDir && (
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors border-b"
          onClick={() => setCurrentDir(undefined)}
        >
          {t('skill.backToRoot')}
        </button>
      )}

      {/* New file input */}
      {isCreating && (
        <form onSubmit={handleCreateFile} className="border-b p-2">
          <Input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder={t('skill.filenamePlaceholder')}
            className="h-7 text-[12px]"
            autoFocus
            onBlur={() => {
              if (!newFileName) setIsCreating(false)
            }}
          />
        </form>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {files.map((entry) => (
          <div key={entry.path} className="group relative">
            <button
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-muted/50 ${
                selectedPath === entry.path ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
              onClick={() => {
                if (entry.type === "directory") {
                  setCurrentDir(entry.path)
                } else {
                  onSelectFile(entry.path)
                }
              }}
            >
              {entry.type === "directory" ? (
                <Folder className="size-3.5 text-amber-500" />
              ) : (
                <File className="size-3.5" />
              )}
              <span className="truncate">{entry.name}</span>
              {entry.size !== undefined && (
                <span className="ml-auto text-[10px] text-muted-foreground/60 group-hover:hidden">
                  {formatFileSize(entry.size)}
                </span>
              )}
            </button>
            {canEdit && entry.name !== "SKILL.md" && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 hidden size-5 items-center justify-center rounded text-destructive/60 hover:text-destructive hover:bg-destructive/10 group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(entry)
                }}
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        ))}

        {files.length === 0 && (
          <div className="p-4 text-center text-[12px] text-muted-foreground">
            {t('agent.dirEmpty')}
          </div>
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
