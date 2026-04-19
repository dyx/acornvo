## Context

前置：
- phase 3 的 SQLite + migrations（files / tags / file_tags / files_fts / ... 已建表）
- phase 4 的 `file.read` / `frontmatter.parseFile` / `safeResolve`
- phase 2 的 `project:changed` 事件驱动 db / watcher 切换

下游强依赖：
- phase 6 果仓 UI 查 files 表
- phase 8 全文搜索需要 FTS5（本阶段先写占位 content，分词在 phase 8 再改）
- phase 9 冲突处理复用 watcher 的 clean/dirty 判断（本阶段仅提供 raw 事件通道 + 自我过滤；clean/dirty 分叉逻辑在 phase 9）
- phase 15 理果自动入队（本阶段暴露 `index:fileChanged` 事件供 phase 15 订阅）

## Goals / Non-Goals

**Goals:**
- 启动进入树林后能看到完整可查的文件索引
- 外部改动（Obsidian/git pull/Finder）几秒内反映到索引
- 应用自己的写不触发自我误报
- 目录级事件风暴（git pull、批量重命名）不压垮 db
- 进度可视、可取消
- 索引器是 `files`/`tags`/`file_tags`/`files_fts` 的**唯一写者**（除损坏重建）

**Non-Goals:**
- 不做"内容已变要不要重新理果"的 UI 决策（phase 15）
- 不做冲突热重载 / toast（phase 9）
- 不做中文分词（phase 8）
- 不监听 `.acornvo/` 内部
- 不把 watcher 事件直接推给 renderer UI（UI 层以 `index:fileChanged` / `index:fileDeleted` / `index:fileRenamed` 聚合事件订阅）

## Decisions

### D1: `content_hash` 的计算对象

选择：`sha256(body)`（解析 frontmatter 后的正文）。

**理由**：
- 理果会改 frontmatter；若 hash 含 frontmatter，每次理果后 hash 变，触发连锁误判
- 用户编辑正文 hash 才变，与"内容变了要重新理果"的直觉一致
- 搜索/去重也以 body 语义为准

**备选**：
- `sha256(fullFile)`：对冲突检测更准但与上述冲突
- 同时保存两种 hash：过度设计

### D2: 启动全量扫描流程

```
switchToGrove(path)
  ↓
db.open + migrate（phase 3）
  ↓
indexer.startScan()
  ↓ (报告 total 未知 → 边走边递增)
walk(grove, skipSet={.acornvo,.obsidian,.git,node_modules,.trash})
  for each *.md:
    stat → file.read → frontmatter.parseFile → sha256(body)
    dbRow = db.get('SELECT * FROM files WHERE path=?', rel)
    if !dbRow: INSERT
    elif dbRow.content_hash === hash && dbRow.mtime === mtime: skip
    else: UPDATE
    每 50 文件一个事务提交；同时推 `index:progress { scanned, total }`
  afterWalk:
    diff: SELECT path FROM files 减去 walker 见过的 path 集合 → DELETE
  ↓
state='ready'
  ↓
watcher.start(grove)
  ↓
state='watching'
```

- `total` 启发：先 `fs.readdir` 快速数一遍（只列文件数量，不读内容）给 UI 一个估算；真实进度仍按 scanned 递增
- `cancel`：设置 `abort=true`；walker 每个文件前 check；取消后保持已完成的数据库状态；state 回到 `idle`（可再次 startScan）

### D3: chokidar 配置

```ts
chokidar.watch(groveRoot, {
  ignored: [
    /(^|[\/\\])\../,   // dotfiles（.acornvo/.obsidian/.git/.DS_Store）
    /node_modules/,
    '**/*.tmp', '**/*~', '**/*.swp',
    (p) => !p.endsWith('.md') && fs.statSync(p).isFile(),  // 非 md 文件直接忽略
  ],
  persistent: true,
  ignoreInitial: true,          // 我们自己做初始全量
  awaitWriteFinish: {
    stabilityThreshold: 200,     // 等写完
    pollInterval: 50
  },
  followSymlinks: false,         // 不跟 symlink
  usePolling: false,             // 先默认 false；云盘失灵时后续可切 polling
})
```

事件：`add` / `change` / `unlink` / `addDir` / `unlinkDir` / `error` / `raw`。

**理由**：
- dotfiles 忽略掉 `.acornvo/` 自动包含
- `awaitWriteFinish` 避免大文件被半写感知
- `followSymlinks: false` 避免循环 + 越界

### D4: 自我过滤机制

模块 scope：
```
selfWrites: Map<absPath, { mtimeMs: number, expiresAt: number }>
```

