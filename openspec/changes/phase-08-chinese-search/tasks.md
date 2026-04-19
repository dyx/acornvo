## 1. 依赖与 schema

- [ ] 1.1 `npm install @node-rs/jieba`（postinstall 不需 rebuild，纯 js 的 .node 预编译）
- [ ] 1.2 `migrations/002_fts.sql`：创建 `files_fts(path UNINDEXED, title, body, tokenize='trigram')` + `PRAGMA user_version = 2`
- [ ] 1.3 phase 5 的 `files_fts` 占位（若有）替换为 migration 创建的真实虚表；renderer 侧删除占位 tokenizer 注入

## 2. FTS 启动自愈

- [ ] 2.1 `maybeRebuildFts()`：`SELECT COUNT(*)` 对比 `files` vs `files_fts`；前者 > 0 后者 = 0 触发 rebuild
- [ ] 2.2 `rebuildFts()`：流式遍历 `files`，对每行 `file.read(absPath)` 拿 body，批量 insert（每 100 行一事务）；每 5% 发一次 `index:rebuildProgress { done, total }` 事件
- [ ] 2.3 `search.rebuild()` IPC（手动入口；不验收，预埋给 phase 13 设置页）
- [ ] 2.4 rebuild 期间 `search.fullText` 返回 `{ items: [], total: 0, pending: true }`

## 3. Indexer 集成（file-indexer MODIFIED）

- [ ] 3.1 `upsertFile(row, body)`：事务内同时 `INSERT OR REPLACE INTO files` + `INSERT OR REPLACE INTO files_fts(rowid, path, title, body)`；body 由 caller 传入避免二次读
- [ ] 3.2 `deleteFile(path)`：事务内同时删 files 与 files_fts
- [ ] 3.3 `renameFile(old, new)`：事务内同时 update files.path 与 files_fts.path
- [ ] 3.4 frontmatter-only 变更跳过 FTS 更新（content_hash 相同时不 touch files_fts）

## 4. search.ts IPC（electron/ipc/search.ts）

- [ ] 4.1 `shared/ipc-contract.ts` 追加 `search` 命名空间：`quickSwitch`、`fullText`、`suggest`、`stats`、`rebuild`
- [ ] 4.2 `quickSwitch(q, { limit })`：LIKE + CASE 排序（无需 FTS，直接扫 files 即可，10K 行 < 20ms）
- [ ] 4.3 `fullText(q, opts)`：
  - [ ] 4.3.1 `src/main/search/jiebaSegment.ts` 封装 `@node-rs/jieba`
  - [ ] 4.3.2 停用词表 `src/main/search/stopwords.ts`（约 100 个）
  - [ ] 4.3.3 `buildFtsQuery(q)`：切词 → 去停用词 → 单 token → `"tok"*`；多 token → AND；引号内原样
  - [ ] 4.3.4 SQL：`SELECT ..., snippet(files_fts, 2, '<mark>', '</mark>', '…', 16), rank FROM files_fts WHERE files_fts MATCH ? ORDER BY rank LIMIT ? OFFSET ?`
  - [ ] 4.3.5 JOIN 回 files 拿 FileSummary；组装 tags_concat（同 phase 6 SQL 模式）
  - [ ] 4.3.6 try/catch FTS5 MATCH 语法错误 → 返回空 + log warn
  - [ ] 4.3.7 返回 `{ items, total, pending }`
- [ ] 4.4 `suggest(q)`：`WHERE title LIKE ? LIMIT 5`（复用 quickSwitch 简化版）
- [ ] 4.5 `stats()`：`SELECT COUNT(*) FROM files_fts` + 读 `~/.acornvo/state/fts_last_rebuild.json`
- [ ] 4.6 错误兜底：所有 handler 捕获异常 → `E_INTERNAL` + log

## 5. QuickSwitcher 组件

