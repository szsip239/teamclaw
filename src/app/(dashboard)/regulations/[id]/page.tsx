'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useQueryClient } from '@tanstack/react-query'
import {
  regulationKeys,
  useDeletePendingUpdate,
  useMarkRegulationChecked,
  useRegulationTracker,
  useRunCheckUpdates,
  useUpdatePendingStatus,
  useUpdateRegulationTracker,
} from '@/hooks/use-regulations'
import type {
  PendingStatus,
  PendingUpdateItem,
  RegulationTrackedDocument,
} from '@/types/regulation'
import { useT } from '@/stores/language-store'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function RegulationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const t = useT()
  const qc = useQueryClient()
  const { data, isLoading, refetch, isFetching } = useRegulationTracker(id)
  const markChecked = useMarkRegulationChecked(id)
  const runCheck = useRunCheckUpdates(id)

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t('loading')}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <Link
          href="/regulations"
          className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" /> {t('regulations.backToList')}
        </Link>
        <p className="text-muted-foreground mt-6 text-sm">{t('regulations.notFound')}</p>
      </div>
    )
  }

  const newDocCount = data.documents.filter((d) => d.isNew).length
  const pendingNew = data.pendingUpdates.filter((p) => p.status === 'NEW').length

  async function handleMarkChecked() {
    try {
      await markChecked.mutateAsync()
      toast.success(t('regulations.markCheckedSuccess'))
      qc.invalidateQueries({ queryKey: regulationKeys.detail(id) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationFailed'))
    }
  }

  async function handleRunCheck() {
    try {
      const result = await runCheck.mutateAsync()
      if (result.newCount === 0) {
        toast.success(t('regulations.checkNoNew'))
      } else {
        toast.success(t('regulations.checkFoundNew', { count: result.newCount }))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationFailed'))
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/regulations"
          className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" /> {t('regulations.backToList')}
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1">
            <RefreshCw className={'size-3.5 ' + (isFetching ? 'animate-spin' : '')} />
            {t('refresh')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRunCheck}
            disabled={runCheck.isPending}
            className="gap-1"
          >
            {runCheck.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            {t('regulations.checkNow')}
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleMarkChecked}
            disabled={markChecked.isPending || newDocCount === 0}
            className="gap-1"
          >
            <CheckCheck className="size-3.5" />
            {t('regulations.markChecked')}
          </Button>
        </div>
      </div>

      <header className="flex items-start gap-4">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
          <ScrollText className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          <Link
            href={`/knowledge-bases/${data.knowledgeBaseId}`}
            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm"
          >
            <BookOpen className="size-3.5" />
            {data.knowledgeBaseName}
            <ExternalLink className="size-3" />
          </Link>
          {data.knowledgeBaseDescription ? (
            <p className="text-muted-foreground max-w-2xl text-sm">
              {data.knowledgeBaseDescription}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label={t('regulations.documentCount')} value={String(data.documentCount)} />
        <StatCard
          label={t('regulations.newDocs')}
          value={String(newDocCount)}
          highlight={newDocCount > 0}
        />
        <StatCard
          label={t('regulations.pendingUpdates')}
          value={String(pendingNew)}
          highlight={pendingNew > 0}
        />
        <StatCard label={t('regulations.lastCheckRunAt')} value={formatDate(data.lastCheckRunAt)} />
      </div>

      <Tabs defaultValue="clauses" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="clauses">
            {t('regulations.tabClauses')} ({data.documentCount})
          </TabsTrigger>
          <TabsTrigger value="keywords">
            {t('regulations.tabKeywords')} ({data.keywords.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t('regulations.tabPending')} ({data.pendingUpdates.length})
            {pendingNew > 0 ? (
              <Badge variant="default" className="ml-2 h-4 px-1.5 text-[10px]">
                {pendingNew}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clauses">
          <ClausesTab documents={data.documents} />
        </TabsContent>

        <TabsContent value="keywords">
          <KeywordsTab trackerId={id} keywords={data.keywords} />
        </TabsContent>

        <TabsContent value="pending">
          <PendingTab trackerId={id} items={data.pendingUpdates} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : ''}>
      <CardContent className="space-y-1 py-1">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="text-lg font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}

// ─── Clauses Tab ─────────────────────────────────────────────────────

function ClausesTab({ documents }: { documents: RegulationTrackedDocument[] }) {
  const t = useT()
  const [filter, setFilter] = useState<'all' | 'new'>('all')
  const newDocCount = documents.filter((d) => d.isNew).length
  const shown = filter === 'new' ? documents.filter((d) => d.isNew) : documents

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          {t('regulations.filterAll')} ({documents.length})
        </Button>
        <Button
          variant={filter === 'new' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('new')}
          className="gap-1"
        >
          <Sparkles className="size-3.5" />
          {t('regulations.filterNew')} ({newDocCount})
        </Button>
      </div>

      {shown.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            {filter === 'new' ? t('regulations.noNew') : t('regulations.noDocs')}
          </CardContent>
        </Card>
      ) : (
        shown.map((doc) => <DocumentCard key={doc.id} doc={doc} />)
      )}
    </div>
  )
}

function DocumentCard({ doc }: { doc: RegulationTrackedDocument }) {
  const t = useT()
  const [expanded, setExpanded] = useState(doc.isNew)

  return (
    <Card className={doc.isNew ? 'border-primary/40' : ''}>
      <CardContent className="py-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div className="flex flex-1 items-start gap-3">
            <FileText className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium tracking-tight">{doc.fileName}</span>
                {doc.isNew ? (
                  <Badge variant="default" className="gap-1">
                    <Sparkles className="size-3" /> {t('regulations.badgeNew')}
                  </Badge>
                ) : null}
                {doc.docType ? (
                  <Badge variant="secondary" className="text-xs">
                    {doc.docType}
                  </Badge>
                ) : null}
                <span className="text-muted-foreground text-xs">
                  {t('regulations.updatedAt')}: {formatDate(doc.updatedAt)}
                </span>
              </div>
              {doc.summary ? (
                <p className="text-muted-foreground line-clamp-2 text-sm">{doc.summary}</p>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  {t('regulations.summaryPending')}
                </p>
              )}
              {doc.keywords.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {doc.keywords.slice(0, 8).map((kw) => (
                    <Badge key={kw} variant="outline" className="text-[10px]">
                      {kw}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="text-muted-foreground mt-1 shrink-0">
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </div>
        </button>

        {expanded ? (
          <>
            <Separator className="my-3" />
            {doc.clauses.length === 0 ? (
              <p className="text-muted-foreground py-2 text-center text-xs">
                {t('regulations.noClauses')}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {doc.clauses.map((clause) => (
                  <li key={clause.id} className="space-y-1">
                    <div className="text-sm font-medium tracking-tight">{clause.title}</div>
                    <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
                      {clause.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ─── Keywords Tab ────────────────────────────────────────────────────

function KeywordsTab({ trackerId, keywords }: { trackerId: string; keywords: string[] }) {
  const t = useT()
  const update = useUpdateRegulationTracker(trackerId)
  const [editing, setEditing] = useState<string[]>(keywords)
  const [draft, setDraft] = useState('')
  const dirty = useMemo(
    () => JSON.stringify(editing) !== JSON.stringify(keywords),
    [editing, keywords],
  )

  function addDraft() {
    const value = draft.trim()
    if (!value) return
    if (editing.includes(value)) {
      setDraft('')
      return
    }
    setEditing((prev) => [...prev, value])
    setDraft('')
  }

  async function save() {
    try {
      await update.mutateAsync({ keywords: editing })
      toast.success(t('regulations.keywordsSaved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationFailed'))
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-1">
        <div>
          <h3 className="font-semibold tracking-tight">{t('regulations.keywordsTitle')}</h3>
          <p className="text-muted-foreground text-xs">{t('regulations.keywordsHint')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {editing.length === 0 ? (
            <p className="text-muted-foreground text-xs italic">
              {t('regulations.keywordsEmpty')}
            </p>
          ) : (
            editing.map((kw) => (
              <Badge key={kw} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                <Tag className="size-3" /> {kw}
                <button
                  type="button"
                  className="hover:bg-muted ml-1 rounded p-0.5"
                  onClick={() => setEditing((prev) => prev.filter((k) => k !== kw))}
                  aria-label="remove"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDraft()
              }
            }}
            placeholder={t('regulations.keywordsAddPlaceholder')}
            className="max-w-xs"
          />
          <Button type="button" variant="outline" size="sm" onClick={addDraft} className="gap-1">
            <Plus className="size-3.5" /> {t('regulations.keywordsAdd')}
          </Button>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : t('save')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(keywords)}
            disabled={!dirty}
          >
            {t('cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Pending Updates Tab ─────────────────────────────────────────────

function PendingTab({ trackerId, items }: { trackerId: string; items: PendingUpdateItem[] }) {
  const t = useT()
  const updateStatus = useUpdatePendingStatus(trackerId)
  const remove = useDeletePendingUpdate(trackerId)

  const ordered = useMemo(() => {
    const order: Record<PendingStatus, number> = { NEW: 0, SEEN: 1, APPLIED: 2, DISMISSED: 3 }
    return [...items].sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        new Date(b.foundAt).getTime() - new Date(a.foundAt).getTime(),
    )
  }, [items])

  if (ordered.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-muted-foreground py-12 text-center text-sm">
          {t('regulations.pendingEmpty')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {ordered.map((item) => (
        <Card
          key={item.id}
          className={item.status === 'NEW' ? 'border-primary/40' : ''}
        >
          <CardContent className="space-y-3 py-1">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold tracking-tight">{item.title}</h4>
                  <StatusBadge status={item.status} />
                  <span className="text-muted-foreground text-xs">
                    {t('regulations.foundAt')}: {formatDate(item.foundAt)}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">{item.summary}</p>
                {item.suggestion ? (
                  <p className="text-sm">
                    <span className="text-primary font-medium">
                      {t('regulations.suggestion')}:
                    </span>{' '}
                    <span className="text-muted-foreground">{item.suggestion}</span>
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {item.matchedKeywords.map((kw) => (
                    <Badge key={kw} variant="outline" className="gap-1 text-[10px]">
                      <Tag className="size-3" /> {kw}
                    </Badge>
                  ))}
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    {t('regulations.openSource')} <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  try {
                    await remove.mutateAsync(item.id)
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('operationFailed'))
                  }
                }}
                aria-label="delete"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {item.status !== 'SEEN' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateStatus.mutate({ id: item.id, status: 'SEEN' })
                  }
                >
                  <CheckCheck className="mr-1 size-3.5" /> {t('regulations.markSeen')}
                </Button>
              ) : null}
              {item.status !== 'APPLIED' ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() =>
                    updateStatus.mutate({ id: item.id, status: 'APPLIED' })
                  }
                >
                  <CheckCircle2 className="mr-1 size-3.5" /> {t('regulations.markApplied')}
                </Button>
              ) : null}
              {item.status !== 'DISMISSED' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateStatus.mutate({ id: item.id, status: 'DISMISSED' })
                  }
                >
                  <XCircle className="mr-1 size-3.5" /> {t('regulations.markDismissed')}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: PendingStatus }) {
  const t = useT()
  switch (status) {
    case 'NEW':
      return <Badge variant="default">{t('regulations.statusNew')}</Badge>
    case 'SEEN':
      return <Badge variant="secondary">{t('regulations.statusSeen')}</Badge>
    case 'APPLIED':
      return (
        <Badge variant="outline" className="border-green-500 text-green-600">
          {t('regulations.statusApplied')}
        </Badge>
      )
    case 'DISMISSED':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {t('regulations.statusDismissed')}
        </Badge>
      )
  }
}
