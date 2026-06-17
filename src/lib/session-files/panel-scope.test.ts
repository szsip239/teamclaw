import { describe, expect, it } from 'vitest'
import { resolveFilePanelSessionIds } from './panel-scope'
import type { ChatSessionResponse } from '@/types/chat'

describe('file panel session scope', () => {
  it('uses the selected runtime session for input writes and the conversation id for output reads', () => {
    const conversation = {
      id: 'conversation-group',
      runtime: 'pi',
      sessionIdsByRuntime: {
        openclaw: 'openclaw-session',
        pi: 'pi-session',
      },
    } as ChatSessionResponse

    expect(resolveFilePanelSessionIds({
      activeSession: conversation,
      activeSessionId: 'conversation-group',
      selectedRuntime: 'pi',
    })).toEqual({
      detailSessionId: 'pi-session',
      inputSessionId: 'pi-session',
      outputSessionId: 'conversation-group',
      watchSessionId: 'pi-session',
    })
  })
})
