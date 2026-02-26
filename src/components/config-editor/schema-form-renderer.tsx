"use client"

import { useState, useCallback, Fragment } from "react"
import { ChevronDown, ChevronRight, HelpCircle, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useT, useLanguageStore } from "@/stores/language-store"
import { StringField } from "./fields/string-field"
import { NumberField } from "./fields/number-field"
import { BooleanField } from "./fields/boolean-field"
import { EnumField } from "./fields/enum-field"
import { ModelPickerField, MultiModelPickerField } from "./fields/model-picker-field"
import {
  detectFieldType,
  humanizeKey,
  getFieldValue,
  getDefaultForSchema,
  isSimpleField,
} from "@/lib/config-editor/schema-utils"
import type { ResolvedFieldGroup } from "@/lib/config-editor/config-knowledge"
import { getFieldDescription } from "@/lib/config-editor/config-knowledge"
import { getEntityLink } from "@/lib/config-editor/entity-links"
import { useConfigEditorStore } from "@/stores/config-editor-store"
import type { JsonSchema } from "@/types/config-editor"
import type { UiHint } from "@/types/gateway"

interface SchemaFormRendererProps {
  schema: JsonSchema
  path: string
  config: Record<string, unknown>
  uiHints: Record<string, UiHint>
  onChange: (path: string, value: unknown) => void
  depth?: number
  /** When provided, only render fields whose key is in this list */
  groupedFields?: string[]
  /** Use two-column grid layout for simple fields */
  useGrid?: boolean
}

export function SchemaFormRenderer({
  schema,
  path,
  config,
  uiHints,
  onChange,
  depth = 0,
  groupedFields,
  useGrid = false,
}: SchemaFormRendererProps) {
  const properties = schema.properties

  // Handle dynamic KV modules (like channels) that have additionalProperties but no fixed properties
  if ((!properties || Object.keys(properties).length === 0) && schema.additionalProperties) {
    const currentValue = (getFieldValue(config, path) ?? {}) as Record<string, unknown>
    return (
      <ModuleLevelKVEditor
        path={path}
        schema={schema}
        value={currentValue}
        uiHints={uiHints}
        config={config}
        onChange={onChange}
      />
    )
  }

  if (!properties) return null

  let entries = Object.entries(properties)

  // Filter to only grouped fields when specified
  if (groupedFields) {
    const fieldSet = new Set(groupedFields)
    entries = entries.filter(([key]) => fieldSet.has(key))
  }

  // Use grid layout when explicitly requested or when rendering grouped fields at depth 0
  const shouldGrid = useGrid || (groupedFields !== undefined && depth === 0)

  if (shouldGrid) {
    return (
      <div className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-2",
        depth > 0 && "pl-3 border-l border-border/50",
      )}>
        {entries.map(([key, fieldSchema]) => {
          const fieldPath = path ? `${path}.${key}` : key
          const value = getFieldValue(config, fieldPath)
          const hint = uiHints[fieldPath]
          // Sensitive fields (tokens) → full width for extra room
          const simple = isSimpleField(fieldSchema) && !hint?.sensitive

          return (
            <div key={fieldPath} className={simple ? undefined : "col-span-2"}>
              <FieldWrapper
                path={fieldPath}
                fieldKey={key}
                schema={fieldSchema}
                value={value}
                uiHint={hint}
                config={config}
                uiHints={uiHints}
                onChange={onChange}
                depth={depth}
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", depth > 0 && "pl-3 border-l border-border/50")}>
      {entries.map(([key, fieldSchema]) => {
        const fieldPath = path ? `${path}.${key}` : key
        const value = getFieldValue(config, fieldPath)
        const hint = uiHints[fieldPath]

        return (
          <FieldWrapper
            key={fieldPath}
            path={fieldPath}
            fieldKey={key}
            schema={fieldSchema}
            value={value}
            uiHint={hint}
            config={config}
            uiHints={uiHints}
            onChange={onChange}
            depth={depth}
          />
        )
      })}
    </div>
  )
}

// ─── Field Group Card ────────────────────────────────────────────────

function FieldGroupCard({
  group,
  fieldCount,
  children,
}: {
  group: ResolvedFieldGroup
  fieldCount: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(group.defaultExpanded ?? false)

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-xl"
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-sm">{group.label}</span>
        {group.description && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            {group.description}
          </span>
        )}
        <Badge variant="secondary" className="ml-auto text-[10px] h-5 shrink-0">
          {fieldCount}
        </Badge>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Grouped Form Renderer ──────────────────────────────────────────

interface GroupedFormRendererProps {
  groups: ResolvedFieldGroup[]
  schema: JsonSchema
  path: string
  config: Record<string, unknown>
  uiHints: Record<string, UiHint>
  onChange: (path: string, value: unknown) => void
}

export function GroupedFormRenderer({
  groups,
  schema,
  path,
  config,
  uiHints,
  onChange,
}: GroupedFormRendererProps) {
  const t = useT()
  const properties = schema.properties ?? {}
  const allKeys = new Set(Object.keys(properties))
  const groupedKeys = new Set(groups.flatMap((g) => g.fields))

  // Fields not assigned to any group
  const ungroupedKeys = [...allKeys].filter((k) => !groupedKeys.has(k))

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        // Only show fields that exist in the schema
        const existingFields = group.fields.filter((f) => allKeys.has(f))
        if (existingFields.length === 0) return null

        return (
          <FieldGroupCard key={group.id} group={group} fieldCount={existingFields.length}>
            <SchemaFormRenderer
              schema={schema}
              path={path}
              config={config}
              uiHints={uiHints}
              onChange={onChange}
              depth={0}
              groupedFields={existingFields}
              useGrid
            />
          </FieldGroupCard>
        )
      })}

      {ungroupedKeys.length > 0 && (
        <FieldGroupCard
          group={{ id: 'other', label: t('config.otherSettings'), fields: ungroupedKeys, defaultExpanded: false }}
          fieldCount={ungroupedKeys.length}
        >
          <SchemaFormRenderer
            schema={schema}
            path={path}
            config={config}
            uiHints={uiHints}
            onChange={onChange}
            depth={0}
            groupedFields={ungroupedKeys}
            useGrid
          />
        </FieldGroupCard>
      )}
    </div>
  )
}

