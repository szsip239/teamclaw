"use client"

import { User, FileText } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { ChatMessage } from "@/types/chat"

interface ChatMessageBubbleProps {
  message: ChatMessage
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const t = useT()
  const hasAttachments = message.attachments && message.attachments.length > 0

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[80%] items-start gap-2">
        <div className="flex flex-col gap-1.5">
          {/* Attachment previews */}
          {hasAttachments && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {message.attachments!.map((att, i) =>
                att.mimeType.startsWith("image/") ? (
                  <img
                    key={i}
                    src={att.dataUrl}
                    alt={att.name}
                    className="max-h-32 max-w-48 rounded-lg border object-cover"
                  />
                ) : (
                  <div
                    key={i}
                    className="bg-primary/10 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                  >
                    <FileText className="text-primary size-3.5 shrink-0" />
                    <div className="flex flex-col">
                      <span className="max-w-[140px] truncate text-xs font-medium">{att.name}</span>
                      <span className="text-muted-foreground text-[10px]">{formatFileSize(att.size)}</span>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
          {/* Text content */}
          {message.content && message.content !== t('chat.attachment') && (
            <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5">
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            </div>
          )}
        </div>
        <div className="bg-primary/10 flex size-7 shrink-0 items-center justify-center rounded-full">
          <User className="size-3.5" />
        </div>
      </div>
    </div>
  )
}
