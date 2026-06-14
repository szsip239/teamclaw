'use client'

import { memo } from 'react'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/stores/chat-store'

function ChartLoadingSkeleton() {
  return (
    <div className="my-2 flex items-center justify-center h-40 rounded-md border bg-card text-muted-foreground text-xs">
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
    </div>
  )
}

const ChatChartBlock = dynamic(() => import('./chat-chart-block').then((m) => m.ChatChartBlock), {
  ssr: false,
  loading: () => <ChartLoadingSkeleton />,
})

const ChatMermaidBlock = dynamic(
  () => import('./chat-mermaid-block').then((m) => m.ChatMermaidBlock),
  { ssr: false, loading: () => <ChartLoadingSkeleton /> },
)

interface ChatTextBlockProps {
  content: string
  // Pure predicate run during render: should this href be styled as an
  // in-app interactive chip (instead of an external link)? MUST be pure
  // — no setState. Used by KB QA to recognize page-citation hrefs.
  shouldIntercept?: (href: string) => boolean
  // Click handler invoked when the user clicks an intercepted anchor.
  // Runs only on click — side effects belong here, not in the predicate.
  onIntercept?: (href: string) => void
}

export const ChatTextBlock = memo(function ChatTextBlock({
  content,
  shouldIntercept,
  onIntercept,
}: ChatTextBlockProps) {
  // LLMs occasionally emit raw HTML <br> inside markdown cells.
  // ReactMarkdown strips HTML for safety — turn <br> into actual
  // newlines so bullets and table cells render correctly.
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const cleaned = content.replace(/<br\s*\/?>/gi, '\n')
  return (
    <div className="text-sm leading-relaxed prose-chat overflow-x-auto min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          // Rewrite output/ links to session file download API
          a({ href, children, ...props }) {
            const h = String(href ?? '')
            if (h.startsWith('output/') && activeSessionId) {
              const apiUrl = `/api/v1/chat/sessions/${activeSessionId}/files/${h}`
              return (
                <a
                  href={apiUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline hover:no-underline"
                  {...props}
                >
                  <Download className="size-3" />
                  {children}
                </a>
              )
            }
            return <a href={h} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
          },
          // --- Code blocks ---
          pre({ children }) {
            return <div className="my-2">{children}</div>
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const lang = match?.[1]
            const raw = String(children).replace(/\n$/, '')

            if (lang === 'echarts') return <ChatChartBlock optionJson={raw} />
            if (lang === 'mermaid') return <ChatMermaidBlock code={raw} />

            const isBlock = raw.includes('\n') || match
            if (isBlock) {
              return (
                <div>
                  {match && (
                    <div className="bg-muted text-muted-foreground rounded-t-md border border-b-0 px-3 py-1 text-[10px] font-mono">
                      {match[1]}
                    </div>
                  )}
                  <pre
                    className={cn(
                      'bg-muted overflow-x-auto rounded-md border p-3 text-xs',
                      match && 'rounded-t-none',
                    )}
                  >
                    <code {...props}>{children}</code>
                  </pre>
                </div>
              )
            }
            return (
              <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono" {...props}>
                {children}
              </code>
            )
          },
          // --- Table ---
          table({ children }) {
            return (
              <div className="my-3 max-h-96 overflow-auto rounded-lg border">
                <table className="w-full text-sm">{children}</table>
              </div>
            )
          },
          thead({ children }) {
            return <thead className="bg-muted/50 border-b sticky top-0 z-[1]">{children}</thead>
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                {children}
              </th>
            )
          },
          td({ children }) {
            return <td className="border-t px-3 py-2">{children}</td>
          },
          tr({ children }) {
            return <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
          },
          // --- Links ---
          a({ href, children }) {
            const intercepted = !!href && !!shouldIntercept?.(href)
            return (
              <a
                href={href}
                target={intercepted ? undefined : '_blank'}
                rel={intercepted ? undefined : 'noopener noreferrer'}
                onClick={
                  intercepted && href
                    ? (e) => {
                        e.preventDefault()
                        onIntercept?.(href)
                      }
                    : undefined
                }
                className={cn(
                  'cursor-pointer break-all transition-colors',
                  intercepted
                    ? 'inline-flex items-center rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[12px] font-medium text-primary no-underline hover:bg-primary/20'
                    : 'text-blue-600 dark:text-blue-400 underline decoration-blue-600/30 dark:decoration-blue-400/30 hover:decoration-blue-600 dark:hover:decoration-blue-400',
                )}
              >
                {children}
              </a>
            )
          },
          // --- Lists ---
          ul({ children }) {
            return <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
          },
          ol({ children }) {
            return <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
          },
          li({ children }) {
            return <li className="pl-0.5">{children}</li>
          },
          // --- Paragraphs: no extra margin for tighter chat layout ---
          p({ children }) {
            return <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
          },
          // --- Headings ---
          h1({ children }) {
            return <h3 className="mt-3 mb-1.5 text-base font-bold first:mt-0">{children}</h3>
          },
          h2({ children }) {
            return <h4 className="mt-3 mb-1.5 text-sm font-bold first:mt-0">{children}</h4>
          },
          h3({ children }) {
            return <h5 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h5>
          },
          // --- Blockquote ---
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground italic">
                {children}
              </blockquote>
            )
          },
          // --- Horizontal rule ---
          hr() {
            return <hr className="my-3 border-border" />
          },
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  )
})
