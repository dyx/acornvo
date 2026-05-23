## Context

PRD 定义了完整的 SQLite schema（详见 prd.md 数据模型节）：`files` / `tags` / `file_tags` / `files_fts` / `bookmarks` / `chats` / `queue` / `usage`。后续 9 个 change 都会往这个 db 读写。

已确立的前置：

- phase 1：`better-sqlite3` 在主进程运行；主进程已有日志
- phase 2：每树林 `.acornvo/` 已初始化；打开/切换树林事件已广播（`project:changed`）

关键约束：

- `better-sqlite3` 必须匹配 Electron ABI，需 `electron-rebuild`
- FTS5 虚拟表需要 SQLite 编译时启用（`better-sqlite3` 默认已启用）
- WAL 模式在云同步目录下可能被撕裂 → phase 2 的同步目录检测 + `.nosync` 已缓解
- 一树林一 db；切换树林必须串行关闭旧句柄再开新句柄，避免两个句柄共存
- 所有 schema 变更走 migration 文件，不做 in-code schema（避免多人协作漂移）

## Goals / Non-Goals

**Goals:**

- 可复用的迁移框架（`PRAGMA user_version` + `migrations/NNN_name.sql` 有序执行）
- 一次把 PRD 数据模型里的全部表 + 索引 + FTS5 虚拟表建出来
- 损坏检测与重建：启动时 `PRAGMA integrity_check`，异常则保留损坏文件 + 建新空 db
- 树林切换时安全关闭旧 db
- 最小 IPC 表面：只暴露 `db.version()` / `db.integrityCheck()`，业务查询各模块自己扩
- `better-sqlite3` 的 native 构建在三平台 CI 可跑（本阶段打通开发机即可）

**Non-Goals:**

- 不做**数据**迁移（没有旧数据）；migration 只处理 schema
- 不做向下迁移（down migration）——版本单调递增，出错只能重建
- 不做查询层 ORM 抽象（继续写裸 SQL）
- 不做 db 级加密（性能代价不划算，API Key 走 safeStorage）
- 不做 SQLite 版本探测与 polyfill（`better-sqlite3` 绑定的 SQLite 足够新）

## Decisions

### D1: Migrations 形态

`electron/services/db/migrations/` 目录下：

```
001_init.sql
002_xxx.sql  ← 后续 change 追加
...
```

`db.ts` 启动时：

1. 读 `PRAGMA user_version`（新库为 0）
2. 列出 migrations 目录按数字排序
3. 逐个比对：若 `user_version < NNN` 则在单事务内 `exec(sqlText)` + `PRAGMA user_version = NNN`
4. 事务失败 → rollback → 抛错 → 主进程捕获 → 走"损坏重建"分支（保底）

**理由**：

- 单事务保证 schema 变更原子性
- 文件名带数字前缀避免并发 PR 冲突（前缀按 change 的顺序分配）
- 不用 JS 代码构建 SQL，纯 .sql 文件便于 review 与 diff

**备选**：`knex` / `drizzle-kit` 等——过度工程，本项目不需要查询构造器。

### D2: 按树林切换 db 句柄

`db.ts` 持单例 `current: Database | null`。订阅 `project:changed`：

- 收到 path → `openForGrove(path)`
- 收到 null → `closeCurrent()`

`openForGrove(path)`：

1. `closeCurrent()`（若存在）
2. 创建 `path/.acornvo/` 目录（phase 2 已建，防御性）
3. `new Database(path/.acornvo/index.db)`
4. 启用 pragmas（D3）
5. `integrityCheck()`；失败则 `backupAndRebuild(path)` 后再打开新空库
6. 跑 migrations
7. 登记 current

`closeCurrent()`：

1. `db.pragma('wal_checkpoint(TRUNCATE)')`
2. `db.close()`
3. 设 current=null

