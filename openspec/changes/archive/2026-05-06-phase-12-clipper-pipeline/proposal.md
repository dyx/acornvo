## Why

PRD P-2 / S-7 定义的拾果核心价值是"剪藏（clip）"：把 phase 11 内置浏览器打开的网页一键保存为本地 Markdown 文件，进入 `inbox/` 供 phase 15 AI 审读、phase 13+ 组织消化。本阶段把 phase 11 的"剪藏"按钮占位真正实装：抽取正文 → 转 Markdown → 写入 vault → 更新索引 → 去重。这是拾果从"浏览器"升级为"知识入口"的关键一阶段。

## What Changes

- 引入 Readability（`@mozilla/readability` + `jsdom` / 或 `@mozilla/readability` + 直接用 WebContents 的 DOM）在 main 侧对 WebContents 当前页面做正文抽取
- 引入 Turndown（`turndown` + `turndown-plugin-gfm`）把抽取到的 HTML 转 Markdown
- 新建 Clipper pipeline：`extract → transform → enrich → dedupe → write → index`，每步可失败可重试
- AddressBar 的"剪藏"按钮与 `Cmd+Shift+S` 快捷键接入 pipeline；剪藏弹出 preview modal（title / url / site / 标签 / 目标目录 / 预览正文前 N 行），用户确认后写入
- 输出路径：`<vault>/inbox/YYYYMM/<slug>.md`；frontmatter 含 `title / url / site / author / published_at / clipped_at / source_type: 'web' / tags`
- 去重：按 `url` 在 `clips` 表命中 → 提示"已剪藏"并跳转已存在文件（而非创建重复）
- 新建 `clips` 表（migration 005），记录每次剪藏的元数据供 phase 15 AI reviewer 与 phase 17 松语 `@剪藏` 引用
- 写入成功后：写入 `ops_log`（phase 10）与 `clip_queue` 占位（phase 14 会真正把它变持久化队列）
- HTML → Markdown 的资源处理：图片默认保持远程 URL 引用（不下载本地）；代码块、列表、表格、引用通过 turndown-plugin-gfm 保真
- i18n：剪藏按钮 / 提示 / 错误态 / 已存在提示的文案

## Capabilities

### New Capabilities
- `clipper-extractor`: 从 WebContents 抽取文章正文（Readability + 元信息增强）
- `clipper-transformer`: HTML → Markdown 转换（Turndown + GFM plugin + 清洗规则）
- `clipper-pipeline`: 拉通 extract→transform→dedupe→write→index 的端到端流水线
- `clip-store`: SQLite `clips` 表与 CRUD/查询 IPC
- `clipper-ui`: 剪藏按钮 / 预览 modal / 去重提示 UI

### Modified Capabilities
- `browser-navigation`: 新增"剪藏触发"需求（AddressBar 剪藏按钮由 phase 11 的 toast 占位替换为真实 pipeline 入口；新增 `Cmd/Ctrl+Shift+S` 快捷键）

## Impact

- `package.json` 新增 `@mozilla/readability`、`turndown`、`turndown-plugin-gfm`（main 侧依赖；Readability 直接跑在 WebContents 的 DOM 上可免 jsdom）
- `migrations/005_clips.sql`：新增 clips 表 + 索引
- `electron/clipper/`：`extract.ts` / `transform.ts` / `enrich.ts` / `pipeline.ts` / `dedupe.ts`
- `electron/ipc/clipper.ts` / `electron/ipc/clips.ts`：剪藏与 CRUD IPC
- `src/pages/Browse.tsx` 调整：接入剪藏触发；新增 `ClipPreviewDialog.tsx`
- `src/stores/browser.ts` 新增剪藏状态机（idle / extracting / previewing / saving / done / error）
- `shared/clipper-types.ts` / `shared/clip-types.ts` 新增类型
- 依赖 phase 4（原子写）、phase 5（索引）、phase 9（冲突 — 剪藏目标文件若已存在按扩展名 `.clip.<ts>.md` 策略，不走冲突流）、phase 10（ops_log）、phase 11（WebContentsView + AddressBar）
- 为 phase 14 队列持久化与 phase 15 AI reviewer 预留接口：pipeline 成功后调 `clipQueue.enqueue(clipId)`（phase 14 前为 no-op 占位）
