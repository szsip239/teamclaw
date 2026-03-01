"use client"

import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { useState, useEffect } from "react"
import { useLanguageStore } from "@/stores/language-store"

const REFRESH_INTERVAL = 150 * 60 * 1000 // 150 min (~83% of 180 min token lifetime)
const LOCK_KEY = 'teamclaw_auth_refresh_ts'

function AuthRefresh() {
  useEffect(() => {
    function doRefresh() {
      const lastRefresh = Number(localStorage.getItem(LOCK_KEY) || '0')
      if (Date.now() - lastRefresh < REFRESH_INTERVAL) return
      localStorage.setItem(LOCK_KEY, String(Date.now()))
      fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
        .catch(() => {})
    }

    const timer = setInterval(doRefresh, REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  return null
}

function LanguageSync() {
  const language = useLanguageStore((s) => s.language)
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthRefresh />
        <LanguageSync />
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            className: "font-sans",
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
