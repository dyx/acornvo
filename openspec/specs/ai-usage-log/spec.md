# ai-usage-log Specification

## Purpose
AI 调用用量记录与查询。维护 `ai_usage` 表，记录每次 LLM 请求的 token 用量、延迟、成功/失败状态，并提供聚合查询与分页明细 IPC。
## Requirements
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
`ai_usage` store SHALL 提供 `insert(row)`，调用者在每次 LLM 请求完成后（成功或失败均要）写入。usage 字段来源由 LangChain `AIMessage.usage_metadata` 提供：
- `input_tokens` → 入库 `prompt_tokens`
- `output_tokens` → 入库 `completion_tokens`
- `total_tokens` → 仅作校验，不单独入库（schema 不变）

`electron/ai/usage.ts` SHALL 暴露 `recordUsage({ sessionId?, profileId, model, message, latencyMs, ok, error?, jobId? })` 适配器：从 `AIMessage.usage_metadata` 提取 token 数；缺失（某些 provider / 错误路径）时填 null；调 `aiUsage.insert(...)`。

成功路径：
- `ok=1, error=null`
- `prompt_tokens / completion_tokens / latency_ms` 真实值（usage_metadata 缺失时填 null）

失败路径：
- `ok=0, error=<LlmErrorCode>`
- tokens 可为 null，latency_ms 仍记

#### Scenario: 成功调用记录（agent 上下文）
- **WHEN** runner 完成一次 LLM 调用，AIMessage.usage_metadata={ input_tokens:1234, output_tokens:456 }，sessionId='abc'
- **THEN** ai_usage 新增 `{ ok:1, prompt_tokens:1234, completion_tokens:456, latency_ms≈4200, session_id:'abc' }`

#### Scenario: 成功调用记录（reviewer 上下文）
- **WHEN** reviewer 完成 withStructuredOutput 调用
- **THEN** ai_usage 新增一行，session_id=null（非 agent 上下文）；其他字段同上

#### Scenario: 失败调用记录
- **WHEN** reviewer 因 429 失败，normalizeLLMError 返回 E_RATE
- **THEN** ai_usage 新增一行 `{ ok:0, error:'E_RATE', latency_ms:<short> }`

#### Scenario: usage_metadata 缺失
- **WHEN** 某 provider 未返回 usage_metadata（旧模型 / fallback 路径）
- **THEN** ai_usage 行 `prompt_tokens` 与 `completion_tokens` 为 null；ok=1 仍记录

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

