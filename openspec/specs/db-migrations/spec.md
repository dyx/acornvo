# db-migrations Specification

## Purpose

Versioned SQLite schema migration framework. Manages `migrations/NNN_*.sql` files, executes them in order against `PRAGMA user_version`, and provides idempotent, transactional schema evolution for the per-grove index database.

## Requirements

### Requirement: 版本化迁移执行

系统 SHALL 在每次打开 db 后按文件名数字前缀升序执行 `migrations/NNN_*.sql`，仅执行 `PRAGMA user_version` 小于该 NNN 的文件。每个迁移 MUST 在单事务内执行并在提交前把 `user_version` 更新为 NNN。

#### Scenario: 新库跑全量迁移

- **WHEN** 打开一个新创建的 db（`user_version` = 0）
- **THEN** 所有 migration 文件按序执行
- **AND** `user_version` 等于最大 NNN
- **AND** 日志记录每个已执行的文件名

#### Scenario: 增量迁移

- **WHEN** 打开一个已存在的 db（`user_version` = 1）且 migrations 目录存在 `002_xxx.sql`
- **THEN** 仅 `002_xxx.sql` 被执行
- **AND** `user_version` 变为 2

#### Scenario: 迁移失败回滚

- **WHEN** 某个 migration 的 SQL 执行中抛错
- **THEN** 事务被回滚，`user_version` 保持迁移前的值
- **AND** db 进入损坏重建流程（参见 sqlite-index-store）

### Requirement: 初始迁移（001）建表全量

`001_init.sql` SHALL 创建以下表与索引：`files` / `tags` / `file_tags` / `files_fts`（FTS5 tokenize=simple）/ `bookmarks` / `chats` / `queue` / `usage`。每张表的列、主键、外键、默认值 MUST 与 PRD 数据模型节的 DDL 完全一致。

#### Scenario: 初始 schema 完整

- **WHEN** 001 迁移执行完
- **THEN** `SELECT name FROM sqlite_master WHERE type='table'` 至少包含：`files`、`tags`、`file_tags`、`files_fts`、`bookmarks`、`chats`、`queue`、`usage`
- **AND** `sqlite_master` 中 `type='index'` 的行包含 `idx_files_category`、`idx_files_rating`、`idx_queue_status`、`idx_usage_ts`、`idx_usage_model`

#### Scenario: FTS5 可用

- **WHEN** 对 `files_fts` 执行 `INSERT INTO files_fts(path, title, summary, content) VALUES (...)` 与 `SELECT * FROM files_fts WHERE files_fts MATCH '<term>'`
- **THEN** 语句执行成功（不抛 "no such module: fts5"）

### Requirement: 迁移幂等与顺序约束

迁移文件名 MUST 形如 `NNN_*.sql`（NNN 为三位十进制数字）。不同 NNN 前缀 MUST 不重复；同一 db 同一 NNN 仅执行一次。

#### Scenario: 重复启动不重跑迁移

- **WHEN** 已完成全部迁移的应用被关闭后再次启动
- **THEN** 不再执行任何 migration 文件
- **AND** 日志不出现迁移执行记录
