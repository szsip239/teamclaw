"use client"

import { useState, useRef, useCallback } from "react"
import { Send, StopCircle, MessageCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ChatTextBlock } from "@/components/chat/chat-text-block"
import { KbQaSources } from "./kb-qa-sources"
import { streamKbQuery } from "@/lib/knowledge-base/query-stream"
import { useT } from "@/stores/language-store"
import type { RetrievalSource } from "@/types/knowledge-base"

interface KbQaTabProps {
  kbId: string
  kbName: string
}

export function KbQaTab({ kbId, kbName }: KbQaTabProps) {
  const t = useT()
  const [question, setQuestion] = useState("")
  const [askedQuestion, setAskedQuestion] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [answer, setAnswer] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [sources, setSources] = useState<RetrievalSource[]>([])
  const [generateAnswer, setGenerateAnswer] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const hasResult = askedQuestion !== ""

  const handleSubmit = useCallback(async () => {
    const q = question.trim()
    if (!q || isStreaming) return

    setAskedQuestion(q)
    setAnswer("")
    setReasoning("")
    setSources([])
    setIsStreaming(true)
    setQuestion("")

    const controller = new AbortController()
    abortRef.current = controller

    try {
      for await (const event of streamKbQuery(kbId, q, generateAnswer, 5, controller.signal)) {
        if (event.type === "retrieval") {
          const retrievedSources = (event.data.sources as RetrievalSource[]) ?? []
          setSources(retrievedSources)
        } else if (event.type === "chunk") {
          setAnswer((prev) => prev + (event.data.text as string ?? ""))
        } else if (event.type === "reasoning") {
          setReasoning((prev) => prev + (event.data.text as string ?? ""))
        } else if (event.type === "error") {
          setAnswer(`Error: ${event.data.message as string}`)
        } else if (event.type === "done") {
          break
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setAnswer(`Error: ${(err as Error).message}`)
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [question, isStreaming, kbId, generateAnswer])

  function handleAbort() {
    abortRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-280px)]">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {!hasResult ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <MessageCircle className="size-6 text-primary/60" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">{t('kb.qaWelcome')}</h3>
            <p className="mt-1 text-[12px] text-muted-foreground max-w-[280px]">
              {kbName}
            </p>
          </div>
        ) : (
          /* Q&A display */
          <div className="space-y-4 pb-4">
            {/* User question */}
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-[13px]">
                {askedQuestion}
              </div>
            </div>

            {/* AI answer */}
            <div className="space-y-2">
              {/* Reasoning (collapsible) */}
              {reasoning && (
                <details className="rounded-lg bg-muted/30 border">
                  <summary className="px-3 py-2 text-[12px] font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                    <Sparkles className="inline size-3.5 mr-1.5" />
                    {t('kb.qaReasoning')}
                  </summary>
                  <div className="px-3 pb-3 text-[12px] text-muted-foreground whitespace-pre-wrap">
                    {reasoning}
                  </div>
                </details>
              )}

              {/* Answer text */}
              {answer && (
                <div className="rounded-xl bg-card border p-4">
                  <ChatTextBlock content={answer} />
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
              )}

              {/* Sources */}
              {!isStreaming && sources.length > 0 && (
                <KbQaSources sources={sources} />
              )}

              {/* No sources */}
              {!isStreaming && sources.length === 0 && !answer && (
                <p className="text-[12px] text-muted-foreground text-center py-4">
                  {t('kb.qaNoSources')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('kb.qaPlaceholder')}
            className="text-[13px] min-h-[44px] max-h-[120px] resize-none"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAbort}
              className="shrink-0"
            >
              <StopCircle className="size-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!question.trim()}
              className="shrink-0"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="generateAnswer"
            checked={generateAnswer}
            onCheckedChange={(checked) => setGenerateAnswer(!!checked)}
          />
          <label htmlFor="generateAnswer" className="text-[12px] text-muted-foreground cursor-pointer">
            {t('kb.qaGenerateAnswer')}
          </label>
        </div>
      </div>
    </div>
  )
}
