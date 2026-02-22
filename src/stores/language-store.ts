import { create } from "zustand"
import { persist } from "zustand/middleware"
import zhCN from "@/locales/zh-CN"
import en from "@/locales/en"
import type { TranslationKey } from "@/locales/zh-CN"

export type Language = "zh-CN" | "en"

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
}

const translations = { "zh-CN": zhCN, en } as const

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "zh-CN",
      setLanguage: (language) => set({ language }),
    }),
    { name: "teamclaw-language" }
  )
)

export function useT() {
  const language = useLanguageStore((s) => s.language)
  return (key: TranslationKey, params?: Record<string, string | number>) => {
    const template = translations[language][key]
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (_, k) =>
      k in params ? String(params[k]) : `{${k}}`
    )
  }
}
