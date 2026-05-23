## Context

前置：

- phase 3：SQLite + migrations
- phase 5：索引失败的散点重试（chokidar 错误 + upsert 错误的 setTimeout fallback）
- phase 10：`ops_log` 表，已经记录"动作"但不记录"待办"
- phase 12：pipeline 末端 `clipQueue.enqueue(...)` 占位
- phase 15（未实装）：会订阅 ai-review-clip kind

PRD S-10：长耗时任务必须可见、可取消、崩溃后自动续作。

## Goals / Non-Goals

**Goals:**

- 剪藏后 AI review / 索引失败补偿 走统一队列，失败可重试、崩溃可恢复
- UI 可见进度、失败原因、一键重试
- 对用户无感：正常情况下 runner 在后台静默完成

**Non-Goals:**

- 不做跨进程分布式队列（单 Electron 主进程处理即可）
- 不做延时定时任务 scheduler（job 只做"立即 + 重试 backoff"；真正的 cron 在 phase 18）
- 不做 job 依赖 DAG（每个 job 独立；ai-review-clip 内部如果要拆多步骤，由 handler 自己切分成多个 job 或串行 await）
- 不做 priority 多级（全部 FIFO + 按 `next_run_at` 排）
- 不做消息持久化（WAL / journal）之外的外部 broker

## Decisions

### D1: 单表单 runner

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,                  -- uuid
  kind TEXT NOT NULL,                   -- 'ai-review-clip' | 'index-retry' | 未来更多
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,                 -- 'pending' | 'running' | 'failed' | 'done' | 'canceled'
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT NOT NULL,            -- ISO string; due time
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_status_next_run ON jobs(status, next_run_at);
CREATE INDEX idx_jobs_kind_status ON jobs(kind, status);
```

- 状态机：`pending → running → (done | failed | pending-retry)`；`pending-retry` 复用 status='pending' + 递增 attempts + 更新 next_run_at
- 任何 `running` 状态在启动时 MUST 先"重置"成 `pending`（崩溃恢复：上次没完成的 job 重做；handler 必须幂等）

### D2: Runner loop

单 `setInterval(250ms)` tick：

- 取 **每个 kind 的并发窗口剩余数**
- `SELECT id FROM jobs WHERE status='pending' AND next_run_at <= ? AND kind = ? ORDER BY next_run_at LIMIT ?`
- 把选中的 job status 置 running，并行调 handler

启动时额外逻辑：

- `UPDATE jobs SET status='pending', updated_at=? WHERE status='running'`（崩溃恢复）

### D3: Handler 契约

```ts
type JobHandler<P> = (ctx: {
  job: Job
  payload: P
  log: (level, msg) => void
  cancel: AbortSignal
}) => Promise<
  | { kind: 'ok' }
  | { kind: 'retry'; delayMs: number; reason: string }
  | { kind: 'fail'; error: string } // 不再重试
>
```

- runner 捕获未 catch 的异常 → 等同 `retry(policy.next(attempts), errMsg)`（即抛错默认走重试策略）
- `cancel` 触发时 handler 应尽快返回（写入时不强 kill）；runner 在触发 cancel 后把 job 标 `canceled`
- handler 必须**幂等**：同一 payload 可能跑多次

### D4: 重试策略

```ts
function nextDelay(attempts: number): number {
  return [1_000, 5_000, 30_000, 120_000, 900_000][attempts] ?? null
}
```

- attempts ≥ 5 且 handler 返回 retry → 转 `fail`
- `retry.delayMs` 传入值覆盖默认（handler 可以要求短一点或长一点）
- 所有 fail 写入 `ops_log` `op='job.failed'`

### D5: kind 注册与并发

```ts
queueRunner.register({
  kind: 'ai-review-clip',
  concurrency: 2, // 同时最多 2 个 ai review
  minGapMs: 500, // rate limit：连续两个任务间至少 500ms
  handler: aiReviewClipHandler
})
queueRunner.register({
  kind: 'index-retry',
  concurrency: 4,
  minGapMs: 0,
  handler: indexRetryHandler
})
```

- 并发控制：runner 维护 `Map<kind, Set<runningId>>`；size >= concurrency 时本 tick 跳过该 kind
- minGapMs：维护 `Map<kind, lastPickedAt>`；距离上次 pick 不足 minGapMs 时跳过

### D6: enqueue API

```ts
jobs.enqueue(kind, payload, opts?: { delayMs?, dedupeKey? }) → { id }
```

- `dedupeKey` 可选：相同 (kind, dedupeKey) 已在 pending/running 中存在时 → 返回已有 id，不重复 enqueue
  - 例如 `ai-review-clip` 用 `dedupeKey = 'clip:' + clipId`；phase 12 重复保存同 clip 不重跑 AI
- `delayMs`：`next_run_at = now + delayMs`

### D7: IPC

- `jobs.list({ kind?, status?, limit, offset }) → { items, total }`
- `jobs.retry(id) → { ok }`：把 `failed` job 改 `pending`，attempts 不重置（继续累加），`next_run_at = now`
- `jobs.cancel(id) → { ok }`：`pending` → `canceled`；`running` → 发 AbortSignal；`done`/`failed`/`canceled` 报错 `E_STATUS_NOT_ALLOWED`
- `jobs.onChanged(listener)`：订阅 `jobs.stateChanged` 事件，用于 UI 实时刷新

### D8: UI — /history 增加"任务" tab

phase 10 设计了 3 tab（变更 / 剪藏 / 冲突）；本阶段把它扩成 4 tab：变更 / 剪藏 / 冲突 / **任务**。

"任务" tab：

- 顶部 filter：kind (all / ai-review-clip / index-retry) / status (all / running / pending / failed / done)
- 列表：行高 48px，显示 kind、payload 摘要（clipId / path）、status badge、attempts、next_run_at、last_error（failed 时红底）
- 每行右侧按钮：running → "取消"；pending → "取消"；failed → "重试"
- 顶部全局按钮："清除已完成"（删除 status=done 的 job，保留最近 7 天记录）

默认状态过滤：running + pending + failed（隐藏 done）

### D9: phase 12 pipeline 改造

`electron/clipper/pipeline.ts` 末端：

```ts
// phase 12 原本
clipQueue.enqueue({ clipId, url, path })

