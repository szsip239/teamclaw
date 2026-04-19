"use client"

import { useMemo } from "react"
import { useResources, useProviders } from "./use-resources"
import type { ResourceOverview, ModelDefinition, ProviderInfo } from "@/types/resource"

// ─── Types ─────────────────────────────────────────────────────────

export interface ModelOption {
  /** Full value: "anthropic/claude-sonnet-4-5" */
  value: string
  /** Display name: "Claude Sonnet 4.5" */
  label: string
  /** Provider display name: "Anthropic" */
  providerName: string
  /** Provider ID: "anthropic" */
  providerId: string
  /** Variant label resolved from Resource.baseUrl, e.g. "国内 · Coding" */
  variantLabel?: string
  /** Data source */
  source: 'resource' | 'default'
  /** Resource status (only for 'resource' source) */
  status?: 'ACTIVE' | 'UNTESTED' | 'ERROR'
  /** Supports reasoning */
  reasoning?: boolean
  /** Supports multimodal input */
  multimodal?: boolean
}

export interface ModelGroup {
  /** Unique group key — `providerId` or `providerId:variantId` when multiple variants coexist */
  key: string
  providerId: string
  providerName: string
  /** Variant label shown after providerName, e.g. "国内 · Coding" */
  variantLabel?: string
  models: ModelOption[]
}

// ─── Hook ──────────────────────────────────────────────────────────

/**
 * Fetch and assemble the model options list for config editor pickers.
 *
 * Data assembly strategy:
 * 1. For each configured Resource (type=MODEL): extract models from config.models
 * 2. If a resource has no config.models, fall back to provider's defaultModels
 * 3. Providers without a configured resource are excluded (no API key = unusable)
 */
export function useConfigModels() {
  const { data: resourceData, isLoading: resourcesLoading } = useResources({
    type: 'MODEL',
    pageSize: 100,
  })
  const { data: providerData, isLoading: providersLoading } = useProviders('MODEL')

  const { models, groups } = useMemo(() => {
    const resources = resourceData?.resources ?? []
    const providers = providerData?.providers ?? []

    // Build provider lookup: providerId → ProviderInfo
    const providerMap = new Map<string, ProviderInfo>()
    for (const p of providers) {
      providerMap.set(p.id, p)
    }

    const allModels: ModelOption[] = []
    const groupMap = new Map<string, ModelGroup>()
    const seen = new Set<string>()

    for (const resource of resources) {
      const provider = providerMap.get(resource.provider)
      const providerName = provider?.name ?? resource.providerName ?? resource.provider

      // Resolve variant label from Resource.baseUrl matching one of the provider's
      // registered variants. When a provider has no variants, or the Resource uses
      // a custom baseUrl not in the registry, we just omit the label.
      const effectiveBaseUrl = resource.config?.baseUrl ?? provider?.baseUrl
      const matchingVariant =
        effectiveBaseUrl && provider?.variants
          ? provider.variants.find((v) => v.baseUrl === effectiveBaseUrl)
          : undefined
      const variantLabel = matchingVariant?.label
      const variantId = matchingVariant?.id

      // Group key: include variant id so multiple variants of the same provider
      // show up as separate groups (e.g. qwen-cn-coding vs qwen-cn-regular)
      const groupKey = variantId ? `${resource.provider}:${variantId}` : resource.provider

      // Get models: resource config first, then provider defaults
      const models = getModelsForResource(resource, provider)

      for (const model of models) {
        const value = `${resource.provider}/${model.id}`
        // Deduplicate: multiple resources can share the same provider
        if (seen.has(value)) continue
        seen.add(value)

        const option: ModelOption = {
          value,
          label: model.name || model.id,
          providerName,
          providerId: resource.provider,
          variantLabel,
          source: resource.config?.models?.some((m) => m.id === model.id)
            ? 'resource'
            : 'default',
          status: resource.status as ModelOption['status'],
          reasoning: model.reasoning,
          multimodal: model.input?.includes('image'),
        }
        allModels.push(option)

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            key: groupKey,
            providerId: resource.provider,
            providerName,
            variantLabel,
            models: [],
          })
        }
        groupMap.get(groupKey)!.models.push(option)
      }
    }

    return {
      models: allModels,
      groups: Array.from(groupMap.values()),
    }
  }, [resourceData, providerData])

  return {
    models,
    groups,
    isLoading: resourcesLoading || providersLoading,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function getModelsForResource(
  resource: ResourceOverview,
  provider?: ProviderInfo,
): ModelDefinition[] {
  // Prefer resource's own model list (from test or manual config)
  if (resource.config?.models && resource.config.models.length > 0) {
    return resource.config.models
  }
  // Fall back to provider's default models
  if (provider?.defaultModels && provider.defaultModels.length > 0) {
    return provider.defaultModels
  }
  return []
}
