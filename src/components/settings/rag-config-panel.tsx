"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { useRagSettings, useSaveRagSettings } from "@/hooks/use-settings"
import { useT } from "@/stores/language-store"

export function RagConfigPanel() {
  const t = useT()
  const { data: config, isLoading } = useRagSettings()
  const saveSettings = useSaveRagSettings()

  // Form state
  const [llmBaseUrl, setLlmBaseUrl] = useState("")
  const [llmApiKey, setLlmApiKey] = useState("")
  const [llmModel, setLlmModel] = useState("")
  const [embBaseUrl, setEmbBaseUrl] = useState("")
  const [embApiKey, setEmbApiKey] = useState("")
  const [embModel, setEmbModel] = useState("")
  const [rerankEnabled, setRerankEnabled] = useState(false)
  const [rerankBaseUrl, setRerankBaseUrl] = useState("")
  const [rerankApiKey, setRerankApiKey] = useState("")
  const [rerankModel, setRerankModel] = useState("")
  const [ocrModel, setOcrModel] = useState("")
  const [ocrWorkers, setOcrWorkers] = useState(4)
  const [paddleocrToken, setPaddleocrToken] = useState("")
  const [paddleocrModel, setPaddleocrModel] = useState("PP-OCRv5")

  // Visibility toggles for API keys
  const [showLlmKey, setShowLlmKey] = useState(false)
  const [showEmbKey, setShowEmbKey] = useState(false)
  const [showRerankKey, setShowRerankKey] = useState(false)
  const [showPaddleocrToken, setShowPaddleocrToken] = useState(false)

  // Populate form from fetched config
  useEffect(() => {
    if (config) {
      // The settings form is editable local state; refresh it when the async config load completes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLlmBaseUrl(String(config['rag.llm.baseUrl'] ?? ''))
      setLlmApiKey(String(config['rag.llm.apiKey'] ?? ''))
      setLlmModel(String(config['rag.llm.model'] ?? ''))
      setEmbBaseUrl(String(config['rag.embedding.baseUrl'] ?? ''))
      setEmbApiKey(String(config['rag.embedding.apiKey'] ?? ''))
      setEmbModel(String(config['rag.embedding.model'] ?? ''))
      setRerankEnabled(config['rag.rerank.enabled'] === true)
      setRerankBaseUrl(String(config['rag.rerank.baseUrl'] ?? ''))
      setRerankApiKey(String(config['rag.rerank.apiKey'] ?? ''))
      setRerankModel(String(config['rag.rerank.model'] ?? ''))
      setOcrModel(String(config['rag.ocr.model'] ?? ''))
      setOcrWorkers(Number(config['rag.ocr.workers']) || 4)
      setPaddleocrToken(String(config['rag.paddleocr.token'] ?? ''))
      setPaddleocrModel(String(config['rag.paddleocr.model'] || 'PP-OCRv5'))
    }
  }, [config])

  async function handleSave() {
    try {
      await saveSettings.mutateAsync({
        'rag.llm.baseUrl': llmBaseUrl,
        'rag.llm.apiKey': llmApiKey,
        'rag.llm.model': llmModel,
        'rag.embedding.baseUrl': embBaseUrl,
        'rag.embedding.apiKey': embApiKey,
        'rag.embedding.model': embModel,
        'rag.rerank.enabled': rerankEnabled,
        'rag.rerank.baseUrl': rerankBaseUrl,
        'rag.rerank.apiKey': rerankApiKey,
        'rag.rerank.model': rerankModel,
        'rag.ocr.model': ocrModel,
        'rag.ocr.workers': ocrWorkers,
        'rag.paddleocr.token': paddleocrToken,
        'rag.paddleocr.model': paddleocrModel,
      })
      toast.success(t('settings.ragSaved'))
    } catch {
      toast.error(t('settings.ragSaveFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h3 className="text-sm font-semibold">{t('settings.ragTitle')}</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">{t('settings.ragDesc')}</p>
      </div>

      {/* LLM Section */}
      <section className="space-y-3">
        <h4 className="text-[13px] font-medium border-b pb-2">{t('settings.ragLlm')}</h4>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragApiBaseUrl')}</Label>
          <Input value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} className="text-[13px]" />
        </div>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragApiKey')}</Label>
          <div className="relative">
            <Input
              type={showLlmKey ? "text" : "password"}
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              className="text-[13px] pr-10"
            />
            <button
              type="button"
              onClick={() => setShowLlmKey(!showLlmKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showLlmKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragModel')}</Label>
          <Input value={llmModel} onChange={(e) => setLlmModel(e.target.value)} className="text-[13px]" />
        </div>
      </section>

      {/* Embedding Section */}
      <section className="space-y-3">
        <h4 className="text-[13px] font-medium border-b pb-2">{t('settings.ragEmbedding')}</h4>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragApiBaseUrl')}</Label>
          <Input value={embBaseUrl} onChange={(e) => setEmbBaseUrl(e.target.value)} className="text-[13px]" />
        </div>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragApiKey')}</Label>
          <div className="relative">
            <Input
              type={showEmbKey ? "text" : "password"}
              value={embApiKey}
              onChange={(e) => setEmbApiKey(e.target.value)}
              className="text-[13px] pr-10"
            />
            <button
              type="button"
              onClick={() => setShowEmbKey(!showEmbKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showEmbKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragModel')}</Label>
          <Input value={embModel} onChange={(e) => setEmbModel(e.target.value)} className="text-[13px]" />
        </div>
      </section>

      {/* Reranking Section */}
      <section className="space-y-3">
        <h4 className="text-[13px] font-medium border-b pb-2">{t('settings.ragRerank')}</h4>
        <div className="flex items-center gap-2">
          <Checkbox
            id="rerankEnabled"
            checked={rerankEnabled}
            onCheckedChange={(checked) => setRerankEnabled(!!checked)}
          />
          <label htmlFor="rerankEnabled" className="text-[12px] cursor-pointer">
            {t('settings.ragEnableRerank')}
          </label>
        </div>
        {rerankEnabled && (
          <>
            <div className="space-y-2">
              <Label className="text-[12px]">{t('settings.ragApiBaseUrl')}</Label>
              <Input value={rerankBaseUrl} onChange={(e) => setRerankBaseUrl(e.target.value)} className="text-[13px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[12px]">{t('settings.ragApiKey')}</Label>
              <div className="relative">
                <Input
                  type={showRerankKey ? "text" : "password"}
                  value={rerankApiKey}
                  onChange={(e) => setRerankApiKey(e.target.value)}
                  className="text-[13px] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowRerankKey(!showRerankKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showRerankKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[12px]">{t('settings.ragModel')}</Label>
              <Input value={rerankModel} onChange={(e) => setRerankModel(e.target.value)} className="text-[13px]" />
            </div>
          </>
        )}
      </section>

      {/* PaddleOCR Section */}
      <section className="space-y-3">
        <h4 className="text-[13px] font-medium border-b pb-2">{t('settings.ragPaddleOcr')}</h4>
        <p className="text-[11px] text-muted-foreground">
          {t('settings.ragPaddleOcrHint')}
        </p>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragPaddleOcrToken')}</Label>
          <div className="relative">
            <Input
              type={showPaddleocrToken ? "text" : "password"}
              value={paddleocrToken}
              onChange={(e) => setPaddleocrToken(e.target.value)}
              className="text-[13px] pr-10"
              placeholder="b9501e311e..."
            />
            <button
              type="button"
              onClick={() => setShowPaddleocrToken(!showPaddleocrToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPaddleocrToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-[12px]">{t('settings.ragPaddleOcrModel')}</Label>
          <Input value={paddleocrModel} onChange={(e) => setPaddleocrModel(e.target.value)} className="text-[13px]" />
        </div>
      </section>

      {/* Save */}
      <Button onClick={handleSave} disabled={saveSettings.isPending}>
        {saveSettings.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {t('save')}
      </Button>
    </div>
  )
}
