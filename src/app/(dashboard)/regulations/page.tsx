'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  Plus,
  ScrollText,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useKnowledgeBases } from '@/hooks/use-knowledge-bases'
import {
  useCreateRegulationTracker,
  useDeleteRegulationTracker,
  useRegulationTrackers,
} from '@/hooks/use-regulations'
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

export default function RegulationsPage() {
  const t = useT()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: trackerData, isLoading } = useRegulationTrackers()
  const trackers = trackerData?.trackers ?? []
  const deleteTracker = useDeleteRegulationTracker()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
            <ScrollText className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t('regulations.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('regulations.desc')}</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" /> {t('regulations.addTracker')}
        </Button>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> {t('loading')}
        </div>
      ) : trackers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center text-sm">
            <BookOpen className="size-8 opacity-50" />
            <p>{t('regulations.empty')}</p>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="size-3.5" /> {t('regulations.addTracker')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trackers.map((tracker) => (
            <Card
              key={tracker.id}
              className="group hover:border-primary/50 transition hover:shadow-md"
            >
              <CardContent className="flex flex-col gap-3 py-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <Link
                      href={`/regulations/${tracker.id}`}
                      className="hover:text-primary block font-semibold tracking-tight"
                    >
                      {tracker.name}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {tracker.knowledgeBaseName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {tracker.pendingNewCount > 0 ? (
                      <Badge variant="default" className="gap-1">
                        {t('regulations.pendingUpdates')}: {tracker.pendingNewCount}
                      </Badge>
                    ) : null}
                    {tracker.newUpdateCount > 0 ? (
                      <Badge variant="secondary">
                        {t('regulations.newCount', { count: tracker.newUpdateCount })}
                      </Badge>
                    ) : tracker.pendingNewCount === 0 ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="size-3" /> {t('regulations.upToDate')}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <dl className="text-muted-foreground grid grid-cols-2 gap-y-1 text-xs">
                  <dt>{t('regulations.documentCount')}</dt>
                  <dd className="text-foreground text-right">{tracker.documentCount}</dd>
                  <dt>{t('regulations.lastChecked')}</dt>
                  <dd className="text-foreground text-right">{formatDate(tracker.lastCheckedAt)}</dd>
                  <dt>{t('regulations.latestUpdate')}</dt>
                  <dd className="text-foreground text-right">
                    {formatDate(tracker.latestDocumentAt)}
                  </dd>
                </dl>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive gap-1"
                    onClick={() => setDeleteId(tracker.id)}
                  >
                    <Trash2 className="size-3.5" /> {t('delete')}
                  </Button>
                  <Link
                    href={`/regulations/${tracker.id}`}
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  >
                    {t('regulations.openDetail')} <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateTrackerDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('regulations.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('regulations.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return
                try {
                  await deleteTracker.mutateAsync(deleteId)
                  toast.success(t('regulations.deleteSuccess'))
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t('operationFailed'))
                }
                setDeleteId(null)
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

function CreateTrackerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const t = useT()
  const { data, isLoading } = useKnowledgeBases()
  const { data: existing } = useRegulationTrackers()
  const create = useCreateRegulationTracker()
  const [kbId, setKbId] = useState('')

  const trackedKbIds = useMemo(
    () => new Set(existing?.trackers.map((tr) => tr.knowledgeBaseId) ?? []),
    [existing],
  )

  const choices = useMemo(
    () => (data?.knowledgeBases ?? []).filter((kb) => !trackedKbIds.has(kb.id)),
    [data, trackedKbIds],
  )

  async function handleSubmit() {
    if (!kbId) return
    try {
      await create.mutateAsync({ knowledgeBaseId: kbId })
      toast.success(t('regulations.createSuccess'))
      setKbId('')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('regulations.addTracker')}</DialogTitle>
          <DialogDescription>{t('regulations.addTrackerDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <label className="text-sm font-medium">{t('regulations.pickKb')}</label>
          {isLoading ? (
            <div className="text-muted-foreground text-sm">{t('loading')}</div>
          ) : choices.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs">
              {t('regulations.noAvailableKb')}
            </p>
          ) : (
            <Select value={kbId} onValueChange={setKbId}>
              <SelectTrigger>
                <SelectValue placeholder={t('regulations.pickKbPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((kb) => (
                  <SelectItem key={kb.id} value={kb.id}>
                    <span className="flex items-center gap-2">
                      <BookOpen className="size-3.5" />
                      <span>{kb.name}</span>
                      <span className="text-muted-foreground text-xs">
                        · {kb.documentCount} {t('regulations.docs')}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!kbId || create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
