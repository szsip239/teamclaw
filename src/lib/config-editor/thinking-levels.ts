export const TEAMCLAW_THINKING_LEVELS = ['low', 'medium', 'xhigh'] as const

export type TeamClawThinkingLevel = (typeof TEAMCLAW_THINKING_LEVELS)[number]

export const TEAMCLAW_DEFAULT_THINKING_LEVEL: TeamClawThinkingLevel = 'medium'

export const TEAMCLAW_THINKING_LEVEL_MAP = {
  off: null,
  minimal: null,
  high: null,
} as const satisfies Record<string, string | null>
