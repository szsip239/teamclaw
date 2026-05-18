import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/skills/skill-card.tsx'), 'utf-8')

describe('SkillCard responsive header layout', () => {
  it('lets long skill names shrink before header badges overflow the card', () => {
    expect(source).toContain('className="flex items-start justify-between gap-3"')
    expect(source).toContain('className="flex min-w-0 flex-1 items-center gap-3"')
    expect(source).toContain('className="block truncate text-sm font-semibold leading-tight"')
  })
})
