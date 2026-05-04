/**
 * Phase-14 placeholder: clip queue for offline/background processing.
 *
 * Currently a no-op in-memory list. Phase-14 will replace this with a
 * reliable persistent queue backed by SQLite.
 */

export interface ClipQueueMessage {
  clipId: number
  url: string
  path: string
}

export interface ClipQueue {
  enqueue(msg: ClipQueueMessage): void
  getPendingForTest(): ClipQueueMessage[]
}

let queue: ClipQueueMessage[] = []

export function getClipQueue(): ClipQueue {
  return {
    enqueue(msg: ClipQueueMessage): void {
      queue.push(msg)
    },
    getPendingForTest(): ClipQueueMessage[] {
      return [...queue]
    }
  }
}

export function resetClipQueueForTest(): void {
  queue = []
}
