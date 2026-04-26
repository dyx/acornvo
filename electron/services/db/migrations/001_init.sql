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
