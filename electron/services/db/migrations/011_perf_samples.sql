-- migration: 011_perf_samples
-- Phase 18 — perf sampling + local telemetry + ops_log index.
-- NOTE: OpenSpec proposal originally numbered this 010_perf_samples;
--       slot 010 was already taken by Phase 16 (010_sessions.sql),
--       so we ship as 011 with user_version = 11.

CREATE TABLE IF NOT EXISTS perf_samples (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   TEXT    NOT NULL,
  area TEXT    NOT NULL,
  ok   INTEGER NOT NULL,
  ms   INTEGER NOT NULL,
  meta TEXT
);

CREATE INDEX IF NOT EXISTS idx_perf_area_ts ON perf_samples(area, ts);

CREATE TABLE IF NOT EXISTS telemetry_local (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  day    TEXT    NOT NULL,
  metric TEXT    NOT NULL,
  value  REAL    NOT NULL,
  meta   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_telemetry_day_metric ON telemetry_local(day, metric);

CREATE INDEX IF NOT EXISTS idx_ops_log_ts ON ops_log(ts DESC);

PRAGMA user_version = 11;
