"use client"

import { Input } from "@/components/ui/input"
import { useT } from "@/stores/language-store"
import type { JsonSchema } from "@/types/config-editor"
import type { UiHint } from "@/types/gateway"

interface NumberFieldProps {
  path: string
  value: number | undefined
  schema: JsonSchema
  uiHint?: UiHint
  onChange: (value: number) => void
}

export function NumberField({ value, schema, uiHint, onChange }: NumberFieldProps) {
  const t = useT()
  return (
    <div>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value
          if (v === "") return
          const num = schema.type === "integer" ? parseInt(v, 10) : parseFloat(v)
          if (!isNaN(num)) onChange(num)
        }}
        min={schema.minimum}
        max={schema.maximum}
        placeholder={uiHint?.placeholder ?? ""}
        className="h-9 text-sm font-mono"
      />
      {(schema.minimum !== undefined || schema.maximum !== undefined) && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {schema.minimum !== undefined && t('config.minimum', { n: schema.minimum })}
          {schema.minimum !== undefined && schema.maximum !== undefined && " · "}
          {schema.maximum !== undefined && t('config.maximum', { n: schema.maximum })}
        </p>
      )}
    </div>
  )
}