- `file.write` 成功后 → `selfWrites.set(abs, { mtimeMs, expiresAt: now + 3000 })`
- watcher 收 `change`/`add` → 查 `selfWrites`；命中且 `mtimeMs` 匹配（±50ms）→ 忽略事件并从 map 删除条目
- 每 30s 清理过期条目

**理由**：
- 3s TTL：覆盖云盘延迟；过短漏过滤，过长外部快速改漏报
- mtimeMs 对比：防止相同路径的后续真实外部改动误命中

### D5: 批处理 + 单事务

收到事件后：
- `batch: Map<absPath, { kind: 'add'|'change'|'unlink', stat?, hash? }>`（同路径后来的覆盖前者）
- `scheduleFlush()`：debounce 500ms；flush 时打开 SQLite 事务：
  1. 对 `unlink` 先处理：按 path DELETE 索引行，记录被删的 `content_hash` 到 `pendingRenames`（path → hash）
  2. 再处理 `add`/`change`：读文件 → 计算 hash → 查 `pendingRenames` 中是否有 hash 相同项；命中则当 rename 处理（`UPDATE files SET path=? WHERE path=?` + 同步 tags 关联不变）；否则 upsert
  3. `commit`
- 事务期间任何读操作（UI 查询）会短暂被阻塞，可接受（< 100ms）

**理由**：rename 检测的 500ms 窗口与 debounce 重合；git pull 改 100 个文件走一个事务比 100 个事务快很多。

### D6: FTS5 写入（本阶段占位）

`files_fts`：`INSERT INTO files_fts(rowid, path, title, summary, content)`，`content` **本阶段存 body 原文**（不做分词）。phase 8 改写时：
- 删除所有 `files_fts` 行
- 用 jieba 分词重写 content 字段
- 此处接口留 `tokenizer: (text) => string`，默认 identity（传入即传出），phase 8 注入 jieba

**理由**：避免 phase 8 时整体重写 indexer；接入 jieba 仅改 writer 的一行。

### D7: IndexState 状态机

```
idle → scanning → ready → watching
                    ↓
                  idle (on grove close)
                    ↑
                  error (on unrecoverable watcher / db error)
```

- `idle`：未打开树林 / 刚打开还没 scan
- `scanning`：全量扫描中
- `ready`：扫描完、watcher 未启动（极短过渡）
- `watching`：watcher 就绪
- `error`：不可恢复（watcher 挂了且重启 3 次失败）

渲染端通过 `index.status()` 或订阅 `index:stateChange` 拿到状态；理果/松语按钮依此状态置灰（实装在 phase 15/17）。

### D8: 公开事件

供下游订阅：
- `index:progress` / `index:done` / `index:error` / `index:stateChange`（UI 用）
- `index:fileChanged { path, mtime, contentHash, frontmatter }`（phase 9 / 15 订阅）
- `index:fileDeleted { path }`（phase 9 订阅）
- `index:fileRenamed { oldPath, newPath }`（phase 9 / 10 订阅）

不暴露 raw chokidar 事件——统一封装后便于调优。

## Risks / Trade-offs

- **cp/mv 大量小文件触发事件风暴** → debounce + 单事务（D5）缓解；极端情况下 UI 感知卡顿 < 2s
- **chokidar 在 macOS 的 FSEvents 与 iCloud 延迟互动** → `awaitWriteFinish` 兜底；极端情况下写入后 > 2s 才被感知，能接受
- **NTFS/exFAT 上 mtime 精度仅 2s** → `selfWrites` 的 mtime 匹配容忍 ±50ms 在精度低时会失效，可退化为基于 "path + 写入时间 < TTL" 的过滤（添加 fallback 比较）
- **hash 碰撞 rename 误报** → sha256 碰撞概率可忽略；但"创建新文件与被删文件恰好同内容"会被当 rename；此情况用户感知不到差异（因为内容同，索引仍对），可接受
- **中途 app 被 kill** → watcher 中断；重启后全量扫描一次即恢复；可能错过 app-shutdown 到 app-restart 之间的 unlink 事件（重扫 diff 也能补上）
- **windows path 分隔符** → 内部一律用 posix `/` 存 SQLite path；读盘时规范化；输出到 UI 时保持

## Migration Plan

无存量。

回滚：关闭 watcher + `DELETE FROM files; DELETE FROM files_fts; DELETE FROM file_tags; DELETE FROM tags;` → 重启触发全量扫描。

## Open Questions

- 是否把 assets/（图片）也索引？**否**，只 md
- 是否支持不在根目录的"次级树林"（`/<grove>/sub-vault/`）嵌套？**否**，phase 2 打开时已警告嵌套（PRD 边界）
- 文件 `>5MB` 是否跳过索引？**否**但记录告警日志
