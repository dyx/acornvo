// electron/queue/handlers/index-retry.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createIndexRetryHandler } from './index-retry'
import type { Job } from '@shared/job-types'

function fakeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j-1',
    kind: 'index-retry',
    payload: { path: 'a.md' },
    status: 'running',
    attempts: 0,
    nextRunAt: '2026-05-03T10:00:00.000Z',
    lastError: null,
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z',
    ...overrides
  }
}

describe('createIndexRetryHandler', () => {
  it('returns { kind: "ok" } when upsertFromFs succeeds', async () => {
    const upsertFromFs = vi.fn().mockResolvedValue(undefined)
    const handler = createIndexRetryHandler({ upsertFromFs })
    const result = await handler({
      job: fakeJob(),
      payload: { path: 'a.md' },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(upsertFromFs).toHaveBeenCalledWith('a.md')
    expect(result).toEqual({ kind: 'ok' })
  })

  it('treats ENOENT as success (file already removed from index)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' })
    const upsertFromFs = vi.fn().mockRejectedValue(err)
    const handler = createIndexRetryHandler({ upsertFromFs })
    const result = await handler({
      job: fakeJob(),
      payload: { path: 'gone.md' },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(result).toEqual({ kind: 'ok' })
  })

  it('returns { kind: "retry" } with the error message on transient failure', async () => {
    const upsertFromFs = vi.fn().mockRejectedValue(new Error('EIO read err'))
    const handler = createIndexRetryHandler({ upsertFromFs })
    const result = await handler({
      job: fakeJob(),
      payload: { path: 'a.md' },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('EIO read err')
      expect(result.delayMs).toBe(0)
    }
  })

  it('throws E_INVALID_PAYLOAD if path missing', async () => {
    const handler = createIndexRetryHandler({ upsertFromFs: vi.fn() })
    await expect(
      handler({
        job: fakeJob({ payload: {} }),
        payload: {},
        log: () => {},
        cancel: new AbortController().signal
      })
    ).rejects.toThrow(/payload\.path/i)
  })
})
