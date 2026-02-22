"use client"

import { Button } from "@/components/ui/button"
import { Loader2, Zap, CheckCircle2, XCircle } from "lucide-react"
import { useTestResource } from "@/hooks/use-resources"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import { useState } from "react"
import type { TestConnectionResult } from "@/types/resource"

interface ResourceTestButtonProps {
  resourceId: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "icon"
}

export function ResourceTestButton({
  resourceId,
  variant = "outline",
  size = "sm",
}: ResourceTestButtonProps) {
  const testMutation = useTestResource()
  const t = useT()
  const [lastResult, setLastResult] = useState<TestConnectionResult | null>(null)

  async function handleTest() {
    setLastResult(null)
    try {
      const result = await testMutation.mutateAsync(resourceId)
      setLastResult(result)
      if (result.ok) {
        const detected = result.details?.detectedModels
        const modelCount = detected?.length ?? result.details?.models?.length
        const multimodalCount = detected?.filter(
          (m) => m.multimodal === true,
        ).length
        let message = t('resource.testSuccessMsg', { ms: result.latencyMs })
        if (modelCount) {
          message += ` · ${t('resource.testModelsMsg', { n: modelCount })}`
          if (multimodalCount) {
            message += t('resource.testMultimodalMsg', { n: multimodalCount })
          }
        }
        // Auth succeeded but with billing warning
        if (result.error) {
          toast.warning(result.error)
        } else {
          toast.success(message)
        }
      } else {
        toast.error(t('resource.testFailedMsg', { error: result.error ?? '' }))
      }
    } catch {
      toast.error(t('resource.testRequestFailed'))
    }
  }

  const isLoading = testMutation.isPending

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleTest}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {t('resource.testing')}
        </>
      ) : lastResult?.ok ? (
        <>
          <CheckCircle2 className="size-3.5 text-emerald-600" />
          {t('resource.testPassed')}
        </>
      ) : lastResult && !lastResult.ok ? (
        <>
          <XCircle className="size-3.5 text-red-600" />
          {t('resource.retest')}
        </>
      ) : (
        <>
          <Zap className="size-3.5" />
          {t('resource.testConnection')}
        </>
      )}
    </Button>
  )
}
