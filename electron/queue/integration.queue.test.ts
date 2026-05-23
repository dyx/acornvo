import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'
import { createIndexRetryHandler } from './handlers/index-retry'
import { aiReviewClipHandler } from './handlers/ai-review-clip'
import { createJobsHandlers } from '../ipc/jobs'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshFixture() {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  const store = createJobStore(db)
  return { db, store }
}

// === 10.2 ===
describe('Acceptance 10.2 — clip ai-review-clip enqueued', () => {
  it('enqueueing ai-review-clip via the store reflects in the jobs table', () => {
    const { db, store } = freshFixture()
    store.enqueue(
      'ai-review-clip',
      { clipId: 1, path: 'inbox/202604/a.md' },
      { dedupeKey: 'clip:1' }
    )
    const row = db.prepare('SELECT kind, status FROM jobs LIMIT 1').get() as {
      kind: string
      status: string
    }
    expect(row).toEqual({ kind: 'ai-review-clip', status: 'pending' })
    db.close()
  })
})

// === 10.3 ===
describe('Acceptance 10.3 — ai-review-clip handler retry on E_RATE', () => {
  let runner: QueueRunner
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mock('../../ai/reviewer', () => ({ reviewClip: vi.fn() }))
    vi.mock('../../ai/usage', () => ({ aiUsage: { insert: vi.fn() } }))
    vi.mock('../../settings/store', () => ({ settingsStore: { get: vi.fn(() => ({})) } }))
  })
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('handler catches E_RATE → retry 60s, attempts=1, status=pending', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshFixture()
    const { reviewClip } = await import('../ai/reviewer')
    ;(reviewClip as any).mockRejectedValue(Object.assign(new Error('rate'), { code: 'E_RATE' }))
    runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 2,
      minGapMs: 0,
      handler: aiReviewClipHandler
    })
    const { id } = store.enqueue(
      'ai-review-clip',
      { clipId: 1, path: 'inbox/a.md' },
      { dedupeKey: 'clip:1' }
    )
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    const row = db.prepare('SELECT status, attempts, next_run_at FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(59_000)
    expect(delta).toBeLessThanOrEqual(61_000)
    db.close()
  })
})

// === 10.4 ===
describe('Acceptance 10.4 — dedupeKey idempotency', () => {
  it('second enqueue with same kind + dedupeKey returns existing id and does not insert', () => {
    const { db, store } = freshFixture()
    const a = store.enqueue(
      'ai-review-clip',
      { clipId: 7, path: 'inbox/a.md' },
      { dedupeKey: 'clip:7' }
    )
    const b = store.enqueue(
      'ai-review-clip',
      { clipId: 7, path: 'inbox/a.md' },
      { dedupeKey: 'clip:7' }
    )
    expect(b.id).toBe(a.id)
    const total = (db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n
    expect(total).toBe(1)
    db.close()
  })
})

// === 10.5 ===
describe('Acceptance 10.5 — index-retry backoff to success', () => {
  let runner: QueueRunner
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('two transient EIOs then success → status=done, attempts=2', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshFixture()
    let calls = 0
    runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: createIndexRetryHandler({
        upsertFromFs: async () => {
          calls++
          if (calls < 3) throw new Error('EIO transient')
        }
      })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(7_000)
    const row = db.prepare('SELECT status, attempts FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
    }
    expect(row.status).toBe('done')
    expect(row.attempts).toBe(2)
    expect(calls).toBe(3)
    db.close()
  })
})

// === 10.7 ===
describe('Acceptance 10.7 — jobs.retry resets attempts', () => {
  it('failed → retry → pending, attempts=0', async () => {
    const { db, store } = freshFixture()
    const handlers = createJobsHandlers({
      getStore: () => store,
      cancelInRunner: () => ({ error: 'E_STATUS_NOT_ALLOWED' as const })
    })
    const { id } = store.enqueue('index-retry', { path: 'x.md' })
    store.markRetry(id, 0, 'a')
    store.markRetry(id, 0, 'b')
    store.markRetry(id, 0, 'c')
    store.markRetry(id, 0, 'd')
    store.markFailed(id, 'gave up')
    const before = db.prepare('SELECT attempts, status FROM jobs WHERE id=?').get(id) as {
      attempts: number
      status: string
    }
    expect(before.attempts).toBe(4)
    expect(before.status).toBe('failed')
    const r = await handlers.retry(id)
    expect(r).toEqual({ ok: true })
    const after = db.prepare('SELECT attempts, status FROM jobs WHERE id=?').get(id) as {
      attempts: number
      status: string
      next_run_at: string
    }
    expect(after.attempts).toBe(0)
    expect(after.status).toBe('pending')
    db.close()
  })
})

// === 10.8 ===
describe('Acceptance 10.8 — clearDone removes done, preserves failed', () => {
  it('returns { removed } and leaves failed rows alone', async () => {
    const { db, store } = freshFixture()
    const handlers = createJobsHandlers({
      getStore: () => store,
      cancelInRunner: () => ({ ok: true as const })
    })
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    const c = store.enqueue('index-retry', { path: 'c.md' })
    const d = store.enqueue('index-retry', { path: 'd.md' })
    store.markDone(a.id)
    store.markDone(b.id)
    store.markDone(c.id)
    store.markFailed(d.id, 'oops')
    const r = await handlers.clearDone()
    expect(r).toEqual({ removed: 3 })
    const remaining = db.prepare('SELECT id, status FROM jobs').all() as {
      id: string
      status: string
    }[]
    expect(remaining).toEqual([{ id: d.id, status: 'failed' }])
    db.close()
  })
})

// === 10.12 ===
describe('Acceptance 10.12 — concurrency cap = 2 for ai-review-clip', () => {
  let runner: QueueRunner
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('with 5 enqueued, only 2 are running concurrently', async () => {
    const { db, store } = freshFixture()
    const release: Array<() => void> = []
    const inFlight = new Set<string>()
    let maxInFlight = 0
    runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 2,
      minGapMs: 0,
      handler: ({ job }) =>
        new Promise<{ kind: 'ok' }>((resolve) => {
          inFlight.add(job.id)
          maxInFlight = Math.max(maxInFlight, inFlight.size)
          release.push(() => {
            inFlight.delete(job.id)
            resolve({ kind: 'ok' })
          })
        })
    })
    for (let i = 0; i < 5; i++) store.enqueue('ai-review-clip', { clipId: i, path: `a${i}.md` })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    expect(maxInFlight).toBe(2)
    expect(release.length).toBe(2)
    while (release.length) {
      release.shift()!()
      await vi.advanceTimersByTimeAsync(150)
    }
    expect(maxInFlight).toBe(2)
    const done = (
      db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='done'").get() as { n: number }
    ).n
    expect(done).toBe(5)
    db.close()
  })
})
