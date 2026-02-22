"use client"

import { motion } from "motion/react"
import { Server } from "lucide-react"
import { useT } from "@/stores/language-store"

export function InstanceEmptyState() {
  const t = useT()
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="relative">
        <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-muted/80 to-muted/30 blur-md" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/60 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
          <Server className="size-7 text-muted-foreground/60" />
        </div>
      </div>
      <h3 className="mt-6 text-base font-semibold tracking-tight">{t('instance.noInstances')}</h3>
      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
        {t('instance.noInstancesHint')}
      </p>
    </motion.div>
  )
}
