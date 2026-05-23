## ADDED Requirements

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

### Requirement: FTS5 写入占位

索引器 SHALL 对每个 md 文件维护 `files_fts` 行。`content` 字段 MUST 写入 body 原文；系统 SHALL 预留 `tokenizer: (text) => string` 接入点（默认为 identity 函数）以便 phase 8 注入分词器。

#### Scenario: FTS5 行同步

- **WHEN** 一个文件 body 变更
- **THEN** `files_fts` 对应 rowid 的 `content` 被重写

### Requirement: 唯一写者

除 db 损坏重建外，`files` / `tags` / `file_tags` / `files_fts` 四张表 MUST 仅由 `indexer` 服务写入。其他模块 MAY 读取但 MUST 通过调用 indexer API 触发变更。

#### Scenario: 外部禁止直写

- **WHEN** 代码审核发现其他模块直接 `INSERT INTO files`
- **THEN** 违反本规范，需重构走 indexer API（此 scenario 为代码审查约定，测试用静态规则/lint 或约定文档呈现）
