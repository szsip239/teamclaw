"use client"

import { useEffect, useRef, useState, type SyntheticEvent } from "react"
import { User, FileText } from "lucide-react"
import type { ChatMessage } from "@/types/chat"
import { imageBlockDisplayKey, uniqueImageBlocks } from "@/lib/chat/image-blocks"

interface ChatMessageBubbleProps {
  message: ChatMessage
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function uniqueAttachmentPreviews(
  attachments: ChatMessage["attachments"],
): NonNullable<ChatMessage["attachments"]> {
  const seen = new Set<string>()
  const unique: NonNullable<ChatMessage["attachments"]> = []

  for (const attachment of attachments ?? []) {
    const key = attachment.dataUrl || `${attachment.mimeType}:${attachment.name}:${attachment.size}`
    if (seen.has(key)) continue
    unique.push(attachment)
    seen.add(key)
  }

  return unique
}

function attachmentPreviewKey(att: NonNullable<ChatMessage["attachments"]>[number]): string {
  return `attachment:${att.mimeType}:${att.dataUrl.slice(0, 96)}:${att.dataUrl.length}`
}

function visualImageFingerprint(img: HTMLImageElement): string {
  const dimensions = `${img.naturalWidth}x${img.naturalHeight}`

  try {
    const size = 16
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return dimensions

    ctx.drawImage(img, 0, 0, size, size)
    const pixels = ctx.getImageData(0, 0, size, size).data
    const grays: number[] = []
    let total = 0

    for (let i = 0; i < pixels.length; i += 4) {
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
      grays.push(gray)
      total += gray
    }

    const avg = total / grays.length
    return `${dimensions}:${grays.map((gray) => (gray >= avg ? "1" : "0")).join("")}`
  } catch {
    return dimensions
  }
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const attachments = uniqueAttachmentPreviews(message.attachments)
  const hasAttachments = attachments.length > 0
  // After syncFromHistory, user images move from `attachments` (client-only)
  // to `contentBlocks` (from gateway history). Render those as fallback.
  const contentImages = !hasAttachments
    ? uniqueImageBlocks(message.contentBlocks)
    : []
  const imageSignature = [
    ...attachments.map(attachmentPreviewKey),
    ...contentImages.map(imageBlockDisplayKey),
  ].join("|")
  const seenVisualFingerprints = useRef<Set<string>>(new Set())
  const [hiddenImageKeys, setHiddenImageKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    seenVisualFingerprints.current.clear()
    setHiddenImageKeys(new Set())
  }, [imageSignature])

  function handleImageLoad(
    key: string,
    event: SyntheticEvent<HTMLImageElement>,
  ) {
    const fingerprint = visualImageFingerprint(event.currentTarget)
    if (seenVisualFingerprints.current.has(fingerprint)) {
      setHiddenImageKeys((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      return
    }
    seenVisualFingerprints.current.add(fingerprint)
  }

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[80%] items-start gap-2">
        <div className="flex flex-col gap-1.5">
          {/* Attachment previews */}
          {hasAttachments && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {attachments.map((att, i) => {
                const key = `att-${i}-${attachmentPreviewKey(att)}`
                return att.mimeType.startsWith("image/") ? (
                  <img
                    key={key}
                    src={att.dataUrl}
                    alt={att.name}
                    onLoad={(event) => handleImageLoad(key, event)}
                    className={`${hiddenImageKeys.has(key) ? "hidden " : ""}max-h-32 max-w-48 rounded-lg border object-cover`}
                  />
                ) : (
                  <div
                    key={key}
                    className="bg-primary/10 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                  >
                    <FileText className="text-primary size-3.5 shrink-0" />
                    <div className="flex flex-col">
                      <span className="max-w-[140px] truncate text-xs font-medium">{att.name}</span>
                      <span className="text-muted-foreground text-[10px]">{formatFileSize(att.size)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Images from contentBlocks (after history sync replaces attachments) */}
          {contentImages.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {contentImages.map((block, i) => {
                const key = `cb-${i}-${imageBlockDisplayKey(block)}`
                return (
                  <img
                    key={key}
                    src={block.imageUrl!}
                    alt={block.alt ?? ""}
                    onLoad={(event) => handleImageLoad(key, event)}
                    className={`${hiddenImageKeys.has(key) ? "hidden " : ""}max-h-32 max-w-48 rounded-lg border object-cover`}
                  />
                )
              })}
            </div>
          )}
          {/* Text content */}
          {message.content && message.content !== '__attachment_only__' && (
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
