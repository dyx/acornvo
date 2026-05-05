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
