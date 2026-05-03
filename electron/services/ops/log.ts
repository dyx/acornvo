import { getCurrent } from '../db'
import { logger } from '../logger'
import type {
  Op,
  OpsItem,
  OpsLogListOptions,
  OpsLogListResult,
  OpsLogRecordInput
} from '@shared/ops-types'

/** Retention: drop entries older than 90 days. */
const PRUNE_AGE_SQL = `DELETE FROM ops_log WHERE ts < datetime('now', '-90 days')`

/** Retention: hard cap of 10000 most-recent entries. */
const PRUNE_CAP = 10000
const PRUNE_CAP_SQL = `
  DELETE FROM ops_log
  WHERE id NOT IN (
    SELECT id FROM ops_log ORDER BY ts DESC LIMIT ?
  )
`

const INSERT_SQL = `
  INSERT INTO ops_log (op, path, ts, meta_json)
  VALUES (?, ?, ?, ?)
`

/**
 * Record a single op into ops_log.
 *
 * Behaviour:
 *  - Prune-then-insert runs in a single SQLite transaction.
 *  - Prune deletes rows older than 90 days, then enforces a 10000 row cap.
 *  - meta is JSON-stringified; pass `undefined` for `meta_json=NULL`.
 *  - Failures are logged but NOT rethrown — ops_log is best-effort audit.
 */
export function record(input: OpsLogRecordInput): void {
  const db = getCurrent()
  if (!db) return

  const ts = new Date().toISOString()
  const metaJson = input.meta ? JSON.stringify(input.meta) : null

  const tx = db.transaction((op: Op, path: string, ts: string, metaJson: string | null) => {
    db.prepare(PRUNE_AGE_SQL).run()
    db.prepare(PRUNE_CAP_SQL).run(PRUNE_CAP)
    db.prepare(INSERT_SQL).run(op, path, ts, metaJson)
  })

  try {
    tx(input.op, input.path, ts, metaJson)
  } catch (err) {
    logger.warn('opsLog.record failed (non-fatal)', {
      op: input.op,
      path: input.path,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

/**
 * List ops_log entries. Returned in `ts DESC` order.
 *
 * `op` filter is optional. `total` is the count matching the filter
 * (NOT capped by `limit`).
 */
export function list(opts: OpsLogListOptions): OpsLogListResult {
  const db = getCurrent()
  if (!db) return { items: [], total: 0 }

  const where = opts.op ? `WHERE op = ?` : ``
  const args: unknown[] = opts.op ? [opts.op] : []
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ops_log ${where}`)
    .get(...args) as { n: number }
  const itemRows = db
    .prepare(
      `SELECT id, op, path, ts, meta_json FROM ops_log ${where}
       ORDER BY ts DESC LIMIT ? OFFSET ?`
    )
    .all(...args, opts.limit, opts.offset) as Array<{
    id: number
    op: string
    path: string
    ts: string
    meta_json: string | null
  }>
  const items: OpsItem[] = itemRows.map((r) => ({
    id: r.id,
    op: r.op as Op,
    path: r.path,
    ts: r.ts,
    meta: r.meta_json ? safeParse(r.meta_json) : null
  }))
  return { items, total: totalRow.n }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Internal accessors for tests
export const _internals = {
  PRUNE_CAP,
  PRUNE_AGE_SQL,
  PRUNE_CAP_SQL
}
