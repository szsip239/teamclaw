'use client'

import { ArrowUpRight, Radar, ScrollText, Wrench, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'motion/react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { TranslationKey } from '@/locales/zh-CN'
import { useT } from '@/stores/language-store'

interface ToolItem {
  key: string
  icon: LucideIcon
  titleKey: TranslationKey
  descKey: TranslationKey
  href: string
  available: boolean
}

const TOOLS: ToolItem[] = [
  {
    key: 'public-opinion',
    icon: Radar,
    titleKey: 'toolbox.publicOpinion.title',
    descKey: 'toolbox.publicOpinion.desc',
    href: '/public-opinion',
    available: true,
  },
  {
    key: 'regulations',
    icon: ScrollText,
    titleKey: 'toolbox.regulations.title',
    descKey: 'toolbox.regulations.desc',
    href: '/regulations',
    available: true,
  },
]

export default function ToolboxPage() {
  const t = useT()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <header className="flex items-start gap-4">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
          <Wrench className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('page.toolbox')}</h1>
          <p className="text-muted-foreground text-sm">{t('page.toolboxDesc')}</p>
        </div>
      </header>

      {TOOLS.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            {t('toolbox.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            const card = (
              <Card
                className={
                  'group h-full transition ' +
                  (tool.available
                    ? 'hover:border-primary/50 hover:shadow-md cursor-pointer'
                    : 'opacity-70')
                }
              >
                <CardContent className="flex h-full flex-col gap-4 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-lg">
                      <Icon className="size-5" />
                    </div>
                    {tool.available ? (
                      <ArrowUpRight className="text-muted-foreground group-hover:text-primary size-4 transition" />
                    ) : (
                      <Badge variant="secondary">{t('toolbox.comingSoon')}</Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-semibold tracking-tight">{t(tool.titleKey)}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {t(tool.descKey)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )

            return tool.available ? (
              <Link key={tool.key} href={tool.href} aria-label={t(tool.titleKey)}>
                {card}
              </Link>
            ) : (
              <div key={tool.key}>{card}</div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
