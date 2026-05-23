import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

describe('Acceptance 10.11 — ops_log row per state transition', () => {
  let runner: QueueRunner
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    runner?.stop()
    vi.useRealTimers()
  })

  it('records job.enqueued / job.started / job.succeeded for the happy path', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const store = createJobStore(db)
    const ops: { op: string; path: string; meta?: Record<string, unknown> }[] = []
    runner = createQueueRunner({ store, tickMs: 50, opsLog: (r) => ops.push(r) })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    store.enqueue('index-retry', { path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    const opNames = ops.map((o) => o.op)
    expect(opNames).toEqual(['job.enqueued', 'job.started', 'job.succeeded'])
    expect(ops.every((o) => o.path === 'a.md')).toBe(true)
    expect(ops[0].meta).toMatchObject({ kind: 'index-retry' })
    db.close()
  })

  it('records job.failed when handler returns { kind: "fail" }', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const store = createJobStore(db)
    const ops: string[] = []
    runner = createQueueRunner({ store, tickMs: 50, opsLog: (r) => ops.push(r.op) })
    runner.register({
      kind: 'ai-review-clip',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'fail', error: 'E_MISSING_PROFILE' })
    })
    store.enqueue('ai-review-clip', { clipId: 1, path: 'a.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(300)
    expect(ops).toContain('job.failed')
    db.close()
  })

  it('records job.canceled when cancel is called', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    const store = createJobStore(db)
    const ops: string[] = []
    runner = createQueueRunner({ store, tickMs: 50, opsLog: (r) => ops.push(r.op) })
    runner.register({
      kind: 'index-retry',
      concurrency: 1,
      minGapMs: 0,
      handler: async () => ({ kind: 'ok' })
    })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    runner.cancel(id)
    expect(ops).toContain('job.canceled')
    db.close()
  })
})
