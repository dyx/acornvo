# job-queue-runner Specification

## Purpose

The runner loop that polls for due jobs and dispatches them to registered handlers. Manages concurrency limits, rate limiting (minGapMs), handler result processing, cancellation via AbortSignal, graceful shutdown, and ops_log integration.

## Requirements

### Requirement: runner loop

`electron/queue/runner.ts` SHALL 启动一个 `setInterval(250)` 的 tick loop：

- 每 tick 对每个注册 kind：
  - 若当前运行中数量 ≥ kind.concurrency → 跳过
  - 若 `now - lastPickedAt[kind] < kind.minGapMs` → 跳过
  - 否则 `SELECT id FROM jobs WHERE status='pending' AND next_run_at <= now AND kind = ? ORDER BY next_run_at LIMIT (concurrency - running)` → 对每个候选调 `markRunning` → 并行调 handler
- handler 返回：
  - `{ kind:'ok' }` → `markDone(id)`
  - `{ kind:'retry', delayMs, reason }` → `markRetry(id, delayMs, reason)`
  - `{ kind:'fail', error }` → `markFailed(id, error)`
- handler 抛异常 → 视为 `retry(policy.nextDelay(attempts), err.message)`

应用退出前（`before-quit`）runner SHALL `stopAcceptingNew()` + 等待运行中的 handler 至多 5s 退出。

#### Scenario: 选取 due job

- **WHEN** tick 时存在 1 个 next_run_at ≤ now 的 pending job
- **THEN** 该 job 状态改为 running；对应 handler 被调用

#### Scenario: 并发限制

- **WHEN** kind='ai-review-clip' 并发设为 2，当前正在跑 2 个
- **THEN** tick 不再 pick 新的 ai-review-clip job

#### Scenario: minGap 限速

- **WHEN** kind 'ai-review-clip' minGapMs=500；上次 pick 距今 300ms
- **THEN** 本 tick 跳过该 kind

#### Scenario: handler 抛错默认重试

- **WHEN** handler throw new Error('boom')
- **THEN** runner 调 `markRetry(id, nextDelay, 'boom')`

### Requirement: handler 注册

runner SHALL 暴露 `register({ kind, concurrency, minGapMs, handler })`。相同 kind 重复注册 MUST 抛错。至少注册以下 kind（phase 14 内）：

- `index-retry`（concurrency=4, minGapMs=0）：调 `fileIndexer.upsertFromFs(path)`
- `ai-review-clip`（concurrency=2, minGapMs=500）：phase 14 提供占位 handler（见下）

#### Scenario: 重复注册被拒

- **WHEN** 对 'index-retry' 注册两次
- **THEN** 第二次 register 抛 `E_DUPLICATE_KIND`

### Requirement: ai-review-clip handler

phase 15 SHALL 用真实 reviewer handler 替换 phase 14 注册的 `ai-review-clip` 占位：

- 新 handler 调 `reviewer.reviewClip(clipId, { force })`
- 按错误映射决定 ok / retry / fail
- 成功后写入 `ai_usage` 表
- 启动时 runner 注册 MUST 只保留 phase 15 的实现（phase 14 占位代码路径被删除或无条件 no-op）

#### Scenario: 真实审读成功

- **WHEN** `ai-review-clip` job 被拾取，defaultProfileId 存在且 LLM 返回合法 JSON
- **THEN** handler 返回 `{ kind:'ok' }`；md 的 frontmatter 新增 ai\_\* 字段；ai_usage 有成功记录

#### Scenario: 无 profile 直接失败

- **WHEN** `ai-review-clip` job 跑到 handler 时 `settings.ai.defaultProfileId === null`
- **THEN** handler 返回 `{ kind:'fail', error:'E_MISSING_PROFILE' }`；不再自动重试

#### Scenario: 网络错误退避

- **WHEN** fetch 抛 E_NETWORK
- **THEN** handler 返回 `{ kind:'retry', delayMs: nextDelay(attempts), reason:'E_NETWORK' }`

#### Scenario: mtime 冲突退避

- **WHEN** 写回时 md 已被用户修改导致 mtime 不匹配
- **THEN** handler 返回 `{ kind:'retry', delayMs: 600000, reason:'E_MTIME_CONFLICT' }`

### Requirement: 取消信号

`runner.cancel(id)` SHALL：

- job status='pending' → 直接 `markCanceled(id)`
- job status='running' → 向对应 AbortController 发 abort；等 handler 返回；runner 忽略其返回值；`markCanceled(id)`
- job 其他状态 → 返回错误 `E_STATUS_NOT_ALLOWED`

handler MUST 检查 `ctx.cancel.aborted` 并合作式退出。

#### Scenario: 取消 pending

- **WHEN** runner.cancel 一个 pending job
- **THEN** 立即标 canceled

#### Scenario: 取消 running 合作式

- **WHEN** runner.cancel 一个 running job；handler 检测到 abort 并返回
- **THEN** job 最终 status='canceled'；handler 的返回值不影响状态

### Requirement: ops_log 事件

runner SHALL 在关键状态变更时写 `ops_log`：

- `job.enqueued`（入队时由 store 写）
- `job.started`（markRunning 时）
- `job.succeeded`（markDone 时）
- `job.retry`（markRetry 时，meta 含 delayMs + reason）
- `job.failed`（markFailed 时，meta 含 reason）
- `job.canceled`（markCanceled 时）

#### Scenario: 失败入日志

- **WHEN** job 耗尽重试 → markFailed
- **THEN** `ops_log` 新增 `op='job.failed', meta={ kind, id, reason }`
