import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import {
  isJobStatus,
  type EnqueueOpts,
  type Job,
  type JobListFilter,
  type JobStatus
} from '@shared/job-types'

interface JobsRow {
  id: string
  kind: string
  payload_json: string
  status: string
  attempts: number
  next_run_at: string
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface JobStoreDeps {
  /** Inject `now()` for tests; defaults to `() => new Date()`. */
  now?: () => Date
  /** Inject id generator for tests; defaults to uuid v4. */
  uuid?: () => string
}

export interface JobStore {
  enqueue(
    kind: string,
    payload: Record<string, unknown>,
    opts?: EnqueueOpts
  ): { id: string }
  markRunning(id: string): void
  markDone(id: string): void
  markRetry(id: string, delayMs: number, reason: string): void
  markFailed(id: string, reason: string): void
  markCanceled(id: string): void
  /** Special path for IPC `jobs.retry`: reset attempts to 0 and re-pending now. */
  resetForManualRetry(id: string): void
  list(filter: JobListFilter): { items: Job[]; total: number }
  getById(id: string): Job | null
  /** Delete all rows with status='done'; returns delete count. */
  clearDone(): { removed: number }
  /** Crash-recovery sweep — see Task 6. */
  recoverRunning(): { restored: number }
}

export function createJobStore(db: Database.Database, deps: JobStoreDeps = {}): JobStore {
  const now = deps.now ?? (() => new Date())
  const uuid = deps.uuid ?? uuidv4

  function rowToJob(row: JobsRow): Job {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    if ('__dedupe' in payload) delete (payload as { __dedupe?: unknown }).__dedupe
    if (!isJobStatus(row.status)) {
      throw new Error(`unexpected job status from db: ${row.status}`)
    }
    return {
      id: row.id,
      kind: row.kind,
      payload,
      status: row.status as JobStatus,
      attempts: row.attempts,
      nextRunAt: row.next_run_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  function enqueue(
    kind: string,
    payload: Record<string, unknown>,
    opts: EnqueueOpts = {}
  ): { id: string } {
    const id = uuid()
    const ts = now().toISOString()
    const nextRunAt = new Date(now().getTime() + (opts.delayMs ?? 0)).toISOString()
    const stored: Record<string, unknown> = { ...payload }
    if (opts.dedupeKey) stored.__dedupe = opts.dedupeKey
    db.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, attempts, next_run_at, last_error, created_at, updated_at)
       VALUES (?,?,?,?,?,?,NULL,?,?)`
    ).run(id, kind, JSON.stringify(stored), 'pending', 0, nextRunAt, ts, ts)
    return { id }
  }

  function markRunning(id: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, updated_at=? WHERE id=?').run('running', ts, id)
  }

  function markDone(id: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, updated_at=? WHERE id=?').run('done', ts, id)
  }

  function markRetry(id: string, delayMs: number, reason: string): void {
    const ts = now().toISOString()
    const nextRunAt = new Date(now().getTime() + delayMs).toISOString()
    db.prepare(
      `UPDATE jobs
       SET status='pending', attempts = attempts + 1, next_run_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextRunAt, reason, ts, id)
  }

  function markFailed(id: string, reason: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, last_error=?, updated_at=? WHERE id=?').run(
      'failed',
      reason,
      ts,
      id
    )
  }

  function markCanceled(id: string): void {
    const ts = now().toISOString()
    db.prepare('UPDATE jobs SET status=?, updated_at=? WHERE id=?').run('canceled', ts, id)
  }

  function resetForManualRetry(id: string): void {
    const ts = now().toISOString()
    db.prepare(
      `UPDATE jobs
       SET status='pending', attempts = 0, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(ts, ts, id)
  }

  function list(filter: JobListFilter): { items: Job[]; total: number } {
    const where: string[] = []
    const params: unknown[] = []
    if (filter.kind) {
      where.push('kind = ?')
      params.push(filter.kind)
    }
    if (filter.status) {
      where.push('status = ?')
      params.push(filter.status)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const orderCol = filter.orderBy ?? 'next_run_at'
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM jobs ${whereSql}`).get(...params) as { n: number }
    ).n
    const rows = db
      .prepare(
        `SELECT * FROM jobs ${whereSql} ORDER BY ${orderCol} ASC LIMIT ? OFFSET ?`
      )
      .all(...params, filter.limit, filter.offset) as JobsRow[]
    return { items: rows.map(rowToJob), total }
  }

  function getById(id: string): Job | null {
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as JobsRow | undefined
    return row ? rowToJob(row) : null
  }

  function clearDone(): { removed: number } {
    const info = db.prepare("DELETE FROM jobs WHERE status='done'").run()
    return { removed: info.changes }
  }

  function recoverRunning(): { restored: number } {
    const ts = now().toISOString()
    const info = db
      .prepare("UPDATE jobs SET status='pending', updated_at=? WHERE status='running'")
      .run(ts)
    return { restored: info.changes }
  }

  return {
    enqueue,
    markRunning,
    markDone,
    markRetry,
    markFailed,
    markCanceled,
    resetForManualRetry,
    list,
    getById,
    clearDone,
    recoverRunning
  }
}
