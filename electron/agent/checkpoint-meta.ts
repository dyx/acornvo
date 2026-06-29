import { dbService } from '../services/db'

/** Records that a thread is currently active (or has just been resumed). */
export function markThreadActive(threadId: string): void {
  const db = dbService.requireCurrent()
  const now = Date.now()
  db.prepare(
    `
    INSERT INTO checkpoint_meta (thread_id, last_active_at, canceled_at)
    VALUES (?, ?, NULL)
    ON CONFLICT(thread_id) DO UPDATE SET last_active_at = excluded.last_active_at, canceled_at = NULL
  `
  ).run(threadId, now)
}

/**
 * Marks a thread as canceled at "now".
 */
export function markThreadCanceled(threadId: string): void {
  const db = dbService.requireCurrent()
  const now = Date.now()
  db.prepare(
    `
    INSERT INTO checkpoint_meta (thread_id, last_active_at, canceled_at)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET canceled_at = excluded.canceled_at
  `
  ).run(threadId, now, now)
}
