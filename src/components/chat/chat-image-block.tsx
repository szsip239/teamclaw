"use client"

import { useState } from "react"
import { X, Download } from "lucide-react"
import { useT } from "@/stores/language-store"

interface ChatImageBlockProps {
  imageUrl: string
  alt?: string
}

export function ChatImageBlock({ imageUrl, alt }: ChatImageBlockProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  function handleDownload() {
    const a = document.createElement("a")
    a.href = imageUrl
    a.download = alt || "image"
    a.click()
  }

  return (
    <>
      <img
        src={imageUrl}
        alt={alt || t('chat.imageAlt')}
        className="max-w-sm cursor-pointer rounded-lg border transition-shadow hover:shadow-md"
        onClick={() => setExpanded(true)}
      />
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setExpanded(false)}
        >
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDownload() }}
              className="rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/40"
              title={t('chat.downloadImage')}
            >
              <Download className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/40"
              title={t('close')}
            >
              <X className="size-5" />
            </button>
          </div>
          <img
            src={imageUrl}
            alt={alt || t('chat.imageAlt')}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
