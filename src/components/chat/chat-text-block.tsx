"use client"

import { cn } from "@/lib/utils"

interface ChatTextBlockProps {
  content: string
}

export function ChatTextBlock({ content }: ChatTextBlockProps) {
  // Simple rendering: detect code blocks and render them in <pre><code>,
  // everything else in whitespace-pre-wrap. No external markdown library.
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <div className="text-sm leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Extract language and code
          const inner = part.slice(3, -3)
          const newlineIdx = inner.indexOf("\n")
          const lang = newlineIdx > 0 ? inner.slice(0, newlineIdx).trim() : ""
          const code = newlineIdx > 0 ? inner.slice(newlineIdx + 1) : inner

          return (
            <div key={i} className="my-2">
              {lang && (
                <div className="bg-muted text-muted-foreground rounded-t-md border border-b-0 px-3 py-1 text-[10px] font-mono">
                  {lang}
                </div>
              )}
              <pre
                className={cn(
                  "bg-muted overflow-x-auto rounded-md border p-3 text-xs",
                  lang && "rounded-t-none",
                )}
              >
                <code>{code}</code>
              </pre>
            </div>
          )
        }

        // Render inline content with basic formatting
        return (
          <span key={i} className="whitespace-pre-wrap">
            {renderInline(part)}
          </span>
        )
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode[] {
  // Handle inline code: `code`
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-muted rounded px-1 py-0.5 text-xs font-mono"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    // Handle bold: **text**
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g)
    return boldParts.map((bp, j) => {
      if (bp.startsWith("**") && bp.endsWith("**")) {
        return <strong key={`${i}-${j}`}>{bp.slice(2, -2)}</strong>
      }
      return <span key={`${i}-${j}`}>{bp}</span>
    })
  })
}

