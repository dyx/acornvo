## ADDED Requirements

### Requirement: jobs 表

migration 007 SHALL 建：

```sql
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
```

`user_version` 被设为 7。`status` 取值集合：`'pending' | 'running' | 'failed' | 'done' | 'canceled'`。

#### Scenario: 迁移到 7

- **WHEN** `PRAGMA user_version = 6`
- **THEN** 执行 migration 007；`user_version = 7`；`jobs` 表与两个索引存在

### Requirement: enqueue

`jobs.enqueue(kind, payload, opts?)` SHALL：

- 生成 UUID id
- `status='pending'`，`attempts=0`，`next_run_at = now + (opts?.delayMs ?? 0)`
- 若 `opts.dedupeKey` 非空 → 先 `SELECT id FROM jobs WHERE kind = ? AND json_extract(payload_json, '$.__dedupe') = ? AND status IN ('pending','running')`；命中则直接返回已有 id，不插入
- 否则 INSERT，返回新 id

`__dedupe` 字段 MUST 在入队时自动注入 payload JSON，供 dedupe 查询使用。

#### Scenario: 普通入队

- **WHEN** 调 `jobs.enqueue('index-retry', { path: 'a.md' })`
- **THEN** 新行 status='pending'，attempts=0，next_run_at ≈ now；返回 id

#### Scenario: 去重命中

- **WHEN** 调 `jobs.enqueue('ai-review-clip', { clipId: 1 }, { dedupeKey: 'clip:1' })`，此前已有同 kind + dedupeKey 的 pending row
- **THEN** 不新增行；返回已有 id

#### Scenario: 延时

- **WHEN** 调 `jobs.enqueue('index-retry', {...}, { delayMs: 5000 })`
- **THEN** 新行 `next_run_at ≈ now + 5s`

### Requirement: 启动恢复

应用启动时 `job-queue-store` MUST 执行：

```sql
UPDATE jobs SET status='pending', updated_at=? WHERE status='running';
```

避免上次崩溃留下的 stuck `running` 状态。

#### Scenario: crash 恢复

- **WHEN** 启动前数据库内有 status='running' 的 job
- **THEN** 启动完成后这些 job 状态为 'pending'，attempts 保持不变

### Requirement: 状态写入 API

`job-queue-store` SHALL 提供：

- `markRunning(id)`：status='running'
- `markDone(id)`：status='done'
- `markRetry(id, delayMs, reason)`：attempts+=1；`next_run_at = now + delayMs`；last_error = reason；status='pending'
- `markFailed(id, reason)`：status='failed'；last_error = reason
- `markCanceled(id)`：status='canceled'

每次状态写入 MUST 同步更新 `updated_at` 并派发事件 `jobs.stateChanged`（payload 含完整 row）。

#### Scenario: markRetry 递增 attempts

- **WHEN** job 当前 attempts=1，调 `markRetry(id, 30_000, 'E_NET')`
- **THEN** attempts=2，next_run_at ≈ now+30s，last_error='E_NET'，status='pending'

### Requirement: 查询 API

`jobs.list({ kind?, status?, limit, offset, orderBy? }) → { items, total }` MUST 按 `orderBy` 指定字段排序（默认 `next_run_at ASC`）；支持 kind / status 过滤；同时返回符合条件的总数。

#### Scenario: 过滤 status

- **WHEN** 调 `jobs.list({ status: 'failed', limit: 50, offset: 0 })`
- **THEN** items 全为 status='failed' 行；total 为 failed 总数

#### Scenario: 过滤 kind

- **WHEN** 调 `jobs.list({ kind: 'ai-review-clip' })`
- **THEN** items 只含 kind='ai-review-clip'
