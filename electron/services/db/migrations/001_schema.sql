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
-- files_fts — full-text search (trigram tokenizer)
-- Replaces the phase-05 simple-tokenizer version via DROP IF EXISTS.
-- ============================================================
DROP TABLE IF EXISTS files_fts;
CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
  heading_path,
  title,
  body,
  tokenize='trigram'
);

-- ============================================================
-- bookmarks — saved URLs (final phase-11 schema)
-- ============================================================
DROP TABLE IF EXISTS bookmarks;
CREATE TABLE bookmarks (
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
-- clips — web clipper captures (phase-12)
-- REMOVED: Clips are now just .md documents tracked in files table.
-- ============================================================
DROP TABLE IF EXISTS clips;


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
  role TEXT NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
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
