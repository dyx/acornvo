import { describe, it, expect } from 'vitest'
import { getClipQueue, resetClipQueueForTest } from './clip-queue'

describe('clip-queue', () => {
  it('enqueue does not throw', () => {
    resetClipQueueForTest()
    const q = getClipQueue()
    expect(() =>
      q.enqueue({ clipId: 1, url: 'https://example.com', path: 'inbox/test.md' })
    ).not.toThrow()
  })

  it('getPendingForTest reflects enqueued state', () => {
    resetClipQueueForTest()
    const q = getClipQueue()
    q.enqueue({ clipId: 1, url: 'https://example.com', path: 'inbox/test.md' })
    q.enqueue({ clipId: 2, url: 'https://other.com', path: 'inbox/other.md' })

    const pending = q.getPendingForTest()
    expect(pending).toHaveLength(2)
    expect(pending[0]).toMatchObject({ clipId: 1, url: 'https://example.com' })
    expect(pending[1]).toMatchObject({ clipId: 2, url: 'https://other.com' })
  })

  it('reset clears all pending messages', () => {
    const q = getClipQueue()
    q.enqueue({ clipId: 1, url: 'https://example.com', path: 'inbox/test.md' })
    resetClipQueueForTest()

    const pending = q.getPendingForTest()
    expect(pending).toHaveLength(0)
  })
})
