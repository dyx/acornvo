-- migration: 005_bookmarks
-- Replaces the old bookmarks table from 001_init with the full phase-11 schema.
-- Old schema: id, url, title, favicon, created_at, sort_order (url NOT NULL, no UNIQUE)
-- New schema: id, url UNIQUE, title, favicon, tags_json, created_at, updated_at, sort_order

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

CREATE INDEX idx_bookmarks_created ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmarks_url ON bookmarks(url);
