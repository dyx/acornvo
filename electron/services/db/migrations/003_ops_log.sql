CREATE TABLE ops_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  path TEXT NOT NULL,
  ts TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX idx_ops_log_ts ON ops_log(ts DESC);
CREATE INDEX idx_ops_log_op_ts ON ops_log(op, ts DESC);
PRAGMA user_version = 3;
