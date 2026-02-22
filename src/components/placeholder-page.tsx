"use client"

import type { LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useT } from "@/stores/language-store"

interface PlaceholderPageProps {
  icon: LucideIcon
  title: string
  description: string
}

export function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: PlaceholderPageProps) {
  const t = useT()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 items-center justify-center"
    >
      <Card className="w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-xl">
            <Icon className="size-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          <Badge variant="secondary">{t('placeholder.comingSoon')}</Badge>
        </CardContent>
      </Card>
    </motion.div>
  )
}
