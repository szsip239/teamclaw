import { describe, expect, it } from 'vitest'
import { mergeOverlappingSnapshotBatches } from './history-snapshot-batches'
import type { ChatSnapshotBatch } from '@/types/chat'

function batch(
  batchId: string,
  messages: Array<{ id: string; runtime: 'openclaw' | 'pi'; createdAt: string; content: string }>,
): ChatSnapshotBatch {
  return {
    batchId,
    createdAt: messages[0]?.createdAt ?? '2026-06-18T00:00:00.000Z',
    messages: messages.map((message, index) => ({
      id: message.id,
      role: index % 2 === 0 ? 'user' : 'assistant',
      runtime: message.runtime,
      createdAt: message.createdAt,
      content: message.content,
      messageSeq: index,
    })),
  }
}

describe('mergeOverlappingSnapshotBatches', () => {
  it('merges overlapping runtime archives and sorts messages by timestamp', () => {
    const merged = mergeOverlappingSnapshotBatches([
      batch('openclaw', [
        {
          id: 'oc-1',
          runtime: 'openclaw',
          createdAt: '2026-06-18T18:02:22.111Z',
          content: 'openclaw later',
        },
      ]),
      batch('pi', [
        {
          id: 'pi-1',
          runtime: 'pi',
          createdAt: '2026-06-18T17:49:41.415Z',
          content: 'pi first',
        },
        {
          id: 'pi-2',
          runtime: 'pi',
          createdAt: '2026-06-18T18:10:52.381Z',
          content: 'pi later',
        },
      ]),
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].messages.map((message) => message.content)).toEqual([
      'pi first',
      'openclaw later',
      'pi later',
    ])
  })

  it('keeps non-overlapping context ranges separate', () => {
    const merged = mergeOverlappingSnapshotBatches([
      batch('before-reset', [
        {
          id: 'before',
          runtime: 'openclaw',
          createdAt: '2026-06-18T08:00:00.000Z',
          content: 'before reset',
        },
      ]),
      batch('after-reset', [
        {
          id: 'after',
          runtime: 'openclaw',
          createdAt: '2026-06-18T09:00:00.000Z',
          content: 'after reset',
        },
      ]),
    ])

    expect(merged).toHaveLength(2)
  })
})