- [ ] 5.1 `src/components/search/QuickSwitcher.tsx`（模态 + 输入 + 候选列表）
- [ ] 5.2 `src/stores/search.ts`：`quickSwitcher: { open, q, items, selectedIndex, recent }` + actions
- [ ] 5.3 全局 `Cmd/Ctrl+P` 快捷键（在 `App.tsx` 根布局监听）；`preventDefault` 阻止浏览器打印
- [ ] 5.4 输入 debounce 80ms + `AbortController` 式取消（IPC 带 `requestId`；renderer 忽略过期返回）
- [ ] 5.5 键盘：↑↓ / Enter / Cmd+Enter / Esc
- [ ] 5.6 空 q 时显示 "最近打开" LRU（renderer 内存 10 条；selectedPath 变更时 unshift）
- [ ] 5.7 行渲染：title + path + clipped_at；选中态左边框 + 底色

## 6. FullTextSearchPanel 组件

- [ ] 6.1 `src/pages/Search.tsx`（`/search?q=...` 路由，phase 1 的 router 追加）
- [ ] 6.2 顶部大输入框；URL `q` 双向同步（`useSearchParams`）
- [ ] 6.3 结果列表复用 `VirtualFileList` 或单独 `FullTextResultList`（行高不固定，snippet 多行，需测量）
- [ ] 6.4 snippet 用 `dangerouslySetInnerHTML` 渲染 `<mark>`（service 端已 HTML 转义正文，仅允许 `<mark>` 标签）
- [ ] 6.5 `Cmd+Shift+F` 全局快捷键 → navigate `/search` 或 select-all
- [ ] 6.6 零结果 / 索引构建中 / 错误态分别渲染
- [ ] 6.7 点击结果 navigate `/editor/<encodedPath>#match=<q>`；Cmd+Click → `/library` + 定位
- [ ] 6.8 "最近搜索" renderer 内存 5 条
- [ ] 6.9 输入防抖 200ms + 取消上一个请求

## 7. IndexBanner 扩展

- [ ] 7.1 订阅 `index:rebuildProgress` 事件 → 顶部显示 "索引构建中 3200 / 8000"
- [ ] 7.2 构建完成后事件 `index:rebuildDone` → banner 消失 + 重新拉搜索结果

## 8. i18n

- [ ] 8.1 `search.placeholder_quick` / `search.placeholder_full` / `search.no_results` / `search.pending` / `search.syntax_error` / `search.recent` / `search.phrase_hint` 等

## 9. 验收

- [ ] 9.1 全新树林打开 → migration 002 执行 → `PRAGMA user_version` = 2；`files_fts` 存在
- [ ] 9.2 老树林（v1）升级打开 → 日志 "fts rebuild start" → 完成后 `COUNT(files_fts) = COUNT(files)`；UI 期间显示进度条
- [ ] 9.3 `Cmd+P` 打开 QuickSwitcher；输入 "attention" → 30ms 内出结果；Enter 打开编辑器
- [ ] 9.4 QuickSwitcher 空 q → 显示最近打开列表（至少预先手动打开过几次）
- [ ] 9.5 `Cmd+Shift+F` 打开 `/search`；输入 "注意力" → 命中 body 含"注意力"的文件；snippet 用 `<mark>` 高亮
- [ ] 9.6 q="注意力 机制"（空格分隔）→ 仅 body 同时含两词的文件
- [ ] 9.7 q=`"注意力机制"`（引号）→ 仅连续出现"注意力机制"的文件
- [ ] 9.8 q="的 注意力" → 等效 q="注意力"（停用词过滤）
- [ ] 9.9 q="att" → 单 token 前缀匹配，命中 "attention" 系列
- [ ] 9.10 q="foo :" → 返回空 + toast "搜索语法错误"
- [ ] 9.11 新增 md 后 1s 内 `Cmd+Shift+F` 搜索可命中（indexer + FTS 同步生效）
- [ ] 9.12 删除 md 后搜索不再命中
- [ ] 9.13 重命名文件后 FTS 的 path 自动更新；搜索命中新 path
- [ ] 9.14 仅改 frontmatter.rating → 不触发 FTS rewrite（日志观察）
- [ ] 9.15 10000 md 文件 `search.fullText` P50 < 300ms
- [ ] 9.16 QuickSwitcher Cmd+Enter → Library 定位并选中目标
- [ ] 9.17 搜索结果点击 → 跳 editor，URL 含 `#match=<q>`；editor 页忽略 hash 正常加载
- [ ] 9.18 `openspec validate phase-08-chinese-search --strict` 通过
