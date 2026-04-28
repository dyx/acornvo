## 1. 依赖与目录

- [x] 1.1 `npm install chokidar`
- [x] 1.2 新增 `electron/services/indexer.ts`、`electron/services/watcher.ts`、`electron/services/index-queries.ts`、`electron/ipc/index.ts`

## 2. 查询层（electron/services/index-queries.ts）

- [x] 2.1 `upsertFile(db, row)`：INSERT OR REPLACE `files`；返回是否新增/更新/未变
- [x] 2.2 `deleteFile(db, path)`：DELETE `files` + 联动删 `file_tags` + `files_fts`
- [x] 2.3 `renameFile(db, oldPath, newPath)`：事务内 UPDATE `files.path` / `file_tags.path` / `files_fts.path`
- [x] 2.4 `syncTags(db, path, tags: string[])`：diff 旧新 tags → `INSERT OR IGNORE tags` + 更新 `file_tags` + 更新 `tags.usage_count`
- [x] 2.5 `upsertFts(db, { rowid, path, title, summary, content }, tokenizer)`：删旧行再插；`content` 经 `tokenizer(body)` 处理（默认 identity）
- [x] 2.6 `listAllPaths(db)`：返回全部 `files.path` 的 Set（供 diff）
- [x] 2.7 `queryBy(db, { category?, tag?, rating?, limit, offset, orderBy })`：为 phase 6 果仓提供分页查询（基础实现，可不做复杂 JOIN 优化）

## 3. 索引器（electron/services/indexer.ts）

- [x] 3.1 `IndexState` 状态机 + `stateChange` EventEmitter + `state()` getter
- [x] 3.2 `walk(groveRoot, skipSet)`：async generator 产出 `{ absPath, relPath }`；跳过目录集合 + symlink
- [x] 3.3 `startScan(groveRoot)`：
  - [x] 3.3.1 状态转 `scanning`
  - [x] 3.3.2 先轻量 pre-count（仅 `readdir` 统计 *.md 数量）填 `total`
  - [x] 3.3.3 遍历文件：`file.read` → `parseFile` → sha256(body) → 与 db 行对比 → upsert/skip
  - [x] 3.3.4 每 50 文件或 2 秒推一次 `index:progress`
  - [x] 3.3.5 `abort` 标志 check；每文件前检查
  - [x] 3.3.6 walker 结束后：`listAllPaths - seenPaths` → `deleteFile` 循环
  - [x] 3.3.7 状态转 `ready` → 调 watcher.start → 状态转 `watching`
  - [x] 3.3.8 推 `index:done`
- [x] 3.4 `cancelScan()`：置 abort；等当前文件处理完毕；状态回 `idle`
- [x] 3.5 `status()`：`{ state, total, scanned, error? }`
- [x] 3.6 `tokenizer` 注入点：模块级变量，`phase 8` 注入 jieba；默认 `(t) => t`

## 4. Watcher（electron/services/watcher.ts）

- [x] 4.1 `selfWrites: Map<absPath, { mtimeMs, expiresAt }>`；导出 `registerSelfWrite(abs, mtimeMs)` / `shouldIgnore(abs, mtimeMs)`
- [x] 4.2 30s 定期 GC 过期条目
- [x] 4.3 `start(groveRoot)`：chokidar.watch 配置（见 design D3）；注册事件 handler
- [x] 4.4 事件缓冲 `batch: Map<absPath, EventEntry>`；debounce 500ms flush
- [x] 4.5 flush：打开 db 事务 → 先 unlink 再 add/change → rename 识别（500ms 窗内 content_hash 相同）→ 调 `index-queries` 对应 API → commit
- [x] 4.6 flush 结束推 `index:fileChanged` / `index:fileDeleted` / `index:fileRenamed` 事件
- [x] 4.7 重启机制：watcher 自身 `error` 事件 → 尝试重启 3 次（每次间隔 2s）；失败则 `IndexState=error`
- [x] 4.8 `stop()`：`watcher.close()` + 清 selfWrites map

## 5. phase 4 回归集成

- [x] 5.1 修改 phase 4 的 `file.write`：写入成功后调 `watcher.registerSelfWrite(abs, newMtimeMs)`
- [x] 5.2 修改 `file.rename`：登记 oldPath + newPath 两项 selfWrites（防止 unlink 与 add 事件都被当外部）

## 6. IPC（electron/ipc/index.ts + 契约）

- [x] 6.1 `shared/ipc-contract.ts` 新增 `index` 命名空间：`status()` / `startScan()` / `cancelScan()`
- [x] 6.2 事件通道：`index:progress` / `index:done` / `index:error` / `index:stateChange` / `index:fileChanged` / `index:fileDeleted` / `index:fileRenamed`
- [x] 6.3 handler 实现：`status` 委托 indexer；`startScan` 拒绝在 `scanning` 状态下重复启动；`cancelScan` 委托 indexer

## 7. 生命周期集成

- [x] 7.1 订阅 `project:changed` 事件：新 grove → `indexer.startScan(path)`；null → `watcher.stop() + indexer.reset()`
- [x] 7.2 `app.on('will-quit')`：`watcher.stop()`
- [x] 7.3 `closeGrove()` 先 `watcher.stop()` 再 `db.closeCurrent()`

## 8. 渲染端进度遮罩

- [x] 8.1 `src/components/IndexProgressOverlay.tsx`：全屏半透明 + 进度条 + "后台继续"按钮（调 `cancelScan`）
- [x] 8.2 挂在 `App.tsx`：订阅 `index:stateChange` + `index:progress`；状态 `scanning` 时显示
- [x] 8.3 显示文件计数 `scanned / total` + 当前 `currentPath` 截断显示
- [x] 8.4 i18n key 写入 `zh-CN.json`

## 9. 验收

- [x] 9.1 准备 50 个 md 的测试树林 → 打开树林 → 见进度遮罩 → 完成后 `files` 表 50 行
- [x] 9.2 外部 `echo '# x' > notes/new.md` → 1s 内 `files` 多 1 行；`index:fileChanged` 事件发出
- [x] 9.3 外部 `rm notes/x.md` → 行被删除；`index:fileDeleted` 事件
- [x] 9.4 外部 `mv a.md b.md` → `files.path` 更新为 `b.md`；无 delete+insert
- [x] 9.5 应用自身 `file.write('a.md', ...)` → watcher 事件被自我过滤，不产 `index:fileChanged`
- [x] 9.6 批处理：`cp -r src dst`（含 30 个 md）→ 一个事务内完成，UI 查询在 ~1s 内看到新数据
- [x] 9.7 仅 frontmatter 改：`content_hash` 不变；frontmatter_json 已更新
- [x] 9.8 `index.cancelScan()` 中断 → `IndexState=idle`；已扫描部分数据保留
- [x] 9.9 `openspec validate phase-05-indexer-watcher --strict` 通过
