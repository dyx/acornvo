## 1. 依赖与构建

- [x] 1.1 `npm install better-sqlite3`；dev 依赖 `@electron/rebuild`
- [x] 1.2 `package.json` 增加 `"postinstall": "electron-rebuild -f -w better-sqlite3"`
- [x] 1.3 `electron.vite.config.ts`：主进程 `build.rollupOptions.external` 追加 `'better-sqlite3'`
- [x] 1.4 CI（若有）在 `npm ci` 之后显式触发 rebuild；三平台各跑一次确保构建通过
- [x] 1.5 新增目录 `electron/services/db/`、`electron/services/db/migrations/`

## 2. 迁移框架（electron/services/db/migrations.ts）

- [x] 2.1 `readMigrations(dir)`：扫 `NNN_*.sql`，按 NNN 升序返回 `{ version: number, name: string, sql: string }[]`
- [x] 2.2 `runMigrations(db)`：读 `PRAGMA user_version`，对每个 `m.version > current` 的迁移在单事务内执行 `db.exec(m.sql)` + `PRAGMA user_version = m.version`
- [x] 2.3 失败抛 `MigrationError`（含 version + 原始错误）；调用方触发重建
- [x] 2.4 `listApplied(db)`：返回 `user_version` 与 migrations 目录内 `<= user_version` 的文件名数组

## 3. 初始 SQL（electron/services/db/migrations/001_init.sql）

- [ ] 3.1 按 PRD 数据模型节 DDL 原样落：`files`（含 PK `path`、`mtime`、`content_hash`、`frontmatter_json` 列，+ `idx_files_category`、`idx_files_rating`）
- [ ] 3.2 `tags` / `file_tags`（含 PK 与 FK 到 files）
- [ ] 3.3 `files_fts`（`USING fts5(path UNINDEXED, title, summary, content, tokenize='simple')`）
- [ ] 3.4 `bookmarks`（含 `sort_order`）
- [ ] 3.5 `chats`（id TEXT PK、title、model、created_at、updated_at）
- [ ] 3.6 `queue`（含 `idx_queue_status`；对 `(path, status IN pending/running)` 的 uniqueness 通过 partial index 实现：`CREATE UNIQUE INDEX uq_queue_active_path ON queue(payload_json ->> '$.path') WHERE status IN ('pending','running') AND kind = 'review'`——后续理果 change 可能再调，本阶段建基础索引；payload_json path 提取见注释）
- [ ] 3.7 `usage`（含 `idx_usage_ts`、`idx_usage_model`、`idx_usage_purpose`）
- [ ] 3.8 文件首行注释 `-- migration: 001_init` 便于排错

## 4. 核心服务（electron/services/db.ts）

- [ ] 4.1 module-scoped `current: Database.Database | null`、`currentGrovePath: string | null`
- [ ] 4.2 `applyPragmas(db)`：设置 WAL / synchronous=NORMAL / foreign_keys=ON / busy_timeout=5000 / temp_store=MEMORY / cache_size=-20000 / mmap_size=268435456
- [ ] 4.3 `integrityCheck(db)`：`db.pragma('integrity_check', { simple: true })`；返回 `'ok'` 或错误串
- [ ] 4.4 `backupAndRebuild(grovePath)`：rename `index.db*` → `index.db.corrupt-<ts>*`；新建空 db 并跑 migrations；过程中 `webContents.send('db:rebuilding' | 'db:rebuilt')`
- [ ] 4.5 `openForGrove(grovePath)`：close current → ensure `.acornvo/` → new Database → applyPragmas → integrityCheck → 失败 backupAndRebuild → runMigrations → 登记 current
- [ ] 4.6 `closeCurrent()`：若 current 非空，尝试 `wal_checkpoint(TRUNCATE)`（失败退 PASSIVE）→ `db.close()` → 清 current
- [ ] 4.7 `getCurrent()` / `requireCurrent()`：后者在 null 时抛 `IpcError('E_NOT_FOUND', 'no grove opened')`（供后续模块使用）
- [ ] 4.8 对外暴露 `dbService` 单例（后续 indexer/search/queue/usage/bookmarks/chats 都通过此单例拿 db）

## 5. 与 grove 生命周期联动

- [ ] 5.1 在 `services/grove.ts` 的 `openGrove` 成功获取 lock + 读 project.json 之后串行调 `dbService.openForGrove(path)`
- [ ] 5.2 任一步骤失败：释放 lock、`dbService.closeCurrent()`、不更新 `last_opened_at`、IPC 返回 `E_INTERNAL`
- [ ] 5.3 `closeGrove()` 里先 `dbService.closeCurrent()` 再 release lock
- [ ] 5.4 `app.on('will-quit')` 里保底 `dbService.closeCurrent()`
- [ ] 5.5 `project:changed` 事件订阅逻辑集中在 `electron/main.ts`；收到新 path 调 `dbService.openForGrove`，null 则 `closeCurrent`

## 6. IPC（electron/ipc/db.ts）

- [ ] 6.1 `shared/ipc-contract.ts` 添加 `db` 命名空间：`version(): { user_version: number, migrations_applied: string[] }`、`integrityCheck(): 'ok' | string`
- [ ] 6.2 添加事件通道声明：`db:rebuilding`、`db:rebuilt`
- [ ] 6.3 handler 实现：`version` 委托 `dbService.current!`；若无 current 返回 `E_NOT_FOUND`
- [ ] 6.4 渲染端侧 `src/ipc/client.ts` 为 `on('db:rebuilding'|'db:rebuilt', cb)` 提供类型

## 7. 渲染端最小 UX 联动

- [ ] 7.1 `src/App.tsx` 订阅 `db:rebuilding` → 显示全屏遮罩 + 文案"索引损坏，正在重建"
- [ ] 7.2 订阅 `db:rebuilt` → 移除遮罩 + toast "索引已重建，部分数据将在后续步骤中恢复"
- [ ] 7.3 `src/components/DbHealthBadge.tsx`：可在 TitleBar 或 StatusBar 占位，显示 `user_version` + ✅/⚠️（本阶段可先不挂，留后续接入）

## 8. 验收

- [ ] 8.1 打开新树林 → `<grove>/.acornvo/index.db` 存在；`PRAGMA user_version` = 1
- [ ] 8.2 DevTools 执行 `window.api.db.version()` 返回 `{ user_version: 1, migrations_applied: ['001_init.sql'] }`
- [ ] 8.3 `window.api.db.integrityCheck()` 返回 `'ok'`
- [ ] 8.4 检查 `sqlite_master`：所有 PRD 列出的表与索引均存在
- [ ] 8.5 手动损坏：关闭应用 → 往 `index.db` 写入乱字节 → 启动应用
  - [ ] 8.5a 出现"正在重建"提示
  - [ ] 8.5b `index.db.corrupt-<ts>` 文件存在
  - [ ] 8.5c 新 `index.db` `user_version` = 1
- [ ] 8.6 切换树林 → 旧 db 文件出现 `.wal` 大小归零；新树林的 db 正常打开
- [ ] 8.7 macOS / Windows / Linux 开发机各跑通 `postinstall` + 启动
- [ ] 8.8 `openspec validate phase-03-sqlite-schema-migrations --strict` 通过
