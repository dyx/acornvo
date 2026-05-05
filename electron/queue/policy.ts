const TABLE: readonly number[] = [1_000, 5_000, 30_000, 120_000, 900_000]

/**
 * Exponential-ish backoff for queue retries.
 * Returns ms to wait before the next attempt, or `null` to indicate "give up".
 *
 *   attempts=0 →   1s
 *   attempts=1 →   5s
 *   attempts=2 →  30s
 *   attempts=3 →   2m
 *   attempts=4 →  15m
 *   attempts ≥5 → null  (runner will markFailed)
 */
export function nextDelay(attempts: number): number | null {
  if (!Number.isInteger(attempts) || attempts < 0 || attempts >= TABLE.length) return null
  return TABLE[attempts] as number
}
