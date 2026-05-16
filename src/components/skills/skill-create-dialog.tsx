"use client"

import { useRef, useState } from "react"
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
import { Loader2, Puzzle, Cloud, Search, Globe, Building2, UserCircle, Check, FolderUp, FileText } from "lucide-react"
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

const MAX_IMPORT_FILES = 200
const MAX_IMPORT_TOTAL_BYTES = 20 * 1024 * 1024

type ImportedSkillFilePayload = {
  path: string
  contentBase64: string
  size: number
}

type ImportedSkillMetadata = {
  name?: string
  description?: string
  emoji?: string
  tags?: string[]
}

const CATEGORY_OPTIONS: { value: SkillCategory; labelKey: string; icon: typeof Globe; descKey: string; roles: string[] }[] = [
  { value: "DEFAULT", labelKey: "agent.categoryDefault", icon: Globe, descKey: "agent.categoryDefaultDesc", roles: ["SYSTEM_ADMIN"] },
  { value: "DEPARTMENT", labelKey: "agent.categoryDepartment", icon: Building2, descKey: "agent.categoryDepartmentDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN"] },
  { value: "PERSONAL", labelKey: "agent.categoryPersonal", icon: UserCircle, descKey: "agent.categoryPersonalDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN", "USER"] },
]

function getBrowserFilePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
}

function stripSelectedFolderRoot(paths: string[]): string[] {
  if (paths.includes("SKILL.md")) return paths

  const splitPaths = paths.map((path) => path.replace(/\\/g, "/").split("/").filter(Boolean))
  const root = splitPaths[0]?.[0]
  if (!root || !splitPaths.every((parts) => parts[0] === root && parts.length > 1)) {
    return paths
  }

  return splitPaths.map((parts) => parts.slice(1).join("/"))
}

function slugifySkillName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "imported-skill"
}

function titleFromSlug(slug: string): string {
  const words = slug.split(/[-_]+/).filter(Boolean)
  if (words.length === 0) return "Imported Skill"
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")
}

function parseSkillMdMetadata(content: string): ImportedSkillMetadata {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const metadata: ImportedSkillMetadata = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key === "name") metadata.name = value
    if (key === "description") metadata.description = value
    if (key === "emoji") metadata.emoji = value
    if (key === "tags") {
      const listSource =
        value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value
      const tags = listSource
        .split(",")
        .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
        .slice(0, 10)
      if (tags.length > 0) metadata.tags = tags
    }
  }

  return metadata
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ""

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="local" className="gap-1.5 text-[13px]">
              <Puzzle className="size-3.5" />
              {t('skill.localCreate')}
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-1.5 text-[13px]">
              <FolderUp className="size-3.5" />
              {t('skill.localImport')}
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

          <TabsContent value="import" className="mt-4">
            <LocalFolderImportForm
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

function LocalFolderImportForm({
  user,
  onSuccess,
}: {
  user: { role: string; departmentId: string | null } | null
  onSuccess: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [slug, setSlug] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [emoji, setEmoji] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [folderName, setFolderName] = useState("")
  const [fileCount, setFileCount] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [importFiles, setImportFiles] = useState<ImportedSkillFilePayload[]>([])
  const [isReading, setIsReading] = useState(false)
  const [category, setCategory] = useState<SkillCategory | "">("")
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([])

  const t = useT()
  const createSkill = useCreateSkill()
  const { data: deptsData } = useDepartments()
  const departments = deptsData?.departments ?? []

  const availableCategories = CATEGORY_OPTIONS.filter(
    (opt) => user && opt.roles.includes(user.role),
  )
  const showDeptPicker = category === "DEPARTMENT" && user?.role === "SYSTEM_ADMIN"

  function reset() {
    setSlug("")
    setName("")
    setDescription("")
    setEmoji("")
    setTags([])
    setFolderName("")
    setFileCount(0)
    setTotalBytes(0)
    setImportFiles([])
    setIsReading(false)
    setCategory("")
    setSelectedDeptIds([])
  }

  function toggleDept(id: string) {
    setSelectedDeptIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  function attachDirectoryPicker(node: HTMLInputElement | null) {
    inputRef.current = node
    if (!node) return
    node.setAttribute("webkitdirectory", "")
    node.setAttribute("directory", "")
  }

  async function handleFolderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (selectedFiles.length === 0) return

    setIsReading(true)
    try {
      if (selectedFiles.length > MAX_IMPORT_FILES) {
        throw new Error(t('skill.importTooManyFiles', { count: MAX_IMPORT_FILES }))
      }

      const browserPaths = selectedFiles.map(getBrowserFilePath)
      const previewPaths = stripSelectedFolderRoot(browserPaths)
      const skillMdIndex = previewPaths.findIndex((path) => path === "SKILL.md")
      if (skillMdIndex === -1) {
        throw new Error(t('skill.importMissingSkillMd'))
      }

      const bytes = selectedFiles.reduce((sum, file) => sum + file.size, 0)
      if (bytes > MAX_IMPORT_TOTAL_BYTES) {
        throw new Error(t('skill.importTooLarge'))
      }

      const payloads = await Promise.all(
        selectedFiles.map(async (file) => ({
          path: getBrowserFilePath(file),
          contentBase64: arrayBufferToBase64(await file.arrayBuffer()),
          size: file.size,
        })),
      )

      const skillMdContent = await selectedFiles[skillMdIndex].text()
      const metadata = parseSkillMdMetadata(skillMdContent)
      const detectedFolderName =
        browserPaths[0]?.replace(/\\/g, "/").split("/").filter(Boolean)[0] ||
        "imported-skill"
      const detectedSlug = slugifySkillName(detectedFolderName)

      setFolderName(detectedFolderName)
      setFileCount(selectedFiles.length)
      setTotalBytes(bytes)
      setImportFiles(payloads)
      setSlug(detectedSlug)
      setName(metadata.name || titleFromSlug(detectedSlug))
      setDescription(metadata.description || "")
      setEmoji(metadata.emoji || "")
      setTags(metadata.tags ?? [])
      toast.success(t('skill.importFolderReady', { name: detectedFolderName }))
    } catch (err) {
      setImportFiles([])
      toast.error((err as Error).message || t('skill.importReadFailed'))
    } finally {
      setIsReading(false)
    }
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
        tags: tags.length > 0 ? tags : undefined,
        importFiles,
      })
      toast.success(t('skill.importedMsg', { name }))
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
      <input
        ref={attachDirectoryPicker}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderChange}
      />

      <div className="rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <FolderUp className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">
              {folderName || t('skill.importFolder')}
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {importFiles.length > 0
                ? t('skill.importFolderSummary', {
                    count: fileCount,
                    size: Math.ceil(totalBytes / 1024),
                  })
                : t('skill.importFolderHint')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={isReading || createSkill.isPending}
          >
            {isReading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t('skill.chooseFolder')
            )}
          </Button>
        </div>
      </div>

      {importFiles.length > 0 && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <FileText className="size-3.5" />
            <span className="font-mono">SKILL.md</span>
            <span>{t('skill.importSkillMdFound')}</span>
          </div>
        </div>
      )}

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
          <Input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="text-center text-sm"
            placeholder="🧩"
            maxLength={4}
          />
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
          className="text-[13px] min-h-[72px]"
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
          disabled={createSkill.isPending || importFiles.length === 0 || !slug || !name}
        >
          {createSkill.isPending && (
            <Loader2 className="mr-2 size-4 animate-spin" />
          )}
          {t('skill.importButton')}
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
