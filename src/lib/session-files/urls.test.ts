import { describe, expect, it } from 'vitest'
import { buildSessionFileUrl } from './urls'
import type { SessionFileEntry } from '@/types/session-files'

describe('session file urls', () => {
  it('uses the source session id when a file entry comes from a grouped conversation', () => {
    const entry: SessionFileEntry = {
      name: 'report.html',
      path: 'report.html',
      size: 12,
      sourceSessionId: 'pi-session',
      type: 'file',
    }

    expect(buildSessionFileUrl('conversation-group', 'output', entry)).toBe(
      '/api/v1/chat/sessions/pi-session/files/output/report.html',
    )
  })
})
