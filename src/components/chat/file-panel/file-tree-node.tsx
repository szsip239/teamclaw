"use client"

import { useCallback } from "react"
import type { SessionFileEntry } from "@/types/session-files"
import type { SessionFileZone } from "@/stores/file-panel-store"
import { useFilePanelStore } from "@/stores/file-panel-store"
import { useMoveSessionFile, useUploadSessionFile } from "@/hooks/use-session-files"
import { useT } from "@/stores/language-store"
import { cn } from "@/lib/utils"
import { File, Folder, FolderOpen, FileText, Image } from "lucide-react"
import { FileContextMenu } from "./file-context-menu"
import { toast } from "sonner"

interface FileTreeNodeProps {
  entry: SessionFileEntry
  zone: SessionFileZone
  sessionId: string
  depth: number
  onDownload: (entry: SessionFileEntry) => void
  onDelete: (entry: SessionFileEntry) => void
  onNewFolder: (parentDir?: string) => void
}

function getFileIcon(entry: SessionFileEntry) {
  if (entry.type === "directory") return null // handled separately
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) {
    return <Image className="size-4 shrink-0" />
  }
  if (["txt", "md", "csv", "json", "html", "xml", "yaml", "yml", "log", "ts", "tsx", "js", "jsx", "py"].includes(ext)) {
    return <FileText className="size-4 shrink-0" />
  }
  return <File className="size-4 shrink-0" />
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function FileTreeNode({
  entry,
  zone,
  sessionId,
  depth,
  onDownload,
  onDelete,
  onNewFolder,
}: FileTreeNodeProps) {
  const t = useT()
  const selectedFile = useFilePanelStore((s) => s.selectedFile)
  const setSelectedFile = useFilePanelStore((s) => s.setSelectedFile)
  const expandedDirs = useFilePanelStore((s) => s.expandedDirs)
  const toggleDir = useFilePanelStore((s) => s.toggleDir)
  const moveMutation = useMoveSessionFile(sessionId)
  const uploadMutation = useUploadSessionFile(sessionId)

  const isSelected =
    selectedFile?.entry.path === entry.path && selectedFile?.zone === zone
  const isExpanded = entry.type === "directory" && expandedDirs.has(entry.path)
  const isDir = entry.type === "directory"

  const handleClick = useCallback(() => {
    if (isDir) {
      toggleDir(entry.path)
    }
    setSelectedFile({ zone, entry })
  }, [isDir, entry, zone, toggleDir, setSelectedFile])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (zone !== "input") return
      e.dataTransfer.setData("application/x-file-path", entry.path)
      e.dataTransfer.effectAllowed = "move"
    },
    [zone, entry.path]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDir || zone !== "input") return
      // Accept both internal file moves and OS file drops
      if (
        e.dataTransfer.types.includes("application/x-file-path") ||
        e.dataTransfer.types.includes("Files")
      ) {
        e.preventDefault()
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files")
          ? "copy"
          : "move"
      }
    },
    [isDir, zone]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isDir || zone !== "input") return
      e.preventDefault()
      e.stopPropagation() // prevent FileUploadZone from also handling this

      // OS file drop → upload to this folder
      if (e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          uploadMutation.mutate(
            { file: e.dataTransfer.files[i], dir: entry.path },
            {
              onSuccess: () => toast.success(t("filePanel.uploadSuccess")),
              onError: () => toast.error(t("filePanel.uploadFailed")),
            }
          )
        }
        return
      }

      // Internal drag → move file into this folder
      const sourcePath = e.dataTransfer.getData("application/x-file-path")
      if (!sourcePath || sourcePath === entry.path) return

      const fileName = sourcePath.split("/").pop() ?? sourcePath
      const targetPath = entry.path
        ? `${entry.path}/${fileName}`
        : fileName

      moveMutation.mutate(
        { source: sourcePath, target: targetPath },
        {
          onSuccess: () => toast.success(t("filePanel.moveSuccess")),
          onError: () => toast.error(t("filePanel.moveFailed")),
        }
      )
    },
    [isDir, zone, entry.path, moveMutation, uploadMutation, t]
  )

  const node = (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm cursor-pointer select-none",
        "hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent text-accent-foreground",
        isDir && zone === "input" && "drop-target"
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick()
      }}
      draggable={zone === "input" && !isDir}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDir ? (
        isExpanded ? (
          <FolderOpen className="size-4 shrink-0 text-amber-500" />
        ) : (
          <Folder className="size-4 shrink-0 text-amber-500" />
        )
      ) : (
        getFileIcon(entry)
      )}
      <span className="truncate flex-1">{entry.name}</span>
      {!isDir && (
        <span className="text-muted-foreground text-xs shrink-0">
          {formatSize(entry.size)}
        </span>
      )}
    </div>
  )

  return (
    <FileContextMenu
      entry={entry}
      zone={zone}
      sessionId={sessionId}
      onDownload={() => onDownload(entry)}
      onDelete={() => onDelete(entry)}
      onNewFolder={() => onNewFolder(isDir ? entry.path : undefined)}
    >
      {node}
    </FileContextMenu>
  )
}
