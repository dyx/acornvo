-- Acornvo consolidated schema
-- All tables in their final form. The migration runner sets user_version
-- from the filename prefix (001).

-- ============================================================
-- files — document index (from md sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  mtime INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  frontmatter_json TEXT NOT NULL DEFAULT '{}',

  title TEXT GENERATED ALWAYS AS (json_extract(frontmatter_json, '$.title')) VIRTUAL,
  url TEXT GENERATED ALWAYS AS (json_extract(frontmatter_json, '$.url')) VIRTUAL,
  category TEXT GENERATED ALWAYS AS (json_extract(frontmatter_json, '$.category')) VIRTUAL,
  summary TEXT GENERATED ALWAYS AS (json_extract(frontmatter_json, '$.summary')) VIRTUAL,
  clipped_at TEXT GENERATED ALWAYS AS (json_extract(frontmatter_json, '$.clipped_at')) VIRTUAL,
  reviewed_at TEXT GENERATED ALWAYS AS (json_extract(frontmatter_json, '$.reviewed_at')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash);


-- ============================================================
-- files_fts — full-text search (unicode61 tokenizer)
-- ============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  chunk_id UNINDEXED,
  path UNINDEXED,
  heading_path,
  title,
  body,
  tokenize='unicode61 remove_diacritics 1'
);

-- ============================================================
-- chunks & chunk_vectors — semantic search
-- ============================================================
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  heading_path TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  model_id TEXT,
  embedded_at TEXT,
  FOREIGN KEY(path) REFERENCES files(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
CREATE INDEX IF NOT EXISTS idx_chunks_unembedded ON chunks(path) WHERE embedded_at IS NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
  rowid INTEGER PRIMARY KEY,
  embedding FLOAT[512] distance_metric=cosine
);

-- ============================================================
-- bookmarks — saved URLs (final phase-11 schema)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  favicon TEXT,
  tags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);


-- ============================================================
-- ops_log — operation audit log (phase-03)
-- ============================================================
CREATE TABLE IF NOT EXISTS ops_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  path TEXT NOT NULL,
  ts TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_ops_log_ts ON ops_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ops_log_op_ts ON ops_log(op, ts DESC);


-- ============================================================
-- jobs — persistent job queue (phase-14)
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run ON jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_kind_status ON jobs(kind, status);


-- ============================================================
-- sessions / messages / tool_calls — chat history (phase-16)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  profile_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  parent_id INTEGER,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  usage_json TEXT,
  attachments_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES session_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, id);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id INTEGER,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_json TEXT,
  approved INTEGER,
  started_at TEXT,
  finished_at TEXT,
  error TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES session_messages(id)
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);

-- ============================================================
-- LangGraph SqliteSaver tables (Phase 19)
-- ============================================================
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

CREATE TABLE IF NOT EXISTS checkpoint_meta (
  thread_id TEXT PRIMARY KEY,
  last_active_at INTEGER NOT NULL,
  canceled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_meta_canceled ON checkpoint_meta(canceled_at);

-- ============================================================
-- compaction_events (phase-16 context management)
-- ============================================================
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
