## Why

phase 5 已给 FTS5 预留 tokenizer 注入点；phase 6 的果仓只做标题/路径 LIKE 过滤，命中率与召回率都不够。Acornvo 面向中文用户，"注意力机制"这样的查询需要先分词再建倒排。本阶段把 jieba 分词接入 FTS5，并同时补齐两个 PRD 明文约定的搜索入口：`⌘P` QuickSwitcher（按文件名模糊跳转，复用 phase 6 的 FileSummary）、`⌘⇧F` 全文搜索面板（跨文件 snippet 命中）。两者都是键盘驱动的主流程，必须在整套果仓体验中闭环。

## What Changes

- 引入 `@node-rs/jieba` 作为 FTS5 分词器；phase 5 的占位 tokenizer 替换为真实 jieba 实现
- FTS5 虚表 `files_fts`（`path`, `title`, `body`）在本阶段建库并由 indexer 写入；第一次升级时需要一次全量 rebuild（migration 002 + 启动期检测）
- `search.quickSwitch(q, limit)`：标题 + 路径模糊（按 token + 子串），返回 FileSummary，用于 QuickSwitcher
- `search.fullText(q, { limit, offset })`：FTS5 MATCH，返回 `{ summary, snippet }[]`；snippet 用 FTS5 `snippet()` 函数裁剪上下文 + `<mark>` 包裹
- `search.suggest(q)`：轻量建议（本阶段仅返回标题命中的前 5 条），为 UI 输入框的下拉候选
- 新增 `QuickSwitcher` Modal：`Cmd+P` 全局打开；键盘 ↑↓ + Enter；命中 navigate 到 `/editor/:encodedPath` 或 `/library`（带 highlight path）
- 新增 `FullTextSearchPanel`：`Cmd+Shift+F` 全局打开；结果行点击跳编辑器并高亮命中段（phase 7 的 Vditor 暂不支持高亮，本阶段仅跳到文件后由用户浏览；预埋 `#match=<hash>` URL 片段）
- `file-indexer` MODIFIED：`upsert` 时同步写入 `files_fts`；`delete` 同步删；rename 同步更新
- 可观测：`search.stats()` 返回 `{ fts_rows, last_rebuild_at }`（设置页预埋）

## Capabilities

### New Capabilities
- `search-index-fts5`: FTS5 虚表的 schema、jieba tokenizer 注册、rebuild 流程
- `search-query-api`: `search.quickSwitch` / `search.fullText` / `search.suggest` / `search.stats` IPC
- `quick-switcher`: `⌘P` 模态的 UI、键盘导航、模糊排序
- `full-text-search-panel`: `⌘⇧F` 面板的 UI、结果行、snippet 渲染

### Modified Capabilities
- `file-indexer`: `upsert` / `delete` / `rename` 在同一事务内同步写 `files_fts`；启动期检测 FTS 版本并按需 rebuild

## Impact

- 依赖：`@node-rs/jieba`（native 模块，需 `electron-rebuild` 重新编译）+ `better-sqlite3` 已有
- migration 002：建 `files_fts` 虚表；标记 `pragma user_version = 2`
- 启动流程：在 phase 3 的 migration runner 末尾增加"FTS 空 → 重放 files 全量 upsert 一次"的自愈路径（防老版本升级后 FTS 空）
- renderer：`src/components/search/QuickSwitcher.tsx`、`src/components/search/FullTextSearchPanel.tsx`、`src/stores/search.ts`
- 全局快捷键：在 phase 1 的根布局注册；注意 macOS `Cmd+P`（打印）需阻止默认
- 打包体积：`@node-rs/jieba` 的字典约 6MB；与 Vditor 合计约 10MB，接受
