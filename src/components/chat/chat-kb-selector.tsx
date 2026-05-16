'use client'

import { useState, useCallback } from 'react'
import { BookOpen, X, Search, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useChatStore } from '@/stores/chat-store'
import { useT } from '@/stores/language-store'
import { api } from '@/lib/api-client'
import type { KnowledgeBaseOverview } from '@/types/knowledge-base'

const MAX_MOUNTED = 10

export function ChatKbSelector() {
  const t = useT()
  const mountedKbIds = useChatStore((s) => s.mountedKbIds)
  const setMountedKbIds = useChatStore((s) => s.setMountedKbIds)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const remoteStreaming = useChatStore((s) => s.remoteStreaming)
  const activeSessionId = useChatStore((s) => s.activeSessionId)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'INTERNAL' | 'EXTERNAL'>('ALL')
  const [allKbs, setAllKbs] = useState<KnowledgeBaseOverview[]>([])
  const [autoRules, setAutoRules] = useState<KnowledgeBaseOverview[]>([])

  // Load available KBs when opening
  const loadKbs = useCallback(async () => {
    try {
      const data = await api.get<{
        knowledgeBases: KnowledgeBaseOverview[]
        total: number
      }>('/api/v1/knowledge-bases?scope=all')

      // Separate RULES from selectable KBs
      const rules: KnowledgeBaseOverview[] = []
      const selectable: KnowledgeBaseOverview[] = []
      for (const kb of data.knowledgeBases) {
        if (kb.category === 'RULES') rules.push(kb)
        else selectable.push(kb)
      }
      setAutoRules(rules)
      setAllKbs(selectable)
    } catch {
      // Non-critical
    }
  }, [])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) void loadKbs()
  }, [loadKbs])

  // Mount / unmount via API
  const mount = useCallback(
    async (kbId: string) => {
      if (!activeSessionId) return
      if (mountedKbIds.length >= MAX_MOUNTED) return
      try {
        const data = await api.post<{ kbIds: string[] }>(
          `/api/v1/chat/sessions/${activeSessionId}/knowledge-bases`,
          { kbId },
        )
        setMountedKbIds(data.kbIds)
      } catch {
        // Non-critical
      }
    },
    [activeSessionId, mountedKbIds, setMountedKbIds],
  )

  const unmount = useCallback(
    async (kbId: string) => {
      if (!activeSessionId) return
      try {
        const data = await api.delete<{ kbIds: string[] }>(
          `/api/v1/chat/sessions/${activeSessionId}/knowledge-bases?kbId=${kbId}`,
        )
        setMountedKbIds(data.kbIds)
      } catch {
        // Non-critical
      }
    },
    [activeSessionId, setMountedKbIds],
  )

  const disabled = isStreaming || remoteStreaming || !activeSessionId

  // Filter
  const filtered = allKbs.filter((kb) => {
    if (categoryFilter !== 'ALL' && kb.category !== categoryFilter) return false
    if (search && !kb.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Count total active KBs (mounted + auto-rules)
  const totalActive = mountedKbIds.length + autoRules.length

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 relative"
          disabled={disabled}
          title={t('chat.kbMount')}
        >
          <BookOpen className="size-4" />
          {totalActive > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {totalActive}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-2" align="start" side="top">
        <div className="space-y-2">
          {/* Auto-rules (locked) */}
          {autoRules.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {t('chat.kbAutoRules')}
              </p>
              <div className="flex flex-wrap gap-1">
                {autoRules.map((kb) => (
                  <Badge
                    key={kb.id}
                    variant="secondary"
                    className="gap-1 text-[11px] opacity-80"
                  >
                    <Lock className="size-2.5" />
                    {kb.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Search + Category filter */}
          <div className="flex gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('chat.kbSelectorPlaceholder')}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | 'INTERNAL' | 'EXTERNAL')}
              className="h-7 rounded-md border bg-background px-2 text-[11px]"
            >
              <option value="ALL">{t('kb.all')}</option>
              <option value="INTERNAL">{t('kb.category.INTERNAL')}</option>
              <option value="EXTERNAL">{t('kb.category.EXTERNAL')}</option>
            </select>
          </div>

          {/* Mounted KB chips (removable) */}
          {allKbs.filter((kb) => mountedKbIds.includes(kb.id)).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allKbs
                .filter((kb) => mountedKbIds.includes(kb.id))
                .map((kb) => (
                  <Badge
                    key={kb.id}
                    variant="default"
                    className="gap-1 text-[11px] pr-1 cursor-pointer"
                  >
                    {kb.name}
                    <button
                      onClick={() => unmount(kb.id)}
                      className="ml-0.5 rounded-full hover:bg-primary-foreground/20 p-0.5"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
            </div>
          )}

          {/* KB list */}
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t('chat.kbEmpty')}
              </p>
            ) : (
              filtered.map((kb) => {
                const isMounted = mountedKbIds.includes(kb.id)
                const atMax = !isMounted && mountedKbIds.length >= MAX_MOUNTED
                return (
                  <button
                    key={kb.id}
                    onClick={() => (isMounted ? unmount(kb.id) : mount(kb.id))}
                    disabled={atMax}
                    className="flex items-center justify-between w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors disabled:opacity-40"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <BookOpen className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{kb.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {kb.category === 'INTERNAL'
                          ? t('kb.category.INTERNAL')
                          : t('kb.category.EXTERNAL')}
                      </span>
                      {isMounted && <span className="size-1.5 rounded-full bg-primary" />}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {mountedKbIds.length >= MAX_MOUNTED && (
            <p className="text-[10px] text-muted-foreground text-center">
              {t('chat.kbMaxReached', { n: String(MAX_MOUNTED) })}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
