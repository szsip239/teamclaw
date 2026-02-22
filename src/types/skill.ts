export type SkillCategory = 'DEFAULT' | 'DEPARTMENT' | 'PERSONAL'
export type SkillSource = 'LOCAL' | 'CLAWHUB'

/** Skill overview for list page */
export interface SkillOverview {
  id: string
  slug: string
  name: string
  description: string | null
  emoji: string | null
  category: SkillCategory
  source: SkillSource
  version: string
  tags: string[]
  creatorName: string
  departments: { id: string; name: string }[]
  installationCount: number
  createdAt: string
  updatedAt: string
}

/** Skill detail */
export interface SkillDetail extends SkillOverview {
  homepage: string | null
  clawhubSlug: string | null
  frontmatter: Record<string, unknown> | null
  versions: SkillVersionInfo[]
}

/** Skill version info */
export interface SkillVersionInfo {
  id: string
  version: string
  changelog: string | null
  publishedByName: string
  publishedAt: string
}

/** Skill file tree entry */
export interface SkillFileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

/** Skill installation info */
export interface SkillInstallationInfo {
  id: string
  skillId: string
  skillName: string
  instanceId: string
  instanceName: string
  agentId: string
  installedVersion: string
  installPath: string
  installedByName: string
  installedAt: string
}

/** ClawHub search result */
export interface ClawHubSearchResult {
  slug: string
  name: string
  description: string
  version: string
  author: string
  tags: string[]
  homepage: string
}

/** Skills list API response */
export interface SkillListResponse {
  skills: SkillOverview[]
  total: number
  page: number
  pageSize: number
}
