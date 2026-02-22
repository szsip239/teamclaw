"use client"

import { useState, useRef, useCallback } from "react"
import { Send, Square, Paperclip, X, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useChatStore } from "@/stores/chat-store"
import { useT } from "@/stores/language-store"

const IMAGE_MAX_SIZE = 10 * 1024 * 1024  // 10MB
const FILE_MAX_SIZE = 5 * 1024 * 1024    // 5MB
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const FILE_ACCEPT = "image/*,.pdf,.txt,.md,.csv,.json,.html"

interface PendingFile {
  name: string
  mimeType: string
  size: number
  content: string   // pure base64 (for API)
  dataUrl: string   // data URL (for preview)
}

export function ChatInput() {
  const t = useT()
  const [input, setInput] = useState("")
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const abortController = useChatStore((s) => s.abortController)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const activeSessionId = useChatStore((s) => s.activeSessionId)

  const handleSend = useCallback(() => {
    const text = input.trim()
    if ((!text && pendingFiles.length === 0) || !selectedAgent || isStreaming) return

    const message = text || t('chat.attachment')
    const attachments = pendingFiles.length > 0 ? pendingFiles : undefined

    setInput("")
    setPendingFiles([])
    sendMessage(
      selectedAgent.instanceId,
      selectedAgent.agentId,
      message,
      activeSessionId ?? undefined,
      attachments,
    )

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [input, pendingFiles, selectedAgent, isStreaming, sendMessage, activeSessionId])

  function handleStop() {
    abortController?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ignore Enter during IME composition (e.g. Chinese/Japanese input)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      // Enforce limits
      const isImage = IMAGE_TYPES.has(file.type)
      const maxSize = isImage ? IMAGE_MAX_SIZE : FILE_MAX_SIZE
      if (file.size > maxSize) {
        alert(t('chat.fileTooLarge', { name: file.name, limit: isImage ? "10MB" : "5MB" }))
        continue
      }
      // Check total count
      if (pendingFiles.length >= 5) {
        alert(t('chat.maxAttachments'))
        break
      }

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(",")[1]
        setPendingFiles(prev => {
          if (prev.length >= 5) return prev
          return [...prev, {
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            content: base64,
            dataUrl,
          }]
        })
      }
      reader.readAsDataURL(file)
    }
    // Reset so the same file can be selected again
    e.target.value = ""
  }

  function removeFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  return (
    <div className="border-t px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Pending files preview */}
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {pendingFiles.map((file, i) => (
              <div key={i} className="group relative shrink-0">
                {file.mimeType.startsWith("image/") ? (
                  <img
                    src={file.dataUrl}
                    alt={file.name}
                    className="h-16 w-auto rounded-lg border object-cover"
                  />
                ) : (
                  <div className="bg-muted flex h-16 items-center gap-1.5 rounded-lg border px-3">
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <div className="flex flex-col">
                      <span className="max-w-[120px] truncate text-xs font-medium">{file.name}</span>
                      <span className="text-muted-foreground text-[10px]">{formatFileSize(file.size)}</span>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="bg-destructive text-destructive-foreground absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* File upload button */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={FILE_ACCEPT}
            multiple
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title={t('chat.uploadFile')}
          >
            <Paperclip className="size-4" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            className="min-h-[44px] max-h-[200px] resize-none"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon"
              className="shrink-0"
              onClick={handleStop}
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="shrink-0"
              onClick={handleSend}
              disabled={!input.trim() && pendingFiles.length === 0 || !selectedAgent}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
