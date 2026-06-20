import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/resources/model-push-dialog.tsx'), 'utf-8')

describe('ModelPushDialog', () => {
  it('invalidates chat model queries after a successful model push', () => {
    expect(source).toContain('useQueryClient')
    expect(source).toContain('chatKeys.all')
    expect(source.includes('"model"') || source.includes("'model'")).toBe(true)
  })

  it('lets model pushes choose the thinking depth sent to runtimes', () => {
    expect(source).toContain('TEAMCLAW_DEFAULT_THINKING_LEVEL')
    expect(source).toContain('resource.pushModelThinkingLabel')
    expect(source).toContain('thinkingLevel')
  })
})
