'use client'

import { useState } from 'react'
import { Loader2, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useT } from '@/stores/language-store'
import type { ConversationSummary } from '@/lib/knowledge-base/conversations-client'

interface Props {
  kbName: string
  conversations: ConversationSummary[]
  activeId: string | null
  isLoading: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, currentTitle: string) => void
  onDelete: (id: string) => void
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = (now - then) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  return new Date(iso).toLocaleDateString()
}

export function KbConversationSidebar({
  kbName,
  conversations,
  activeId,
  isLoading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const t = useT()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const totalMessages = conversations.reduce((sum, conv) => sum + conv.messageCount, 0)

  return (
    <aside className="flex h-auto max-h-64 w-full shrink-0 flex-col border-b bg-muted/30 md:h-full md:max-h-none md:w-[232px] md:border-r md:border-b-0">
      <div className="flex flex-col gap-2.5 border-b bg-background/70 p-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold leading-none">{kbName}</h2>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{t('kb.qaConversations')}</span>
            <span className="size-1 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            <span>{t('kb.qaMessages', { n: totalMessages })}</span>
          </div>
        </div>
        <Button size="sm" variant="default" onClick={onCreate} className="w-full justify-start">
          <Plus data-icon="inline-start" />
          {t('kb.qaNewConversation')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl border bg-background text-primary shadow-xs">
              <MessageSquare className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-foreground">{t('kb.qaNoConversations')}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t('kb.qaNewConversation')}
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId
              return (
                <li
                  key={conv.id}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-[13px] transition-colors',
                    isActive
                      ? 'border-primary/15 bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:border-border/70 hover:bg-background/70 hover:text-foreground',
                  )}
                  onClick={() => onSelect(conv.id)}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md',
                      isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <MessageSquare className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {conv.title || t('kb.qaUntitledConversation')}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] opacity-60">
                      {formatRelative(conv.updatedAt)} · {conv.messageCount}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'transition-opacity',
                          hoveredId === conv.id || isActive ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-label={t('kb.qaConversationActions')}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onRename(conv.id, conv.title)
                          }}
                        >
                          <Pencil />
                          {t('kb.qaRename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(conv.id)
                          }}
                          variant="destructive"
                        >
                          <Trash2 />
                          {t('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
