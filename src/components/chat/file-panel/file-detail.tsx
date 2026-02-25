"use client"

import { useCallback, useEffect, useState } from "react"
import { useFilePanelStore } from "@/stores/file-panel-store"
import { useDeleteSessionFile } from "@/hooks/use-session-files"
import { useT } from "@/stores/language-store"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
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
import { Download, Trash2, File, FileText, Image } from "lucide-react"
import { toast } from "sonner"

interface FileDetailProps {
  sessionId: string
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"])
const TEXT_EXTS = new Set([
  "txt", "md", "csv", "json", "html", "xml", "yaml", "yml",
  "log", "ts", "tsx", "js", "jsx", "py", "sh", "toml", "ini", "cfg",
])

function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? ""
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function FileDetail({ sessionId }: FileDetailProps) {
  const t = useT()
  const selectedFile = useFilePanelStore((s) => s.selectedFile)
  const setSelectedFile = useFilePanelStore((s) => s.setSelectedFile)
  const deleteMutation = useDeleteSessionFile(sessionId)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const entry = selectedFile?.entry
  const zone = selectedFile?.zone
  const ext = entry ? getExt(entry.name) : ""
  const isImage = IMAGE_EXTS.has(ext)
  const isText = TEXT_EXTS.has(ext)

  // Fetch preview content when selection changes
  useEffect(() => {
    setTextContent(null)
    setImageUrl(null)

    if (!entry || entry.type === "directory") return

    const url = `/api/v1/chat/sessions/${sessionId}/files/${zone}/${entry.path}`

    if (isImage) {
      // Build blob URL for image preview
      fetch(url, { credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch")
          return res.blob()
        })
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob)
          setImageUrl(blobUrl)
        })
        .catch(() => {
          // Silently fail preview
        })
      return () => {
        // Clean up will happen on next effect run
      }
    }

    if (isText && entry.size <= 512 * 1024) {
      // Only preview text files under 512KB
      fetch(url, { credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch")
          return res.text()
        })
        .then((text) => {
          // Show first 200 lines
          const lines = text.split("\n")
          setTextContent(
            lines.length > 200
              ? lines.slice(0, 200).join("\n") + "\n..."
              : text
          )
        })
        .catch(() => {
          // Silently fail preview
        })
    }
  }, [entry, zone, sessionId, isImage, isText])

  // Clean up blob URLs
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  const handleDownload = useCallback(() => {
    if (!entry || !zone) return
    const url = `/api/v1/chat/sessions/${sessionId}/files/${zone}/${entry.path}`
    const a = document.createElement("a")
    a.href = url
    a.download = entry.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [entry, zone, sessionId])

  const confirmDelete = useCallback(() => {
    if (!entry || !zone) return
    deleteMutation.mutate(
      `input/${entry.path}`,
      {
        onSuccess: () => {
          toast.success(t("filePanel.deleteSuccess"))
          setSelectedFile(null)
        },
        onError: () => toast.error(t("filePanel.deleteFailed")),
      }
    )
    setShowDeleteDialog(false)
  }, [entry, zone, deleteMutation, t, setSelectedFile])

  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        {t("filePanel.noSelection")}
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {isImage ? (
            <Image className="size-4 shrink-0 text-muted-foreground" />
          ) : isText ? (
            <FileText className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <File className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-medium truncate">{entry.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {entry.type === "file" && (
            <Button variant="ghost" size="icon-xs" onClick={handleDownload}>
              <Download className="size-3" />
            </Button>
          )}
          {zone === "input" && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="size-3 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 px-3 pb-2 text-xs text-muted-foreground">
        {entry.type === "file" && (
          <>
            <span>
              {t("filePanel.fileSize")}: {formatSize(entry.size)}
            </span>
            <span>
              {t("filePanel.fileType")}: {ext.toUpperCase() || "-"}
            </span>
          </>
        )}
      </div>

      {/* Preview area */}
      <ScrollArea className="flex-1 min-h-0 px-3 pb-2">
        {entry.type === "directory" ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            {entry.name}
          </div>
        ) : isImage && imageUrl ? (
          <div className="flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={entry.name}
              className="max-w-full max-h-64 rounded border object-contain"
            />
          </div>
        ) : isText && textContent !== null ? (
          <pre className="text-xs whitespace-pre-wrap break-all font-mono leading-relaxed">
            {textContent}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <File className="size-8" />
            <span className="text-xs">{entry.name}</span>
          </div>
        )}
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("filePanel.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("filePanel.confirmDelete", { name: entry.name })}
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
    </div>
  )
}
