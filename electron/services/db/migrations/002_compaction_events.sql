-- 002_compaction_events.sql
CREATE TABLE IF NOT EXISTS compaction_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  pre_message_count INTEGER NOT NULL,
  post_message_count INTEGER NOT NULL,
  pre_token_est INTEGER NOT NULL,
  post_token_est INTEGER NOT NULL,
  trigger TEXT,
  reason TEXT,
  token_method TEXT NOT NULL DEFAULT 'acornvo.estimateTokens.v1',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compaction_events_session ON compaction_events(session_id);
