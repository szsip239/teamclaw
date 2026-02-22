import { create } from 'zustand'
import type { JsonSchema, ConfigModule, EditSource } from '@/types/config-editor'
import type { UiHint } from '@/types/gateway'
import { extractModules, setFieldValue, buildPatch } from '@/lib/config-editor/schema-utils'
import { validateConfig, type ValidationError } from '@/lib/config-editor/config-validator'

interface ConfigEditorState {
  // ─── Data ───────────────────────────────────────────────────────
  schema: JsonSchema | null
  uiHints: Record<string, UiHint>
  configData: Record<string, unknown>
  originalConfig: Record<string, unknown>
  baseHash: string

  // ─── Navigation ─────────────────────────────────────────────────
  modules: ConfigModule[]
  selectedModule: string | null

  // ─── Sync ───────────────────────────────────────────────────────
  lastEditSource: EditSource
  isDirty: boolean

  // ─── Focus (form → JSON sync) ─────────────────────────────────
  focusedFieldPath: string | null

  // ─── Validation ────────────────────────────────────────────────
  validationErrors: ValidationError[]

  // ─── Actions ────────────────────────────────────────────────────
  initialize: (
    schema: JsonSchema,
    uiHints: Record<string, UiHint>,
    config: Record<string, unknown>,
    hash: string,
  ) => void
  selectModule: (key: string) => void
  setFieldValue: (path: string, value: unknown, source: EditSource) => void
  setConfigFromJson: (config: Record<string, unknown>, source: EditSource) => void
  setFocusedField: (path: string | null) => void
  resetToOriginal: () => void
  applyPatchResult: (config: Record<string, unknown>, hash: string) => void
  getPatch: () => Record<string, unknown>
  validate: () => ValidationError[]
}

export const useConfigEditorStore = create<ConfigEditorState>((set, get) => ({
  schema: null,
  uiHints: {},
  configData: {},
  originalConfig: {},
  baseHash: '',
  modules: [],
  selectedModule: null,
  lastEditSource: null,
  isDirty: false,
  focusedFieldPath: null,
  validationErrors: [],

  initialize: (schema, uiHints, config, hash) => {
    const modules = extractModules(schema, uiHints, config)
    set({
      schema,
      uiHints,
      configData: config,
      originalConfig: structuredClone(config),
      baseHash: hash,
      modules,
      selectedModule: modules[0]?.key ?? null,
      lastEditSource: null,
      isDirty: false,
      validationErrors: [],
    })
  },

  selectModule: (key) => {
    set({ selectedModule: key })
  },

  setFieldValue: (path, value, source) => {
    const { configData, originalConfig, schema, uiHints } = get()
    const newConfig = setFieldValue(configData, path, value)
    const isDirty = Object.keys(buildPatch(originalConfig, newConfig)).length > 0
    const modules = schema
      ? extractModules(schema, uiHints, newConfig)
      : get().modules

    set({
      configData: newConfig,
      isDirty,
      modules,
      lastEditSource: source,
      validationErrors: [],
    })

    // Reset source flag on next frame to re-enable all sources
    requestAnimationFrame(() => {
      set({ lastEditSource: null })
    })
  },

  setConfigFromJson: (config, source) => {
    const { originalConfig, schema, uiHints } = get()
    const isDirty = Object.keys(buildPatch(originalConfig, config)).length > 0
    const modules = schema
      ? extractModules(schema, uiHints, config)
      : get().modules

    set({
      configData: config,
      isDirty,
      modules,
      lastEditSource: source,
      validationErrors: [],
    })

    requestAnimationFrame(() => {
      set({ lastEditSource: null })
    })
  },

  setFocusedField: (path) => {
    set({ focusedFieldPath: path })
  },

  resetToOriginal: () => {
    const { originalConfig, schema, uiHints } = get()
    const config = structuredClone(originalConfig)
    const modules = schema
      ? extractModules(schema, uiHints, config)
      : get().modules

    set({
      configData: config,
      isDirty: false,
      modules,
      lastEditSource: null,
    })
  },

  applyPatchResult: (config, hash) => {
    const { schema, uiHints } = get()
    const modules = schema
      ? extractModules(schema, uiHints, config)
      : get().modules

    set({
      configData: config,
      originalConfig: structuredClone(config),
      baseHash: hash,
      isDirty: false,
      modules,
      lastEditSource: null,
    })
  },

  getPatch: () => {
    const { originalConfig, configData } = get()
    return buildPatch(originalConfig, configData)
  },

  validate: () => {
    const { schema, configData } = get()
    if (!schema) return []
    const errors = validateConfig(schema, configData)
    set({ validationErrors: errors })
    return errors
  },

}))
