"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/stores/language-store"
import type { ProviderInfo } from "@/types/resource"

interface ResourceProviderSelectProps {
  providers: ProviderInfo[]
  value: string
  onValueChange: (value: string) => void
  type?: string
}

export function ResourceProviderSelect({
  providers,
  value,
  onValueChange,
  type,
}: ResourceProviderSelectProps) {
  const t = useT()
  const filtered = type && type !== "all"
    ? providers.filter((p) => p.type === type)
    : providers

  const modelProviders = filtered.filter((p) => p.type === "MODEL")
  const toolProviders = filtered.filter((p) => p.type === "TOOL")

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t('resource.selectProvider')} />
      </SelectTrigger>
      <SelectContent>
        {modelProviders.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t('resource.providerModels')}</SelectLabel>
            {modelProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {toolProviders.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t('resource.providerTools')}</SelectLabel>
            {toolProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
