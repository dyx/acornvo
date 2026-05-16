-- Phase 19 · LangGraph SqliteSaver tables
-- Explicit DDL so backup/diagnostic-bundle tools can discover these tables.
-- The library also creates these on first use (CREATE IF NOT EXISTS); these
-- migrations are idempotent with that behavior.

CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint BLOB,
  metadata BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON checkpoints(thread_id);

CREATE TABLE IF NOT EXISTS writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  value BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_writes_thread ON writes(thread_id);

-- Sidecar table tracking thread activity for the 24h retention sweeper
-- (LangGraph's own tables don't store wall-clock activity).
CREATE TABLE IF NOT EXISTS checkpoint_meta (
  thread_id TEXT PRIMARY KEY,
  last_active_at INTEGER NOT NULL,
  canceled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_meta_canceled ON checkpoint_meta(canceled_at);
