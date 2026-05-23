# file-indexer Specification

## Purpose

TBD - created by archiving change phase-05-indexer-watcher. Update Purpose after archive.

## Requirements

### Requirement: 全量扫描

打开树林后系统 SHALL 扫描树林内所有 `*.md` 文件（递归）并将其同步到 `files` / `tags` / `file_tags` / `files_fts`。扫描 MUST 跳过 `.acornvo/` / `.obsidian/` / `.git/` / `node_modules/` / symlink。

#### Scenario: 新树林首次扫描

- **WHEN** 打开一个含 100 个 md 文件的树林
- **THEN** 扫描结束后 `SELECT COUNT(*) FROM files` = 100
- **AND** 每行 `content_hash` 与其 md body 的 sha256 一致
- **AND** `files_fts` 行数 = 100

#### Scenario: 二次打开无变更

- **WHEN** 无外部改动后再次打开同一树林
- **THEN** 扫描期间 `UPDATE` / `INSERT` 语句数为 0（所有文件 hash + mtime 未变被跳过）
- **AND** 日志记录 "scan: 100 skipped, 0 updated, 0 inserted, 0 deleted"

#### Scenario: 扫描后磁盘文件被外部删除（应用未启动）

- **WHEN** 关闭应用 → 删除一个 md → 重启
- **THEN** 扫描发现索引里有而磁盘无，执行 `DELETE FROM files WHERE path=?` 及联动清理

### Requirement: content_hash 以 body 为准

索引器 SHALL 计算 `sha256(body)`（frontmatter 之外的正文）作为 `content_hash`。frontmatter 单独变更 MUST NOT 触发 hash 变化。

#### Scenario: 仅 frontmatter 改动

- **WHEN** 用户手动改 `rating` 从 3 到 4（body 不变）
- **THEN** 索引更新 `rating` 列与 `frontmatter_json`，但 `content_hash` 保持不变

#### Scenario: 正文改动

- **WHEN** body 新增一段文字
- **THEN** `content_hash` 变化，`files_fts.content` 被重写

### Requirement: 标签同步

索引器 SHALL 把 frontmatter.tags 同步到 `tags` 与 `file_tags` 表；`tags.usage_count` MUST 反映实际引用该 tag 的文件数。

#### Scenario: 新增文件带新 tag

- **WHEN** 新文件含 `tags: [attention, transformer]`
- **THEN** `tags` 表含 `attention`（usage_count=1）、`transformer`（usage_count=1）
- **AND** `file_tags` 含两条 `(path, tag)`

#### Scenario: 删除文件减计数

- **WHEN** 删掉一个唯一用 `rare-tag` 的文件
- **THEN** `tags.rare-tag.usage_count` 减为 0（行可保留，后续 phase 可做 GC；本阶段不 GC）
- **AND** `file_tags` 中该对被删

### Requirement: FTS5 写入

索引器 SHALL 对每个 md 文件维护 `files_fts` 行（schema：`path UNINDEXED, title, body, tokenize='trigram'`）。upsert / delete / rename 路径 MUST 与 `files` 表在同一事务内同步写 `files_fts`：

- upsert：`INSERT OR REPLACE INTO files_fts(rowid, path, title, body)`，`rowid` 与 `files.rowid` 一致；body 从 `file.read(absPath)` 拿到并与 `content_hash` 计算复用同一变量（不二次读盘）
- delete：`DELETE FROM files_fts WHERE rowid=?`
- rename（content_hash 不变）：`UPDATE files_fts SET path=? WHERE rowid=?`

phase 5 约定的 `tokenizer: (text) => string` 注入点在本阶段由 FTS5 内置 `trigram` 替代，不再需要 renderer 注入自定义切词函数（切词由查询端 jieba 处理，索引端用 trigram）。

#### Scenario: 新增文件同步 FTS

- **WHEN** 新建 `notes/x.md`，body = "注意力机制研究"
- **THEN** 事务内 `files` 与 `files_fts` 同步写入；事务外 `SELECT * FROM files_fts WHERE files_fts MATCH '注意力'` 命中该行

#### Scenario: 仅 frontmatter 改动不影响 body

- **WHEN** 用户改 `rating` 从 3 到 4（body 不变，content_hash 不变）
- **THEN** `files_fts` 不重写（rowid 的 body 列未 touched）；索引器可跳过 FTS 更新，只更 `files.rating` 与 `frontmatter_json`

#### Scenario: 删除同步

- **WHEN** 外部 `rm notes/x.md`
- **THEN** 事务内 `DELETE FROM files` 与 `DELETE FROM files_fts` 均完成；FTS 查询 `'注意力'` 不再命中该 path

#### Scenario: 重命名同步

- **WHEN** `mv notes/x.md notes/y.md`
- **THEN** `files.path` 与 `files_fts.path` 同一事务内更新；`rowid` 保持不变；FTS 查询 rank 不变

#### Scenario: 事务失败回滚

- **WHEN** 批处理内某 md 写入 FTS 时触发约束错误
- **THEN** 事务回滚；`files` 与 `files_fts` 均保持上一状态；下次 watcher 事件重试

### Requirement: 唯一写者

除 db 损坏重建外，`files` / `tags` / `file_tags` / `files_fts` 四张表 MUST 仅由 `indexer` 服务写入。其他模块 MAY 读取但 MUST 通过调用 indexer API 触发变更。

#### Scenario: 外部禁止直写

- **WHEN** 代码审核发现其他模块直接 `INSERT INTO files`
- **THEN** 违反本规范，需重构走 indexer API（此 scenario 为代码审查约定，测试用静态规则/lint 或约定文档呈现）

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
