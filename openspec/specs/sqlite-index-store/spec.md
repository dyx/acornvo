# sqlite-index-store Specification

## Purpose
Per-grove SQLite index database lifecycle — creation, pragma configuration, integrity checking, corruption recovery, safe closure, and minimal IPC surface for runtime observability.

## Requirements
### Requirement: 每树林单一 SQLite 数据库
系统 SHALL 为每棵树林在 `<grove>/.acornvo/index.db` 维护一份独立 SQLite 数据库。任一时刻 MUST 至多存在一个打开的 db 句柄。

#### Scenario: 首次打开树林创建 db
- **WHEN** 打开一棵首次使用的树林
- **THEN** 文件 `<grove>/.acornvo/index.db` 存在
- **AND** `PRAGMA user_version` 返回最新迁移版本号

#### Scenario: 重复打开同一树林复用路径
- **WHEN** 连续两次打开同一树林
- **THEN** 不创建第二份 db 文件；旧句柄被关闭后新句柄在同一文件上打开

### Requirement: WAL 与默认 pragma
每个新打开的 db SHALL 设置：`journal_mode=WAL` / `synchronous=NORMAL` / `foreign_keys=ON` / `busy_timeout=5000` / `temp_store=MEMORY`。以上 pragma MUST 在任何业务 SQL 执行前完成设置。

#### Scenario: WAL 文件出现
- **WHEN** 打开树林后执行一次任意 INSERT
- **THEN** `.acornvo/index.db-wal` 与 `.acornvo/index.db-shm` 文件出现

#### Scenario: foreign_keys 启用
- **WHEN** 向一个带外键约束的表插入非法引用
- **THEN** 语句抛 `SQLITE_CONSTRAINT_FOREIGNKEY` 错误

### Requirement: 完整性自检与损坏重建
系统 SHALL 在每次打开 db 后执行 `PRAGMA integrity_check`。若结果不是 `'ok'`，系统 MUST 关闭当前句柄、把 `index.db` 及其 `-wal` / `-shm` 文件重命名为 `index.db.corrupt-<ISO timestamp>*`，然后创建空 db 并重跑全部 migrations。过程中 MUST 向渲染端推送 `db:rebuilding` 事件，重建完成后推送 `db:rebuilt`。

#### Scenario: 损坏的 db 被替换
- **WHEN** 打开树林时 integrity_check 返回非 `'ok'`
- **THEN** 原文件被重命名为 `index.db.corrupt-<ts>`
- **AND** 新建的 `index.db` 含全部表结构但无数据
- **AND** 日志记录告警

#### Scenario: 重建期间 UI 提示
- **WHEN** 重建开始
- **THEN** 渲染端收到 `db:rebuilding` 事件
- **WHEN** 重建结束
- **THEN** 渲染端收到 `db:rebuilt` 事件

### Requirement: 关闭前 checkpoint
系统 SHALL 在关闭 db 句柄前执行 `PRAGMA wal_checkpoint(TRUNCATE)`（失败时回退 `PASSIVE`），以便 `-wal` / `-shm` 合入主文件。

#### Scenario: 退出清理
- **WHEN** 应用正常退出
- **THEN** `index.db` 的最后修改时间更新，`-wal` 文件大小归零或被清理

### Requirement: 最小 IPC 表面
系统 SHALL 暴露两个 IPC 方法用于运维观测：`db.version()` 返回 `{ user_version, migrations_applied }`；`db.integrityCheck()` 返回 `'ok'` 或错误字符串。系统 MUST NOT 暴露任意 SQL 执行的 IPC。

#### Scenario: version 查询
- **WHEN** 渲染端调用 `window.api.db.version()`
- **THEN** 返回当前 user_version（≥ 1）与已应用 migrations 文件名列表

#### Scenario: 任意 SQL 不可达
- **WHEN** 渲染端尝试调用 `window.api.db.exec('...')`
- **THEN** TypeScript 编译失败；运行时不存在该方法
