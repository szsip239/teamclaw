import type { ChatSnapshotBatch } from '@/types/chat'
import { compareChatMessagesForDisplay } from './history-runtime-messages'

interface BatchRange {
  batch: ChatSnapshotBatch
  start: number
  end: number
  index: number
}

interface BatchCluster {
  ranges: BatchRange[]
  start: number
  end: number
}

function finiteMessageTimes(batch: ChatSnapshotBatch): number[] {
  return batch.messages
    .map((message) => Date.parse(message.createdAt))
    .filter((time) => Number.isFinite(time))
}

function batchRange(batch: ChatSnapshotBatch, index: number): BatchRange {
  const times = finiteMessageTimes(batch)
  if (times.length === 0) {
    return { batch, start: index, end: index, index }
  }
  return {
    batch,
    start: Math.min(...times),
    end: Math.max(...times),
    index,
  }
}

function clusterId(ranges: BatchRange[]): string {
  return ranges.map((range) => range.batch.batchId).join('+')
}

/**
 * Snapshot batches are storage chunks, not always display resets. Runtime-specific
 * archives can overlap in time, and rendering those chunks as blocks makes the
 * chat look like messages disappeared or moved. Merge overlapping time ranges
 * into one display batch, while keeping non-overlapping ranges separate so real
 * context-reset separators still have a chance to render.
 */
export function mergeOverlappingSnapshotBatches(
  batches: ChatSnapshotBatch[],
): ChatSnapshotBatch[] {
  const ranges = batches
    .map(batchRange)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)

  const clusters: BatchCluster[] = []
  for (const range of ranges) {
    const current = clusters[clusters.length - 1]
    if (current && range.start <= current.end) {
      current.ranges.push(range)
      current.end = Math.max(current.end, range.end)
      continue
    }
    clusters.push({ ranges: [range], start: range.start, end: range.end })
  }

  return clusters.map((cluster) => {
    const messages = cluster.ranges
      .flatMap((range) => range.batch.messages)
      .sort(compareChatMessagesForDisplay)
    return {
      batchId: clusterId(cluster.ranges),
      createdAt: messages[0]?.createdAt ?? cluster.ranges[0].batch.createdAt,
      messages,
    }
  })
}
