"use client"

import { Switch } from "@/components/ui/switch"

interface BooleanFieldProps {
  path: string
  value: boolean
  onChange: (value: boolean) => void
}

export function BooleanField({ path, value, onChange }: BooleanFieldProps) {
  return (
    <Switch
      id={path}
      checked={value ?? false}
      onCheckedChange={onChange}
    />
  )
}
