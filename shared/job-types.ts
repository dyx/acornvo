/**
 * Phase-14 queue persistence — shared types.
 * Used by main (store + runner + IPC), preload (bridge), and renderer (UI).
 */

export const JOB_STATUSES = ['pending', 'running', 'failed', 'done', 'canceled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export function isJobStatus(v: unknown): v is JobStatus {
  return typeof v === 'string' && (JOB_STATUSES as readonly string[]).includes(v)
}

/** Phase-14 ships these two; later phases may register more. */
export const JOB_KINDS = ['ai-review-clip', 'index-retry', 'download-clip-images', 'embed-file'] as const
export type JobKind = (typeof JOB_KINDS)[number]

export function isJobKind(v: unknown): v is JobKind {
  return typeof v === 'string' && (JOB_KINDS as readonly string[]).includes(v)
}

/**
 * The user-facing Job row. Mirrors the SQL schema except:
 *  - `payload_json` is parsed back to `payload` (Record<string, unknown>)
 *  - the `__dedupe` synthetic field is stripped
 *  - timestamps are passed through as ISO-8601 strings
 */
export interface Job {
  id: string
  kind: string // not narrowed to JobKind so unknown future kinds round-trip
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
  nextRunAt: string
  lastError: string | null
  createdAt: string
  updatedAt: string
}

/** Discriminated union returned by handlers. */
export type JobHandlerResult =
  | { kind: 'ok' }
  | { kind: 'retry'; delayMs: number; reason: string }
  | { kind: 'fail'; error: string }

export interface EnqueueOpts {
  /** Defer the first run; default 0. */
  delayMs?: number
  /** When set, an existing pending/running (kind, dedupeKey) returns its id without inserting. */
  dedupeKey?: string
}

/** Filter shape for `jobs.list`. Used by IPC + store. */
export interface JobListFilter {
  kind?: string
  status?: JobStatus
  limit: number
  offset: number
  /** Default `'next_run_at'`; ascending. */
  orderBy?: 'next_run_at' | 'updated_at' | 'created_at'
}
