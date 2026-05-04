import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from './store'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return db
}

describe('createJobStore — enqueue (no dedupe)', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('inserts a pending job with attempts=0 and next_run_at ≈ now', () => {
    const store = createJobStore(db, { now: () => new Date('2026-05-03T10:00:00.000Z') })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    expect(typeof id).toBe('string')
    expect(id).toMatch(/^[0-9a-f-]{36}$/i) // uuid v4 shape

    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      kind: string
      payload_json: string
      status: string
      attempts: number
      next_run_at: string
      last_error: string | null
    }
    expect(row.kind).toBe('index-retry')
    expect(JSON.parse(row.payload_json)).toEqual({ path: 'a.md' })
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(0)
    expect(row.next_run_at).toBe('2026-05-03T10:00:00.000Z')
    expect(row.last_error).toBe(null)
  })

  it('respects opts.delayMs', () => {
    const store = createJobStore(db, { now: () => new Date('2026-05-03T10:00:00.000Z') })
    const { id } = store.enqueue('index-retry', { path: 'a.md' }, { delayMs: 5000 })
    const row = db.prepare('SELECT next_run_at FROM jobs WHERE id=?').get(id) as { next_run_at: string }
    expect(row.next_run_at).toBe('2026-05-03T10:00:05.000Z')
  })
})

describe('createJobStore — status mutations', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('markRunning sets status=running + bumps updated_at', () => {
    const t0 = new Date('2026-05-03T10:00:00.000Z')
    const t1 = new Date('2026-05-03T10:00:01.000Z')
    let now = t0
    const store = createJobStore(db, { now: () => now })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    now = t1
    store.markRunning(id)
    const row = db.prepare('SELECT status, updated_at FROM jobs WHERE id=?').get(id) as {
      status: string
      updated_at: string
    }
    expect(row.status).toBe('running')
    expect(row.updated_at).toBe('2026-05-03T10:00:01.000Z')
  })

  it('markDone sets status=done', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('done')
  })

  it('markRetry increments attempts, sets next_run_at, updates last_error, status=pending', () => {
    const t0 = new Date('2026-05-03T10:00:00.000Z')
    const t1 = new Date('2026-05-03T10:00:30.000Z')
    let now = t0
    const store = createJobStore(db, { now: () => now })
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markRunning(id)
    now = t1
    store.markRetry(id, 30_000, 'E_NET')
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {
      status: string
      attempts: number
      next_run_at: string
      last_error: string
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.next_run_at).toBe('2026-05-03T10:01:00.000Z') // t1 + 30s
    expect(row.last_error).toBe('E_NET')
  })

  it('markFailed sets status=failed + last_error', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markFailed(id, 'gave up')
    const row = db.prepare('SELECT status, last_error FROM jobs WHERE id=?').get(id) as {
      status: string
      last_error: string
    }
    expect(row.status).toBe('failed')
    expect(row.last_error).toBe('gave up')
  })

  it('markCanceled sets status=canceled', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markCanceled(id)
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as { status: string }
    expect(row.status).toBe('canceled')
  })
})

describe('createJobStore — list & getById', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => db.close())

  it('list filters by kind and status, returns items + total', () => {
    const store = createJobStore(db)
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    const c = store.enqueue('ai-review-clip', { clipId: 1 })
    store.markFailed(a.id, 'oops')

    const failed = store.list({ status: 'failed', limit: 50, offset: 0 })
    expect(failed.total).toBe(1)
    expect(failed.items.map((j) => j.id)).toEqual([a.id])

    const aiOnly = store.list({ kind: 'ai-review-clip', limit: 50, offset: 0 })
    expect(aiOnly.total).toBe(1)
    expect(aiOnly.items[0].id).toBe(c.id)

    const all = store.list({ limit: 50, offset: 0 })
    expect(all.total).toBe(3)
    expect(all.items.map((j) => j.id)).toContain(b.id)
  })

  it('list strips the synthetic __dedupe field from payload', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' }, { dedupeKey: 'idx:a.md' })
    const out = store.list({ limit: 50, offset: 0 })
    const row = out.items.find((j) => j.id === id)!
    expect('__dedupe' in row.payload).toBe(false)
    expect(row.payload).toEqual({ path: 'a.md' })
  })

  it('getById returns the parsed Job or null', () => {
    const store = createJobStore(db)
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    const job = store.getById(id)
    expect(job?.id).toBe(id)
    expect(job?.payload).toEqual({ path: 'a.md' })
    expect(store.getById('does-not-exist')).toBe(null)
  })

  it('list orders by next_run_at ASC by default', () => {
    const t0 = new Date('2026-05-03T10:00:00.000Z')
    let now = t0
    const store = createJobStore(db, { now: () => now })
    const { id: first } = store.enqueue('index-retry', { path: 'a.md' })
    now = new Date('2026-05-03T10:00:05.000Z')
    const { id: second } = store.enqueue('index-retry', { path: 'b.md' })
    const out = store.list({ limit: 50, offset: 0 })
    expect(out.items.map((j) => j.id)).toEqual([first, second])
  })
})
