import { describe, expect, it } from 'vitest'

import { resolveDashboardTitleKey } from '@/lib/dashboard-title'
import { buildSidebarNavGroups, PUBLIC_OPINION_PATH, TOOLBOX_PATH } from '@/lib/navigation'
import en from '@/locales/en'
import zhCN, { type TranslationKey } from '@/locales/zh-CN'

const t = (key: TranslationKey) => zhCN[key]

describe('toolbox navigation', () => {
  it('places the toolbox in the management sidebar group instead of public opinion', () => {
    const groups = buildSidebarNavGroups(t, 'SYSTEM_ADMIN')
    const managementGroup = groups.find((group) => group.label === zhCN['nav.management'])
    const hrefs = managementGroup?.items.map((item) => item.href)

    expect(hrefs).toContain(TOOLBOX_PATH)
    expect(hrefs).not.toContain(PUBLIC_OPINION_PATH)
    expect(hrefs?.indexOf(TOOLBOX_PATH)).toBeGreaterThan(hrefs?.indexOf('/knowledge-bases') ?? -1)
    expect(hrefs?.indexOf(TOOLBOX_PATH)).toBeLessThan(hrefs?.indexOf('/cron') ?? 999)
  })

  it('has localized labels and dashboard titles for both the toolbox and public opinion routes', () => {
    expect(zhCN['nav.toolbox']).toBe('工具箱')
    expect(en['nav.toolbox']).toBe('Toolbox')
    expect(zhCN['nav.publicOpinion']).toBe('舆情监控')
    expect(en['nav.publicOpinion']).toBe('Public Opinion')
    expect(resolveDashboardTitleKey(TOOLBOX_PATH)).toBe('page.toolbox')
    expect(resolveDashboardTitleKey(PUBLIC_OPINION_PATH)).toBe('page.publicOpinion')
  })
})
