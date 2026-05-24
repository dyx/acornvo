import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../ai/reviewer', () => ({ reviewClip: vi.fn() }))
vi.mock('../../ai/usage', () => ({ aiUsage: { insert: vi.fn() }, writeUsage: vi.fn() }))
vi.mock('../../settings/store', () => ({
  settingsStore: { get: vi.fn() }
}))
vi.mock('../../services/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { reviewClip } from '../../ai/reviewer'
import { writeUsage } from '../../ai/usage'
import { settingsStore } from '../../settings/store'
import { aiReviewClipHandler } from './ai-review-clip'

const baseCtx = (override: any = {}) => ({
  job: { id: 'job-1', kind: 'ai-review-clip', attempts: 0, ...override.job } as any,
  payload: { clipId: 7, path: 'inbox/x.md', force: false, ...override.payload },
  log: vi.fn(),
  cancel: new AbortController().signal
})

beforeEach(() => {
  vi.resetAllMocks()
  ;(settingsStore.get as any).mockReturnValue({ defaultProfileId: null })
})

describe('aiReviewClipHandler', () => {
  it('returns ok on success', async () => {
    ;(reviewClip as any).mockResolvedValue({
      result: {
        summary: 's',
        suggestedTitle: 't',
        tags: ['a', 'b', 'c'],
        keyQuotes: ['q'],
        reviewedAt: 'now'
      },
      cacheHit: false,
      llmCall: { model: 'gpt-4o-mini', latencyMs: 1200, promptTokens: 100, completionTokens: 50 }
    })
    const r = await aiReviewClipHandler(baseCtx())
    expect(r).toEqual({ kind: 'ok' })
  })

  it.each([
    ['E_MISSING_PROFILE', 'fail'],
    ['E_CONFIG', 'fail'],
    ['E_AUTH', 'fail'],
    ['E_CLIP_NOT_FOUND', 'fail'],
    ['E_FILE_NOT_FOUND', 'fail']
  ])('maps %s → fail', async (code) => {
    const e: any = new Error('x')
    e.code = code
    ;(reviewClip as any).mockRejectedValue(e)
    const r = await aiReviewClipHandler(baseCtx())
    expect(r).toMatchObject({ kind: 'fail', error: code })
  })

  it('maps E_RATE → retry 60s', async () => {
    const e: any = new Error('rate')
    e.code = 'E_RATE'
    ;(reviewClip as any).mockRejectedValue(e)
    const r = await aiReviewClipHandler(baseCtx())
    expect(r).toMatchObject({ kind: 'retry', delayMs: 60_000, reason: 'rate-limited' })
  })

  it('maps E_MTIME_CONFLICT → retry 600s', async () => {
    const e: any = new Error('mtime')
    e.code = 'E_MTIME_CONFLICT'
    ;(reviewClip as any).mockRejectedValue(e)
    const r = await aiReviewClipHandler(baseCtx())
    expect(r).toMatchObject({ kind: 'retry', delayMs: 60_000, reason: 'mtime-conflict' })
  })

  it.each([['E_NETWORK'], ['E_SERVER'], ['E_RESPONSE'], ['E_UNKNOWN']])(
    'maps %s → retry with backoff',
    async (code) => {
      const e: any = new Error('x')
      e.code = code
      ;(reviewClip as any).mockRejectedValue(e)
      const r = await aiReviewClipHandler(baseCtx({ job: { attempts: 1 } }))
      expect(r).toMatchObject({ kind: 'retry' })
      expect((r as any).delayMs).toBeGreaterThan(0)
    }
  )

  it('writes ai_usage on success', async () => {
    ;(reviewClip as any).mockResolvedValue({
      result: {
        summary: 's',
        suggestedTitle: 't',
        tags: ['a', 'b', 'c'],
        keyQuotes: ['q'],
        reviewedAt: 'now'
      },
      cacheHit: false,
      llmCall: { model: 'm', latencyMs: 100, promptTokens: 10, completionTokens: 5 }
    })
    ;(settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' })
    await aiReviewClipHandler(baseCtx())
    expect(writeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        profileId: 'p1',
        model: 'm',
        ok: 1,
        error: null
      })
    )
  })

  it('writes ai_usage on failure', async () => {
    const e: any = new Error('x')
    e.code = 'E_AUTH'
    ;(reviewClip as any).mockRejectedValue(e)
    await aiReviewClipHandler(baseCtx())
    expect(writeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        ok: 0,
        error: 'E_AUTH'
      })
    )
  })
})
