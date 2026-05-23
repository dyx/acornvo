## Why

索引跑完后，SQLite `files` 里有成百上千行，但用户什么都看不到。果仓（Library）是用户进入树林后的**主视图**：浏览/筛选/挑文件/跳编辑器，是拾果/理果之外的所有阅读动作的起点。PRD 明确要求"TanStack Virtual 虚拟列表 + 支持上万条稳定滚动"，并要求能按分类/标签/评分/搜索 query 过滤。本阶段把果仓 UI 实装，同时把"SQLite → UI"的查询 IPC 定稳，后续阶段（搜索命中跳、理果触发、松语 @ 文件）都复用。

## What Changes

- **`/library` 页**：对齐 `docs/ui/src/library.jsx` 的三栏布局（品牌/切树林 + 分类侧栏 + 文件列表 + 预览面板）
- **分类侧栏**：
  - 视图：全部 / 果篮（`path LIKE 'inbox/%'`）/ 待理果（`rating IS NULL`）
  - 分类树：从 `files.category` 派生（按 `/` 拆分层级，统计每级计数，限制展开 2 层）
  - 标签云：取 `tags` 表前 30（按 `usage_count` 降序）+ 最近 30（按某文件 `reviewed_at`），本阶段先实现前 30
- **文件列表（虚拟化）**：`@tanstack/react-virtual`；每行显示标题 / 相对路径 / 评分点阵 / 采集时间 / "理果中"脉动点（frontmatter 无 rating 视为理果中）
- **预览面板**：点选文件后右侧展示 category/site/字数/标题/评分/AI 摘要卡片/要点 bullets/tags/"打开编辑器"按钮
- **查询 IPC**：`files.list({ filter: Filter, orderBy, limit, offset })` 返回 `{ items: FileSummary[], total: number }`；`files.get(path)`（完整行 + frontmatter_json）；`files.getCategoryTree()` / `files.getTagCloud({ limit })`
- **Filter**：`{ category?: string (前缀匹配), tag?: string, rating?: { min?: number, max?: number }, pathPrefix?: string, q?: string (标题/路径模糊) }`；**本阶段 q 是 SQL LIKE 标题搜索，不是 FTS5 全文**（FTS5 走 phase 8 的专门 search 服务）
- **响应索引事件**：订阅 `index:fileChanged` / `index:fileDeleted` / `index:fileRenamed` → 刷新当前视图
- **空态 / 加载态**：
  - 空树林（无 md）：引导 "去拾果 / 手动新建第一篇"
  - 索引扫描中（`IndexState=scanning`）：列表置灰 + "索引中，数据可能未完整"
- **与编辑器的联动**：双击 FileRow → 跳 `/editor/:path`（phase 7 接入；本阶段先 `navigate` 跳占位）
- **切换树林**：订阅 `project:changed` 清空本视图 store 并重新拉取
- **不在本阶段**：Vditor 编辑器（phase 7）、全文搜索（phase 8）、理果触发按钮（phase 15，但本阶段预留"待理果"筛选与"理果中"状态展示）、松语 @（phase 17，但查询 API 将复用）、拖拽排序/多选批量（留到后续增强）
- **不在本阶段**：标签云的"最近 30"（需要按时间维度 JOIN，本阶段先只做 usage_count 前 30）

## Capabilities

### New Capabilities

- `library-view`: 果仓三栏页的 React 实现（分类侧栏 / 虚拟化列表 / 预览面板 / 空态 / 加载态）
- `file-query-api`: SQLite `files` 的 IPC 查询入口（分页/筛选/分类树/标签云）
- `file-summary-dto`: 渲染端视图需要的文件摘要 DTO 形态（标题/路径/rating/clipped_at/有无摘要...），明确定义并供后续模块复用

## Impact

- **新增代码**：`src/pages/Library.tsx`、`src/components/CategorySidebar.tsx`、`src/components/VirtualFileList.tsx`、`src/components/FilePreviewPanel.tsx`、`src/stores/library.ts`、`electron/ipc/files.ts`
- **契约扩展**：`shared/ipc-contract.ts` 新增 `files` 命名空间 + `FileSummary` / `FileFilter` 共享类型（在 `shared/file-types.ts`）
- **依赖新增**：`@tanstack/react-virtual`
- **UI 依赖**：已有的 shadcn/ui + Tailwind 4（若 phase 1 未完整引入，本阶段首次落地 shadcn 的 `Button` / `Input` / `Tabs` / `Tooltip` / `ScrollArea` 等基础组件）
- **可观察产物**：进入树林索引完后果仓显示文件列表；切换分类/标签/评分筛选，列表立即更新；双击跳编辑器占位；外部新建 md 后列表自动出现新行
