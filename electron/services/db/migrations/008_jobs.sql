-- migration: 008_jobs
-- Persistent job queue (phase-14). One table per grove, one runner.
-- Status set: 'pending' | 'running' | 'failed' | 'done' | 'canceled'.

CREATE TABLE jobs (
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

CREATE INDEX idx_jobs_status_next_run ON jobs(status, next_run_at);
CREATE INDEX idx_jobs_kind_status ON jobs(kind, status);
