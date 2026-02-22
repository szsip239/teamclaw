// ─── Field → Entity Link Mapping ─────────────────────────────────────
// Declares which config fields should use entity pickers (model, agent, etc.)
// instead of plain text inputs. Follows the same pattern as ENUM_DESCRIPTIONS
// and FIELD_KNOWLEDGE: exact path match first, then suffix fallback.

export type EntityType = 'model'  // Extensible: 'agent' | 'skill' | 'user'
export type PickerMode = 'single' | 'multi'

export interface EntityLink {
  type: EntityType
  mode: PickerMode
  /** Value format written to config */
  format: 'provider/model'
  /** Allow typing a custom value not in the list */
  allowCustom: boolean
}

// ─── Exact Path Matches ──────────────────────────────────────────────

const EXACT_LINKS: Record<string, EntityLink> = {
  'agents.defaults.model.primary': {
    type: 'model',
    mode: 'single',
    format: 'provider/model',
    allowCustom: true,
  },
  'agents.defaults.imageModel.primary': {
    type: 'model',
    mode: 'single',
    format: 'provider/model',
    allowCustom: true,
  },
}

// ─── Suffix Matches (for dynamic/array paths) ───────────────────────
// e.g. "agents.defaults.model.fallbacks" or "agents.list.0.models.primary"

const SUFFIX_LINKS: Record<string, EntityLink> = {
  'model.fallbacks': {
    type: 'model',
    mode: 'multi',
    format: 'provider/model',
    allowCustom: true,
  },
  'imageModel.fallbacks': {
    type: 'model',
    mode: 'multi',
    format: 'provider/model',
    allowCustom: true,
  },
}

// ─── Lookup ──────────────────────────────────────────────────────────

/**
 * Check if a field path has an entity link.
 * Returns the EntityLink descriptor or null.
 */
export function getEntityLink(path: string): EntityLink | null {
  if (EXACT_LINKS[path]) return EXACT_LINKS[path]
  for (const [suffix, link] of Object.entries(SUFFIX_LINKS)) {
    if (path.endsWith(suffix)) return link
  }
  return null
}
