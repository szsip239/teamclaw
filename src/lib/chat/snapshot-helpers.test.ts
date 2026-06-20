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
  chatMessagesSemanticallyMatch,
  MAX_LIVE_MESSAGES,
  mergeLiveMessagesAppendOnly,
  mergeToolCalls,
  saveLiveSnapshot,
  shouldUseLiveMessagesFallback,
  trimCurrentMessagesOverlappingSnapshot,
  transformToLiveMessages,
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

  it('preserves live timestamps when gateway history is the same length', () => {
    const cached = [
      chatMessage('user', 'hi', { createdAt: '2026-06-17T15:19:16.995Z' }),
      chatMessage('assistant', 'hello', { createdAt: '2026-06-17T15:19:16.995Z' }),
    ]
    const gateway = [
      chatMessage('user', 'hi', { id: 'gateway-user', createdAt: '' }),
      chatMessage('assistant', 'hello', { id: 'gateway-assistant', createdAt: '' }),
    ]

    const merged = mergeLiveMessagesAppendOnly(cached, gateway)

    expect(merged).toHaveLength(2)
    expect(merged.map((message) => message.createdAt)).toEqual([
      '2026-06-17T15:19:16.995Z',
      '2026-06-17T15:19:16.995Z',
    ])
  })

  it('refreshes stale cached timestamps from gateway messages when merging live history', () => {
    const cached = [
      chatMessage('user', '把网络限制解除', {
        createdAt: '2026-06-18T18:17:49.947Z',
      }),
    ]
    const gateway = [
      chatMessage('user', '把网络限制解除', {
        createdAt: '2026-06-18T18:03:36.585Z',
        messageSeq: 22,
      }),
    ]

    const merged = mergeLiveMessagesAppendOnly(cached, gateway)

    expect(merged[0]).toMatchObject({
      createdAt: '2026-06-18T18:03:36.585Z',
      messageSeq: 22,
    })
  })

  it('clears stale stream errors when gateway history has a successful final reply', () => {
    const cached = [
      chatMessage('user', 'create report'),
      chatMessage('assistant', 'done', {
        error: '⚠️ ✍️ Write failed',
        isFinal: true,
        stopReason: 'stop',
      }),
    ]
    const gateway = [
      chatMessage('user', 'create report'),
      chatMessage('assistant', 'done', { isFinal: true, stopReason: 'stop' }),
    ]

    const merged = mergeLiveMessagesAppendOnly(cached, gateway)

    expect(merged).toHaveLength(2)
    expect(merged[1]).toMatchObject({
      role: 'assistant',
      content: 'done',
      isFinal: true,
      stopReason: 'stop',
    })
    expect(merged[1].error).toBeUndefined()
  })

  it('falls back to liveMessages when only local artifact links are missing from gateway history', () => {
    const gateway = [
      chatMessage('user', 'create a report'),
      chatMessage('assistant', '文件已创建完成。'),
    ]
    const cached = [
      chatMessage('user', 'create a report'),
      chatMessage('assistant', '文件已创建完成。\n\n[report.html](output/report.html)'),
    ]

    expect(shouldUseLiveMessagesFallback(gateway, cached, true)).toBe(true)

    const merged = mergeLiveMessagesAppendOnly(cached, gateway)
    expect(merged).toHaveLength(2)
    expect(merged[1].content).toBe('文件已创建完成。\n\n[report.html](output/report.html)')
  })

  it('falls back when a stale gateway artifact link was replaced by a normalized link', () => {
    const gateway = [
      chatMessage('user', 'create a report'),
      chatMessage('assistant', '页面已生成：[worldcup.html](output/worldcup.html)'),
    ]
    const cached = [
      chatMessage('user', 'create a report'),
      chatMessage(
        'assistant',
        '页面已生成：worldcup.html\n\n[worldcup-2.html](output/worldcup-2.html)',
      ),
    ]

    expect(shouldUseLiveMessagesFallback(gateway, cached, true)).toBe(true)

    const merged = mergeLiveMessagesAppendOnly(cached, gateway)
    expect(merged).toHaveLength(2)
    expect(merged[1].content).toBe(
      '页面已生成：worldcup.html\n\n[worldcup-2.html](output/worldcup-2.html)',
    )
  })

  it('preserves canvas embed output links when gateway history keeps the raw shortcode', () => {
    const gateway = [
      chatMessage('user', '做一张世界杯可视化表'),
      chatMessage(
        'assistant',
        [
          '为您做好了 2026 世界杯出线状态可视化表，48 队 12 组完整版：',
          '',
          '[embed ref="worldcup-2026-standings" title="2026 FIFA 世界杯 · 出线状态表" height="900" /]',
          '',
          '**表格特点：**',
          '- 完整 12 组',
        ].join('\n'),
        { isFinal: true, stopReason: 'stop' },
      ),
    ]
    const cached = [
      chatMessage('user', '做一张世界杯可视化表'),
      chatMessage(
        'assistant',
        [
          '为您做好了 2026 世界杯出线状态可视化表，48 队 12 组完整版：',
          '',
          '**表格特点：**',
          '- 完整 12 组',
          '',
          '[worldcup-2026-standings.html](output/worldcup-2026-standings.html)',
        ].join('\n'),
        { isFinal: true, stopReason: 'stop' },
      ),
    ]

    expect(shouldUseLiveMessagesFallback(gateway, cached, true)).toBe(true)

    const merged = mergeLiveMessagesAppendOnly(cached, gateway)
    expect(merged).toHaveLength(2)
    expect(merged[1].content).toContain(
      '[worldcup-2026-standings.html](output/worldcup-2026-standings.html)',
    )
    expect(merged[1].content).not.toContain('[embed ref=')
  })

  it('rebuilds from full gateway history when cached live messages contain duplicate tails', () => {
    const existing = [
      chatMessage('user', '制作一个谷歌最新发布的okf标注的新闻页'),
      chatMessage(
        'assistant',
        '已制作完成：\n\n[google-okf-news.html](output/google-okf-news.html)\n页面包含：OKF 新闻内容',
      ),
      chatMessage('user', '你的模型？'),
      chatMessage('assistant', '当前模型：volcengine-agent-plan/glm-latest'),
      chatMessage(
        'assistant',
        '已制作完成：\n\n[google-okf-news.html](output/google-okf-news.html)\n页面包含：OKF 新闻内容',
      ),
      chatMessage('user', '你的模型？'),
      chatMessage('assistant', '当前模型：volcengine-agent-plan/glm-latest'),
    ]
    const gateway = [
      chatMessage('user', '制作一个谷歌最新发布的okf标注的新闻页'),
      chatMessage(
        'assistant',
        '已制作完成： google-okf-news.html\n页面包含：OKF 新闻内容\nMEDIA:current-session/output/google-okf-news.html',
      ),
      chatMessage('user', '你的模型？'),
      chatMessage('assistant', '当前模型：volcengine-agent-plan/glm-latest'),
      chatMessage('user', '今天有什么重要新闻'),
      chatMessage('assistant', '今日重要新闻速报'),
    ]

    const merged = mergeLiveMessagesAppendOnly(existing, gateway)

    expect(merged).toHaveLength(6)
    expect(
      merged.filter((message) => message.content.includes('google-okf-news.html')),
    ).toHaveLength(1)
    expect(merged[1].content).toContain('[google-okf-news.html](output/google-okf-news.html)')
    expect(merged[1].content).not.toContain('MEDIA:')
    expect(
      merged.filter((message) => message.role === 'user' && message.content === '你的模型？'),
    ).toHaveLength(1)
  })

  it('does not merge artifact links into later empty tool-use turns', () => {
    const existing = [
      chatMessage('user', '制作一个谷歌最新发布的okf标注的新闻页'),
      chatMessage(
        'assistant',
        '已制作完成：\n\n[google-okf-news.html](output/google-okf-news.html)',
        { isFinal: true, stopReason: 'stop' },
      ),
      chatMessage('user', '你的模型？'),
      chatMessage('assistant', '', {
        isFinal: false,
        stopReason: 'toolUse',
        toolCalls: [{ toolName: 'session_status', toolInput: null }],
      }),
    ]
    const gateway = [
      chatMessage('user', '制作一个谷歌最新发布的okf标注的新闻页'),
      chatMessage(
        'assistant',
        '已制作完成： google-okf-news.html\nMEDIA:current-session/output/google-okf-news.html',
        { isFinal: true, stopReason: 'stop' },
      ),
      chatMessage('user', '你的模型？'),
      chatMessage('assistant', '', {
        isFinal: false,
        stopReason: 'toolUse',
        toolCalls: [{ toolName: 'session_status', toolInput: null }],
      }),
      chatMessage('assistant', '当前模型：volcengine-agent-plan/glm-latest', {
        isFinal: true,
        stopReason: 'stop',
      }),
    ]

    const merged = mergeLiveMessagesAppendOnly(existing, gateway)

    expect(merged).toHaveLength(5)
    expect(merged[1].content).toContain('[google-okf-news.html](output/google-okf-news.html)')
    expect(merged[3].content).toBe('')
    expect(merged[3].toolCalls?.[0].toolName).toBe('session_status')
  })

  it('does not treat media-only assistant text as an empty semantic match', () => {
    expect(
      chatMessagesSemanticallyMatch(
        chatMessage(
          'assistant',
          '[embed ref="worldcup-2026-standings" title="2026 FIFA World Cup" height="900" /]',
        ),
        chatMessage('assistant', ''),
      ),
    ).toBe(false)
  })

  it('trims current messages when the latest snapshot already has the normalized artifact link', () => {
    const currentMessages = [
      chatMessage('user', '做一张世界杯可视化表'),
      chatMessage(
        'assistant',
        [
          '为您做好了 2026 世界杯出线状态可视化表，48 队 12 组完整版：',
          '',
          '[embed ref="worldcup-2026-standings" title="2026 FIFA 世界杯 · 出线状态表" height="900" /]',
        ].join('\n'),
      ),
    ]
    const snapshots = [
      {
        batchId: 'snapshot-1',
        createdAt: '2026-06-20T00:00:00.000Z',
        messages: [
          chatMessage('user', '做一张世界杯可视化表'),
          chatMessage(
            'assistant',
            [
              '为您做好了 2026 世界杯出线状态可视化表，48 队 12 组完整版：',
              '',
              '[worldcup-2026-standings.html](output/worldcup-2026-standings.html)',
            ].join('\n'),
          ),
        ],
      },
    ]

    expect(trimCurrentMessagesOverlappingSnapshot(snapshots, currentMessages)).toEqual([])
  })

  it('supports history-style stable message ids without terminal failure marking', () => {
    const messages = transformToLiveMessages([user('hello'), assistant('')], {
      idForMessage: ({ messageSeq }) => `current-${messageSeq}`,
      fallbackCreatedAt: () => '',
      markNonDeliverableTerminal: false,
    })

    expect(messages).toMatchObject([
      { id: 'current-0', role: 'user', content: 'hello', createdAt: '' },
      { id: 'current-1', role: 'assistant', content: '', createdAt: '' },
    ])
    expect(messages[1].error).toBeUndefined()
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
        messages: [userWithImage('see this', 'image/png', imageData), assistant('ok')],
      }),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      gwSessionId: 'gw-1',
      liveMessages: [],
    })

    await saveLiveSnapshot('chat-1', client as never, 'agent:a:tc:u', null, undefined, [
      { name: 'image.png', mimeType: 'image/png', content: imageData },
    ])

    const updateArg = mocks.prisma.chatSession.update.mock.calls[0][0]
    const liveMessages = updateArg.data.liveMessages as ChatMessage[]

    expect(liveMessages[0].contentBlocks).toHaveLength(1)
    expect(liveMessages[0].contentBlocks?.[0].imageUrl).toBe('data:image/png;base64,same-image')
  })

  it('persists deterministic artifact links on the last assistant live message', async () => {
    const client = {
      request: vi.fn().mockResolvedValue({
        sessionId: 'gw-1',
        messages: [user('create a report'), assistant('文件已创建完成。')],
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
      undefined,
      undefined,
      '文件已创建完成。\n\n[report.html](output/report.html)',
    )

    const updateArg = mocks.prisma.chatSession.update.mock.calls[0][0]
    const liveMessages = updateArg.data.liveMessages as ChatMessage[]

    expect(liveMessages.at(-1)?.content).toBe(
      '文件已创建完成。\n\n[report.html](output/report.html)',
    )
  })

  it('persists terminal stream errors on the last assistant live message', async () => {
    const client = {
      request: vi.fn().mockResolvedValue({
        sessionId: 'gw-1',
        messages: [
          user('create a news page'),
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'I am preparing the HTML file.' },
              { type: 'toolCall', name: 'exec', arguments: { command: 'mkdir -p output' } },
            ],
            stopReason: 'length',
          } satisfies ChatHistoryMessage,
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
      undefined,
      undefined,
      undefined,
      'Agent failed before reply: non_deliverable_terminal_turn',
    )

    const updateArg = mocks.prisma.chatSession.update.mock.calls[0][0]
    const liveMessages = updateArg.data.liveMessages as ChatMessage[]

    expect(liveMessages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '',
      error: 'Agent failed before reply: non_deliverable_terminal_turn',
      stopReason: 'length',
      isFinal: true,
    })
  })

  it('archives sessions with the unified 500 history limit', async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ sessionId: 'gw-1', messages: [] })
        .mockResolvedValueOnce({}),
      on: vi.fn(),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      liveMessages: [],
    })
    mocks.prisma.chatSession.update.mockResolvedValue({})

    await archiveSession('chat-1', 'instance-1', 'agent-a', 'user-1', client as never)

    expect(client.request).toHaveBeenCalledWith('chat.history', {
      sessionKey: 'agent:agent-a:tc:user-1',
      limit: 500,
    })
  })

  it('archives pi sessions with the pi runtime session key', async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ sessionId: 'gw-1', messages: [] })
        .mockResolvedValueOnce({}),
      on: vi.fn(),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      liveMessages: [],
    })
    mocks.prisma.chatSession.update.mockResolvedValue({})

    await archiveSession('chat-1', 'instance-1', 'agent-a', 'user-1', client as never, {
      runtime: 'pi',
    })

    expect(client.request).toHaveBeenCalledWith('chat.history', {
      sessionKey: 'agent:pi:agent-a:tc:user-1',
      limit: 500,
    })
  })

  it('preserves locally appended assistant artifact links when archiving snapshots', async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          sessionId: 'gw-1',
          messages: [user('create a report'), assistant('文件已创建完成。')],
        })
        .mockResolvedValueOnce({}),
      on: vi.fn(),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      liveMessages: [
        chatMessage('user', 'create a report'),
        chatMessage('assistant', '文件已创建完成。\n\n[report.html](output/report.html)'),
      ],
    })
    mocks.prisma.chatSession.update.mockResolvedValue({})

    await archiveSession('chat-1', 'instance-1', 'agent-a', 'user-1', client as never)

    const createArg = mocks.prisma.chatMessageSnapshot.createMany.mock.calls[0][0]
    expect(createArg.data[1].content).toBe('文件已创建完成。\n\n[report.html](output/report.html)')
  })

  it('preserves live message timestamps when gateway archive history lacks timestamps', async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          sessionId: 'gw-1',
          messages: [user('pi question'), assistant('pi answer')],
        })
        .mockResolvedValueOnce({}),
      on: vi.fn(),
    }

    mocks.prisma.chatSession.findUnique.mockResolvedValue({
      liveMessages: [
        chatMessage('user', 'pi question', { createdAt: '2026-06-18T18:16:30.047Z' }),
        chatMessage('assistant', 'pi answer', { createdAt: '2026-06-18T18:16:45.100Z' }),
      ],
    })
    mocks.prisma.chatSession.update.mockResolvedValue({})

    await archiveSession('chat-1', 'instance-1', 'agent-a', 'user-1', client as never, {
      runtime: 'pi',
    })

    const createArg = mocks.prisma.chatMessageSnapshot.createMany.mock.calls[0][0]
    expect(createArg.data.map((row: { createdAt?: Date }) => row.createdAt?.toISOString())).toEqual(
      ['2026-06-18T18:16:30.047Z', '2026-06-18T18:16:45.100Z'],
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
    const archiveArg = mocks.tx.chatMessageSnapshot.createMany.mock.calls[0][0]
    expect(updateArg.data.liveMessages).toHaveLength(MAX_LIVE_MESSAGES)
    expect(updateArg.data.liveMessages[0].content).toBe('message-2')
    expect(updateArg.data.liveMessages.at(-1).content).toBe('new reply')
    expect(archiveArg.data[0].createdAt?.toISOString()).toBe('2026-05-28T00:00:00.000Z')
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

  it('prefers new gateway toolName over stale old data', () => {
    const result = mergeToolCalls(
      [{ toolName: 'bash', toolInput: null, toolOutput: '' }],
      [{ toolName: 'exec', toolInput: null, toolOutput: 'ok' }],
    )
    expect(result![0].toolName).toBe('exec')
    expect(result![0].toolOutput).toBe('ok')
  })
})

