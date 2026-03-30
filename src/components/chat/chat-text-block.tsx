'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface ChatTextBlockProps {
  content: string
}

export const ChatTextBlock = memo(function ChatTextBlock({ content }: ChatTextBlockProps) {
  return (
    <div className="text-sm leading-relaxed prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // --- Code blocks ---
          pre({ children }) {
            return <div className="my-2">{children}</div>
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isBlock = String(children).includes('\n') || match
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
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline decoration-blue-600/30 dark:decoration-blue-400/30 hover:decoration-blue-600 dark:hover:decoration-blue-400 cursor-pointer break-all transition-colors"
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
        {content}
      </ReactMarkdown>
    </div>
  )
})
