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

CREATE TABLE IF NOT EXISTS ai_provider (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT,
  api_key_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_name ON ai_provider(name);

CREATE TABLE IF NOT EXISTS ai_model (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  context_window INTEGER DEFAULT 128000,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(provider_id) REFERENCES ai_provider(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_model_provider ON ai_model(provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_model_provider_name ON ai_model(provider_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_model_provider_display_name ON ai_model(provider_id, display_name);


CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  model_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cache_read_tokens INTEGER DEFAULT 0,
  reasoning_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  raw_usage_json TEXT,
  session_id TEXT,
  grove_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage(model_id);
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

  // Migration: add context_window if it doesn't exist
  try {
    const columns = db.pragma('table_info(ai_model)') as any[]
    if (!columns.find((c) => c.name === 'context_window')) {
      db.exec('ALTER TABLE ai_model ADD COLUMN context_window INTEGER DEFAULT 128000')
    }
  } catch (err) {
    console.error('Failed to migrate ai_model context_window', err)
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