describe('transformToLiveMessages', () => {
  it('preserves gateway message timestamps for cross-runtime ordering', () => {
    const messages = transformToLiveMessages([
      {
        role: 'user',
        content: '把网络限制解除',
        timestamp: 1781805816585,
      },
      {
        role: 'assistant',
        content: '已处理',
        timestamp: '2026-06-18T18:03:40.000Z',
      },
    ])

    expect(messages.map((message) => message.createdAt)).toEqual([
      '2026-06-18T18:03:36.585Z',
      '2026-06-18T18:03:40.000Z',
    ])
  })

  it('preserves v4 toolUse assistant text as staged display text', () => {
    const messages = transformToLiveMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '正在查看目录' },
          { type: 'toolCall', name: 'exec', arguments: { command: 'ls' } },
        ],
        stopReason: 'toolUse',
      },
    ])

    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: '正在查看目录',
      stopReason: 'toolUse',
      isFinal: false,
    })
    expect(messages[0].thinking).toBeUndefined()
    expect(messages[0].toolCalls).toEqual([{ toolName: 'exec', toolInput: { command: 'ls' } }])
  })

  it('strips local MEDIA references from live assistant text', () => {
    const messages = transformToLiveMessages([
      {
        role: 'assistant',
        content:
          '已制作完成：google-okf-news.html\nMEDIA:current-session/output/google-okf-news.html',
        stopReason: 'stop',
      },
    ])

    expect(messages[0].content).toBe('已制作完成：google-okf-news.html')
  })

  it('hides terminal OpenClaw internal task failures and finalizes the tool turn', () => {
    const messages = transformToLiveMessages([
      {
        role: 'user',
        content: '做一张世界杯可视化的"出线状态表"',
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '我帮您做一张世界杯出线状态表。' },
          {
            type: 'toolCall',
            name: 'image_generate',
            arguments: { prompt: 'World Cup table' },
          },
        ],
        stopReason: 'toolUse',
      },
      {
        role: 'toolResult',
        toolName: 'image_generate',
        content:
          'Background task started for image generation (task-1). Do not call image_generate again.',
      },
      {
        role: 'user',
        content: `<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>
OpenClaw runtime context (internal):

[Internal task completion event]
source: image_generation
status: failed
<prompt-data>
Blocked: resolves to private/internal/special-use IP address
</prompt-data>
<<<END_OPENCLAW_INTERNAL_CONTEXT>>>`,
      },
    ])

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: '我帮您做一张世界杯出线状态表。',
      stopReason: 'error',
      isFinal: true,
      error:
        'Agent image generation task failed before reply: Blocked: resolves to private/internal/special-use IP address',
    })
    expect(messages[1].toolCalls?.[0]).toMatchObject({
      toolName: 'image_generate',
      toolOutput:
        'Background task started for image generation (task-1). Do not call image_generate again.',
    })
  })

  it('keeps terminal task failures when OpenClaw appends a non-chat custom message', () => {
    const messages = transformToLiveMessages([
      {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'image_generate', arguments: {} }],
        stopReason: 'toolUse',
      },
      {
        role: 'toolResult',
        toolName: 'image_generate',
        content: 'Background task started for image generation (task-1).',
      },
      {
        role: 'user',
        content: `<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>
[Internal task completion event]
source: image_generation
status: failed
<prompt-data>
Blocked: resolves to private/internal/special-use IP address
</prompt-data>
<<<END_OPENCLAW_INTERNAL_CONTEXT>>>`,
      },
      {
        role: 'custom_message',
        content: 'Image generation started; wait for the generated image completion event.',
      } as unknown as ChatHistoryMessage,
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      stopReason: 'error',
      isFinal: true,
      error:
        'Agent image generation task failed before reply: Blocked: resolves to private/internal/special-use IP address',
    })
  })

  it('finalizes any unsuccessful internal task completion, not only image generation failures', () => {
    const messages = transformToLiveMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '正在启动子任务。' },
          { type: 'toolCall', name: 'sessions_spawn', arguments: { agent: 'research' } },
        ],
        stopReason: 'toolUse',
      },
      {
        role: 'toolResult',
        toolName: 'sessions_spawn',
        content: 'Background task started for subagent (task-2).',
      },
      {
        role: 'user',
        content: `<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>
[Internal task completion event]
source: subagent
status: timed_out
<prompt-data>
Exceeded the configured timeout
</prompt-data>
<<<END_OPENCLAW_INTERNAL_CONTEXT>>>`,
      },
      {
        role: 'custom_message',
        content: 'Subagent task is still tracked by the runtime.',
      } as unknown as ChatHistoryMessage,
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: '正在启动子任务。',
      stopReason: 'error',
      isFinal: true,
      error: 'Agent subagent task timed out before reply: Exceeded the configured timeout',
    })
    expect(messages[0].toolCalls?.[0]).toMatchObject({
      toolName: 'sessions_spawn',
      toolOutput: 'Background task started for subagent (task-2).',
    })
  })

  it('does not mark the tool turn failed when OpenClaw writes a later visible reply', () => {
    const messages = transformToLiveMessages([
      {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'image_generate', arguments: {} }],
        stopReason: 'toolUse',
      },
      {
        role: 'user',
        content: `<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>
[Internal task completion event]
source: image_generation
status: failed
<<<END_OPENCLAW_INTERNAL_CONTEXT>>>`,
      },
      {
        role: 'assistant',
        content: '图像生成失败，我改为输出 HTML 表格。',
        stopReason: 'stop',
      },
    ])

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ stopReason: 'toolUse', isFinal: false })
    expect(messages[0].error).toBeUndefined()
    expect(messages[1]).toMatchObject({
      content: '图像生成失败，我改为输出 HTML 表格。',
      stopReason: 'stop',
      isFinal: true,
    })
  })

  it('collapses OpenClaw reasoning-only retry user duplicates', () => {
    const messages = transformToLiveMessages([
      {
        role: 'user',
        content: '继续',
        idempotencyKey: 'run-1:user',
        timestamp: 1781881312245,
      },
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Building the HTML structure.' }],
        stopReason: 'length',
        timestamp: 1781881312669,
      },
      {
        role: 'user',
        content: '继续',
        idempotencyKey: 'run-1:user',
        timestamp: 1781881312245,
      },
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Retrying with visible answer.' }],
        stopReason: 'length',
        timestamp: 1781881359840,
      },
      {
        role: 'user',
        content: [{ type: 'text', text: '继续' }],
        timestamp: 1781881403591,
      },
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Still only hidden reasoning.' }],
        stopReason: 'length',
        timestamp: 1781881403599,
      },
    ])

    expect(
      messages.filter((message) => message.role === 'user' && message.content === '继续'),
    ).toHaveLength(1)
    expect(messages.filter((message) => message.role === 'assistant')).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '',
      error: 'Agent failed before reply: incomplete terminal response (stopReason=length)',
      stopReason: 'length',
      isFinal: true,
    })
  })

  it('drops non-terminal hidden retry assistant attempts before a later user turn', () => {
    const messages = transformToLiveMessages([
      {
        role: 'user',
        content: '继续',
        idempotencyKey: 'run-1:user',
        timestamp: 1781881312245,
      },
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Building the HTML structure.' }],
        stopReason: 'length',
        timestamp: 1781881312669,
      },
      {
        role: 'user',
        content: '继续',
        idempotencyKey: 'run-1:user',
        timestamp: 1781881312245,
      },
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Retrying with visible answer.' }],
        stopReason: 'length',
        timestamp: 1781881359840,
      },
      {
        role: 'user',
        content: '你的模型？',
        timestamp: 1781881403591,
      },
      {
        role: 'assistant',
        content: '当前模型：volcengine-agent-plan/glm-latest',
        stopReason: 'stop',
        timestamp: 1781881403599,
      },
    ])

    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ['user', '继续'],
      ['user', '你的模型？'],
      ['assistant', '当前模型：volcengine-agent-plan/glm-latest'],
    ])
    expect(messages.some((message) => message.role === 'assistant' && message.content === '')).toBe(
      false,
    )
  })
})
