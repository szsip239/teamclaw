import { describe, expect, it } from 'vitest'

import { resolveDashboardTitleKey } from '@/lib/dashboard-title'
import { buildSidebarNavGroups, PUBLIC_OPINION_PATH } from '@/lib/navigation'
import en from '@/locales/en'
import zhCN, { type TranslationKey } from '@/locales/zh-CN'

const t = (key: TranslationKey) => zhCN[key]

describe('public opinion navigation', () => {
  it('adds public opinion monitoring to the management sidebar group', () => {
    const groups = buildSidebarNavGroups(t, 'SYSTEM_ADMIN')
    const managementGroup = groups.find((group) => group.label === zhCN['nav.management'])
    const hrefs = managementGroup?.items.map((item) => item.href)

    expect(hrefs).toContain(PUBLIC_OPINION_PATH)
    expect(hrefs?.indexOf(PUBLIC_OPINION_PATH)).toBeGreaterThan(
      hrefs?.indexOf('/knowledge-bases') ?? -1,
    )
    expect(hrefs?.indexOf(PUBLIC_OPINION_PATH)).toBeLessThan(hrefs?.indexOf('/cron') ?? 999)
  })

  it('has localized labels and a dashboard title for the route', () => {
    expect(zhCN['nav.publicOpinion']).toBe('舆情监控')
    expect(en['nav.publicOpinion']).toBe('Public Opinion')
    expect(resolveDashboardTitleKey(PUBLIC_OPINION_PATH)).toBe('page.publicOpinion')
  })
})