// ─── Field Wrapper ──────────────────────────────────────────────────

interface FieldWrapperProps {
  path: string
  fieldKey: string
  schema: JsonSchema
  value: unknown
  uiHint?: UiHint
  config: Record<string, unknown>
  uiHints: Record<string, UiHint>
  onChange: (path: string, value: unknown) => void
  depth: number
}

function FieldWrapper({
  path,
  fieldKey,
  schema,
  value,
  uiHint,
  config,
  uiHints,
  onChange,
  depth,
}: FieldWrapperProps) {
  const t = useT()
  const locale = useLanguageStore((s) => s.language)
  const fieldType = detectFieldType(schema)
  const label = uiHint?.label ?? schema.title ?? humanizeKey(fieldKey)
  // Fallback chain: uiHint.help → knowledge base → schema.description
  const help = uiHint?.help ?? getFieldDescription(path, locale) ?? schema.description
  const setFocusedField = useConfigEditorStore((s) => s.setFocusedField)
  const focusField = useCallback(() => setFocusedField(path), [setFocusedField, path])

  // ── Entity-linked fields (model picker, etc.) ─────────────────
  const entityLink = getEntityLink(path)
  if (entityLink?.type === 'model') {
    if (entityLink.mode === 'single') {
      return (
        <ModelPickerField
          path={path}
          label={label}
          help={help}
          value={(value ?? "") as string}
          onChange={(v) => onChange(path, v || undefined)}
          allowCustom={entityLink.allowCustom}
        />
      )
    }
    if (entityLink.mode === 'multi') {
      return (
        <MultiModelPickerField
          path={path}
          label={label}
          help={help}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(v) => onChange(path, v.length > 0 ? v : undefined)}
          allowCustom={entityLink.allowCustom}
        />
      )
    }
  }

  // Object with properties → collapsible group
  if (fieldType === 'object' && schema.properties) {
    return (
      <CollapsibleObject
        path={path}
        label={label}
        help={help}
        schema={schema}
        config={config}
        uiHints={uiHints}
        onChange={onChange}
        depth={depth}
      />
    )
  }

  // Object with additionalProperties → dynamic KV editor
  if (fieldType === 'object' && schema.additionalProperties) {
    return (
      <DynamicKVEditor
        path={path}
        label={label}
        help={help}
        schema={schema}
        value={(value ?? {}) as Record<string, unknown>}
        uiHints={uiHints}
        config={config}
        onChange={onChange}
        depth={depth}
      />
    )
  }

  // Array field
  if (fieldType === 'array') {
    return (
      <ArrayFieldRenderer
        path={path}
        label={label}
        help={help}
        schema={schema}
        value={(value ?? []) as unknown[]}
        uiHints={uiHints}
        config={config}
        onChange={onChange}
        depth={depth}
      />
    )
  }

  // Union type (anyOf with mixed types)
  if (fieldType === 'union') {
    return (
      <UnionFieldRenderer
        path={path}
        label={label}
        help={help}
        schema={schema}
        value={value}
        uiHint={uiHint}
        uiHints={uiHints}
        config={config}
        onChange={onChange}
        depth={depth}
      />
    )
  }

  // Primitive fields
  const hasValue = value !== undefined && value !== null
  const handleClear = () => onChange(path, undefined)

  // Inline layout for string / number (except sensitive fields like tokens)
  const isInline = (fieldType === 'string' && !uiHint?.sensitive) || fieldType === 'number'

  if (isInline) {
    return (
      <div className="flex items-center gap-3" onClick={focusField}>
        <div className="flex items-center gap-1.5 shrink-0">
          <Label htmlFor={path} className="text-sm font-medium whitespace-nowrap">
            {label}
          </Label>
          {help && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px] text-xs">
                  {help}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {fieldType === 'string' && (
            <StringField
              path={path}
              value={(value ?? "") as string}
              uiHint={uiHint}
              onChange={(v) => onChange(path, v)}
            />
          )}
          {fieldType === 'number' && (
            <NumberField
              path={path}
              value={value as number | undefined}
              schema={schema}
              uiHint={uiHint}
              onChange={(v) => onChange(path, v)}
            />
          )}
        </div>
        {hasValue && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClear() }}
            className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
            title={t('config.removeField')}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    )
  }

  // Vertical layout for boolean, enum, sensitive strings
  return (
    <div className="space-y-1.5" onClick={focusField}>
      <FieldLabel label={label} help={help} path={path} isBool={fieldType === 'boolean'}>
        {fieldType === 'boolean' ? (
          <div className="flex items-center gap-1.5">
            <BooleanField
              path={path}
              value={value as boolean}
              onChange={(v) => onChange(path, v)}
            />
            {hasValue && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClear() }}
                className="text-muted-foreground/50 hover:text-destructive transition-colors"
                title={t('config.removeField')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ) : hasValue ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClear() }}
            className="text-muted-foreground/50 hover:text-destructive transition-colors"
            title={t('config.removeField')}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </FieldLabel>

      {fieldType === 'string' && (
        <StringField
          path={path}
          value={(value ?? "") as string}
          uiHint={uiHint}
          onChange={(v) => onChange(path, v)}
        />
      )}

      {fieldType === 'enum' && (
        <EnumField
          path={path}
          value={(value ?? "") as string}
          schema={schema}
          onChange={(v) => onChange(path, v)}
        />
      )}
    </div>
  )
}

