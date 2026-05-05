import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'
import { createQueueRunner } from './runner'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshStore(): { db: Database.Database; store: ReturnType<typeof createJobStore> } {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return { db, store: createJobStore(db) }
}

describe('createQueueRunner — register + duplicate guard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('rejects duplicate kind registration with E_DUPLICATE_KIND', () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store })
    runner.register({
      kind: 'index-retry',
      concurrency: 4,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    expect(() =>
      runner.register({
        kind: 'index-retry',
        concurrency: 1,
        minGapMs: 0,
        handler: async () => ({ kind: 'ok' })
      })
    ).toThrow(/E_DUPLICATE_KIND/)
  })
})

describe('createQueueRunner — tick picks due jobs', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('picks a pending job whose next_run_at <= now and runs the handler', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const calls: string[] = []
    const runner = createQueueRunner({ store, tickMs: 250 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async ({ payload }) => {
        calls.push((payload as { path: string }).path)
        return { kind: 'ok' }
      }
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300) // > one tick
    expect(calls).toEqual(['a.md'])
    runner.stop()
  })

  it('does NOT pick a job whose next_run_at is in the future', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const ran: string[] = []
    const runner = createQueueRunner({ store, tickMs: 250 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async ({ payload }) => {
        ran.push((payload as { path: string }).path)
        return { kind: 'ok' }
      }
    })
    store.enqueue('index-retry', { path: 'later.md' }, { delayMs: 60_000 })
    runner.start()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(ran).toEqual([])
    runner.stop()
  })

  it('respects concurrency: 2 handlers max for ai-review-clip', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const inFlight: Set<string> = new Set()
    let maxInFlight = 0
    const release: Array<() => void> = []
    const runner = createQueueRunner({ store, tickMs: 250 })
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
    for (let i = 0; i < 5; i++) store.enqueue('ai-review-clip', { clipId: i })
    runner.start()
    await vi.advanceTimersByTimeAsync(500)
    expect(maxInFlight).toBeLessThanOrEqual(2)
    // Drain
    while (release.length) release.shift()!()
    await vi.advanceTimersByTimeAsync(2_000)
    runner.stop()
  })

  it('respects minGapMs: ai-review-clip with minGapMs=500 only picks one per 500ms window', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { store } = freshStore()
    const startedAt: number[] = []
    const runner = createQueueRunner({ store, tickMs: 100, now: () => Date.now() })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 5,
      minGapMs: 500,
      handler: async () => {
        startedAt.push(Date.now())
        return { kind: 'ok' }
      }
    })
    for (let i = 0; i < 3; i++) store.enqueue('ai-review-clip', { clipId: i })
    runner.start()
    // Advance ~1.6s so 3 windows of 500ms elapse
    await vi.advanceTimersByTimeAsync(1_600)
    expect(startedAt.length).toBe(3)
    // Each pick is at least 500ms apart
    for (let i = 1; i < startedAt.length; i++) {
      expect(startedAt[i] - startedAt[i - 1]).toBeGreaterThanOrEqual(500)
    }
    runner.stop()
  })
})

describe('createQueueRunner — handler result branches', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('throws → markRetry with policy.nextDelay(attempts) and the error message', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => {
        throw new Error('boom')
      }
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
      last_error: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('boom')
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(900)
    expect(delta).toBeLessThanOrEqual(1500)
  })

  it('throws on attempts=5 → markFailed (policy returns null)', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    const id = 'doomed'
    db.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      id,
      'index-retry',
      JSON.stringify({ path: 'x.md' }),
      'pending',
      5,
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z'
    )
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => {
        throw new Error('still broken')
      }
    })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT status, last_error FROM jobs WHERE id=?').get(id) as {
      status: string
      last_error: string
    }
    expect(row.status).toBe('failed')
    expect(row.last_error).toBe('still broken')
  })

  it('returns { kind: "fail", error } → markFailed (no retry policy)', async () => {
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'fail', error: 'E_MISSING_PROFILE' })
    })
    const { id } = store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT status, attempts, last_error FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      last_error: string
    }
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(0)
    expect(row.last_error).toBe('E_MISSING_PROFILE')
  })

  it('returns { kind: "retry", delayMs, reason } → markRetry with that delayMs', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'retry', delayMs: 3_600_000, reason: 'E_RATE_LIMITED' })
    })
    const { id } = store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
      last_error: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('E_RATE_LIMITED')
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(3_600_000 - 200)
    expect(delta).toBeLessThanOrEqual(3_600_000 + 1_500)
  })

  it('handler-supplied delayMs ≤ 0 falls back to nextDelay(attempts)', async () => {
    vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'))
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'retry', delayMs: 0, reason: 'oops' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const row = db.prepare('SELECT next_run_at FROM jobs WHERE id=?').get(id) as { next_run_at: string }
    const delta = Date.parse(row.next_run_at) - Date.parse('2026-05-03T10:00:00.000Z')
    expect(delta).toBeGreaterThanOrEqual(900)
    expect(delta).toBeLessThanOrEqual(1500)
  })
})

