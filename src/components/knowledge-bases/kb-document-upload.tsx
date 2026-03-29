"use client"

import { useCallback, useState } from "react"
import { Upload, FileUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useUploadDocument } from "@/hooks/use-knowledge-bases"
import { useT } from "@/stores/language-store"

interface KbDocumentUploadProps {
  kbId: string
}

export function KbDocumentUpload({ kbId }: KbDocumentUploadProps) {
  const t = useT()
  const [isDragging, setIsDragging] = useState(false)
  const uploadDoc = useUploadDocument(kbId)

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files)
      for (const file of fileArr) {
        if (!file.name.toLowerCase().endsWith(".pdf")) {
          toast.error("Only PDF files are supported")
          continue
        }
        try {
          await uploadDoc.mutateAsync(file)
          toast.success(t('kb.uploadSuccess'))
        } catch (err) {
          toast.error((err as Error).message || t('kb.uploadFailed'))
        }
      }
    },
    [uploadDoc, t],
  )

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
      e.target.value = "" // Reset
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/20 hover:border-muted-foreground/40"
      }`}
    >
      {uploadDoc.isPending ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <Upload className="size-5 text-muted-foreground/50" />
      )}
      <div className="text-[13px] text-muted-foreground">
        {uploadDoc.isPending ? (
          t('kb.uploadingFile')
        ) : (
          <>
            {t('kb.uploadHint')}{" "}
            <label className="cursor-pointer text-primary hover:underline">
              {t('kb.browse')}
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileInput}
                className="sr-only"
              />
            </label>
          </>
        )}
      </div>
    </div>
  )
}
