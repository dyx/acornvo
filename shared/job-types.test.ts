// shared/job-types.test.ts
import { describe, it, expect } from 'vitest'
import {
  JOB_STATUSES,
  isJobStatus,
  isJobKind,
  type Job,
  type JobHandlerResult,
  type EnqueueOpts
} from './job-types'

describe('JOB_STATUSES set', () => {
  it('contains the five locked statuses', () => {
    expect(new Set(JOB_STATUSES)).toEqual(
      new Set(['pending', 'running', 'failed', 'done', 'canceled'])
    )
  })
})

describe('isJobStatus type guard', () => {
  it('returns true for known statuses', () => {
    for (const s of JOB_STATUSES) expect(isJobStatus(s)).toBe(true)
  })
  it('returns false for unknown values', () => {
    expect(isJobStatus('queued')).toBe(false)
    expect(isJobStatus(undefined)).toBe(false)
    expect(isJobStatus(42 as unknown)).toBe(false)
  })
})

describe('isJobKind type guard', () => {
  it('accepts the two phase-14 kinds', () => {
    expect(isJobKind('ai-review-clip')).toBe(true)
    expect(isJobKind('index-retry')).toBe(true)
  })
  it('rejects unknown kinds', () => {
    expect(isJobKind('email-blast')).toBe(false)
  })
})

describe('Job shape', () => {
  it('compiles with required fields', () => {
    const j: Job = {
      id: 'j-1',
      kind: 'index-retry',
      payload: { path: 'a.md' },
      status: 'pending',
      attempts: 0,
      nextRunAt: '2026-05-03T00:00:00.000Z',
      lastError: null,
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z'
    }
    expect(j.id).toBe('j-1')
  })
})

describe('JobHandlerResult shape', () => {
  it('discriminates on `kind`', () => {
    const ok: JobHandlerResult = { kind: 'ok' }
    const retry: JobHandlerResult = { kind: 'retry', delayMs: 1000, reason: 'EIO' }
    const fail: JobHandlerResult = { kind: 'fail', error: 'E_MISSING_PROFILE' }
    expect(ok.kind).toBe('ok')
    expect(retry.kind).toBe('retry')
    expect(fail.kind).toBe('fail')
  })
})

describe('EnqueueOpts shape', () => {
  it('allows delayMs and dedupeKey to be optional', () => {
    const a: EnqueueOpts = {}
    const b: EnqueueOpts = { delayMs: 5000 }
    const c: EnqueueOpts = { dedupeKey: 'clip:1' }
    const d: EnqueueOpts = { delayMs: 5000, dedupeKey: 'clip:1' }
    expect([a, b, c, d].length).toBe(4)
  })
})
