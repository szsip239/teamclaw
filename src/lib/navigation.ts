import {
  BookOpen,
  Bot,
  Building2,
  Clock,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  Radar,
  ScrollText,
  Server,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { TranslationKey } from '@/locales/zh-CN'

export const PUBLIC_OPINION_PATH = '/public-opinion'

export interface SidebarNavItem {
  title: string
  icon: LucideIcon
  href: string
  roles?: readonly string[]
}

export interface SidebarNavGroup {
  label: string
  roles?: readonly string[]
  items: SidebarNavItem[]
}

type Translate = (key: TranslationKey) => string

function hasRole(roles: readonly string[] | undefined, role: string | null | undefined) {
  return !roles || (role != null && roles.includes(role))
}

export function buildSidebarNavGroups(t: Translate, role: string | null | undefined) {
  const allNavGroups: SidebarNavGroup[] = [
    {
      label: t('nav.workspace'),
      items: [
        { title: t('nav.dashboard'), icon: LayoutDashboard, href: '/' },
        { title: t('nav.chat'), icon: MessageSquare, href: '/chat' },
      ],
    },
    {
      label: t('nav.management'),
      items: [
        {
          title: t('nav.instances'),
          icon: Server,
          href: '/instances',
          roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'],
        },
        { title: t('nav.agents'), icon: Bot, href: '/agents' },
        { title: t('nav.skills'), icon: Puzzle, href: '/skills' },
        { title: t('nav.knowledgeBases'), icon: BookOpen, href: '/knowledge-bases' },
        { title: t('nav.publicOpinion'), icon: Radar, href: PUBLIC_OPINION_PATH },
        { title: t('nav.cron'), icon: Clock, href: '/cron' },
      ],
    },
    {
      label: t('nav.organization'),
      roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'],
      items: [
        {
          title: t('nav.users'),
          icon: Users,
          href: '/users',
          roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'],
        },
        {
          title: t('nav.departments'),
          icon: Building2,
          href: '/departments',
          roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'],
        },
      ],
    },
    {
      label: t('nav.system'),
      roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'],
      items: [
        { title: t('nav.resources'), icon: KeyRound, href: '/resources', roles: ['SYSTEM_ADMIN'] },
        {
          title: t('nav.logs'),
          icon: ScrollText,
          href: '/logs',
          roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'],
        },
      ],
    },
  ]

  return allNavGroups
    .filter((group) => hasRole(group.roles, role))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasRole(item.roles, role)),
    }))
    .filter((group) => group.items.length > 0)
}
