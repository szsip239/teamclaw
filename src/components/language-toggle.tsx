"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Button } from "@/components/ui/button"
import { useLanguageStore, type Language } from "@/stores/language-store"

export function LanguageToggle() {
  const language = useLanguageStore((s) => s.language)
  const setLanguage = useLanguageStore((s) => s.setLanguage)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="relative size-9" disabled>
        <span className="sr-only">Switch language</span>
      </Button>
    )
  }

  const next: Language = language === "zh-CN" ? "en" : "zh-CN"
  const label = language === "zh-CN" ? "中" : "EN"

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLanguage(next)}
      className="relative size-9"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={language}
          className="text-xs font-semibold"
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 10, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">Switch language</span>
    </Button>
  )
}
