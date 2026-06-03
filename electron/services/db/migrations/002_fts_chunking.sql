-- Phase 20: FTS5 Chunking & Multi-Query Expansion
-- Drop the monolithic file FTS table and replace it with a chunk-level FTS table

DROP TABLE IF EXISTS files_fts;

CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
  heading_path,
  title,
  body,
  tokenize='trigram'
);

-- Force re-indexing of all existing files on next startup
UPDATE files SET content_hash = NULL;
