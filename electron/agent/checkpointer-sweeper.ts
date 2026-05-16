import { dbService } from '../services/db';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export interface SweepResult {
  removed: string[];
}

/**
 * Deletes checkpointer state for threads that are either:
 *  - canceled more than 24h ago, OR
 *  - idle (no activity) for more than 24h.
 *
 * Sessions that haven't been touched at all (no `checkpoint_meta` row) are not
 * swept by this query — those are usually brand-new sessions awaiting their
 * first message, and removing them would race the first send.
 */
export function sweepStaleThreads(nowMs: number = Date.now()): SweepResult {
  const cutoff = nowMs - DAY_MS;
  const db = dbService.requireCurrent();
  const stale = db
    .prepare(
      `SELECT thread_id FROM checkpoint_meta
       WHERE (canceled_at IS NOT NULL AND canceled_at <= ?)
          OR (canceled_at IS NULL AND last_active_at <= ?)`,
    )
    .all(cutoff, cutoff) as Array<{ thread_id: string }>;

  if (stale.length === 0) return { removed: [] };

  const removed: string[] = [];
  const tx = db.transaction(() => {
    for (const { thread_id } of stale) {
      db.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(thread_id);
      db.prepare('DELETE FROM writes WHERE thread_id = ?').run(thread_id);
      db.prepare('DELETE FROM checkpoint_meta WHERE thread_id = ?').run(thread_id);
      removed.push(thread_id);
    }
  });
  tx();
  return { removed };
}

let timer: NodeJS.Timeout | null = null;

export function startSweeper(intervalMs: number = DEFAULT_INTERVAL_MS): () => void {
  stopSweeper();
  timer = setInterval(() => {
    try {
      sweepStaleThreads();
    } catch {
      /* best effort */
    }
  }, intervalMs);
  // Prevent timer from keeping the event loop alive in tests / quit.
  timer.unref?.();
  return stopSweeper;
}

export function stopSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
