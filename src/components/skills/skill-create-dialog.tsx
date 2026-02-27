"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Puzzle, Cloud, Search, Globe, Building2, UserCircle, X, Check } from "lucide-react"
import { toast } from "sonner"
import { useCreateSkill, useClawHubSearch, useClawHubPull } from "@/hooks/use-skills"
import { useDepartments } from "@/hooks/use-departments"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import type { SkillCategory } from "@/types/skill"
import type { ClawHubSearchResult } from "@/types/skill"

const EMOJI_PRESETS = [
  "🧩", "🔧", "📊", "📝", "🔍", "📁", "📋", "💡",
  "🚀", "⚙️", "📌", "🎯", "📈", "🗂️", "💬", "🔔",
  "📎", "✅", "🛠️", "📐", "🖥️", "🤖", "📑", "🔗",
]

const CATEGORY_OPTIONS: { value: SkillCategory; labelKey: string; icon: typeof Globe; descKey: string; roles: string[] }[] = [
  { value: "DEFAULT", labelKey: "agent.categoryDefault", icon: Globe, descKey: "agent.categoryDefaultDesc", roles: ["SYSTEM_ADMIN"] },
  { value: "DEPARTMENT", labelKey: "agent.categoryDepartment", icon: Building2, descKey: "agent.categoryDepartmentDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN"] },
  { value: "PERSONAL", labelKey: "agent.categoryPersonal", icon: UserCircle, descKey: "agent.categoryPersonalDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN", "USER"] },
]

