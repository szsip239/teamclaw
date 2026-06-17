import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function modelsJsonPath(agentDir) {
  return join(agentDir, 'models.json')
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

export async function writeModelsConfig(agentDir, config) {
  const path = modelsJsonPath(agentDir)
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`
  const raw = `${JSON.stringify(config, null, 2)}\n`
  await writeFile(tmpPath, raw, 'utf8')
  await rename(tmpPath, path)
  return { path, raw, config }
}

export async function patchModelsConfig(agentDir, patch) {
  const current = await readModelsConfig(agentDir)
  const nextConfig = mergeConfig(current.config, normalizePatch(patch))
  return writeModelsConfig(agentDir, nextConfig)
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
