'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useTheme } from 'next-themes'
import { AlertTriangle, Code2 } from 'lucide-react'
import { useT } from '@/stores/language-store'
import { createClientId } from '@/lib/client-id'

// Global render queue — mermaid.render() uses global DOM state
// and cannot run concurrently without corruption
let renderQueue = Promise.resolve<void>(undefined)

function enqueueMermaidRender(id: string, code: string, theme: string): Promise<string> {
  const task = renderQueue.then(async () => {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
      fontFamily: 'inherit',
    })
    const { svg } = await mermaid.render(id, code)
    return svg
  })
  // Keep the queue going even if one render fails
  renderQueue = task.then(
    () => {},
    () => {},
  )
  return task
}

interface ChatMermaidBlockProps {
  code: string
}

export const ChatMermaidBlock = memo(function ChatMermaidBlock({ code }: ChatMermaidBlockProps) {
  const t = useT()
  const { resolvedTheme } = useTheme()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const renderIdRef = useRef(0)

  // Stable error message — avoid putting t() in useEffect deps
  const errorMsg = t('chat.mermaidError')

  useEffect(() => {
    const currentRender = ++renderIdRef.current
    const id = createClientId('mermaid')

    enqueueMermaidRender(id, code, resolvedTheme ?? 'light')
      .then((renderedSvg) => {
        if (currentRender !== renderIdRef.current) return
        if (renderedSvg) {
          setSvg(renderedSvg)
          setError(null)
        } else {
          setSvg(null)
          setError(errorMsg)
        }
      })
      .catch(() => {
        if (currentRender !== renderIdRef.current) return
        setSvg(null)
        setError(errorMsg)
        // Mermaid leaves error elements in DOM on failure — clean up
        const errEl = document.getElementById('d' + id)
        if (errEl) errEl.remove()
      })

    return () => {
      renderIdRef.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorMsg is derived from t() which is unstable; code+theme are the real deps
  }, [code, resolvedTheme])

  if (error || showRaw) {
    return (
      <div className="my-2">
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
        <div>
          <div className="bg-muted text-muted-foreground rounded-t-md border border-b-0 px-3 py-1 text-[10px] font-mono flex items-center justify-between">
            <span>mermaid</span>
            {!error && (
              <button
                onClick={() => setShowRaw(false)}
                className="text-primary hover:underline cursor-pointer"
              >
                {t('chat.chartLoading').replace('...', '').replace('…', '')}
              </button>
            )}
          </div>
          <pre className="bg-muted overflow-x-auto rounded-md rounded-t-none border p-3 text-xs">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-2 flex items-center justify-center h-40 rounded-md border bg-card text-muted-foreground text-xs">
        {t('chat.chartLoading')}
      </div>
    )
  }

  return (
    <div className="chat-chart-block my-2">
      <div className="rounded-md border bg-card overflow-hidden">
        <div
          className="overflow-x-auto p-4 flex justify-center [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="flex justify-end px-2 pb-1">
          <button
            onClick={() => setShowRaw(true)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Code2 className="h-3 w-3" />
            {t('chat.mermaidShowRaw')}
          </button>
        </div>
      </div>
    </div>
  )
})
