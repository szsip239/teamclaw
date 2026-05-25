"use client"

import { useState, useEffect } from "react"
import { Key, Loader2, Pencil, Check, X, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { api } from "@/lib/api-client"

interface ApiKeyInfo {
  primaryEnv: string | null
  hasKey: boolean
  maskedKey: string | null
}

export function SkillApiKeySection({ skillId }: { skillId: string }) {
  const t = useT()
  const [info, setInfo] = useState<ApiKeyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get<ApiKeyInfo>(`/api/v1/skills/${skillId}/api-key`)
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [skillId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-1">
        <Loader2 className="size-3 animate-spin" /> {t('loading')}
      </div>
    )
  }

  if (!info?.primaryEnv) return null

  async function handleSave() {
    if (!value.trim()) return
    setSaving(true)
    try {
      const result = await api.put<ApiKeyInfo & { success: boolean }>(
        `/api/v1/skills/${skillId}/api-key`,
        { apiKey: value.trim() },
      )
      setInfo({ primaryEnv: info!.primaryEnv, hasKey: true, maskedKey: (result as any).maskedKey || '***' })
      setEditing(false)
      setValue("")
      toast.success(t('skill.apiKeySaved'))
    } catch (err) {
      toast.error((err as any)?.data?.error || t('operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <Key className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground whitespace-nowrap">{info.primaryEnv}</span>

      {editing ? (
        <div className="flex items-center gap-1">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-..."
              className="h-7 w-[200px] text-[12px]"
              autoFocus
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </button>
          </div>
          <Button variant="ghost" size="icon" className="size-6" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 text-emerald-500" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => { setEditing(false); setValue("") }}>
            <X className="size-3" />
          </Button>
        </div>
      ) : info.hasKey ? (
        <div className="flex items-center gap-1">
          <span className="font-mono text-emerald-600 dark:text-emerald-400">{info.maskedKey}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditing(true)}>
            <Pencil className="size-3" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-[12px] gap-1" onClick={() => setEditing(true)}>
          <Key className="size-3" />
          {t('skill.setApiKey')}
        </Button>
      )}
    </div>
  )
}
