import { afterEach, describe, expect, it } from 'vitest'

import { GET } from './route'

const originalRevision = process.env.TEAMCLAW_BUILD_REVISION

afterEach(() => {
  if (originalRevision === undefined) {
    delete process.env.TEAMCLAW_BUILD_REVISION
  } else {
    process.env.TEAMCLAW_BUILD_REVISION = originalRevision
  }
})

describe('health route', () => {
  it('exposes a concrete build revision', async () => {
    process.env.TEAMCLAW_BUILD_REVISION = 'abc123'

    await expect(GET().json()).resolves.toEqual({
      status: 'ok',
      service: 'teamclaw-app',
      revision: 'abc123',
    })
  })

  it('omits an unknown revision', async () => {
    process.env.TEAMCLAW_BUILD_REVISION = 'unknown'

    await expect(GET().json()).resolves.toEqual({
      status: 'ok',
      service: 'teamclaw-app',
    })
  })
})
