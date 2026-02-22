"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { UiHint } from "@/types/gateway"

interface StringFieldProps {
  path: string
  value: string
  uiHint?: UiHint
  onChange: (value: string) => void
}

export function StringField({ value, uiHint, onChange }: StringFieldProps) {
  const t = useT()
  const isSensitive = uiHint?.sensitive === true
  const [showValue, setShowValue] = useState(false)

  // Detect environment variable reference
  const isEnvRef = typeof value === 'string' && value.startsWith('${') && value.endsWith('}')

  return (
    <div className="relative">
      <Input
        type={isSensitive && !showValue ? "password" : "text"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={uiHint?.placeholder ?? ""}
        className={`h-9 text-sm font-mono ${isEnvRef ? "text-blue-600 dark:text-blue-400" : ""}`}
      />
      {isSensitive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
          onClick={() => setShowValue(!showValue)}
        >
          {showValue ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </Button>
      )}
      {isSensitive && !isEnvRef && value && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('config.envVarHint', { example: '${MY_TOKEN}' })}
        </p>
      )}
    </div>
  )
}
