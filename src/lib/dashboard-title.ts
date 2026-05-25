import type { TranslationKey } from '@/locales/zh-CN'

export const pageTitleKeys: Record<string, TranslationKey> = {
  '/': 'page.dashboard',
  '/chat': 'page.chat',
  '/instances': 'page.instances',
  '/agents': 'page.agents',
  '/skills': 'page.skills',
  '/tools': 'page.toolbox',
  '/public-opinion': 'page.publicOpinion',
  '/regulations': 'page.regulations',
  '/cron': 'page.cron',
  '/users': 'page.users',
  '/departments': 'page.departments',
  '/resources': 'page.resources',
  '/models': 'page.models',
  '/approvals': 'page.approvals',
  '/logs': 'page.logs',
}

export function resolveDashboardTitleKey(pathname: string): TranslationKey | null {
  if (pageTitleKeys[pathname]) return pageTitleKeys[pathname]
  if (/^\/instances\/[^/]+\/config$/.test(pathname)) return 'page.advancedConfig'
  if (/^\/skills\/[^/]+$/.test(pathname)) return 'page.skillDetail'
  if (/^\/regulations\/[^/]+$/.test(pathname)) return 'page.regulations'
  return null
}
