## Why

SQLite `files` / `tags` / `file_tags` / `files_fts` 是所有视图（果仓、搜索、筛选）与 AI 模块（理果查标签词汇表、松语 `list_files` tool）的查询源，但它们只是**从 md 派生的索引**。没有索引器，打开树林看到的是空壳；没有 watcher，外部编辑器（Obsidian / git pull）的改动不会被感知；没有自我过滤，应用自己写 md 会被 watcher 误报触发无穷循环。本阶段把这条"md → SQLite"的同步管道建好，并在启动时跑一次全量扫描把树林变成可见可查。

## What Changes

- **启动全量索引**：进入树林后扫描树林内所有 `*.md`（递归、跳过 `.acornvo/` / `.obsidian/` / `.git/` / `node_modules/`）
  - 逐文件计算 `content_hash`（sha256 of body 而非整文件，避免 frontmatter 无关变更触发 AI 重跑）、`mtime`、解析 frontmatter
  - 与 SQLite `files.content_hash` 比对：未变则跳过；变了则更新 `files` / `tags` / `file_tags` 并重写 `files_fts`
  - 磁盘上已删除但索引里仍在的：删除索引行
  - 新文件：insert
- **进度报告**：扫描过程向 renderer 推送 `index:progress { scanned, total, currentPath }`，完成时 `index:done`；支持 `index:cancel`（cancel 后停止但保持已完成的部分）
- **chokidar 增量监听**：全量扫描完成后启动监听，`add` / `change` / `unlink` / 重命名事件 → 增量同步
- **自我过滤**：保留"自己刚写的路径 + mtime"集合（TTL 3s）；watcher 事件命中则忽略（index 已在写入时同步更新过了）
- **批处理模式**：收到事件后 debounce 500ms，期间聚合的所有事件走**单一 SQLite 事务**提交（应对 git pull / 目录 rename 等事件风暴）
- **rename 识别**：`unlink` 后 500ms 内出现同 `content_hash` 的 `add` → 视为 rename，更新 `files.path` 而非 delete + insert；附带更新 `.acornvo/history/<path>/` 与未来 `.acornvo/conflicts/<path>/` 子目录位置（conflicts 目录本阶段尚未产生内容，但接口预留）
- **FTS5 写入**：body 不直接写 `files_fts.content`；本阶段只写"占位"（原文全量，未分词）；**中文分词交给 phase 8** 的 jieba 接入，本阶段先保证 FTS5 表有行，后续 change 改写 writer 即可
- **IPC 表面**：`index.startScan()` / `index.cancelScan()` / `index.status()`；事件通道 `index:progress` / `index:done` / `index:error`
- **启动门禁**：PRD 要求"已索引完毕后才允许理果 / 松语"——本阶段实现 `indexReady` 状态，renderer 通过 `index.status()` 拿到；理果/松语模块（phase 14-17）以此为前置条件
- **不在本阶段**：Library UI（phase 6）、冲突处理（phase 9）、search UI（phase 8）、jieba 分词（phase 8）、理果自动 enqueue（phase 15）
- **不在本阶段**：watcher 监听 `.acornvo/` 内部变化（理果/队列自己维护）

## Capabilities

### New Capabilities

- `file-indexer`: md 文件的全量/增量 → SQLite 同步（files / tags / file_tags / files_fts 写入）
- `file-watcher`: chokidar 封装，含自我过滤、批处理、rename 识别
- `index-startup-progress`: 启动全量扫描的进度/取消/完成事件与 UI 遮罩

### Modified Capabilities

- `md-file-io`: `file.write` 在成功后 MUST 通知 watcher 的自我过滤集合（机制层集成）

## Impact

- **新增代码**：`electron/services/indexer.ts`、`electron/services/watcher.ts`、`electron/services/index-queries.ts`（files/tags/file_tags CRUD + upsert by path）、`electron/ipc/index.ts`
- **依赖新增**：`chokidar`
- **契约扩展**：`shared/ipc-contract.ts` 新增 `index` 命名空间 + 事件通道
- **状态扩展**：主进程 `IndexState: 'idle' | 'scanning' | 'ready' | 'watching' | 'error'`；切树林时回到 `idle`
- **db 写入**：索引器与后续 indexer 生成的 SQLite 行的唯一权威写者（其他模块可查但原则上通过此服务改写 `files` / `tags` / `file_tags` / `files_fts`，避免双写）
- **可观察产物**：打开含 50 个 md 的树林 → 全屏遮罩 `索引中 34/50...` → 几秒后遮罩消失；`window.api.index.status()` 返回 `{ state: 'watching', total: 50 }`；外部新建文件 `notes/x.md` → 1 秒内 SQLite 多一行
