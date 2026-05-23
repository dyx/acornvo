import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { userAcornDir } from './paths'

let globalDb: Database.Database | null = null

const GLOBAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  ns TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ns, key)
);
CREATE TABLE IF NOT EXISTS settings_secrets (
  key TEXT PRIMARY KEY,
  encrypted_value BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_provider_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT,
  model TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.7,
  top_p REAL NOT NULL DEFAULT 1.0,
  max_tokens INTEGER,
  api_key_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_profiles_name ON ai_provider_profiles(name);

CREATE TABLE IF NOT EXISTS perf_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  area TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  meta TEXT,
  grove_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_perf_area_ts ON perf_samples(area, ts);

CREATE TABLE IF NOT EXISTS telemetry_local (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  meta TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_telemetry_day_metric ON telemetry_local(day, metric);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  profile_id TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  session_id TEXT,
  grove_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_profile ON ai_usage(profile_id);
`

function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
}

export function initGlobalDb(): void {
  if (globalDb) return
  const dir = userAcornDir()
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'global.db')
  const db = new Database(dbPath)
  applyPragmas(db)
  db.exec(GLOBAL_SCHEMA)

  // Migration: Add grove_id if schema already existed without it
  try {
    const tableInfo = db.pragma('table_info(perf_samples)') as { name: string }[]
    if (!tableInfo.some((c) => c.name === 'grove_id')) {
      db.prepare('ALTER TABLE perf_samples ADD COLUMN grove_id TEXT').run()
    }
  } catch {
    /* ignore */
  }

  try {
    const aiUsageInfo = db.pragma('table_info(ai_usage)') as { name: string }[]
    if (!aiUsageInfo.some((c) => c.name === 'grove_id')) {
      db.prepare('ALTER TABLE ai_usage ADD COLUMN grove_id TEXT').run()
    }
  } catch {
    /* ignore */
  }

  globalDb = db
}

export function getGlobalDb(): Database.Database {
  if (!globalDb) {
    throw new Error('globalDb not initialized')
  }
  return globalDb
}

export function __resetGlobalDbForTest(): void {
  if (globalDb) {
    try {
      globalDb.close()
    } catch {
      /* ignore */
    }
    globalDb = null
  }
}

export function __setGlobalDbForTest(db: Database.Database): void {
  globalDb = db
}
