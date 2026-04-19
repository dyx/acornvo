## MODIFIED Requirements

### Requirement: FTS5 写入占位
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
