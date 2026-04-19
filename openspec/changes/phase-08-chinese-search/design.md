## Context

前置：
- phase 3：`migrations/NNN_*.sql`、`better-sqlite3`、PRAGMA user_version
- phase 5：`file-indexer` 在一次事务内 upsert files/tags；已预留 FTS tokenizer 注入点；`content_hash = sha256(body)`
- phase 6：`FileSummary` DTO + Library UI；搜索只做 LIKE
- phase 7：`/editor/:encodedPath` 已可用

PRD 约定：
- `Cmd/Ctrl+P`：QuickSwitcher（按标题 / 路径）
- `Cmd/Ctrl+Shift+F`：全文搜索
- 中文必须分词（jieba），英文按空格 + 连字符

## Goals / Non-Goals

**Goals:**
- 中文查询"注意力机制"可以命中 body 含"注意力 机制"或"注意力机制"的文件
- `Cmd+P` 30ms 内出候选；`Cmd+Shift+F` 10K 文件 body 查询 < 300ms
- 不破坏 phase 5 的 indexer 事务语义（FTS 写入同一事务）
- 升级用户（phase 5 → phase 8）自动 rebuild FTS，无需手动重建

**Non-Goals:**
- 不做语义搜索 / embedding（backlog）
- 不做"搜索历史"持久化（只在内存保留最近 10 条）
- 不做正则搜索（全文面板只支持 FTS 语法 + 隐式 AND）
- 不做跨项目搜索（本阶段仍是单树林）
- 不做搜索结果分组/面形过滤（category/tag 组合过滤在 Library 已有；搜索面板只给结果列表）

## Decisions

### D1: FTS5 虚表结构

```sql
CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize = 'acornvo_jieba',
  content = 'files',
  content_rowid = 'rowid'
);
```

- `content='files'` 用 external content 模式：FTS 不重复存数据，只存倒排索引，节省空间
- `content_rowid='rowid'`：依赖 `files.rowid` 稳定
- `tokenize='acornvo_jieba'`：自定义 tokenizer（下面 D2）

**备选**：不用 external content（直接冗余存 title/body） → 省去 rebuild 时需重放 files，但占空间约 2x；项目规模 < 50K 文件接受 external content 带来的重建一次性成本。

**Trigger**：external content 表需要写 trigger 保持同步 —— 但 phase 5 的 indexer 已在 TypeScript 侧控制 upsert；**不用 SQL trigger**，由 `file-indexer` 显式 insert/delete `files_fts`（见 D4）。

### D2: jieba tokenizer 注册

`better-sqlite3` 通过 `db.aggregate()` 不支持自定义 tokenizer；需要用 `better-sqlite3`'s `function` API 配合 FTS5 的 `tokenize` 外部扩展。实现路径：

- `@node-rs/jieba` 提供 `cut()` 切词
- 用 `tokenizer('acornvo_jieba', jiebaTokenize)` 注册 —— 需要 `better-sqlite3` 暴露 FTS tokenizer 注册 API；如其未提供，**改用 `trigram` tokenizer 作为备选**（FTS5 内置，3-gram，对中英文都能切，召回率略低，性能相当）

**当前选择 trigram**（稳健）：
```sql
tokenize = 'trigram'
```
- 优点：FTS5 内置，零 native 代码；中文按 3-gram 切，"注意力机制" → "注意力/意力机/力机制"
- 缺点：对"的 了 呢"虚词无法过滤；索引约 3x body 大小
- 英文：trigram 对英文也按 3-gram，会降低英文精度，但用户查中文为主

**jieba 作为 1.1 增强**：phase 8.1 验证 `better-sqlite3` tokenizer API 后切换；若不可切换，保持 trigram + renderer 侧用 jieba 预切 `q`（查询串）再 OR 连接——查询时 jieba，索引侧 trigram，也可以。

**决策**：本 phase 先上 **trigram + query-time jieba 切词**（查询时对 `q` 调 `jieba.cut`，拼成 `'注意力' OR '机制'` 或更严谨 `'注意力' AND '机制'`）。

### D3: 查询 DSL

`search.fullText(q, opts)` 内部把 `q` 预处理：

1. 调 `@node-rs/jieba` 切 `q` → `tokens: string[]`
2. 过滤单字（长度 1）与停用词（内置 list：的/了/是/在...）
3. 拼 FTS 查询：
   - 默认：`"tok1" AND "tok2" AND ...`
   - 若 token 数为 1：`"tok"*`（前缀匹配）
   - 若包含引号 `"短语"`：原样透传（用户显式短语搜）
4. `SELECT path, snippet(files_fts, 2, '<mark>', '</mark>', '…', 16) AS snippet, rank FROM files_fts WHERE files_fts MATCH :query ORDER BY rank LIMIT :limit OFFSET :offset`
5. JOIN 回 `files` 表拿 FileSummary

**理由**：FTS5 的 `rank` BM25 已足够；snippet 函数内置，性能好。

### D4: indexer 同步 FTS

phase 5 MODIFIED：
- `upsertFile(row)`：在同一 transaction 内
  - `INSERT OR REPLACE INTO files ...`
  - `INSERT OR REPLACE INTO files_fts (rowid, path, title, body) VALUES (?, ?, ?, ?)`（external content 下仍 insert 行）
- `deleteFile(path)`：
  - `DELETE FROM files WHERE path=?`
  - `DELETE FROM files_fts WHERE rowid=?`
- `renameFile(oldPath, newPath)`：
  - `UPDATE files SET path=? WHERE path=?`
  - `UPDATE files_fts SET path=? WHERE rowid=?`

**理由**：external content 模式下插入语法为 `INSERT INTO files_fts(rowid, path, title, body)`；无需 triggers。

