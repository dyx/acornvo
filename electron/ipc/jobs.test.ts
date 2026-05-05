import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'
import { createJobStore } from '../queue/store'
import { createJobsHandlers } from './jobs'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'db',
  'migrations'
)

function freshStore(): ReturnType<typeof createJobStore> {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return createJobStore(db)
}

describe('jobs IPC handlers', () => {
  let store: ReturnType<typeof createJobStore>
  let handlers: ReturnType<typeof createJobsHandlers>
  beforeEach(() => {
    store = freshStore()
    handlers = createJobsHandlers({
      getStore: () => store,
      cancelInRunner: (id) => {
        const job = store.getById(id)
        if (!job) return { error: 'E_NOT_FOUND' }
        if (job.status === 'pending') {
          store.markCanceled(id)
          return { ok: true }
        }
        if (job.status === 'running') {
          store.markCanceled(id)
          return { ok: true }
        }
        return { error: 'E_STATUS_NOT_ALLOWED' }
      }
    })
  })

  it('list returns items + total filtered by status', async () => {
    const a = store.enqueue('index-retry', { path: 'a.md' })
    store.enqueue('index-retry', { path: 'b.md' })
    store.markFailed(a.id, 'oops')
    const r = await handlers.list({ status: 'failed', limit: 50, offset: 0 })
    expect(r.total).toBe(1)
    expect(r.items[0].id).toBe(a.id)
  })

  it('retry on failed -> resets attempts to 0 and re-pendings the job', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markRetry(id, 1000, 'EIO')
    store.markFailed(id, 'gave up')
    const r = await handlers.retry(id)
    expect(r).toEqual({ ok: true })
    const j = store.getById(id)!
    expect(j.status).toBe('pending')
    expect(j.attempts).toBe(0)
  })

  it('retry on done -> E_STATUS_NOT_ALLOWED', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    const r = await handlers.retry(id)
    expect(r).toEqual({ error: 'E_STATUS_NOT_ALLOWED' })
  })

  it('retry on missing -> E_NOT_FOUND', async () => {
    const r = await handlers.retry('nope')
    expect(r).toEqual({ error: 'E_NOT_FOUND' })
  })

  it('cancel pending -> ok', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    const r = await handlers.cancel(id)
    expect(r).toEqual({ ok: true })
    expect(store.getById(id)?.status).toBe('canceled')
  })

  it('cancel done -> E_STATUS_NOT_ALLOWED', async () => {
    const { id } = store.enqueue('index-retry', { path: 'a.md' })
    store.markDone(id)
    const r = await handlers.cancel(id)
    expect(r).toEqual({ error: 'E_STATUS_NOT_ALLOWED' })
  })

  it('clearDone removes done rows; preserves failed', async () => {
    const a = store.enqueue('index-retry', { path: 'a.md' })
    const b = store.enqueue('index-retry', { path: 'b.md' })
    const c = store.enqueue('index-retry', { path: 'c.md' })
    store.markDone(a.id)
    store.markDone(b.id)
    store.markFailed(c.id, 'oops')
    const r = await handlers.clearDone()
    expect(r).toEqual({ removed: 2 })
    const remaining = store.list({ limit: 100, offset: 0 })
    expect(remaining.total).toBe(1)
    expect(remaining.items[0].id).toBe(c.id)
  })

  it('list rejects negative limit / offset with IpcError E_INVALID_ARGS', async () => {
    await expect(handlers.list({ limit: -1, offset: 0 })).rejects.toThrow(/E_INVALID_ARGS/)
    await expect(handlers.list({ limit: 50, offset: -1 })).rejects.toThrow(/E_INVALID_ARGS/)
  })
})
