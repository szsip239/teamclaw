"use client"

import { useState, useEffect } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import { useUpdateSkill } from "@/hooks/use-skills"
import type { SkillDetail } from "@/types/skill"

const EMOJI_PRESETS = [
  "🧩", "🔧", "📊", "📝", "🔍", "📁", "📋", "💡",
  "🚀", "⚙️", "📌", "🎯", "📈", "🗂️", "💬", "🔔",
  "📎", "✅", "🛠️", "📐", "🖥️", "🤖", "📑", "🔗",
]

interface SkillEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skill: SkillDetail
}

export function SkillEditDialog({ open, onOpenChange, skill }: SkillEditDialogProps) {
  const t = useT()
  const [name, setName] = useState(skill.name)
  const [slug, setSlug] = useState(skill.slug)
  const [description, setDescription] = useState(skill.description ?? "")
  const [emoji, setEmoji] = useState(skill.emoji ?? "")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>(skill.tags)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const updateSkill = useUpdateSkill(skill.id)

  useEffect(() => {
    if (open) {
      setName(skill.name)
      setSlug(skill.slug)
      setDescription(skill.description ?? "")
      setEmoji(skill.emoji ?? "")
      setTags(skill.tags)
      setTagInput("")
      setShowEmojiPicker(false)
    }
  }, [open, skill])

  function addTag() {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag])
      setTagInput("")
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const data: Record<string, unknown> = { tags }
      if (name !== skill.name) data.name = name
      if (slug !== skill.slug) data.slug = slug
      if (description !== (skill.description ?? "")) data.description = description || null
      if (emoji !== (skill.emoji ?? "")) data.emoji = emoji || null

      await updateSkill.mutateAsync(data as Parameters<typeof updateSkill.mutateAsync>[0])
      toast.success(t('skill.updatedMsg'))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base">{t('skill.editTitle')}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {t('skill.editDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name + Emoji */}
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="space-y-2">
              <Label className="text-[13px]">{t('skill.skillName')}</Label>
              <Input
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

          {/* Slug */}
          <div className="space-y-2">
            <Label className="text-[13px]">Slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="font-mono text-[13px]"
              required
            />
            {slug !== skill.slug && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {t('skill.slugChangeWarning', { from: skill.slug, to: slug })}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-[13px]">{t('skill.descriptionLabel')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-[13px] min-h-[80px]"
              placeholder={t('skill.descriptionPlaceholder')}
              maxLength={2000}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-[13px]">{t('skill.tags')}</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="text-[13px]"
                placeholder={t('skill.tagsPlaceholder')}
                maxLength={30}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTag}
                disabled={!tagInput.trim() || tags.length >= 10}
              >
                {t('skill.addTag')}
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 px-2 py-0.5 text-[11px] font-normal"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateSkill.isPending || !name || !slug}
            >
              {updateSkill.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
