-- migration: 002_fts
-- Replace phase-05 files_fts (tokenize=simple, columns: path/title/summary/content)
-- with phase-08 schema: tokenize=trigram, columns: path/title/body.
-- Non-external content: body is stored in the FTS table so rebuild after
-- v1→v2 upgrade only needs file.read per row (no need to add a body column to files).

DROP TABLE IF EXISTS files_fts;

CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize='trigram'
);