// ─── Field Label ────────────────────────────────────────────────────

function FieldLabel({
  label,
  help,
  path,
  isBool,
  children,
}: {
  label: string
  help?: string
  path: string
  isBool?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={cn("flex items-center gap-2", isBool && "justify-between")}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={path} className="text-sm font-medium">
          {label}
        </Label>
        {help && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[300px] text-xs">
                {help}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Collapsible Object ─────────────────────────────────────────────

function CollapsibleObject({
  path,
  label,
  help,
  schema,
  config,
  uiHints,
  onChange,
  depth,
}: {
  path: string
  label: string
  help?: string
  schema: JsonSchema
  config: Record<string, unknown>
  uiHints: Record<string, UiHint>
  onChange: (path: string, value: unknown) => void
  depth: number
}) {
  const t = useT()
  const [open, setOpen] = useState(depth < 1)
  const fieldCount = schema.properties ? Object.keys(schema.properties).length : 0
  const currentValue = getFieldValue(config, path)
  const hasValue = currentValue !== undefined && currentValue !== null
  const setFocusedField = useConfigEditorStore((s) => s.setFocusedField)

  return (
    <div className="rounded-lg border bg-muted/20">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => { setOpen(!open); setFocusedField(path) }}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors rounded-tl-lg"
        >
          {open ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span>{label}</span>
          {help && (
            <span className="text-xs text-muted-foreground font-normal truncate hidden sm:inline">
              {help}
            </span>
          )}
          {fieldCount > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px] h-5 shrink-0">
              {fieldCount}
            </Badge>
          )}
        </button>
        {hasValue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange(path, undefined)
            }}
            className="px-2 py-2 text-muted-foreground/50 hover:text-destructive transition-colors"
            title={t('config.removeBlock')}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3">
          <SchemaFormRenderer
            schema={schema}
            path={path}
            config={config}
            uiHints={uiHints}
            onChange={onChange}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  )
}

