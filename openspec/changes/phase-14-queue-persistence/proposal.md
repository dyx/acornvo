## Why

phase 15 AI reviewer 会对"每一次剪藏"异步地：抽摘要 → 打标签 → 提建议标题 → 写回 frontmatter。这是一个**耗时、会失败、可能网络中断、可能重启应用后要继续**的任务。如果直接在 pipeline 里顺序等待 AI，会：

- 用户必须盯着 spinner
- 程序崩了要重做
- 并发控制和速率限制无从下手

phase 12 已经在剪藏成功后留了 `clipQueue.enqueue(...)` 占位（no-op）。本阶段把它换成**真正的持久化任务队列**，让 phase 15/16 的异步工作流有统一的消息底座。同时把 phase 5 索引的偶发失败也纳入队列自愈（`index-retry`）。

PRD S-10 要求"长耗时任务可见可控"：用户能看到队列进度、重试、取消。

## What Changes

- 新建持久化 Job Queue：SQLite 表 `jobs`，每 job `{ id, kind, payload_json, status, attempts, next_run_at, last_error, created_at, updated_at }`
- job kinds（本阶段定义的）：`ai-review-clip`（phase 15 实际执行；本阶段只预留 kind+入队占位 handler）；`index-retry`（phase 5 失败补偿）
- 队列 runner：单进程单 loop，按 `next_run_at` 轮询取下一个 due job；每个 kind 有注册的 handler；handler 可返回 `ok` / `retry(delayMs)` / `fail(err)`
- 重试策略：最多 5 次，指数退避（1s, 5s, 30s, 2min, 15min）
- 速率限制：每个 kind 可配置 `concurrency`（默认 1）与 `minGapMs`（连续任务之间最小间隔）
- UI：`/queue` 路由（AppRail 不单独入口，`/history` 里加 "任务" tab，或 /settings 的通用 tab 有 "当前任务" 跳转入口）；列出进行中 / 等待 / 失败 job；支持"立即重试" / "取消"
- phase 12 pipeline 成功写入 clip 后调 `jobs.enqueue('ai-review-clip', { clipId })`；phase 15 注册该 kind 的 handler
- phase 5 / 9 的索引失败分支改为 `jobs.enqueue('index-retry', { path, reason })`，替代散落的 setTimeout 重试
- migration 007：`jobs` 表

## Capabilities

### New Capabilities
- `job-queue-store`: SQLite `jobs` 表与持久化 CRUD
- `job-queue-runner`: 单进程 loop + handler 注册 + 并发/速率控制
- `job-retry-policy`: 指数退避策略与错误分类
- `queue-panel-ui`: `/history` 的"任务" tab，展示与操作 jobs
- `queue-ipc`: `jobs.list` / `jobs.retry` / `jobs.cancel` / `jobs.onChanged`

### Modified Capabilities
- `history-panel` (phase 10): `/history` 路由从 3 tab 扩为 4 tab（新增 Jobs tab）
- `clipper-pipeline` (phase 12): `clipQueue.enqueue` 占位替换为真实 `jobs.enqueue('ai-review-clip', ...)`

备注：`file-indexer`（phase 5）的 index-retry 自愈以 ADDED 方式扩展（不改动已有 requirement 内容），因此不列为 Modified；spec delta 使用 `## ADDED Requirements`。

## Impact

- `package.json` 无新外部依赖（手写 poller，不引 bull/bee-queue 等 Redis-based 队列）
- `migrations/007_jobs.sql`：jobs 表 + 索引
- `electron/queue/`：`store.ts` / `runner.ts` / `handlers/index-retry.ts` / `handlers/ai-review-clip.ts`（占位，phase 15 实装）/ `policy.ts`
- `electron/ipc/jobs.ts`
- `shared/job-types.ts`
- `src/pages/History.tsx`：补"任务" tab（phase 10 本来就是 3 tab，本阶段变 4 tab：变更 / 剪藏 / 冲突 / 任务，或把"任务"作为独立侧栏）— design 定
- `src/components/history/QueueTab.tsx`
- 本阶段的 runner 是**骨架 + index-retry handler 实装 + ai-review-clip handler 占位**。真正 AI 调用在 phase 15 注入
