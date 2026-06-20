import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  normalizeContainerSessionArtifacts: vi.fn(),
  normalizeExternalSessionArtifacts: vi.fn(),
}))

vi.mock('@/lib/session-files/artifacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session-files/artifacts')>()
  return {
    ...actual,
    normalizeContainerSessionArtifacts: mocks.normalizeContainerSessionArtifacts,
    normalizeExternalSessionArtifacts: mocks.normalizeExternalSessionArtifacts,
  }
})

import { finalizeAssistantArtifacts, messageHasOutputArtifactLink } from './artifact-finalizer'

describe('finalizeAssistantArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes external artifacts and returns assistant content with deterministic output links', async () => {
    mocks.normalizeExternalSessionArtifacts.mockResolvedValue([
      { fileName: 'report.html', relativePath: 'report.html' },
    ])

    const result = await finalizeAssistantArtifacts({
      agentId: 'main',
      chatSessionId: 'session-1',
      runStartedAt: new Date('2026-06-20T00:00:00.000Z'),
      assistantText: '页面已生成：\n[embed ref="report" title="Report" /]',
      workspacePath: '/workspace',
    })

    expect(mocks.normalizeExternalSessionArtifacts).toHaveBeenCalledWith({
      workspacePath: '/workspace',
      agentId: 'main',
      chatSessionId: 'session-1',
      runStartedAt: new Date('2026-06-20T00:00:00.000Z'),
      assistantText: '页面已生成：\n[embed ref="report" title="Report" /]',
      outputSnapshot: null,
    })
    expect(result).toEqual({
      artifacts: [{ fileName: 'report.html', relativePath: 'report.html' }],
      content: '页面已生成：\n\n[report.html](output/report.html)',
    })
  })

  it('falls back to external normalization when container normalization fails', async () => {
    const execWithOutput = vi.fn()
    mocks.normalizeContainerSessionArtifacts.mockRejectedValue(new Error('docker unavailable'))
    mocks.normalizeExternalSessionArtifacts.mockResolvedValue([
      { fileName: 'report.html', relativePath: 'report.html' },
    ])

    const result = await finalizeAssistantArtifacts({
      agentId: 'main',
      chatSessionId: 'session-1',
      runStartedAt: new Date('2026-06-20T00:00:00.000Z'),
      assistantText: '页面已生成',
      containerId: 'container-1',
      workspacePath: '/workspace',
      execWithOutput,
    })

    expect(mocks.normalizeContainerSessionArtifacts).toHaveBeenCalled()
    expect(mocks.normalizeExternalSessionArtifacts).toHaveBeenCalled()
    expect(result?.content).toContain('[report.html](output/report.html)')
  })

  it('treats external normalization failures as no-op finalization', async () => {
    mocks.normalizeExternalSessionArtifacts.mockRejectedValue(new Error('workspace unavailable'))

    await expect(
      finalizeAssistantArtifacts({
        agentId: 'main',
        chatSessionId: 'session-1',
        runStartedAt: new Date('2026-06-20T00:00:00.000Z'),
        assistantText: '页面已生成',
        workspacePath: '/workspace',
      }),
    ).resolves.toBeNull()
  })

  it('detects existing output links so history polling can skip repeated scans', () => {
    expect(messageHasOutputArtifactLink('下载: [report.html](output/report.html)')).toBe(true)
    expect(messageHasOutputArtifactLink('下载: report.html')).toBe(false)
  })
})