### D3: 打开库时的默认 pragma

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -20000;  -- 20MB
PRAGMA mmap_size = 268435456; -- 256MB
```

**理由**：

- WAL：读写并发友好
- `synchronous=NORMAL` + WAL：崩溃最多丢最后一个事务（可接受）；索引丢了能从 md 重建
- `mmap_size` / `cache_size`：对万级文件库的查询有明显提升

### D4: 损坏重建

```
integrityCheck() 返回不是 'ok'
  ↓
closeCurrent()（若打开了）
  ↓
rename index.db → index.db.corrupt-<ts>
rename index.db-wal → index.db.corrupt-<ts>-wal (if exists)
rename index.db-shm → index.db.corrupt-<ts>-shm (if exists)
  ↓
logger.warn(...)
push IPC 事件 db:rebuilding → renderer toast
  ↓
new Database(...) 并跑 migrations 初始化空 schema
  ↓
push IPC 事件 db:rebuilt → renderer 确认（后续阶段由 indexer 触发真正回填）
```

**理由**：索引可从 md 重建（PRD 多次强调），损坏 db 不影响用户数据；保留损坏文件用于事后分析。

### D5: 001_init.sql 内容

完整建表（按 PRD 数据模型节的 DDL 原样落）+ 所有索引 + FTS5 虚拟表。同时一次性加：

- `files.content_hash` 的索引（后续去重要用）
- `files_fts` 的 `tokenize='simple'`（中文分词由应用层 jieba 做，见 phase 8）
- `usage.purpose` 的索引（用量聚合查询会用）

**理由**：一次建全避免"新 migration 只是加一列"的琐碎脚本；PRD 已明确 schema，没有未知。

### D6: 关闭流程

- `app.on('will-quit')` 里调 `closeCurrent()`（try/catch 吞异常，日志记录）
- `grove.closeGrove()`（phase 2）也调 `db.closeCurrent()`
- 两处调用互不依赖，幂等

### D7: 开发构建

`package.json`：

```json
"scripts": {
  "postinstall": "electron-rebuild -f -w better-sqlite3"
}
```

`electron.vite.config.ts`：主进程 `build.rollupOptions.external = ['better-sqlite3']`。

**理由**：better-sqlite3 是原生模块，vite 不能把它打进 bundle。

### D8: IPC 最小暴露

`db.version(): { user_version: number, migrations_applied: string[] }`
`db.integrityCheck(): 'ok' | string`

其他表（files / tags / ...）的查询 IPC 由各模块（indexer / search / queue / usage）的 change 自己定义。本阶段不设"通用 query IPC"——避免 renderer 能构造任意 SQL。

## Risks / Trade-offs

- **electron 版本升级导致 better-sqlite3 ABI 不匹配** → CI 在每次 `package.json` 改动时跑 postinstall；开发者机第一次遇到报错能按提示手动 `npm rebuild`
- **`wal_checkpoint(TRUNCATE)` 在 db busy 时可能失败** → 先用 `PASSIVE` 尝试，失败则退回普通 close；反正下次启动会恢复
- **云同步目录下 WAL 撕裂** → phase 2 的 `.nosync` + banner 兜底；极端情况损坏自检能救回
- **迁移文件冲突（两个 change 同时占 002 序号）** → 合并时手动重排（仓库约定：change 提案时预留序号；由 openspec 审阅时分配）
- **FTS5 虚拟表对触发器的依赖** → `files` 表变更 → `files_fts` 同步由**应用层**在写入时显式维护（同一事务），不用 SQL 触发器（便于中文分词控制）——本阶段建表时不装触发器
- **SQLite 文件大小与云盘限制** → 不做处理；用户责任

## Migration Plan

无旧数据。

回滚：`rm -rf <grove>/.acornvo/index.db*` 后应用重启自动重建（空索引），用户后续阶段里触发重新全量扫描。

## Open Questions

- 是否对 `bookmarks` / `chats` 这类"用户数据"与 `files` / `usage` 这类"可重建数据"分库？**否**，一库简化；从 md 重建时只重建 files/tags/file_tags/files_fts，保留其他表（phase 5 indexer 实现）
- 是否支持多 db 并存（未来多租户）？**否**，单一 current db 足够
