-- migration: 001_init

-- 文件索引（从 md 同步生成，可随时重建）
CREATE TABLE files (
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
  frontmatter_json TEXT
);

CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_rating ON files(rating);
CREATE INDEX idx_files_content_hash ON files(content_hash);

-- 标签索引（多对多）
CREATE TABLE tags (
  name TEXT PRIMARY KEY,
  usage_count INTEGER DEFAULT 0
);

CREATE TABLE file_tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);

-- 全文搜索（tokenizer=unicode61；中文由应用层 jieba 预分词后写入 content）
CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
  title,
  summary,
  content,
  tokenize='unicode61'
);

-- 标记
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT,
  favicon TEXT,
  created_at TEXT NOT NULL,
  sort_order INTEGER
);

-- 松语对话（元数据索引；消息正文落 .acornvo/chats/<id>.json）
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 持久化队列
CREATE TABLE queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- 'review' | 'reindex' | ...
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,               -- 'pending' | 'running' | 'failed'
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_queue_status ON queue(status);

-- 同一 path 在 pending/running 的 review 任务唯一（payload_json ->> '$.path' 提取 JSON 字段）
CREATE UNIQUE INDEX uq_queue_active_path
  ON queue(payload_json ->> '$.path')
  WHERE status IN ('pending','running') AND kind = 'review';

-- AI 用量记录
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  purpose TEXT NOT NULL,              -- 'review' | 'chat' | 'title-derive'
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL,
  file_path TEXT,
  chat_id TEXT
);
CREATE INDEX idx_usage_ts ON usage(ts);
CREATE INDEX idx_usage_model ON usage(model_id);
CREATE INDEX idx_usage_purpose ON usage(purpose);
