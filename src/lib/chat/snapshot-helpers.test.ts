import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/types/chat'
import type { ChatHistoryMessage } from '@/types/gateway'

const mocks = vi.hoisted(() => {
  const tx = {
    chatMessageSnapshot: {
      createMany: vi.fn(),
    },
    chatSession: {
      update: vi.fn(),
    },
  }

  const prisma = {
    chatSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chatMessageSnapshot: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (txClient: typeof tx) => unknown) => fn(tx)),
  }

  return { prisma, tx }
})

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/chat/image-helpers', () => ({
  computeImageId: vi.fn((dataUrl: string) => `hash:${dataUrl}`),
  extractMediaPaths: vi.fn(() => []),
  readImageAsDataUrl: vi.fn(),
  readContainerImageAsDataUrl: vi.fn(),
  stampImageIds: vi.fn(),
  MIME_BY_EXT: {},
}))

import {
  appendLiveMessages,
  archiveSession,
  MAX_LIVE_MESSAGES,
  mergeLiveMessagesAppendOnly,
  mergeToolCalls,
  saveLiveSnapshot,
  shouldUseLiveMessagesFallback,
} from './snapshot-helpers'

function chatMessage(
  role: 'user' | 'assistant',
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `${role}-${content}-${Math.random()}`,
    role,
    content,
    createdAt: '2026-05-28T00:00:00.000Z',
    ...extra,
  }
}

function user(content: string): ChatHistoryMessage {
  return { role: 'user', content }
}

function userWithImage(content: string, mimeType: string, data: string): ChatHistoryMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: content },
      { type: 'image', source: { type: 'base64', media_type: mimeType, data } },
    ],
  }
}

function assistant(content: string): ChatHistoryMessage {
  return { role: 'assistant', content }
}

function toolResult(toolName: string, content: string): ChatHistoryMessage {
  return { role: 'toolResult', toolName, content }
}

