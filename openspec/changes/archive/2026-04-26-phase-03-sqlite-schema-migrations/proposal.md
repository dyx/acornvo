## Why

Acornvo 数据模型是"本地 md 文件为真实源 + SQLite 作索引/缓存"。索引器、FTS5 搜索、理果队列、用量追踪、标记、对话元数据——后续 8+ 个 change 都需要一个可用的 SQLite 实例与版本化 schema。现在把 `better-sqlite3` 接好、把全量表结构一次建出来、把迁移框架与损坏重建逻辑先定型，后续每个 change 只往 migrations 目录追加一个有序脚本，而不是各自改 schema 定义、各自 hack 升级。

## What Changes

- 引入 `better-sqlite3`（同步 API，Electron 主进程使用）+ native 模块 rebuild 工作流
- 每棵树林一份 `<grove>/.acornvo/index.db`；在 `project:changed` 事件时切换 db 句柄，旧句柄关闭
- **迁移框架**：`electron/services/db.ts` 基于 `PRAGMA user_version`；`migrations/` 目录下 `001_init.sql` / `002_xxx.sql` 按序执行；每次启动比对目标版本，缺什么补什么
- **一次性全量建表**（`001_init.sql`）：`files` / `tags` / `file_tags` / `files_fts`（FTS5 虚拟表）/ `bookmarks` / `chats` / `queue` / `usage`，以及所有索引——对齐 PRD 数据模型节
- **WAL 模式** + `synchronous=NORMAL` + `foreign_keys=ON` + `busy_timeout=5000`
- **完整性自检**：启动时 `PRAGMA integrity_check`，失败时备份 `index.db.corrupt-<ts>` → 重建空 db → 提示用户"索引损坏，正在重建"（真正重建数据的是后续 `indexer-watcher` 阶段；本阶段只保证空 db + 提示）
- **同步目录护栏**：若检测到 `.acornvo/` 在 iCloud/Dropbox/OneDrive 等同步目录内（复用 phase 2 检测），强提醒 + 在该树林内写入 `.nosync` 占位（phase 2 已写，此处仅文档化依赖）
- **关闭流程**：`app.on('will-quit')` / `closeGrove` 时 `db.close()`；退出未关则 `better-sqlite3` 析构可能遗留 `-wal`/`-shm`，通过关闭前 `PRAGMA wal_checkpoint(TRUNCATE)` 清理
- **IPC 表面**：`db.integrityCheck()` / `db.version()`；本阶段不暴露业务查询（各模块自己按需扩展 IPC）
- **不在本阶段**：任何真实数据写入（没有索引器、没有 AI、没有查询 UI）；只验证"能打开、能跑完 migrations、能 `SELECT 1`"
- **不在本阶段**：SQLCipher / 加密 db（全文检索与中文分词性能优先；API Key 在 `secure-storage-settings` 里单独处理）

## Capabilities

### New Capabilities
- `sqlite-index-store`: 每树林 SQLite 数据库的生命周期、WAL/pragma 配置、完整性自检、损坏重建
- `db-migrations`: 版本化迁移脚本的执行、回退、`user_version` 跟踪
- `grove-db-binding`: 树林切换时 db 句柄的打开/关闭联动

### Modified Capabilities
- `grove-management`: 打开树林流水线中追加 "opened → db.init → integrity check → 可能重建" 一步

## Impact

- **新增代码**：`electron/services/db.ts`（句柄 + migrations runner + integrity + backup-rebuild）、`electron/services/db/migrations/001_init.sql`、`electron/services/db/queries/*.ts`（预留空壳）、`electron/ipc/db.ts`（极简 `version` / `integrityCheck` handler）
- **依赖新增**：`better-sqlite3`（需 native rebuild）；开发依赖 `@electron/rebuild`（electron-builder / vite 配置中集成）
- **构建影响**：`electron.vite.config.ts` 标记 `better-sqlite3` 为 external；`package.json` 的 `postinstall` 加 `electron-rebuild -f -w better-sqlite3`
- **文件系统**：首次打开树林会在 `<grove>/.acornvo/` 产出 `index.db` + `index.db-wal` + `index.db-shm`
- **可观察产物**：打开树林后 `<grove>/.acornvo/index.db` 存在，`PRAGMA user_version` = 1；DevTools `window.api.db.version()` 返回 `1`；手动损坏 db 后重启，出现"正在重建"提示，新 db 被创建，旧文件移至 `index.db.corrupt-<ts>`
