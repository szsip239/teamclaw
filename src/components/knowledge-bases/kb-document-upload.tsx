"use client"

import { useCallback, useState } from "react"
import { Upload, Loader2, FileUp, AlertCircle } from "lucide-react"
import { useUploadDocument } from "@/hooks/use-knowledge-bases"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"

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
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`File "${file.name}" exceeds 100MB limit`)
          continue
        }
        try {
          await uploadDoc.mutateAsync(file)
          toast.success(t('kb.uploadSuccess'))
        } catch (err) {
          const msg = (err as { data?: { error?: string } })?.data?.error
            || (err as Error).message
            || t('kb.uploadFailed')
          toast.error(typeof msg === 'string' ? msg : t('kb.uploadFailed'))
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
      e.target.value = ""
    }
  }

  const isUploading = uploadDoc.isPending

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all ${
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : isUploading
            ? "border-muted-foreground/20 bg-muted/20"
            : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/10"
      }`}
    >
      {isUploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="size-6 text-primary animate-spin" />
          </div>
          <div>
            <p className="text-sm font-medium">{t('kb.uploadingFile')}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Please wait...</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
            <FileUp className="size-6 text-muted-foreground/60" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {t('kb.uploadHint')}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              PDF only, up to 100MB per file, supports multiple files
            </p>
          </div>
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Upload className="size-4" />
            {t('kb.browse')}
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileInput}
              className="sr-only"
            />
          </label>
        </div>
      )}
    </div>
  )
}
