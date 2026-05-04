-- migration: 007_settings
-- Adds the application settings + secrets + AI provider profile tables.
-- Settings live in the per-grove DB; secret BLOBs are encrypted via Electron
-- safeStorage (OS user keychain) before write, so they are unreadable on a
-- different machine even if this DB file is copied.

CREATE TABLE settings (
  ns TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ns, key)
);

CREATE TABLE settings_secrets (
  key TEXT PRIMARY KEY,
  encrypted_value BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_provider_profiles (
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

CREATE UNIQUE INDEX idx_ai_profiles_name ON ai_provider_profiles(name);