interface SkillCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SkillCreateDialog({ open, onOpenChange }: SkillCreateDialogProps) {
  const t = useT()
  const user = useAuthStore((s) => s.user)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Puzzle className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('skill.createTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('skill.createDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="local" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local" className="gap-1.5 text-[13px]">
              <Puzzle className="size-3.5" />
              {t('skill.localCreate')}
            </TabsTrigger>
            <TabsTrigger value="clawhub" className="gap-1.5 text-[13px]">
              <Cloud className="size-3.5" />
              {t('skill.clawHubPull')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="mt-4">
            <LocalCreateForm
              user={user}
              onSuccess={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="clawhub" className="mt-4">
            <ClawHubPullForm
              onSuccess={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function LocalCreateForm({
  user,
  onSuccess,
}: {
  user: { role: string; departmentId: string | null } | null
  onSuccess: () => void
}) {
  const [slug, setSlug] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [emoji, setEmoji] = useState("")
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [category, setCategory] = useState<SkillCategory | "">("")
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([])

  const t = useT()
  const createSkill = useCreateSkill()
  const { data: deptsData } = useDepartments()
  const departments = deptsData?.departments ?? []

  const availableCategories = CATEGORY_OPTIONS.filter(
    (opt) => user && opt.roles.includes(user.role),
  )

  // Show department picker for SYSTEM_ADMIN when DEPARTMENT category is selected
  const showDeptPicker = category === "DEPARTMENT" && user?.role === "SYSTEM_ADMIN"

  function reset() {
    setSlug("")
    setName("")
    setDescription("")
    setEmoji("")
    setShowEmojiPicker(false)
    setCategory("")
    setSelectedDeptIds([])
  }

  function toggleDept(id: string) {
    setSelectedDeptIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createSkill.mutateAsync({
        slug,
        name,
        description: description || undefined,
        emoji: emoji || undefined,
        category: category || undefined,
        departmentIds: category === "DEPARTMENT"
          ? (selectedDeptIds.length > 0 ? selectedDeptIds : undefined)
          : undefined,
      })
      toast.success(t('skill.createdMsg', { name }))
      reset()
      onSuccess()
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-[1fr_80px] gap-3">
        <div className="space-y-2">
          <Label className="text-[13px]">{t('skill.skillName')}</Label>
          <Input
            placeholder={t('skill.skillNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-[13px]"
            required
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[13px]">{t('skill.icon')}</Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex h-9 w-full items-center justify-center rounded-md border bg-background text-lg hover:bg-accent transition-colors"
            >
              {emoji || "🧩"}
            </button>
            {showEmojiPicker && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowEmojiPicker(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-[220px] rounded-lg border bg-popover p-2 shadow-lg">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_PRESETS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className={`flex size-7 items-center justify-center rounded text-base hover:bg-accent transition-colors ${
                          emoji === e ? "bg-primary/10 ring-1 ring-primary/30" : ""
                        }`}
                        onClick={() => {
                          setEmoji(e)
                          setShowEmojiPicker(false)
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={emoji}
                      onChange={(e) => setEmoji(e.target.value)}
                      className="text-center text-sm h-7"
                      placeholder={t('custom')}
                      maxLength={4}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        setEmoji("")
                        setShowEmojiPicker(false)
                      }}
                    >
                      {t('skill.clearIcon')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[13px]">Slug</Label>
        <Input
          placeholder="my-skill"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="font-mono text-[13px]"
          required
        />
        <p className="text-[12px] text-muted-foreground">
          {t('skill.slugHint')}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-[13px]">{t('skill.descriptionLabel')}</Label>
        <Textarea
          placeholder={t('skill.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-[13px] min-h-[80px]"
          maxLength={2000}
        />
      </div>

      {availableCategories.length > 1 && (
        <div className="space-y-2">
          <Label className="text-[13px]">{t('agent.visibilityScope')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {availableCategories.map((opt) => {
              const isSelected = category === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "hover:border-muted-foreground/30 hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setCategory(opt.value)
                    if (opt.value !== "DEPARTMENT") setSelectedDeptIds([])
                  }}
                >
                  <opt.icon className={`size-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-[12px] font-medium ${isSelected ? "text-primary" : ""}`}>
                    {t(opt.labelKey as import("@/locales/zh-CN").TranslationKey)}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {t(opt.descKey as import("@/locales/zh-CN").TranslationKey)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Department multi-select for SYSTEM_ADMIN + DEPARTMENT category */}
      {showDeptPicker && departments.length > 0 && (
        <div className="space-y-2">
          <Label className="text-[13px]">{t('skill.selectDepartment')}</Label>
          <div className="rounded-lg border p-2 space-y-1 max-h-[160px] overflow-y-auto">
            {departments.map((dept) => {
              const isSelected = selectedDeptIds.includes(dept.id)
              return (
                <button
                  key={dept.id}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                    isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent"
                  }`}
                  onClick={() => toggleDept(dept.id)}
                >
                  <div
                    className={`flex size-4 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {isSelected && <Check className="size-2.5" />}
                  </div>
                  {dept.name}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('skill.noDeptAutoAssign')}
          </p>
        </div>
      )}

      <DialogFooter className="pt-2">
        <Button
          type="submit"
          disabled={createSkill.isPending || !slug || !name}
        >
          {createSkill.isPending && (
            <Loader2 className="mr-2 size-4 animate-spin" />
          )}
          {t('create')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ClawHubPullForm({ onSuccess }: { onSuccess: () => void }) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClawHubSearchResult[]>([])
  const [directSlug, setDirectSlug] = useState("")

  const searchHub = useClawHubSearch()
  const pullHub = useClawHubPull()

  // Detect if input looks like a slug or URL (contains / or clawhub)
  const isSlugLike = (s: string) => s.includes('/') || s.includes('clawhub')

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const input = query.trim()
    if (!input) return

    // If it looks like a slug/URL, also populate the direct pull field
    if (isSlugLike(input)) {
      setDirectSlug(input)
    }

    try {
      const data = await searchHub.mutateAsync(input)
      setResults(data.results)
      if (data.results.length === 0) {
        if (isSlugLike(input)) {
          toast.info(t('skill.searchNoResult'))
        } else {
          toast.info(t('skill.searchNoMatch'))
        }
      }
    } catch {
      toast.error(t('skill.searchFailed'))
    }
  }

  async function handlePull(slug: string) {
    try {
      await pullHub.mutateAsync({ slug })
      toast.success(t('skill.pulledMsg', { name: slug }))
      onSuccess()
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('skill.pullFailed')
      toast.error(message)
    }
  }

  async function handleDirectPull(e: React.FormEvent) {
    e.preventDefault()
    if (!directSlug.trim()) return
    await handlePull(directSlug.trim())
  }

  return (
    <div className="space-y-4">
      {/* Direct pull by slug/URL */}
      <form onSubmit={handleDirectPull} className="space-y-2">
        <Label className="text-[13px]">{t('skill.directPull')}</Label>
        <div className="flex gap-2">
          <Input
            placeholder={t('skill.directPullPlaceholder')}
            value={directSlug}
            onChange={(e) => setDirectSlug(e.target.value)}
            className="font-mono text-[13px]"
          />
          <Button
            type="submit"
            disabled={pullHub.isPending || !directSlug.trim()}
          >
            {pullHub.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t('skill.pull')
            )}
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {t('skill.directPullHint')}
        </p>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">{t('skill.orSearch')}</span>
        </div>
      </div>

      {/* Keyword search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('skill.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 text-[13px]"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={searchHub.isPending || !query.trim()}
        >
          {searchHub.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            t('skill.searchButton')
          )}
        </Button>
      </form>

      {results.length > 0 && (
        <div className="max-h-[300px] space-y-2 overflow-y-auto">
          {results.map((result) => (
            <div
              key={result.slug}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{result.name}</span>
                  {result.version && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      v{result.version}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {result.description}
                </p>
                {result.author && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    by {result.author}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pullHub.isPending}
                onClick={() => handlePull(result.slug)}
                className="ml-3 shrink-0"
              >
                {pullHub.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  t('skill.pull')
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !searchHub.isPending && (
        <div className="py-6 text-center text-[13px] text-muted-foreground">
          <Cloud className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-2">{t('skill.searchHint')}</p>
        </div>
      )}
    </div>
  )
}
