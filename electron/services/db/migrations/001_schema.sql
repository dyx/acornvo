-- Acornvo consolidated schema
-- All tables in their final form. The migration runner sets user_version
-- from the filename prefix (001).

-- ============================================================
-- files — document index (from md sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  title TEXT,
  url TEXT,
  category TEXT,
  rating INTEGER,
  summary TEXT,
  clipped_at TEXT,
  reviewed_at TEXT,
  mtime INTEGER NOT NULL,
  content_hash TEXT,
  frontmatter_json TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
CREATE INDEX IF NOT EXISTS idx_files_rating ON files(rating);
CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash);

-- ============================================================
-- tags — many-to-many labels
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  name TEXT PRIMARY KEY,
  usage_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS file_tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag),
  FOREIGN KEY (path) REFERENCES files(path) ON DELETE CASCADE
);

-- ============================================================
-- files_fts — full-text search (trigram tokenizer)
-- Replaces the phase-05 simple-tokenizer version via DROP IF EXISTS.
-- ============================================================
DROP TABLE IF EXISTS files_fts;
CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
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
-- chats — conversation metadata (messages in .acornvo/chats/<id>.json)
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================================
-- queue — legacy queue (phase-03; superseded by jobs table)
-- ============================================================
DROP TABLE IF EXISTS queue;
CREATE TABLE queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_active_path
  ON queue(payload_json ->> '$.path')
  WHERE status IN ('pending','running') AND kind = 'review';

-- ============================================================
-- usage — AI usage records (phase-03 legacy; superseded by ai_usage table)
-- ============================================================
DROP TABLE IF EXISTS usage;
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  purpose TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL,
  file_path TEXT,
  chat_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(ts);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model_id);
CREATE INDEX IF NOT EXISTS idx_usage_purpose ON usage(purpose);

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
-- ============================================================
CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  site TEXT,
  author TEXT,
  published_at TEXT,
  clipped_at TEXT NOT NULL,
  excerpt TEXT,
  content_length INTEGER,
  degraded INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clips_clipped_at ON clips(clipped_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_site ON clips(site);

-- ============================================================
-- settings — per-grove application settings (phase-13)
-- ============================================================
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

-- ============================================================
-- ai_provider_profiles — AI provider configurations (phase-13)
-- ============================================================
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
-- ai_usage — per-LLM-call usage tracking (phase-15)
-- ============================================================
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
  session_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_profile ON ai_usage(profile_id);

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
-- perf_samples — performance sampling (phase-18)
-- ============================================================
CREATE TABLE IF NOT EXISTS perf_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  area TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_perf_area_ts ON perf_samples(area, ts);

-- ============================================================
-- telemetry_local — local usage telemetry (phase-18)
-- ============================================================
CREATE TABLE IF NOT EXISTS telemetry_local (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  meta TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_telemetry_day_metric ON telemetry_local(day, metric);
