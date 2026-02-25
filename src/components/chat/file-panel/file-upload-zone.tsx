"use client"

import { useCallback, useRef, useState } from "react"
import { useUploadSessionFile } from "@/hooks/use-session-files"
import { useT } from "@/stores/language-store"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

interface FileUploadZoneProps {
  sessionId: string
  dir?: string
  children: React.ReactNode
}

export function FileUploadZone({
  sessionId,
  dir,
  children,
}: FileUploadZoneProps) {
  const t = useT()
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadSessionFile(sessionId)
  const dragCountRef = useRef(0)

  const uploadFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("filePanel.fileTooLarge"))
        return
      }
      uploadMutation.mutate(
        { file, dir },
        {
          onSuccess: () => toast.success(t("filePanel.uploadSuccess")),
          onError: () => toast.error(t("filePanel.uploadFailed")),
        }
      )
    },
    [uploadMutation, dir, t]
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Only react to OS file drops, not internal DnD
    if (!e.dataTransfer.types.includes("Files")) return
    dragCountRef.current++
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current--
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy"
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragCountRef.current = 0
      setIsDragOver(false)

      const files = e.dataTransfer.files
      if (!files.length) return

      for (let i = 0; i < files.length; i++) {
        uploadFile(files[i])
      }
    },
    [uploadFile]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      for (let i = 0; i < files.length; i++) {
        uploadFile(files[i])
      }
      // Reset so the same file can be selected again
      e.target.value = ""
    },
    [uploadFile]
  )

  return (
    <div
      className={cn(
        "relative flex flex-col flex-1 min-h-0 transition-colors",
        isDragOver && "bg-primary/5 ring-2 ring-primary/30 ring-inset rounded-md"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/5 pointer-events-none">
          <div className="flex flex-col items-center gap-1 text-primary">
            <Upload className="size-6" />
            <span className="text-xs font-medium">
              {t("filePanel.dropFilesHere")}
            </span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center gap-1 p-1 border-t">
        <Button
          variant="ghost"
          size="xs"
          className="flex-1 bg-muted/50 hover:bg-muted"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Upload className="size-3" />
          {t("filePanel.upload")}
        </Button>
      </div>
    </div>
  )
}
