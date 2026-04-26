// electron/services/db.ts
import Database from 'better-sqlite3'
import { renameSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IpcError } from '@shared/ipc-contract'
import { runMigrations } from './db/migrations'
import { migrationsDir } from './db/migrations/index'

let current: Database.Database | null = null
// @ts-ignore TS6133 — write-only in skeleton; read by later tasks (openForGrove, closeCurrent)
let currentGrovePath: string | null = null

export function getCurrent(): Database.Database | null {
  return current
}

export function requireCurrent(): Database.Database {
  if (!current) {
    throw new IpcError('E_NOT_FOUND', 'no grove opened')
  }
  return current
}

export function getCurrentGrovePath(): string | null {
  return currentGrovePath
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

type WindowLike = { webContents: { send: (channel: string, payload?: unknown) => void } }

let mainWindowForTest: WindowLike | null = null
export function __setMainWindowForTest(win: WindowLike | null): void {
  mainWindowForTest = win
}

function getMainWindow(): WindowLike | null {
  if (mainWindowForTest) return mainWindowForTest
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const main = require('../main') as { mainWindow: WindowLike | null }
    return main.mainWindow ?? null
  } catch {
    return null
  }
}

function emit(channel: 'db:rebuilding' | 'db:rebuilt'): void {
  const win = getMainWindow()
  try {
    win?.webContents.send(channel)
  } catch {
    /* renderer may have been destroyed; safe to ignore */
  }
}

export function backupCorruptDb(grovePath: string): void {
  const acorn = join(grovePath, '.acornvo')
  const base = join(acorn, 'index.db')
  if (!existsSync(base)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  for (const suffix of ['', '-wal', '-shm']) {
    const src = base + suffix
    if (existsSync(src)) {
      const dst = join(acorn, `index.db.corrupt-${stamp}${suffix}`)
      renameSync(src, dst)
    }
  }
  emit('db:rebuilding')
}

export function emitRebuilt(): void {
  emit('db:rebuilt')
}

export function closeCurrent(): void {
  if (!current) return
  try {
    try {
      current.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      try {
        current.pragma('wal_checkpoint(PASSIVE)')
      } catch {
        /* ignore */
      }
    }
    current.close()
  } finally {
    current = null
    currentGrovePath = null
  }
}

export function openForGrove(grovePath: string): void {
  closeCurrent()
  mkdirSync(join(grovePath, '.acornvo'), { recursive: true })
  const file = join(grovePath, '.acornvo', 'index.db')
  let db = new Database(file)
  applyPragmas(db)
  if (integrityCheck(db) !== 'ok') {
    db.close()
    backupCorruptDb(grovePath)
    db = new Database(file)
    applyPragmas(db)
    runMigrations(db, migrationsDir())
    current = db
    currentGrovePath = grovePath
    emitRebuilt()
    return
  }
  runMigrations(db, migrationsDir())
  current = db
  currentGrovePath = grovePath
}
