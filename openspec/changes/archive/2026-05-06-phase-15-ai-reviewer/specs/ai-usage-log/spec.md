## ADDED Requirements

### Requirement: ai_usage 表

migration 008 SHALL 建：

```sql
CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  profile_id TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX idx_ai_usage_profile ON ai_usage(profile_id);
```

并把 `user_version` 设为 8。

#### Scenario: 迁移到 8

- **WHEN** `PRAGMA user_version = 7`
- **THEN** migration 008 执行；`user_version = 8`；`ai_usage` 表存在

### Requirement: 记录 API

`ai_usage` store SHALL 提供 `insert(row)`，调用者在每次 LLM 请求完成后（成功或失败均要）写入：

- 成功：`ok=1, error=null, prompt_tokens/completion_tokens/latency_ms 填真实值`
- 失败：`ok=0, error=<code>`，tokens 可为 null，latency_ms 仍记

#### Scenario: 成功调用记录

- **WHEN** reviewClip 成功耗时 4.2s，usage 返回 prompt=1234 completion=456
- **THEN** ai_usage 新增一行 `{ ok:1, prompt_tokens:1234, completion_tokens:456, latency_ms≈4200 }`

#### Scenario: 失败调用记录

- **WHEN** reviewClip 因 429 失败
- **THEN** ai_usage 新增一行 `{ ok:0, error:'E_RATE', latency_ms: <short> }`

### Requirement: 查询聚合

`ai.usage.summary({ sinceDays }: { sinceDays?: number } = { sinceDays: 30 }) → { totalCalls, okCount, errorRate, totalTokens, byProvider: Record<string, { calls, tokens }> }` IPC MUST 返回指定时间窗口内的统计（默认 30 天）。本阶段不一定在 UI 展示，但 IPC MUST 可用。

#### Scenario: 基本聚合

- **WHEN** ai_usage 最近 30 天有 10 行（8 ok, 2 fail），total prompt+completion=40000
- **THEN** summary 返回 `{ totalCalls:10, okCount:8, errorRate:0.2, totalTokens:40000, byProvider: {...} }`

### Requirement: 查询明细

`ai.usage.list({ limit, offset, profileId?, okOnly? }) → { items, total }` MUST 支持分页与过滤。本阶段 IPC 预留；UI 在 phase 18 使用。

#### Scenario: 分页列出

- **WHEN** `ai.usage.list({ limit: 50, offset: 0 })`
- **THEN** items 最多 50 条，按 created_at DESC 排序；total 为总行数
