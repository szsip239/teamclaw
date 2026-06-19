import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('Dockerfile', 'utf-8')

describe('app Dockerfile docker socket access', () => {
  it('keeps the app user non-root while allowing access to the root-owned docker socket', () => {
    expect(dockerfile).toContain('USER nextjs')
    expect(dockerfile).toContain('addgroup nextjs root')
  })
})
