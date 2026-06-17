'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip, X, FileText, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore } from '@/stores/chat-store'
import { useT } from '@/stores/language-store'
import { useIsMobile } from '@/hooks/use-mobile'

const IMAGE_MAX_SIZE = 10 * 1024 * 1024 // 10MB
const FILE_MAX_SIZE = 5 * 1024 * 1024 // 5MB
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const FILE_ACCEPT = 'image/*,.pdf,.txt,.md,.csv,.json,.html'

interface PendingFile {
  name: string
  mimeType: string
  size: number
  content: string // pure base64 (for API)
  dataUrl: string // data URL (for preview)
}

export function ChatInput() {
  const t = useT()
  const isMobile = useIsMobile()
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const selectedRuntime = useChatStore((s) => s.selectedRuntime)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const remoteStreaming = useChatStore((s) => s.remoteStreaming)
  const abortChat = useChatStore((s) => s.abortChat)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const queueMessage = useChatStore((s) => s.queueMessage)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const mobileFilePanelOpen = useChatStore((s) => s.mobileFilePanelOpen)
  const setMobileFilePanelOpen = useChatStore((s) => s.setMobileFilePanelOpen)

  const handleSend = useCallback(() => {
    const text = input.trim()
    if ((!text && pendingFiles.length === 0) || !selectedAgent) return

    const message = text || '__attachment_only__'
    const attachments = pendingFiles.length > 0 ? pendingFiles : undefined

    setInput('')
    setPendingFiles([])

    if (isStreaming || remoteStreaming) {
      // Agent is running — queue the message (gateway handles serialization)
      queueMessage(selectedRuntime, message, attachments)
    } else {
      sendMessage(
        selectedAgent.instanceId,
        selectedAgent.agentId,
        selectedRuntime,
        message,
        activeSessionId ?? undefined,
        attachments,
      )
    }

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [
    input,
    pendingFiles,
    selectedAgent,
    selectedRuntime,
    isStreaming,
    remoteStreaming,
    sendMessage,
    queueMessage,
    activeSessionId,
  ])

  function handleStop() {
    abortChat()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ignore Enter during IME composition (e.g. Chinese/Japanese input)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      // Enforce limits
      const isImage = IMAGE_TYPES.has(file.type)
      const maxSize = isImage ? IMAGE_MAX_SIZE : FILE_MAX_SIZE
      if (file.size > maxSize) {
        alert(t('chat.fileTooLarge', { name: file.name, limit: isImage ? '10MB' : '5MB' }))
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
        const base64 = dataUrl.split(',')[1]
        setPendingFiles((prev) => {
          if (prev.length >= 5) return prev
          const mimeType = file.type || 'application/octet-stream'
          if (prev.some((pending) => pending.mimeType === mimeType && pending.content === base64)) {
            return prev
          }
          return [
            ...prev,
            {
              name: file.name,
              mimeType,
              size: file.size,
              content: base64,
              dataUrl,
            },
          ]
        })
      }
      reader.readAsDataURL(file)
    }
    // Reset so the same file can be selected again
    e.target.value = ''
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  // Mobile: scroll input into view when virtual keyboard opens
  useEffect(() => {
    if (!isMobile) return
    const vv = window.visualViewport
    if (!vv) return
    function onResize() {
      textareaRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [isMobile])

  const showFilePanelButton = isMobile && activeSessionId && selectedAgent?.hasContainer !== false

  return (
    <div className="border-t px-3 py-3">
      <div className="mx-auto max-w-[950px]">
        {/* Pending files preview */}
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {pendingFiles.map((file, i) => (
              <div key={i} className="group relative shrink-0">
                {file.mimeType.startsWith('image/') ? (
                  <img
                    src={file.dataUrl}
                    alt={file.name}
                    className="h-16 w-auto rounded-lg border object-cover"
                  />
                ) : (
                  <div className="bg-muted flex h-16 items-center gap-1.5 rounded-lg border px-3">
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <div className="flex flex-col">
                      <span className="max-w-[120px] truncate text-xs font-medium">
                        {file.name}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {formatFileSize(file.size)}
                      </span>
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

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={FILE_ACCEPT}
          multiple
          onChange={handleFileSelect}
        />
        <div className="flex items-end gap-1 rounded-lg border bg-card px-1.5 py-1 shadow-sm transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title={t('chat.uploadFile')}
          >
            <Paperclip className="size-4" />
          </Button>

          {showFilePanelButton && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setMobileFilePanelOpen(!mobileFilePanelOpen)}
              title={t('chat.filePanel')}
            >
              <FolderOpen className="size-4" />
            </Button>
          )}

          {selectedRuntime === 'pi' && (
            <span className="text-muted-foreground bg-muted/60 flex h-6 shrink-0 items-center rounded px-1.5 text-[11px] font-medium">
              [{t('chat.runtimePi')}]
            </span>
          )}

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            className="min-h-8 max-h-[200px] resize-none border-0 bg-transparent px-1 py-1.5 text-sm leading-5 shadow-none focus-visible:ring-0"
            rows={1}
            enterKeyHint="send"
          />
          {isStreaming && (
            <Button
              variant="destructive"
              size="icon"
              className="size-8 shrink-0"
              onClick={handleStop}
            >
              <Square className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            className="size-8 shrink-0"
            onClick={handleSend}
            disabled={(!input.trim() && pendingFiles.length === 0) || !selectedAgent}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
