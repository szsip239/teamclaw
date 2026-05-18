import { describe, expect, it } from 'vitest'

import {
  deriveSkillImportMetadata,
  normalizeImportedSkillFiles,
} from '@/lib/skills/import'

const textFile = (path: string, content: string) => ({
  path,
  contentBase64: Buffer.from(content, 'utf-8').toString('base64'),
  size: Buffer.byteLength(content),
})

describe('skill folder import', () => {
  it('normalizes a browser folder upload and requires SKILL.md at the skill root', () => {
    const files = normalizeImportedSkillFiles([
      textFile('demo-skill/SKILL.md', '---\nname: Demo Skill\n---\n# Demo\n'),
      textFile('demo-skill/scripts/run.ts', 'export const run = () => true\n'),
      textFile('demo-skill/.DS_Store', 'ignored'),
    ])

    expect(files.map((file) => file.path)).toEqual([
      'SKILL.md',
      'scripts/run.ts',
    ])
  })

  it('derives metadata from SKILL.md frontmatter', () => {
    const metadata = deriveSkillImportMetadata(
      '---\nname: "Imported Skill"\ndescription: "Uses local docs"\nemoji: "🧩"\ntags: local, docs, automation\n---\n# Imported\n',
      'imported-skill',
    )

    expect(metadata).toEqual({
      name: 'Imported Skill',
      description: 'Uses local docs',
      emoji: '🧩',
      tags: ['local', 'docs', 'automation'],
    })
  })

  it('rejects unsafe imported paths', () => {
    expect(() =>
      normalizeImportedSkillFiles([
        textFile('demo-skill/SKILL.md', '# Demo\n'),
        textFile('demo-skill/../secret.txt', 'secret'),
      ]),
    ).toThrow('Unsafe import path')

    expect(() =>
      normalizeImportedSkillFiles([
        textFile('demo-skill/SKILL.md', '# Demo\n'),
        textFile('/tmp/secret.txt', 'secret'),
      ]),
    ).toThrow('Unsafe import path')
  })
})
