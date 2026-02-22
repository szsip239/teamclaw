"use client"

import { AlertTriangle } from "lucide-react"

interface ChatErrorBlockProps {
  error: string
}

export function ChatErrorBlock({ error }: ChatErrorBlockProps) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/30">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" />
      <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
    </div>
  )
}
