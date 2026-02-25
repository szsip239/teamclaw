"use client"

import { useCallback, useState } from "react"
import type { SessionFileEntry } from "@/types/session-files"
import type { SessionFileZone } from "@/stores/file-panel-store"
import { useFilePanelStore } from "@/stores/file-panel-store"
import { useSessionFiles, useDeleteSessionFile, useMkdirSession } from "@/hooks/use-session-files"
import { useT } from "@/stores/language-store"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { FolderPlus, Loader2 } from "lucide-react"
import { FileTreeNode } from "./file-tree-node"
import { toast } from "sonner"

interface FileTreeProps {
  zone: SessionFileZone
  sessionId: string
}

export function FileTree({ zone, sessionId }: FileTreeProps) {
  const t = useT()
  const { data, isLoading } = useSessionFiles(sessionId, zone)
  const deleteMutation = useDeleteSessionFile(sessionId)
  const mkdirMutation = useMkdirSession(sessionId)
  const expandedDirs = useFilePanelStore((s) => s.expandedDirs)
  const setSelectedFile = useFilePanelStore((s) => s.setSelectedFile)

  const [deleteTarget, setDeleteTarget] = useState<SessionFileEntry | null>(null)
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null)
  const [folderName, setFolderName] = useState("")

  const files = data?.files ?? []

  // Build tree structure: only show children of expanded dirs
  const visibleEntries = buildVisibleEntries(files, expandedDirs)

  const handleDownload = useCallback(
    (entry: SessionFileEntry) => {
      const url = `/api/v1/chat/sessions/${sessionId}/files/${zone}/${entry.path}`
      const a = document.createElement("a")
      a.href = url
      a.download = entry.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    },
    [sessionId, zone]
  )

  const handleDelete = useCallback((entry: SessionFileEntry) => {
    setDeleteTarget(entry)
  }, [])

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    deleteMutation.mutate(
      `input/${deleteTarget.path}`,
      {
        onSuccess: () => {
          toast.success(t("filePanel.deleteSuccess"))
          setSelectedFile(null)
        },
        onError: () => toast.error(t("filePanel.deleteFailed")),
      }
    )
    setDeleteTarget(null)
  }, [deleteTarget, deleteMutation, zone, t, setSelectedFile])

  const handleNewFolder = useCallback((parentDir?: string) => {
    setNewFolderParent(parentDir ?? "")
    setFolderName("")
  }, [])

  const confirmNewFolder = useCallback(() => {
    if (!folderName.trim()) return
    const dir = newFolderParent
      ? `${newFolderParent}/${folderName.trim()}`
      : folderName.trim()
    mkdirMutation.mutate(dir, {
      onSuccess: () => {
        toast.success(t("filePanel.folderCreated"))
        setNewFolderParent(null)
        setFolderName("")
      },
      onError: () => toast.error(t("filePanel.moveFailed")),
    })
  }, [folderName, newFolderParent, mkdirMutation, t])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <ScrollArea className="flex-1 min-h-0">
        {visibleEntries.length === 0 ? (
          <div className="flex items-center justify-center p-4 text-muted-foreground text-xs">
            {zone === "input"
              ? t("filePanel.noFiles")
              : t("filePanel.noOutputFiles")}
          </div>
        ) : (
          <div className="py-1">
            {visibleEntries.map(({ entry, depth }) => (
              <FileTreeNode
                key={`${zone}:${entry.path}`}
                entry={entry}
                zone={zone}
                sessionId={sessionId}
                depth={depth}
                onDownload={handleDownload}
                onDelete={handleDelete}
                onNewFolder={handleNewFolder}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {zone === "input" && (
        <div className="flex items-center gap-1 px-1 pb-1">
          <Button
            variant="ghost"
            size="xs"
            className="flex-1"
            onClick={() => handleNewFolder()}
          >
            <FolderPlus className="size-3" />
            {t("filePanel.newFolder")}
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("filePanel.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("filePanel.confirmDelete", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              {t("filePanel.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New folder dialog */}
      <AlertDialog
        open={newFolderParent !== null}
        onOpenChange={(open) => {
          if (!open) setNewFolderParent(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("filePanel.newFolder")}</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            placeholder={t("filePanel.folderName")}
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmNewFolder()
            }}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmNewFolder}
              disabled={!folderName.trim()}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Build a flat list of visible entries based on expanded directories.
 * Files are assumed to be a flat list with `path` indicating hierarchy (e.g. "dir/file.txt").
 * Group entries by parent directory and only show children of expanded dirs.
 */
function buildVisibleEntries(
  files: SessionFileEntry[],
  expandedDirs: Set<string>
): { entry: SessionFileEntry; depth: number }[] {
  // Sort: directories first, then alphabetical
  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const result: { entry: SessionFileEntry; depth: number }[] = []

  for (const entry of sorted) {
    const parts = entry.path.split("/")
    const depth = parts.length - 1

    // Check if all parent directories are expanded
    let visible = true
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join("/")
      if (!expandedDirs.has(parentPath)) {
        visible = false
        break
      }
    }

    if (visible) {
      result.push({ entry, depth })
    }
  }

  return result
}
