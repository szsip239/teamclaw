"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useT } from "@/stores/language-store"
import type { ModelDefinition } from "@/types/resource"

interface ResourceModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  model?: ModelDefinition | null
  onSave: (model: ModelDefinition) => void
}

export function ResourceModelDialog({
  open,
  onOpenChange,
  model,
  onSave,
}: ResourceModelDialogProps) {
  const t = useT()
  const isEditing = !!model

  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [reasoning, setReasoning] = useState(false)
  const [inputText, setInputText] = useState(true)
  const [inputImage, setInputImage] = useState(false)
  const [costInput, setCostInput] = useState("")
  const [costOutput, setCostOutput] = useState("")
  const [cacheRead, setCacheRead] = useState("")
  const [cacheWrite, setCacheWrite] = useState("")
  const [contextWindow, setContextWindow] = useState("")
  const [maxTokens, setMaxTokens] = useState("")

  useEffect(() => {
    if (open) {
      if (model) {
        setId(model.id)
        setName(model.name ?? "")
        setReasoning(model.reasoning ?? false)
        setInputText(model.input?.includes("text") ?? true)
        setInputImage(model.input?.includes("image") ?? false)
        setCostInput(model.cost?.input?.toString() ?? "")
        setCostOutput(model.cost?.output?.toString() ?? "")
        setCacheRead(model.cost?.cacheRead?.toString() ?? "")
        setCacheWrite(model.cost?.cacheWrite?.toString() ?? "")
        setContextWindow(model.contextWindow?.toString() ?? "")
        setMaxTokens(model.maxTokens?.toString() ?? "")
      } else {
        setId("")
        setName("")
        setReasoning(false)
        setInputText(true)
        setInputImage(false)
        setCostInput("")
        setCostOutput("")
        setCacheRead("")
        setCacheWrite("")
        setContextWindow("")
        setMaxTokens("")
      }
    }
  }, [open, model])

  function handleSave() {
    if (!id.trim()) return

    const input: string[] = []
    if (inputText) input.push("text")
    if (inputImage) input.push("image")

    const result: ModelDefinition = {
      id: id.trim(),
      name: name.trim() || id.trim(),
      reasoning: reasoning || undefined,
      input: input.length > 0 ? input : undefined,
    }

    const ci = parseFloat(costInput)
    const co = parseFloat(costOutput)
    if (!isNaN(ci) && !isNaN(co)) {
      result.cost = { input: ci, output: co }
      const cr = parseFloat(cacheRead)
      const cw = parseFloat(cacheWrite)
      if (!isNaN(cr)) result.cost.cacheRead = cr
      if (!isNaN(cw)) result.cost.cacheWrite = cw
    }

    const cw = parseInt(contextWindow)
    if (!isNaN(cw) && cw > 0) result.contextWindow = cw

    const mt = parseInt(maxTokens)
    if (!isNaN(mt) && mt > 0) result.maxTokens = mt

    onSave(result)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('resource.editModel') : t('resource.addModelTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Model ID */}
          <div className="space-y-2">
            <Label htmlFor="model-id">{t('resource.modelId')}</Label>
            <Input
              id="model-id"
              placeholder={t('resource.modelIdPlaceholder')}
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={isEditing}
              className="font-mono text-sm"
            />
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="model-name">{t('resource.modelDisplayName')}</Label>
            <Input
              id="model-name"
              placeholder={t('resource.modelDisplayNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Reasoning + Input modalities */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="text-sm">{t('resource.reasoningModel')}</Label>
              <Switch checked={reasoning} onCheckedChange={setReasoning} />
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-sm">{t('resource.inputType')}</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={inputText} onCheckedChange={(v) => setInputText(!!v)} />
                  text
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={inputImage} onCheckedChange={(v) => setInputImage(!!v)} />
                  image
                </label>
              </div>
            </div>
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <Label className="text-sm">{t('resource.costPerMillion')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder={t('resource.costInput')}
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="text-sm"
              />
              <Input
                type="number"
                step="0.01"
                placeholder={t('resource.costOutput')}
                value={costOutput}
                onChange={(e) => setCostOutput(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder={t('resource.costCacheRead')}
                value={cacheRead}
                onChange={(e) => setCacheRead(e.target.value)}
                className="text-sm"
              />
              <Input
                type="number"
                step="0.01"
                placeholder={t('resource.costCacheWrite')}
                value={cacheWrite}
                onChange={(e) => setCacheWrite(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Context / Max Tokens */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model-ctx">{t('resource.contextWindow')}</Label>
              <Input
                id="model-ctx"
                type="number"
                placeholder="200000"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-max">{t('resource.maxOutput')}</Label>
              <Input
                id="model-max"
                type="number"
                placeholder="16000"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!id.trim()}>
            {isEditing ? t('save') : t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
