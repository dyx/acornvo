-- migration: 006_clips
-- Adds the `clips` table for phase-12 web clipper.

CREATE TABLE clips (
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

CREATE INDEX idx_clips_clipped_at ON clips(clipped_at DESC);
CREATE INDEX idx_clips_site ON clips(site);
