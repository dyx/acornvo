// electron/services/db.ts
import type Database from 'better-sqlite3'

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
