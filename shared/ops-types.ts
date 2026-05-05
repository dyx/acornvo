/**
 * Op enum — the set of operations recorded in ops_log.
 * Keep in sync with shared/ipc-contract.ts and migration 003.
 */
export type Op =
  | 'trash'
  | 'hard_delete'
  | 'conflict_resolve'
  | 'conflict_delete'
  | 'rename'
  | 'job.enqueued'
  | 'job.started'
  | 'job.succeeded'
  | 'job.retry'
  | 'job.failed'
  | 'job.canceled'

/**
 * One row of ops_log as exposed to the renderer.
 * `meta` is already JSON.parse'd (callers do not parse).
 */
export interface OpsItem {
  id: number
  op: Op
  path: string // grove-relative POSIX path; for rename this is `old_path`
  ts: string // ISO-8601 UTC, e.g. 2026-04-30T12:30:45.123Z
  meta: Record<string, unknown> | null
}

/**
 * Input shape for opsLog.record.
 * `path` is grove-relative POSIX. `meta` is serialised to JSON internally.
 */
export interface OpsLogRecordInput {
  op: Op
  path: string
  meta?: Record<string, unknown>
}

/**
 * Pagination query for ops.list.
 */
export interface OpsLogListOptions {
  limit: number
  offset: number
  op?: Op
}

export interface OpsLogListResult {
  items: OpsItem[]
  total: number
}
