// electron/services/db.ts
import Database from 'better-sqlite3'

let current: Database.Database | null = null
// @ts-ignore TS6133 — write-only in skeleton; read by later tasks (openForGrove, closeCurrent)
let currentGrovePath: string | null = null

export function getCurrent(): Database.Database | null {
  return current
}

// Stubs (filled in by later tasks)
export const dbService = {
  getCurrent
}

// Test-only escape hatch — removed in production builds via tree-shaking when unused.
export function __resetForTest(): void {
  if (current) {
    try {
      current.close()
    } catch {
      /* ignore */
    }
  }
  current = null
  currentGrovePath = null
}

export function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -20000')
  db.pragma('mmap_size = 268435456')
}

export function integrityCheck(db: Database.Database): string {
  const r = db.pragma('integrity_check', { simple: true }) as string
  return r
}