describe('live snapshot append-only merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(
      async (fn: (txClient: typeof mocks.tx) => unknown) => fn(mocks.tx),
    )
  })

  it('matches repeated empty assistant tool messages by occurrence and preserves old tool data', () => {
    const firstToolAssistant = chatMessage('assistant', '', {
      toolCalls: [{ toolName: 'shell', toolInput: 'first input', toolOutput: 'first output' }],
      contentBlocks: [{ type: 'image', imageUrl: 'data:image/png;base64,first' }],
    })
    const secondToolAssistant = chatMessage('assistant', '', {
      toolCalls: [{ toolName: 'shell', toolInput: 'second input', toolOutput: 'second output' }],
      contentBlocks: [{ type: 'image', imageUrl: 'data:image/png;base64,second' }],
    })

    const existing = [
      chatMessage('user', 'first'),
      firstToolAssistant,
      chatMessage('user', 'second'),
      secondToolAssistant,
    ]
    const incomingTail = [
      chatMessage('user', 'second'),
      chatMessage('assistant', '', {
        toolCalls: [{ toolName: 'shell', toolInput: null, toolOutput: undefined }],
      }),
      chatMessage('user', 'third'),
      chatMessage('assistant', 'done'),
    ]

    const merged = mergeLiveMessagesAppendOnly(existing, incomingTail)

    expect(merged).toHaveLength(6)
    expect(merged[1].toolCalls?.[0].toolOutput).toBe('first output')
    expect(merged[3].toolCalls?.[0].toolInput).toBe('second input')
    expect(merged[3].toolCalls?.[0].toolOutput).toBe('second output')
    expect(merged[3].contentBlocks?.[0].imageUrl).toBe('data:image/png;base64,second')
    expect(merged[4].content).toBe('third')
  })

  it('chooses the latest occurrence when repeated turns have identical role and content', () => {
    const existing = [
      chatMessage('user', 'again'),
      chatMessage('assistant', '', {
        toolCalls: [{ toolName: 'shell', toolInput: 'first input', toolOutput: 'first output' }],
      }),
      chatMessage('user', 'again'),
      chatMessage('assistant', '', {
        toolCalls: [{ toolName: 'shell', toolInput: null, toolOutput: 'second output' }],
      }),
    ]
    const incomingTail = [
      chatMessage('user', 'again'),
      chatMessage('assistant', '', {
        toolCalls: [{ toolName: 'shell', toolInput: 'incoming input', toolOutput: undefined }],
      }),
      chatMessage('user', 'after repeat'),
    ]

    const merged = mergeLiveMessagesAppendOnly(existing, incomingTail)

    expect(merged).toHaveLength(5)
    expect(merged[1].toolCalls?.[0].toolInput).toBe('first input')
    expect(merged[1].toolCalls?.[0].toolOutput).toBe('first output')
    expect(merged[3].toolCalls?.[0].toolInput).toBe('incoming input')
    expect(merged[3].toolCalls?.[0].toolOutput).toBe('second output')
    expect(merged[4].content).toBe('after repeat')
  })

  it('falls back to liveMessages when gateway history is a shorter cached suffix', () => {
    const cached = [
      chatMessage('user', 'one'),
      chatMessage('assistant', 'one reply'),
      chatMessage('user', 'two'),
      chatMessage('assistant', 'two reply'),
      chatMessage('user', 'three'),
      chatMessage('assistant', 'three reply'),
    ]
    const gatewayTail = cached.slice(-2).map((msg) => ({ ...msg, id: `gateway-${msg.id}` }))

    expect(shouldUseLiveMessagesFallback(gatewayTail, cached, true)).toBe(true)
    expect(shouldUseLiveMessagesFallback(gatewayTail, cached, false)).toBe(false)
    expect(shouldUseLiveMessagesFallback(cached, cached, true)).toBe(false)
  })

  it('fetches live snapshots with the unified 500 history limit', async () => {
    const client = {
      request: vi.fn().mockResolvedValue({
        sessionId: 'gw-1',
        messages: [user('hello'), assistant('hi')],
      }),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      gwSessionId: 'gw-1',
      liveMessages: [],
    })

    await saveLiveSnapshot('chat-1', client as never, 'agent:a:tc:u')

    expect(client.request).toHaveBeenCalledWith(
      'chat.history',
      { sessionKey: 'agent:a:tc:u', limit: 500 },
      10_000,
    )
  })

  it('does not duplicate uploaded image attachments already present in history', async () => {
    const imageData = 'same-image'
    const client = {
      request: vi.fn().mockResolvedValue({
        sessionId: 'gw-1',
        messages: [
          userWithImage('see this', 'image/png', imageData),
          assistant('ok'),
        ],
      }),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      gwSessionId: 'gw-1',
      liveMessages: [],
    })

    await saveLiveSnapshot(
      'chat-1',
      client as never,
      'agent:a:tc:u',
      null,
      undefined,
      [{ name: 'image.png', mimeType: 'image/png', content: imageData }],
    )

    const updateArg = mocks.prisma.chatSession.update.mock.calls[0][0]
    const liveMessages = updateArg.data.liveMessages as ChatMessage[]

    expect(liveMessages[0].contentBlocks).toHaveLength(1)
    expect(liveMessages[0].contentBlocks?.[0].imageUrl).toBe(
      'data:image/png;base64,same-image',
    )
  })

  it('archives sessions with the unified 500 history limit', async () => {
    const client = {
      request: vi.fn()
        .mockResolvedValueOnce({ sessionId: 'gw-1', messages: [] })
        .mockResolvedValueOnce({}),
      on: vi.fn(),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      liveMessages: [],
    })
    mocks.prisma.chatSession.update.mockResolvedValue({})

    await archiveSession('chat-1', 'instance-1', 'agent-a', 'user-1', client as never)

    expect(client.request).toHaveBeenCalledWith(
      'chat.history',
      { sessionKey: 'agent:agent-a:tc:user-1', limit: 500 },
    )
  })

  it('serializes live message appends for the same chat session', async () => {
    let liveMessages: ChatMessage[] = []

    mocks.prisma.chatSession.findUnique.mockImplementation(async () => ({
      liveMessages,
    }))
    mocks.prisma.chatSession.update.mockImplementation(async (args) => {
      liveMessages = args.data.liveMessages as ChatMessage[]
      return {}
    })

    await Promise.all([
      appendLiveMessages('chat-1', [chatMessage('user', 'first')]),
      appendLiveMessages('chat-1', [chatMessage('user', 'second')]),
    ])

    expect(liveMessages.map((message) => message.content)).toEqual(['first', 'second'])
  })

  it('archives overflow messages before trimming liveMessages in the same transaction', async () => {
    const existing = Array.from({ length: MAX_LIVE_MESSAGES }, (_, i) =>
      chatMessage(i % 2 === 0 ? 'user' : 'assistant', `message-${i}`),
    )
    const incoming = [
      user(`message-${MAX_LIVE_MESSAGES - 2}`),
      assistant(`message-${MAX_LIVE_MESSAGES - 1}`),
      user('new'),
      assistant('new reply'),
    ]
    const client = {
      request: vi.fn().mockResolvedValue({ sessionId: 'gw-1', messages: incoming }),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      gwSessionId: 'gw-1',
      liveMessages: existing,
    })

    await saveLiveSnapshot('chat-1', client as never, 'agent:a:tc:u')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.chatMessageSnapshot.createMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.chatSession.update).toHaveBeenCalledTimes(1)

    const updateArg = mocks.tx.chatSession.update.mock.calls[0][0]
    expect(updateArg.data.liveMessages).toHaveLength(MAX_LIVE_MESSAGES)
    expect(updateArg.data.liveMessages[0].content).toBe('message-2')
    expect(updateArg.data.liveMessages.at(-1).content).toBe('new reply')
  })
})

describe('mergeToolCalls', () => {
  it('drops stale tool calls from old messages when the new message has fewer', () => {
    const result = mergeToolCalls(
      [{ toolName: 'bash', toolInput: 'ls', toolOutput: 'AGENTS.md' }],
      undefined,
    )
    expect(result).toBeUndefined()
  })

  it('drops extra old tool calls beyond the new count', () => {
    const result = mergeToolCalls(
      [
        { toolName: 'exec', toolInput: 'ls', toolOutput: 'ok' },
        { toolName: 'read', toolInput: 'x.md', toolOutput: '...' },
      ],
      [{ toolName: 'exec', toolInput: null, toolOutput: 'ok' }],
    )
    expect(result).toHaveLength(1)
    expect(result![0].toolName).toBe('exec')
    expect(result![0].toolInput).toBe('ls') // preserves old enriched input
  })
})
