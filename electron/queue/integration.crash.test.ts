import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { __resetForTest, closeCurrent, openForGrove, requireCurrent } from '../services/db'
import { createJobStore } from './store'
import { createQueueRunner } from './runner'

// === 10.9 ===
describe('Acceptance 10.9 — crash recovery resets running → pending', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'p14-crash-')); __resetForTest() })
  afterEach(() => { closeCurrent(); __resetForTest(); rmSync(dir, { recursive: true, force: true }) })

  it('a running job becomes pending after grove reopen', () => {
    openForGrove(dir)
    const db1 = requireCurrent()
    db1.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run('crashed', 'ai-review-clip', JSON.stringify({ clipId: 1, path: 'inbox/a.md' }),
      'running', 2, '2026-05-03T10:00:00.000Z', '2026-05-03T10:00:00.000Z', '2026-05-03T10:00:00.000Z')
    closeCurrent()

    openForGrove(dir)
    const db2 = requireCurrent()
    const row = db2.prepare('SELECT status, attempts FROM jobs WHERE id=?').get('crashed') as { status: string; attempts: number }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(2)
  })
})

// === 10.10 ===
describe('Acceptance 10.10 — before-quit drains running handlers', () => {
  it('drainOnQuit waits for in-flight handler then resolves; pending rows preserved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const dir = mkdtempSync(join(tmpdir(), 'p14-drain-'))
    __resetForTest()
    openForGrove(dir)
    const db = requireCurrent()
    const store = createJobStore(db)
    let resolveHandler!: (r: { kind: 'ok' }) => void
    const runner = createQueueRunner({ store, tickMs: 50 })
    runner.register({
      kind: 'ai-review-clip', concurrency: 1, minGapMs: 0,
      handler: () => new Promise<{ kind: 'ok' }>((r) => { resolveHandler = r })
    })
    const { id: running } = store.enqueue('ai-review-clip', { clipId: 1, path: 'a.md' })
    const { id: pending } = store.enqueue('ai-review-clip', { clipId: 2, path: 'b.md' })
    runner.start()
    await vi.advanceTimersByTimeAsync(120)
    const drain = runner.drainOnQuit(5_000)
    resolveHandler({ kind: 'ok' })
    await vi.advanceTimersByTimeAsync(200)
    await drain
    const r1 = db.prepare('SELECT status FROM jobs WHERE id=?').get(running) as { status: string }
    const r2 = db.prepare('SELECT status FROM jobs WHERE id=?').get(pending) as { status: string }
    expect(r1.status).toBe('done')
    expect(r2.status).toBe('pending')
    closeCurrent()
    rmSync(dir, { recursive: true, force: true })
    vi.useRealTimers()
  })
})
