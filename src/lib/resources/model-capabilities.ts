/**
 * Known multimodal model patterns — models that support image input.
 * Used as a fallback when the API response doesn't provide capability info.
 */
const KNOWN_MULTIMODAL_PATTERNS: RegExp[] = [
  // Anthropic Claude (all modern versions support vision)
  /^claude-/,
  // OpenAI GPT-4+ and o-series
  /^gpt-4/, /^o[1-4]/, /^chatgpt-4o/,
  // Google Gemini
  /^gemini/,
  // xAI Grok (3+)
  /^grok-[3-9]/, /^grok-\d{2}/,
  // Vision-specific models
  /vision/i, /-vl/i, /vl-/i,
  // Qwen VL
  /qwen.*vl/i,
  // Pixtral / Mistral vision
  /^pixtral/i,
  // LLaVA
  /llava/i,
  // InternVL
  /internvl/i,
  // GLM (智谱) — GLM-4.5+ all support image input
  /^glm-[4-9]/,
]

/** Text-only patterns that override general multimodal patterns */
const KNOWN_TEXT_ONLY_PATTERNS: RegExp[] = [
  /^claude-instant/,
  /^claude-2/,
  /^gpt-3/,
]

/**
 * Check if a model ID is known to support image input.
 * Returns undefined if unknown (neither confirmed multimodal nor text-only).
 */
export function isKnownMultimodal(modelId: string): boolean | undefined {
  const lower = modelId.toLowerCase()

  // Check text-only overrides first
  for (const pattern of KNOWN_TEXT_ONLY_PATTERNS) {
    if (pattern.test(lower)) return false
  }

  // Check multimodal patterns
  for (const pattern of KNOWN_MULTIMODAL_PATTERNS) {
    if (pattern.test(lower)) return true
  }

  return undefined
}