// ─── Dynamic Key-Value Editor ───────────────────────────────────────

function DynamicKVEditor({
  path,
  label,
  help,
  schema,
  value,
  uiHints,
  config,
  onChange,
  depth,
}: {
  path: string
  label: string
  help?: string
  schema: JsonSchema
  value: Record<string, unknown>
  uiHints: Record<string, UiHint>
  config: Record<string, unknown>
  onChange: (path: string, value: unknown) => void
  depth: number
}) {
  const t = useT()
  const [open, setOpen] = useState(depth < 1)
  const [newKey, setNewKey] = useState("")

  const addEntry = useCallback(() => {
    const key = newKey.trim()
    if (!key || key in value) return

    const valueSchema =
      typeof schema.additionalProperties === 'object'
        ? schema.additionalProperties
        : { type: 'string' as const }
    const defaultVal = getDefaultForSchema(valueSchema)
    onChange(path, { ...value, [key]: defaultVal })
    setNewKey("")
  }, [newKey, value, schema, path, onChange])

  const removeEntry = useCallback(
    (key: string) => {
      const updated = { ...value }
      delete updated[key]
      onChange(path, updated)
    },
    [value, path, onChange],
  )

  const keys = Object.keys(value)
  const valueSchema =
    typeof schema.additionalProperties === 'object'
      ? schema.additionalProperties
      : undefined

  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors rounded-t-lg"
      >
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <span>{label}</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-5">
          {keys.length}
        </Badge>
        {help && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3 text-muted-foreground/50" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[300px] text-xs">
                {help}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {keys.map((key) => (
            <div key={key} className="rounded border bg-background p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-medium text-muted-foreground">
                  {key}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEntry(key)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
              {valueSchema?.properties ? (
                <SchemaFormRenderer
                  schema={valueSchema}
                  path={`${path}.${key}`}
                  config={config}
                  uiHints={uiHints}
                  onChange={onChange}
                  depth={depth + 1}
                />
              ) : (
                <Input
                  autoComplete="off"
                  value={String(value[key] ?? "")}
                  onChange={(e) => onChange(`${path}.${key}`, e.target.value)}
                  className="h-8 text-sm font-mono"
                />
              )}
            </div>
          ))}

          {/* Add new key */}
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={t('config.newKeyPlaceholder')}
              className="h-8 text-sm font-mono flex-1"
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEntry}
              disabled={!newKey.trim() || newKey.trim() in value}
              className="h-8 gap-1 px-2"
            >
              <Plus className="size-3" />
              {t('config.addButton')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Array Field ────────────────────────────────────────────────────

function ArrayFieldRenderer({
  path,
  label,
  help,
  schema,
  value,
  uiHints,
  config,
  onChange,
  depth,
}: {
  path: string
  label: string
  help?: string
  schema: JsonSchema
  value: unknown[]
  uiHints: Record<string, UiHint>
  config: Record<string, unknown>
  onChange: (path: string, value: unknown) => void
  depth: number
}) {
  const t = useT()
  const [open, setOpen] = useState(depth < 1)
  const itemSchema = schema.items

  // Entity-linked array → use picker (e.g. model fallbacks)
  const entityLink = getEntityLink(path)
  if (entityLink?.type === 'model' && entityLink.mode === 'multi') {
    return (
      <MultiModelPickerField
        path={path}
        label={label}
        help={help}
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={(v) => onChange(path, v.length > 0 ? v : undefined)}
        allowCustom={entityLink.allowCustom}
      />
    )
  }

  // Enum array → toggleable buttons (anyOf with const values, e.g. input: ["text", "image"])
  const enumConstants = itemSchema?.anyOf
    ?.filter((s: JsonSchema) => 'const' in s)
    ?.map((s: JsonSchema) => s.const as string)
  if (enumConstants && enumConstants.length > 0) {
    return (
      <div className="space-y-1.5">
        <FieldLabel label={label} help={help} path={path} />
        <EnumArrayInput
          options={enumConstants}
          value={value as string[]}
          onChange={(v) => onChange(path, v)}
        />
      </div>
    )
  }

  // Primitive array → chip/tag input
  if (!itemSchema || itemSchema.type === 'string' || itemSchema.type === 'number') {
    return (
      <div className="space-y-1.5">
        <FieldLabel label={label} help={help} path={path} />
        <PrimitiveArrayInput
          value={value as (string | number)[]}
          onChange={(v) => onChange(path, v)}
        />
      </div>
    )
  }

  // Object array → collapsible list
  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors rounded-t-lg"
      >
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <span>{label}</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-5">
          {value.length}
        </Badge>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {value.map((item, idx) => (
            <ObjectArrayItem
              key={idx}
              index={idx}
              path={path}
              schema={itemSchema}
              value={item as Record<string, unknown>}
              config={config}
              uiHints={uiHints}
              onChange={onChange}
              onRemove={() => {
                const updated = [...value]
                updated.splice(idx, 1)
                onChange(path, updated)
              }}
              depth={depth}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const newItem = getDefaultForSchema(itemSchema)
              onChange(path, [...value, newItem])
            }}
            className="h-8 gap-1 px-2 w-full"
          >
            <Plus className="size-3" />
            {t('config.addItem')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Object Array Item ──────────────────────────────────────────────

function ObjectArrayItem({
  index,
  path,
  schema,
  value,
  config,
  uiHints,
  onChange,
  onRemove,
  depth,
}: {
  index: number
  path: string
  schema: JsonSchema
  value: Record<string, unknown>
  config: Record<string, unknown>
  uiHints: Record<string, UiHint>
  onChange: (path: string, value: unknown) => void
  onRemove: () => void
  depth: number
}) {
  const [open, setOpen] = useState(false)
  // Try to find a meaningful label from common keys
  const itemLabel =
    (value.id as string) ??
    (value.name as string) ??
    (value.key as string) ??
    `#${index + 1}`

  return (
    <div className="rounded border bg-background">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 flex-1 text-left text-sm"
        >
          {open ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
          <span className="font-mono text-xs">{itemLabel}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {open && schema.properties && (
        <div className="px-2 pb-2">
          <SchemaFormRenderer
            schema={schema}
            path={`${path}.${index}`}
            config={config}
            uiHints={uiHints}
            onChange={onChange}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  )
}

// ─── Primitive Array (Chip Input) ───────────────────────────────────

function PrimitiveArrayInput({
  value,
  onChange,
}: {
  value: (string | number)[]
  onChange: (value: (string | number)[]) => void
}) {
  const t = useT()
  const [inputValue, setInputValue] = useState("")

  const addItem = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    if (!value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInputValue("")
  }, [inputValue, value, onChange])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map((item, idx) => (
          <Badge key={idx} variant="secondary" className="gap-1 text-xs h-6 font-mono">
            {String(item)}
            <button
              type="button"
              onClick={() => {
                const updated = [...value]
                updated.splice(idx, 1)
                onChange(updated)
              }}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        autoComplete="off"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            addItem()
          }
        }}
        placeholder={t('config.enterToAdd')}
        className="h-8 text-sm"
      />
    </div>
  )
}

// ─── Enum Array (Toggleable Buttons) ────────────────────────────────

function EnumArrayInput({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (active) {
                onChange(value.filter((v) => v !== option))
              } else {
                onChange([...value, option])
              }
            }}
            className={cn(
              "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

// ─── Module-Level KV Editor (for dynamic modules like channels) ─────

function ModuleLevelKVEditor({
  path,
  schema,
  value,
  uiHints,
  config,
  onChange,
}: {
  path: string
  schema: JsonSchema
  value: Record<string, unknown>
  uiHints: Record<string, UiHint>
  config: Record<string, unknown>
  onChange: (path: string, value: unknown) => void
}) {
  const t = useT()
  const [newKey, setNewKey] = useState("")

  const addEntry = useCallback(() => {
    const key = newKey.trim()
    if (!key || key in value) return

    const valueSchema =
      typeof schema.additionalProperties === 'object'
        ? schema.additionalProperties
        : { type: 'string' as const }
    const defaultVal = getDefaultForSchema(valueSchema)
    onChange(path, { ...value, [key]: defaultVal })
    setNewKey("")
  }, [newKey, value, schema, path, onChange])

  const removeEntry = useCallback(
    (key: string) => {
      const updated = { ...value }
      delete updated[key]
      onChange(path, updated)
    },
    [value, path, onChange],
  )

  const keys = Object.keys(value)
  const valueSchema =
    typeof schema.additionalProperties === 'object'
      ? schema.additionalProperties
      : undefined

  return (
    <div className="space-y-3">
      {keys.map((key) => (
        <div key={key} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <span className="text-sm font-medium font-mono">
              {key}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeEntry(key)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <div className="p-4">
            {valueSchema?.properties ? (
              <SchemaFormRenderer
                schema={valueSchema}
                path={`${path}.${key}`}
                config={config}
                uiHints={uiHints}
                onChange={onChange}
                depth={1}
              />
            ) : (
              <Input
                autoComplete="off"
                value={String(value[key] ?? "")}
                onChange={(e) => onChange(`${path}.${key}`, e.target.value)}
                className="h-8 text-sm font-mono"
              />
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          autoComplete="off"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder={t('config.channelNamePlaceholder')}
          className="h-9 text-sm font-mono flex-1"
          onKeyDown={(e) => e.key === "Enter" && addEntry()}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addEntry}
          disabled={!newKey.trim() || newKey.trim() in value}
          className="h-9 gap-1 px-3"
        >
          <Plus className="size-3.5" />
          {t('config.addChannel')}
        </Button>
      </div>
    </div>
  )
}

// ─── Union Type (anyOf with mixed types) ────────────────────────────

function UnionFieldRenderer({
  path,
  label,
  help,
  schema,
  value,
  uiHint,
  uiHints,
  config,
  onChange,
  depth,
}: {
  path: string
  label: string
  help?: string
  schema: JsonSchema
  value: unknown
  uiHint?: UiHint
  uiHints: Record<string, UiHint>
  config: Record<string, unknown>
  onChange: (path: string, value: unknown) => void
  depth: number
}) {
  const t = useT()
  const variants = schema.anyOf ?? []
  // Determine current mode: is value a string or an object?
  const currentIsObject = value !== null && typeof value === 'object' && !Array.isArray(value)

  // Find which variant matches
  const objectVariant = variants.find(
    (v) => v.type === 'object' || v.properties,
  )
  const simpleVariant = variants.find(
    (v) => v.type === 'string' || v.type === 'number' || v.type === 'boolean',
  )

  if (!objectVariant && !simpleVariant) {
    // Fallback: render as JSON string
    return (
      <div className="space-y-1.5">
        <FieldLabel label={label} help={help} path={path} />
        <Input
          autoComplete="off"
          value={typeof value === 'string' ? value : JSON.stringify(value ?? "")}
          onChange={(e) => {
            try {
              onChange(path, JSON.parse(e.target.value))
            } catch {
              onChange(path, e.target.value)
            }
          }}
          className="h-9 text-sm font-mono"
        />
      </div>
    )
  }

  const hasValue = value !== undefined && value !== null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel label={label} help={help} path={path}>
          {hasValue && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(path, undefined) }}
              className="text-muted-foreground/50 hover:text-destructive transition-colors"
              title={t('config.removeField')}
            >
              <X className="size-3.5" />
            </button>
          )}
        </FieldLabel>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={!currentIsObject ? "default" : "outline"}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => {
              if (!currentIsObject) return
              // Switch to simple mode
              const simple =
                typeof value === 'object' && value !== null
                  ? ((value as Record<string, unknown>).primary as string) ?? ""
                  : ""
              onChange(path, simple)
            }}
          >
            {t('config.simpleMode')}
          </Button>
          <Button
            type="button"
            variant={currentIsObject ? "default" : "outline"}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => {
              if (currentIsObject) return
              // Switch to advanced mode
              onChange(path, {
                primary: typeof value === 'string' ? value : "",
              })
            }}
          >
            {t('config.advancedMode')}
          </Button>
        </div>
      </div>

      {currentIsObject && objectVariant ? (
        <div className="rounded border bg-muted/20 p-2">
          {objectVariant.properties ? (
            <SchemaFormRenderer
              schema={objectVariant}
              path={path}
              config={config}
              uiHints={uiHints}
              onChange={onChange}
              depth={depth + 1}
            />
          ) : (
            <Input
              autoComplete="off"
              value={JSON.stringify(value ?? {})}
              onChange={(e) => {
                try { onChange(path, JSON.parse(e.target.value)) } catch { /* ignore */ }
              }}
              className="h-8 text-sm font-mono"
            />
          )}
        </div>
      ) : (
        <StringField
          path={path}
          value={(value ?? "") as string}
          uiHint={uiHint}
          onChange={(v) => onChange(path, v)}
        />
      )}
    </div>
  )
}
