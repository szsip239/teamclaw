import type { TranslationKey } from '@/locales/zh-CN'

export const pageTitleKeys: Record<string, TranslationKey> = {
  '/': 'page.dashboard',
  '/chat': 'page.chat',
  '/instances': 'page.instances',
  '/agents': 'page.agents',
  '/skills': 'page.skills',
  '/public-opinion': 'page.publicOpinion',
  '/cron': 'page.cron',
  '/users': 'page.users',
  '/departments': 'page.departments',
  '/resources': 'page.resources',
  '/models': 'page.models',
  '/approvals': 'page.approvals',
  '/logs': 'page.logs',
  '/settings': 'page.settings',
}

export function resolveDashboardTitleKey(pathname: string): TranslationKey | null {
  if (pageTitleKeys[pathname]) return pageTitleKeys[pathname]
  if (/^\/instances\/[^/]+\/config$/.test(pathname)) return 'page.advancedConfig'
  if (/^\/skills\/[^/]+$/.test(pathname)) return 'page.skillDetail'
  return null
}
