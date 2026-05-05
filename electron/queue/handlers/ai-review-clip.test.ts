import { describe, it, expect, vi } from 'vitest'
import { createAiReviewClipHandler } from './ai-review-clip'

const fakeCtx = {
  job: {
    id: 'j-1',
    kind: 'ai-review-clip' as const,
    payload: { clipId: 1, path: 'inbox/202604/a.md' },
    status: 'running' as const,
    attempts: 0,
    nextRunAt: '2026-05-03T10:00:00.000Z',
    lastError: null,
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z'
  },
  payload: { clipId: 1, path: 'inbox/202604/a.md' },
  log: () => {},
  cancel: new AbortController().signal
}

describe('createAiReviewClipHandler', () => {
  it('returns retry 1h when reviewClip throws E_NOT_IMPLEMENTED', async () => {
    const reviewClip = vi.fn().mockRejectedValue(
      Object.assign(new Error('phase-15 not yet implemented'), { code: 'E_NOT_IMPLEMENTED' })
    )
    const handler = createAiReviewClipHandler({
      reviewClip,
      readClipRow: vi.fn().mockReturnValue({ id: 1, title: 't', path: 'inbox/a.md' }),
      readMdFile: vi.fn().mockResolvedValue({ frontmatter: {}, body: 'hello' })
    })
    const result = await handler(fakeCtx)
    expect(result).toEqual({
      kind: 'retry',
      delayMs: 60 * 60 * 1000,
      reason: 'E_NOT_IMPLEMENTED'
    })
  })

  it('returns ok when reviewClip resolves', async () => {
    const reviewClip = vi.fn().mockResolvedValue(undefined)
    const handler = createAiReviewClipHandler({
      reviewClip,
      readClipRow: vi.fn().mockReturnValue({ id: 1, title: 't', path: 'inbox/a.md' }),
      readMdFile: vi.fn().mockResolvedValue({ frontmatter: {}, body: 'hello' })
    })
    const result = await handler(fakeCtx)
    expect(result).toEqual({ kind: 'ok' })
  })

  it('returns fail when clip row missing', async () => {
    const handler = createAiReviewClipHandler({
      reviewClip: vi.fn(),
      readClipRow: vi.fn().mockReturnValue(null),
      readMdFile: vi.fn()
    })
    const result = await handler(fakeCtx)
    expect(result).toEqual({ kind: 'fail', error: 'E_CLIP_NOT_FOUND' })
  })

  it('non-E_NOT_IMPLEMENTED errors bubble up so runner applies default backoff', async () => {
    const reviewClip = vi.fn().mockRejectedValue(new Error('rate limit'))
    const handler = createAiReviewClipHandler({
      reviewClip,
      readClipRow: vi.fn().mockReturnValue({ id: 1, title: 't', path: 'inbox/a.md' }),
      readMdFile: vi.fn().mockResolvedValue({ frontmatter: {}, body: 'hello' })
    })
    await expect(handler(fakeCtx)).rejects.toThrow(/rate limit/)
  })
})
