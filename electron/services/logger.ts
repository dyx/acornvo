/**
 * Stub logger — replaced by electron-log integration in Plan 4 (Task 6.1).
 * Keeps the same public interface so downstream code does not change.
 */

export type Logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => void
  info: (msg: string, ctx?: Record<string, unknown>) => void
  warn: (msg: string, ctx?: Record<string, unknown>) => void
  error: (msg: string, ctx?: Record<string, unknown>) => void
}

export const logger: Logger = {
  debug: (msg, ctx) => console.debug(msg, ctx ?? ''),
  info: (msg, ctx) => console.info(msg, ctx ?? ''),
  warn: (msg, ctx) => console.warn(msg, ctx ?? ''),
  error: (msg, ctx) => console.error(msg, ctx ?? '')
}

export async function initLogger(): Promise<void> {
  // no-op — real initialisation added in Plan 4
}
