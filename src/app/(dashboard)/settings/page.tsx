"use client"

import { motion } from "motion/react"
import { Settings } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RagConfigPanel } from "@/components/settings/rag-config-panel"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"

export default function SettingsPage() {
  const t = useT()
  const user = useAuthStore((s) => s.user)

  if (user?.role !== 'SYSTEM_ADMIN') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
          <Settings className="size-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {t('page.settings')}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t('page.settingsDesc')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="rag">
        <TabsList>
          <TabsTrigger value="rag" className="text-[13px]">
            {t('settings.ragTab')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rag" className="mt-4">
          <RagConfigPanel />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
