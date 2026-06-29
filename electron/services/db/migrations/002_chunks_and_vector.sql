-- Add vector search tables
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

-- Recreate FTS index with unicode61 tokenizer (replaces trigram for v1.0.0 users)
DROP TABLE IF EXISTS files_fts;
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  chunk_id UNINDEXED,
  path UNINDEXED,
  heading_path,
  title,
  body,
  tokenize='unicode61 remove_diacritics 1'
);