describe('createQueueRunner — drainOnQuit', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('stops accepting new picks once drain starts', async () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 50 })
    let started = 0
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => {
        started++
        return { kind: 'ok' }
      }
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(150) // a.md runs
    expect(started).toBe(1)
    store.enqueue('index-retry', { path: 'b.md' })
    const drain = runner.drainOnQuit(2_000)
    await vi.advanceTimersByTimeAsync(2_500)
    await drain
    expect(started).toBe(1)
  })

  it('waits up to timeoutMs for in-flight handlers to settle', async () => {
    const { store } = freshStore()
    let resolveHandler!: (r: { kind: 'ok' }) => void
    const runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: () => new Promise<{ kind: 'ok' }>((r) => { resolveHandler = r })
    })
    store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(100)
    const drain = runner.drainOnQuit(5_000)
    await vi.advanceTimersByTimeAsync(200)
    resolveHandler({ kind: 'ok' })
    await vi.advanceTimersByTimeAsync(200)
    await drain
  })

  it('returns even if handlers exceed timeoutMs (best-effort)', async () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: () => new Promise<{ kind: 'ok' }>(() => {}) // never settles
    })
    store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(100)
    const drain = runner.drainOnQuit(500)
    await vi.advanceTimersByTimeAsync(700)
    await drain
  })
})

describe('createQueueRunner — cancel + AbortSignal', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('cancel pending → status=canceled immediately; runner does not pick it', async () => {
    const { db, store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    const r = runner.cancel(id)
    expect(r).toEqual({ ok: true })
    runner.start()
    await vi.advanceTimersByTimeAsync(500)
    runner.stop()
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('canceled')
  })

  it('cancel running → AbortSignal fires, handler co-op exits, status=canceled regardless of return', async () => {
    const { db, store } = freshStore()
    let signaled = false
    let handlerResolve!: (r: { kind: 'ok' }) => void
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: ({ cancel }) => {
        cancel.addEventListener('abort', () => {
          signaled = true
        })
        return new Promise<{ kind: 'ok' }>((resolve) => {
          handlerResolve = resolve
        })
      }
    })
    const { id } = store.enqueue('ai-review-clip', { clipId: 1 })
    runner.start()
    await vi.advanceTimersByTimeAsync(200)
    const r = runner.cancel(id)
    expect(r).toEqual({ ok: true })
    expect(signaled).toBe(true)
    handlerResolve({ kind: 'ok' })
    await vi.advanceTimersByTimeAsync(50)
    runner.stop()
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('canceled')
  })

  it('cancel done → E_STATUS_NOT_ALLOWED', async () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store, tickMs: 100 })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    expect(runner.cancel(id)).toEqual({ error: 'E_STATUS_NOT_ALLOWED' })
  })

  it('cancel non-existent id → E_NOT_FOUND', () => {
    const { store } = freshStore()
    const runner = createQueueRunner({ store })
    expect(runner.cancel('nope')).toEqual({ error: 'E_NOT_FOUND' })
  })
})

describe('createQueueRunner — ops_log integration', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('writes job.enqueued / started / succeeded for the happy path', async () => {
    const { store } = freshStore()
    const events: { op: string; path: string; meta?: Record<string, unknown> }[] = []
    const opsLog = (r: { op: string; path: string; meta?: Record<string, unknown> }) =>
      events.push(r)
    const runner = createQueueRunner({ store, tickMs: 100, opsLog })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    const ops = events.map((e) => e.op)
    expect(ops).toEqual(['job.enqueued', 'job.started', 'job.succeeded'])
    expect(events.every((e) => e.path === 'a.md')).toBe(true)
    expect(events[0].meta).toMatchObject({ kind: 'index-retry' })
  })

  it('writes job.retry on retry / job.failed on fatal', async () => {
    const { store } = freshStore()
    const ops: string[] = []
    const opsLog = (r: { op: string }) => ops.push(r.op)
    const runner = createQueueRunner({ store, tickMs: 100, opsLog })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'fail', error: 'gave up' })
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    runner.stop()
    expect(ops).toEqual(['job.enqueued', 'job.started', 'job.failed'])
  })

  it('writes job.canceled on cancel', async () => {
    const { store } = freshStore()
    const ops: string[] = []
    const opsLog = (r: { op: string }) => ops.push(r.op)
    const runner = createQueueRunner({ store, tickMs: 100, opsLog })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.cancel(id)
    expect(ops).toContain('job.canceled')
  })
})

describe('bootstrapQueueRunner — renderer fan-out', () => {
  it('forwards each stateChanged to the supplied renderers', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const sent: Array<[string, unknown]> = []
    const wc = {
      send: (ch: string, p: unknown) => sent.push([ch, p])
    } as unknown as Electron.WebContents
    const { bootstrapQueueRunner } = await import('./index')
    const runner = bootstrapQueueRunner(db, { getRenderers: () => [wc] })
    runner.stop()
    const { getQueueBootstrap } = await import('./index')
    const { store } = getQueueBootstrap()!
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    expect(sent.length).toBeGreaterThanOrEqual(1)
    expect(sent[0][0]).toBe('jobs:changed')
    expect((sent[0][1] as { id: string }).id).toBe(id)
    db.close()
  })
})
