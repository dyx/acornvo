# search-index-fts5 Specification

## Purpose

FTS5 全文搜索索引，管理 `files_fts` 虚表的 schema、migration、升级自愈重建，以及与 indexer 的同步写入。

## Requirements

### Requirement: FTS5 虚表 Schema

系统 SHALL 在 `migrations/002_fts.sql` 创建 FTS5 虚表 `files_fts(path UNINDEXED, title, body, tokenize = 'trigram')`，并把 `PRAGMA user_version` 推进到 `2`。非 external content 模式（自己存 body）。

#### Scenario: 初始建表

- **WHEN** 全新树林首次 open
- **THEN** migration runner 执行 001 + 002；`files_fts` 存在；`SELECT COUNT(*) FROM files_fts` = 0（待 indexer 填充）

#### Scenario: 版本推进

- **WHEN** migration 002 完成
- **THEN** `PRAGMA user_version` = 2

### Requirement: 升级自愈重建

启动时系统 SHALL 执行 `maybeRebuildFts()`：若 `COUNT(files) > 0` 且 `COUNT(files_fts) = 0`，MUST 触发全量 rebuild（对每个 files 行调 `file.read(absPath)` 拿 body，insert 到 `files_fts`）。rebuild 过程 MUST 通过 IndexBanner 暴露进度（`rebuilt / total`）；rebuild 期间 `search.fullText` MUST 返回 `{ items: [], pending: true }` 以便 UI 提示"索引构建中"。

#### Scenario: 老版本升级

- **WHEN** 用户从 phase 5 升级到 phase 8，重新打开树林；`files` 已有 8000 行、`files_fts` 为空
- **THEN** 启动日志出现 `fts rebuild start 0/8000`；UI 顶部显示进度条；期间全文搜索返回 pending

#### Scenario: 正常启动无 rebuild

- **WHEN** `files_fts` 行数 > 0
- **THEN** 直接进入 watching，不触发 rebuild

#### Scenario: rebuild 中途崩溃

- **WHEN** 进程被 kill，rebuild 只写了 3000/8000 行
- **THEN** 下次启动 `COUNT(files_fts) = 3000 > 0` → 不再 rebuild；FTS 处于部分状态 → 提供手动 `search.rebuild()` IPC（设置页入口，本阶段暂不验收该入口）

### Requirement: Indexer 同步写 FTS

`file-indexer` 的 upsert/delete/rename 路径 MUST 在同一 transaction 内同步写 `files_fts`。body 从 `file.read(absPath)` 拿到，和 `content_hash` 计算共用同一 body 变量（避免二次读盘）。

#### Scenario: 新增文件

- **WHEN** 新建 `notes/x.md`（body="注意力机制研究"）
- **THEN** 事务内 `INSERT OR REPLACE INTO files ...` 与 `INSERT INTO files_fts(rowid, path, title, body)` 均完成；事务外可用 `files_fts MATCH '注意力'` 命中

#### Scenario: 删除文件

- **WHEN** 外部删除 `notes/x.md`
- **THEN** `DELETE FROM files WHERE path=?` 与 `DELETE FROM files_fts WHERE rowid=?` 同事务完成

#### Scenario: 重命名

- **WHEN** rename `notes/x.md` → `notes/y.md`
- **THEN** `files.path` 与 `files_fts.path` 同时更新；`rowid` 保持不变
