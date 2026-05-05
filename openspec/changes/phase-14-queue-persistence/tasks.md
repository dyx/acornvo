## 1. Schema 与类型

- [x] 1.1 `migrations/007_jobs.sql`：建 jobs 表 + 2 个索引；`user_version = 7`（注：实际为 `008_jobs.sql`，因 007 已被 phase-13 settings 占用）
- [x] 1.2 `shared/job-types.ts`：`Job` / `JobKind` / `JobStatus` / `JobHandlerResult` / `EnqueueOpts`
- [x] 1.3 `shared/ipc-contract.ts`：`jobs` 命名空间签名

## 2. store 层

- [x] 2.1 `electron/queue/store.ts`：`enqueue / markRunning / markDone / markRetry / markFailed / markCanceled / list`
- [x] 2.2 `enqueue` 的 dedupe 实现（payload 注入 `__dedupe`；查询用 `json_extract(payload_json, '$.__dedupe')`）
- [x] 2.3 启动恢复：`UPDATE jobs SET status='pending' WHERE status='running'`
- [x] 2.4 内部 EventEmitter：`stateChanged`

## 3. runner 与策略

- [x] 3.1 `electron/queue/policy.ts`：`nextDelay(attempts)` 退避表
- [x] 3.2 `electron/queue/runner.ts`：setInterval 250ms loop；kind 注册 / concurrency / minGapMs
- [x] 3.3 handler 抛错 → retry；返回值处理三分支；AbortSignal 贯通
- [x] 3.4 `before-quit` 钩子：停 loop + 等待 5s running handler
- [x] 3.5 `electron/queue/handlers/index-retry.ts`：实装
- [x] 3.6 `electron/queue/handlers/ai-review-clip.ts`：占位 handler，捕获 `E_NOT_IMPLEMENTED` → retry 1h

## 4. ops_log 集成

- [x] 4.1 每个状态变更写 `ops_log`：`job.enqueued / started / succeeded / retry / failed / canceled`（meta 含 kind / id / reason / delayMs）

## 5. IPC

- [x] 5.1 `electron/ipc/jobs.ts`：`list / retry / cancel / clearDone` handler
- [x] 5.2 preload：暴露 `window.api.jobs.*` + `onJobsChanged(cb)`
- [x] 5.3 main 广播：`stateChanged` → 所有 renderer 的 `jobs.changed`

## 6. renderer UI

- [x] 6.1 `src/pages/History.tsx`：tab 列表扩为 4 项；URL 与 tab 同步
- [x] 6.2 `src/components/history/JobsTab.tsx`：filter + 全局按钮 + 虚拟列表
- [x] 6.3 行渲染器（payload 摘要按 kind 分发）
- [x] 6.4 行按钮：重试 / 取消；调用 IPC；订阅 `jobs.changed` 刷新
- [x] 6.5 空状态文案

## 7. phase 12 pipeline 改造

- [x] 7.1 `electron/clipper/pipeline.ts`：`clipQueue.enqueue(...)` 替换为 `jobs.enqueue('ai-review-clip', { clipId, path }, { dedupeKey: 'clip:' + clipId })`
- [x] 7.2 删除 phase 12 的 no-op `clipQueue` 模块

## 8. phase 5 index-retry 改造

- [x] 8.1 `electron/indexer/*`：upsertFromFs 失败分支改为 `jobs.enqueue('index-retry', ...)`；ENOENT 视为永久错误直接清 row
- [x] 8.2 移除散落的 setTimeout 自重试

## 9. i18n

- [x] 9.1 添加 `history.jobs.*` / `jobs.status.*` / `jobs.action.retry` / `jobs.action.cancel` / `jobs.clearDone` 等

## 10. 验收

- [ ] 10.1 `/history/jobs` 路由存在；默认过滤 running+pending+failed
- [ ] 10.2 phase 12 剪藏一个 URL → jobs 表新增一行 `kind='ai-review-clip'`，status='pending'
- [ ] 10.3 runner 启动 → 上述 job 转 running → handler 捕获 `E_NOT_IMPLEMENTED` → status 回 pending，next_run_at ≈ now+1h，attempts=1
- [ ] 10.4 再次剪藏同 clip → dedupeKey 命中；jobs 表行数不变
- [ ] 10.5 模拟 phase 5 upsert 失败（如 mock fs 读错）→ 新增 index-retry job；runner 按退避重试 3 次后成功
- [ ] 10.6 手动 `jobs.cancel` 一个 pending job → status=canceled；UI 不再默认显示
- [ ] 10.7 `jobs.retry` 一个 failed job → status=pending，attempts 重置 0，next_run_at=now
- [ ] 10.8 `jobs.clearDone` → 所有 done job 删除；failed 保留；返回删除数
- [ ] 10.9 崩溃恢复：kill 应用时一个 job 处于 running → 重启后该 job 变 pending
- [ ] 10.10 before-quit：触发 quit 时 runner 停 loop；pending 仍保留；无数据丢失
- [ ] 10.11 `ops_log` 可查询 `op='job.succeeded' / 'job.failed'` 等
- [ ] 10.12 并发/限速：mock 5 个 ai-review-clip 入队；同时 running 数 ≤ 2（配置的 concurrency）
- [ ] 10.13 UI 订阅 `jobs.changed` → 后台 runner 变更立即反映前端列表
- [ ] 10.14 `openspec validate phase-14-queue-persistence --strict` 通过
