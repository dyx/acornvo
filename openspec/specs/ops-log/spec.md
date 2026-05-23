## ADDED Requirements

### Requirement: ops_log Schema

系统 SHALL 在 `migrations/003_ops_log.sql` 创建表：

```sql
CREATE TABLE ops_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  path TEXT NOT NULL,
  ts TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX idx_ops_log_ts ON ops_log(ts DESC);
CREATE INDEX idx_ops_log_op_ts ON ops_log(op, ts DESC);
```

`PRAGMA user_version` MUST 推进到 `3`。

#### Scenario: Migration 执行

- **WHEN** 首次启动 phase 10 版本
- **THEN** 运行 003 后 `user_version=3`；`ops_log` 表存在

### Requirement: Ops 写入器

系统 SHALL 提供 `opsLog.record({ op, path, meta? })` 函数（main 侧）。以下事件 MUST 写入：

- `op='trash'`：soft-delete 成功后
- `op='hard_delete'`：降级永久删除后
- `op='conflict_resolve'`：phase 9 冲突解决时；`meta` 含 `{ id, resolved_by, winner_path? }`
- `op='conflict_delete'`：`conflict.delete(id)` 调用成功后；`meta` 含 `{ id }`
- `op='rename'`：watcher 识别到 rename 时（phase 5）；`meta` 含 `{ new_path }`

#### Scenario: trash 记录

- **WHEN** 成功 `file.trash('notes/a.md')`
- **THEN** `ops_log` 最后一行 `op='trash', path='notes/a.md', ts=<now ISO>, meta_json=NULL`

#### Scenario: 冲突解决记录

- **WHEN** 用户在 ConflictDialog 点"另存副本"
- **THEN** `ops_log` 行 `op='conflict_resolve', path='notes/a.md', meta_json='{"id":"...","resolved_by":"save_as","winner_path":"notes/a.conflict....md"}'`

### Requirement: 保留策略

每次 `opsLog.record` 调用前系统 SHALL 执行 prune：

- 删除 `ts < datetime('now', '-90 days')` 的行
- 若行数仍 > 10000，按 `ts` 升序删到 10000

#### Scenario: 超 90 天

- **WHEN** 存在 ts 为 100 天前的行
- **THEN** 下一次 record 调用前该行被删

#### Scenario: 超 10000 上限

- **WHEN** ops_log 含 10050 行（全 < 90 天）
- **THEN** prune 后保留最新 10000 条

### Requirement: ops.list IPC

系统 SHALL 提供 `ops.list({ limit, offset, op? })` IPC，返回 `{ items: OpsItem[], total }`，按 `ts DESC`。`OpsItem = { id, op, path, ts, meta }`（meta 已 JSON parse）。`op` 过滤可选，缺省返回所有。

#### Scenario: 全部列出

- **WHEN** `ops.list({ limit: 50, offset: 0 })`
- **THEN** 返回按 ts 降序的前 50 条

#### Scenario: 仅 trash

- **WHEN** `ops.list({ limit: 50, offset: 0, op: 'trash' })`
- **THEN** 仅返回 `op='trash'` 的行
