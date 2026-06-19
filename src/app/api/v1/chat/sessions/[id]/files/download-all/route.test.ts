import { Readable } from 'stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { gunzipSync } from 'zlib'
import tar from 'tar-stream'

const mocks = vi.hoisted(() => ({
  dockerManager: {
    downloadFileFromContainer: vi.fn(),
    listContainerDir: vi.fn(),
  },
  prisma: {
    chatSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    instance: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/docker/manager', () => ({
  dockerManager: mocks.dockerManager,
}))

import { GET } from './route'

function createRequest() {
  return new NextRequest(
    'http://localhost/api/v1/chat/sessions/conversation-1/files/download-all',
    { headers: { 'x-user-id': 'user-1' } },
  )
}

function routeCtx(id = 'conversation-1') {
  return { params: Promise.resolve({ id }) }
}

function sessionRow(id: string, runtime: 'OPENCLAW' | 'PI') {
  return {
    agentId: 'main',
    conversationGroupId: 'conversation-1',
    id,
    instanceId: 'instance-1',
    runtime,
    userId: 'user-1',
  }
}

async function responseBuffer(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer())
}

async function listTarEntries(gzipBuffer: Buffer): Promise<string[]> {
  const extract = tar.extract()
  const entries: string[] = []

  const done = new Promise<void>((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      entries.push(header.name)
      stream.resume()
      stream.on('end', next)
    })
    extract.on('finish', resolve)
    extract.on('error', reject)
  })

  Readable.from(gunzipSync(gzipBuffer)).pipe(extract)
  await done
  return entries
}

describe('chat session download-all route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.user.findUnique.mockResolvedValue({
      avatar: null,
      department: null,
      departmentId: null,
      email: 'user@example.com',
      id: 'user-1',
      name: 'Test User',
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
    })
    mocks.prisma.instance.findUnique.mockResolvedValue({
      containerId: 'container-1',
      id: 'instance-1',
      workspacePath: null,
    })
  })

  it('downloads output files from every runtime session in a conversation group', async () => {
    mocks.prisma.chatSession.findUnique.mockResolvedValue(null)
    mocks.prisma.chatSession.findMany.mockResolvedValue([
      sessionRow('openclaw-session', 'OPENCLAW'),
      sessionRow('pi-session', 'PI'),
    ])
    mocks.dockerManager.listContainerDir
      .mockResolvedValueOnce([
        { name: 'report.html', path: 'report.html', size: 10, type: 'file' },
      ])
      .mockResolvedValueOnce([
        { name: 'report.html', path: 'report.html', size: 20, type: 'file' },
      ])
    mocks.dockerManager.downloadFileFromContainer
      .mockResolvedValueOnce(Buffer.from('openclaw'))
      .mockResolvedValueOnce(Buffer.from('pi'))

    const response = await GET(createRequest(), routeCtx())
    const entries = await listTarEntries(await responseBuffer(response))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/gzip')
    expect(entries).toEqual(['openclaw/report.html', 'pi/report.html'])
  })
})