// phase 14 改为
jobs.enqueue('ai-review-clip', { clipId, path }, { dedupeKey: `clip:${clipId}` })
```

phase 12 的 `clipQueue` 模块改名为 `clipReviewEnqueue` 或直接删除，pipeline 直接调 `jobs.enqueue`。

### D10: phase 5 index-retry 改造

phase 5 里的索引 `upsert` 失败分支：

- 原来：`setTimeout(() => retry(), 1000)` × 3
- 现在：`jobs.enqueue('index-retry', { path, reason: err.message }, { dedupeKey: 'idx:' + path })`

handler:

```ts
async function indexRetryHandler({ payload }) {
  try {
    await fileIndexer.upsertFromFs(payload.path)
    return { kind: 'ok' }
  } catch (e) {
    return { kind: 'retry', delayMs: defaultBackoff, reason: e.message }
  }
}
```

### D11: AI review 占位 handler

phase 14 提供一个 `aiReviewClipHandler` **骨架**：

- 读 clip row 与 md 文件
- 调 `phase15.reviewClip(content)` ← 此阶段该模块抛 `E_NOT_IMPLEMENTED`
- handler 捕获 `E_NOT_IMPLEMENTED` → `retry(delayMs: 60 * 60_000)`（1 小时后再试；phase 15 实装后就会成功）

**理由**：保证 phase 14 独立可验收（剪藏 → job 入队 → running → retry 1h），而不依赖 phase 15 完成。

### D12: 观测与 ops_log

- 每次 job 状态变更 → 写 `ops_log`：`job.enqueued` / `job.started` / `job.succeeded` / `job.retry` / `job.failed` / `job.canceled`
- phase 18 的 observability 面板可读 ops_log 绘图

### D13: 关闭应用时的安全退出

- app `before-quit` 事件：runner stop + 等 5s 让 running handler 返回
- 强退 → 下次启动 status='running' 全部重置为 pending（D2）
- handler 写文件时需按 phase 4 原子写，防止 crash 过程中的半写

## Risks / Trade-offs

- [轮询 250ms 空查询成本] → SQLite prepared statement + 索引命中；小库几乎零开销；可未来改条件变量
- [handler 非幂等导致重复副作用] → 要求所有 handler 文档化幂等方式；ai-review-clip 用 clipId dedupe + 写入前先读 frontmatter 判断是否已经有 `ai_review_at`
- [大量 failed job 占表] → "清除已完成/失败" 用户手动触发；或 phase 18 定期 TTL 清理（30 天）
- [崩溃时 running → pending 导致重跑副作用] → 幂等+ `attempts` 保留；write 操作用 phase 4 原子保证
- [cancel 对 running job 做不到 hard kill] → 只能发 AbortSignal；handler 自己 co-op 退出；未遵守的会继续跑完但结果可能被丢弃（runner 忽略其返回，因为状态已 canceled）

## Migration Plan

- migration 007 建 jobs 表
- phase 12 的 `clipQueue.enqueue` 一行改写
- phase 5 的 setTimeout 重试改为 `jobs.enqueue('index-retry', ...)`
- 回滚：删 migration 007；pipeline 末端改回 no-op；phase 5 恢复 setTimeout

## Open Questions

- cancel + running 是否给予"强 kill"选项？→ **不给**，尊重 handler 的 cleanup 窗口；若真的卡死，用户关应用即可
- "清除已完成" 是否保留最近 N 天？→ 默认"只清 done"，failed 全保留；用户可二次确认"同时清 failed"
- index-retry dedupe key 用 path → 若两个不同文件路径但同 hash，怎么办？→ 不是同一行；dedupe 不冲突
