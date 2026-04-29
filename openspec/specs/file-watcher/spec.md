# file-watcher Specification

## Purpose
TBD - created by archiving change phase-05-indexer-watcher. Update Purpose after archive.

## Requirements

### Requirement: chokidar 增量监听
全量扫描完成后系统 SHALL 启动 chokidar 监听树林根，配置 `ignoreInitial: true`、`followSymlinks: false`、`awaitWriteFinish`。监听 MUST 忽略 `.acornvo/` / `.obsidian/` / `.git/` / `node_modules/` 以及非 md 文件。

#### Scenario: 外部新增 md
- **WHEN** 外部在 `notes/new.md` 写入一个新文件
- **THEN** 1 秒内 `files` 表多出一行，`files_fts` 同步
- **AND** 发出 `index:fileChanged` 事件

#### Scenario: 外部删除 md
- **WHEN** 外部删除 `notes/x.md`
- **THEN** `files` 表对应行被删，`file_tags` 联动清理
- **AND** 发出 `index:fileDeleted` 事件

### Requirement: 自我过滤
索引器 SHALL 维护 `selfWrites: Map<absPath, { mtimeMs, expiresAt }>`（TTL 3 秒）。`file.write` 成功后 MUST 把写入路径 + mtime 登记。chokidar 事件命中登记项（路径一致且 mtime ±50ms 内）MUST 被忽略且从 map 中移除。

#### Scenario: 应用自身写不触发事件
- **WHEN** 应用调用 `file.write('a.md', ...)` 写磁盘
- **THEN** chokidar 随后触发的 `change` 事件被自我过滤消费掉
- **AND** 不产生 `index:fileChanged` 事件（因为索引已在写入同步更新）

#### Scenario: TTL 外的真实外部改动
- **WHEN** 应用写 a.md 后 5 秒，外部再次改 a.md
- **THEN** 事件不被过滤（TTL 已过），正常触发 `index:fileChanged`

### Requirement: 批处理 + 单事务
系统 SHALL 对 chokidar 事件以 debounce 500 ms 聚合，到期 flush 时在单一 SQLite 事务内应用全部变更。

#### Scenario: git pull 一次改 100 个文件
- **WHEN** 外部同时改动 100 个 md
- **THEN** 索引在 ~1 秒内完成全部更新且用 1 个事务提交
- **AND** UI 查询在事务结束后看到全部新数据

### Requirement: rename 识别
系统 SHALL 把 "unlink 后 500 ms 内出现相同 `content_hash` 的 add" 识别为 rename。rename MUST 更新 `files.path` 而非 delete + insert；`file_tags` / FTS5 / 关联外部目录（history / conflicts）引用 MUST 相应更新。

#### Scenario: 外部重命名文件
- **WHEN** 外部把 `old.md` 重命名为 `new.md`（内容未动）
- **THEN** `files` 中该行 `path` 变为 `new.md`，`content_hash` 不变
- **AND** 发出 `index:fileRenamed { oldPath, newPath }` 事件
- **AND** `file_tags` 行通过 `path` 外键仍正确关联

#### Scenario: 同内容两文件的移动
- **WHEN** `a.md` 删除 + `b.md`（内容与 `a.md` 相同）创建（但实际是两个不同内容的巧合）
- **THEN** 被视为 rename（依 D1 理由接受）

### Requirement: 公开事件
系统 SHALL 向订阅方发出以下聚合事件（封装后非 raw chokidar）：`index:fileChanged` / `index:fileDeleted` / `index:fileRenamed`。事件 payload MUST 含相对路径；`fileChanged` 附带 `contentHash`、`mtime`、`frontmatter`。

#### Scenario: 事件载荷
- **WHEN** 索引更新一条 file 记录
- **THEN** `index:fileChanged` 事件载荷含 `path`、`contentHash`、`mtime`、`frontmatter`
