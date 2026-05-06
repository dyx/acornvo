## ADDED Requirements

### Requirement: 索引失败入队重试
`file-indexer` 的 `upsertFromFs(path)` 若抛错（非"文件不存在"类永久错误）MUST 调 `jobs.enqueue('index-retry', { path, reason: err.message }, { dedupeKey: 'idx:' + path })`，而非原 setTimeout 自重试。单文件同一时刻 MUST 最多只有一个 `index-retry` job 在 pending/running 中（dedupe 保证）。

"文件不存在" 类错误（例如 `ENOENT`、path 已 trash）MUST 视为永久错误 → 不入队；直接从 `files` 表删除对应 row。

#### Scenario: 读文件偶发 EIO
- **WHEN** upsertFromFs 抛 `EIO`
- **THEN** 新建一个 `index-retry` job；status='pending'；payload.path = 原路径；dedupe 命中时不重复新增

#### Scenario: 文件已被删
- **WHEN** upsertFromFs 抛 `ENOENT`
- **THEN** `files` 表删 row；不入队

#### Scenario: dedupe 生效
- **WHEN** 同一路径已有 pending 的 index-retry job，再次触发失败
- **THEN** 不新增 job；仍返回已有 job id

### Requirement: index-retry handler 合约
`electron/queue/handlers/index-retry.ts` SHALL 注册到 runner，处理 `index-retry` kind：
- 读 payload.path
- 调 `fileIndexer.upsertFromFs(path)`
- 成功 → 返回 `{ kind: 'ok' }`
- 抛 `ENOENT` → 返回 `{ kind: 'ok' }`（文件已删，视为目标达成——其 row 已在入队时被清理）
- 其他异常 → 返回 `{ kind: 'retry', delayMs: nextDelay(attempts), reason: err.message }`

#### Scenario: 重试成功
- **WHEN** index-retry handler 的 upsertFromFs 成功
- **THEN** 返回 ok；runner markDone；`files` 表对应 row 更新；ops_log `job.succeeded`

#### Scenario: 持续失败到达重试上限
- **WHEN** handler 连续 5 次抛错
- **THEN** 第 6 次（attempts=5 时）runner 把 job 标 failed；用户可在 /history/jobs 中手动重试