### D5: 升级自愈 rebuild

migration 002 建虚表后，表为空。不能在 migration SQL 里重放文件（migration 是纯 SQL，不知道磁盘内容）。方案：

- 在 `db.open(groveRoot)` 链路之后，`indexer.start()` 之前，加 `maybeRebuildFts()`：
  - `SELECT COUNT(*) FROM files`，`SELECT COUNT(*) FROM files_fts` —— 若前者 > 0 且后者 = 0 → 认为 FTS 空，触发 `rebuildFts()`
  - `rebuildFts()`：`INSERT INTO files_fts(files_fts) VALUES('rebuild')`（FTS5 内置命令）或 `INSERT INTO files_fts(rowid, path, title, body) SELECT rowid, path, title, '' FROM files` —— 但 body 不在 files 表中（files 只存 summary + frontmatter_json）！
  - 解决：**files 表需补 body 列**？不 —— body 字段体积大，indexer 已 hashed，存 body 会冗余整个树林
  - 方案调整：**FTS 不用 external content**，直接存 body（FTS5 contentless + `path/title/body` 内置列），由 indexer 调 `file.read(absPath)` 拿 body 再 insert
  - 更新 D1：
    ```sql
    CREATE VIRTUAL TABLE files_fts USING fts5(
      path UNINDEXED,
      title,
      body,
      tokenize = 'trigram'
    );
    ```
    不用 `content`，占空间约 2x；rebuild 时遍历 files 表，对每行调 `file.read` 再 insert
  - rebuild 进度条：UI 在 IndexBanner 展示 "索引重建中 3200 / 8000"

**最终采纳**：非 external content。代价可接受（< 20% 磁盘开销）换 rebuild 简化。

### D6: QuickSwitcher UI

- `Cmd+P` 全局键绑定（phase 1 根布局注册；macOS `Cmd+P` 默认打印需 `preventDefault`）
- 模态 Overlay 居顶 15% 处，600px 宽
- 顶部输入框 + 底部结果列表（最多 10 条）
- 排序：
  - 标题完全匹配 > 标题前缀匹配 > 标题子串 > 路径子串
  - 同等级按 `clipped_at desc`
- 键盘：↑↓ 选中，Enter 跳编辑器，`Cmd+Enter` 跳 Library 并高亮该行，Esc 关闭
- 空 query：显示最近打开 10 个（来自 renderer 内存 LRU；本阶段暂不持久化）

### D7: FullTextSearchPanel UI

- `Cmd+Shift+F` 打开；是**路由页** `/search` 还是模态？
- 选择：**路由页 `/search?q=...`**。原因：结果列表需要 scroll、query param 方便分享、大屏用户可长期停留在搜索视图
- 布局：顶部大号搜索输入 + 右上关键词高亮开关 + 结果列表（虚拟化）+ 底部分页/总数
- 结果行：title + path + snippet（多行，`<mark>` 高亮）+ 点击跳编辑器
- 空 query：显示"输入关键词开始搜索" + 最近搜索 5 条

### D8: 输入防抖与取消

- QuickSwitcher：每次按键 debounce 80ms；发起新查询前 abort 上一个（IPC 带 `requestId`，main 侧 ignore 旧 id 的返回）
- FullTextSearch：debounce 200ms；同 abort

### D9: 全文搜索的索引停用词

内置停用词表（硬编码 `search/stopwords.ts`）：`的 了 是 在 和 或 与 及 而 于 也 都 就 还 又 等 ...`（约 100 个中英常用虚词）。只在查询侧切词后过滤；索引侧不过滤（trigram 切词无停用词概念）。

### D10: 可观测

- 日志：每次 `search.fullText` 记录 `{ q, token_count, hit_count, ms }`
- 失败（FTS MATCH 语法错误，如用户输入保留字符 `:`）：返回空 + toast "搜索语法错误"
- 设置页（phase 13）预埋 "重建搜索索引" 按钮，调 `search.rebuild()`（本阶段可选实现，未验收）

## Risks / Trade-offs

- [trigram 召回高但精度低] → UI 侧提供 "精确短语"开关（`"xxx"` 引号语法）兜底；后续评估切 jieba
- [FTS 表体积 ≈ 2x body] → 10K 文件约 100MB × 2 = 200MB；接受；phase 13 设置页提供"清理索引"操作
- [rebuild 时间长（10K 文件逐个 read）] → 进度条 + 不阻塞 UI（后台 task）；打开树林时先 rebuild，完成前 `search.fullText` 返回空 + "索引构建中"提示
- [`Cmd+P` 抢系统打印] → `preventDefault`；macOS 打印不常用，可接受
- [单字查询无结果] → 用户输入"的"返回空是正确行为；UI 提示"关键词过短"

## Migration Plan

- 迁移：`migrations/002_fts.sql` 创建 `files_fts`；不删 phase 5 预留的占位 tokenizer（若有）
- 自愈：启动时 `maybeRebuildFts()`；对老用户透明
- 回滚：
  - 删 `migrations/002_fts.sql` + 回滚 user_version 不现实；改为 `migrations/003_drop_fts.sql` 删虚表
  - renderer：隐藏 QuickSwitcher/FTS 面板入口；保留 phase 6 的 LIKE 过滤

## Open Questions

- jieba 通过 `better-sqlite3` 能否注册为 FTS5 tokenizer？需要一次 spike；本阶段先按 trigram 走
- 是否支持 `tag:xxx` / `category:yyy` 过滤语法？**暂不**，Library 侧已能按 tag/category 筛选
- FullTextSearch 是否要同时按 tag/category 交叉过滤？**暂不**，保持搜索单一维度
