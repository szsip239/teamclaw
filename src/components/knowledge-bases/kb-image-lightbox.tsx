"use client"

import { useEffect, useCallback } from "react"
import { X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface KbImageLightboxProps {
  imageUrl: string | null
  title: string
  onClose: () => void
}

export function KbImageLightbox({ imageUrl, title, onClose }: KbImageLightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (imageUrl) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [imageUrl, handleKeyDown])

  if (!imageUrl) return null

  function handleDownload() {
    if (!imageUrl) return
    const a = document.createElement("a")
    a.href = imageUrl
    a.download = title || "image"
    a.click()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] rounded-xl bg-background p-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-[13px] font-medium truncate max-w-[60%]">
            {title}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={handleDownload}
            >
              <Download className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Image */}
        <img
          src={imageUrl}
          alt={title}
          className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain"
        />
      </div>
    </div>
  )
}
