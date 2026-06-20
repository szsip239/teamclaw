import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function modelsJsonPath(agentDir) {
  return join(agentDir, 'models.json')
}

export function settingsJsonPath(agentDir) {
  return join(agentDir, 'settings.json')
}

export function openClawJsonPath(agentDir) {
  return join(agentDir, 'openclaw.json')
}

export async function readModelsConfig(agentDir) {
  const path = modelsJsonPath(agentDir)
  try {
    const raw = await readFile(path, 'utf8')
    return { path, raw, config: JSON.parse(raw) }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { path, raw: '', config: {} }
    }
    throw err
  }
}

export async function ensureModelsConfig(agentDir) {
  const current = await readModelsConfig(agentDir)
  if (current.raw) return current

  const seeded = await readOpenClawModelsConfig(agentDir)
  if (!seeded) return current

  return writeModelsConfig(agentDir, seeded.config)
}

export async function writeModelsConfig(agentDir, config) {
  return writeJsonConfig(modelsJsonPath(agentDir), config)
}

export async function readSettingsConfig(agentDir) {
  const path = settingsJsonPath(agentDir)
  try {
    const raw = await readFile(path, 'utf8')
    return { path, raw, config: JSON.parse(raw) }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { path, raw: '', config: {} }
    }
    throw err
  }
}

export async function writeSettingsConfig(agentDir, config) {
  return writeJsonConfig(settingsJsonPath(agentDir), config)
}

async function writeJsonConfig(path, config) {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`
  const raw = `${JSON.stringify(config, null, 2)}\n`
  await writeFile(tmpPath, raw, 'utf8')
  await rename(tmpPath, path)
  return { path, raw, config }
}

export async function patchModelsConfig(agentDir, patch) {
  const current = await readModelsConfig(agentDir)
  const modelsPatch = normalizePatch(patch)
  if (Object.keys(modelsPatch).length === 0) return current

  const nextConfig = mergeConfig(current.config, modelsPatch)
  return writeModelsConfig(agentDir, nextConfig)
}

export async function patchSettingsConfig(agentDir, patch) {
  const settingsPatch = normalizeSettingsPatch(patch)
  if (Object.keys(settingsPatch).length === 0) return null

  const current = await readSettingsConfig(agentDir)
  const nextConfig = mergeConfig(current.config, settingsPatch)
  return writeSettingsConfig(agentDir, nextConfig)
}

async function readOpenClawModelsConfig(agentDir) {
  const path = openClawJsonPath(agentDir)
  try {
    const raw = await readFile(path, 'utf8')
    const config = normalizeOpenClawConfig(JSON.parse(raw))
    if (!config) return null
    return { path, raw: `${JSON.stringify(config, null, 2)}\n`, config }
  } catch (err) {
    if (err?.code === 'ENOENT') return null
    throw err
  }
}

function normalizeOpenClawConfig(config) {
  if (!config || typeof config !== 'object') return null
  const models = config.models
  if (!models || typeof models !== 'object') return null
  const providers = models.providers
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return null
  return { providers }
}

function normalizePatch(patch) {
  if (!patch || typeof patch !== 'object') return {}
  const rawPatch =
    patch.raw && typeof patch.raw === 'object'
      ? patch.raw
      : patch.patch && typeof patch.patch === 'object'
        ? patch.patch
        : patch

  if (rawPatch.models && typeof rawPatch.models === 'object' && rawPatch.models.providers) {
    return { providers: rawPatch.models.providers }
  }
  if (rawPatch.providers && typeof rawPatch.providers === 'object') {
    return { providers: rawPatch.providers }
  }
  return {}
}

function normalizeSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object') return {}
  const rawPatch =
    patch.raw && typeof patch.raw === 'object'
      ? patch.raw
      : patch.patch && typeof patch.patch === 'object'
        ? patch.patch
        : patch

  const settings = rawPatch.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {}

  const result = {}
  if (typeof settings.defaultProvider === 'string') {
    result.defaultProvider = settings.defaultProvider
  }
  if (typeof settings.defaultModel === 'string') {
    result.defaultModel = settings.defaultModel
  }
  if (typeof settings.defaultThinkingLevel === 'string') {
    result.defaultThinkingLevel = settings.defaultThinkingLevel
  }
  return result
}

function mergeConfig(base, patch) {
  if (!isPlainObject(base)) return patch
  if (!isPlainObject(patch)) return patch
  const result = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key]
    } else if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeConfig(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
