## 1. 依赖与目录

- [ ] 1.1 `npm install @tanstack/react-virtual`
- [ ] 1.2 引入 shadcn/ui 基础组件（若 phase 1 未全引入）：`npx shadcn@latest add button input tooltip scroll-area dropdown-menu popover separator`
- [ ] 1.3 新增目录 `src/pages/Library.tsx`、`src/components/library/*.tsx`、`src/stores/library.ts`、`electron/ipc/files.ts`
- [ ] 1.4 `shared/file-types.ts`：导出 `FileSummary`、`FileFilter`、`Pagination`、`CategoryNode`、`TagCloudItem`

## 2. IPC 契约与 handler（electron/ipc/files.ts）

- [ ] 2.1 `shared/ipc-contract.ts` 追加 `files` 命名空间：`list(filter, pagination)` / `get(path)` / `getCategoryTree()` / `getTagCloud({ limit })` / `revealInFinder(path)`
- [ ] 2.2 `list` handler：组装 design D2 的参数化 SQL；`tags_concat` 用 `\u0001` 分隔，渲染侧 split
- [ ] 2.3 `get` handler：从 SQLite 读 summary 行 + 调 `file.readParsed(path)` 拿 frontmatter + body；返回合并结构
- [ ] 2.4 `getCategoryTree`：`SELECT category, COUNT(*) ...` → 在 TS 里按 `/` 拆分聚合成树（树最多 3 层）
- [ ] 2.5 `getTagCloud`：`SELECT name, usage_count FROM tags WHERE usage_count > 0 ORDER BY usage_count DESC LIMIT ?`
- [ ] 2.6 `revealInFinder(path)`：`safeResolve` + `shell.showItemInFolder(abs)`；IPC 返回 `ok: true`
- [ ] 2.7 handler 出错兜底：任何 SQL 异常 → `E_INTERNAL` + log；empty grove 时返回空 items + total=0（不报错）

## 3. Library store（src/stores/library.ts）

- [ ] 3.1 Zustand slice：`filter`、`orderBy`、`pagination`、`items`、`total`、`selectedPath`、`categoryTree`、`tagCloud`、`isLoading`、`detailsByPath: Map<path, FullDetail>`
- [ ] 3.2 actions：`setFilter(partial)`、`setOrder(orderBy)`、`load()`、`loadMore()`、`select(path)`、`refresh()`
- [ ] 3.3 `select` 走 `files.get` 并写入 `detailsByPath` 缓存
- [ ] 3.4 订阅 `index:fileChanged/Deleted/Renamed` → 调 `refresh()`；若删除项 == selectedPath → 清 selectedPath
- [ ] 3.5 订阅 `project:changed` → 清所有 slice，重新 `load()` + `loadCategoryTree()` + `loadTagCloud()`

## 4. 组件（src/components/library/*）

- [ ] 4.1 `CategorySidebar.tsx`：
  - [ ] 4.1.1 视图分组：全部 / 果篮 / 待理果
  - [ ] 4.1.2 分类树（递归渲染，最多 2 层展开）
  - [ ] 4.1.3 标签云（chip 集合；字号按 usage_count 线性映射 11-13px）
  - [ ] 4.1.4 active 态视觉（底色 + 左边框）
- [ ] 4.2 `VirtualFileList.tsx`：
  - [ ] 4.2.1 顶部搜索输入（bind filter.q；debounce 150ms）
  - [ ] 4.2.2 `useVirtualizer` 渲染行；行高 60px；overscan 10
  - [ ] 4.2.3 `FileRow` 子组件：标题 + 路径 + 评分点阵 + "理果中"脉动 + clipped_at
  - [ ] 4.2.4 键盘 ↑↓ 移动选中项 + 自动 scrollToIndex；Enter 打开编辑器
  - [ ] 4.2.5 底部统计 `{shown} / {total} 篇`
- [ ] 4.3 `FilePreviewPanel.tsx`：
  - [ ] 4.3.1 header 行（category / site / word_count）
  - [ ] 4.3.2 标题 h1 + 评分 5 星 SVG
  - [ ] 4.3.3 summary 卡片：`Sparkles` 图标 + summary + highlights bullets；无 summary → 脉动 loader + 文案
  - [ ] 4.3.4 tags chips
  - [ ] 4.3.5 "打开编辑器" 按钮（phase 7 接入前 `navigate` 到占位）
  - [ ] 4.3.6 空态：未选文件时显示 "从列表选一篇开始"
- [ ] 4.4 `IndexBanner.tsx`：顶部根据 IndexState 渲染 scanning/error 横幅（phase 5 事件源）
- [ ] 4.5 `FileRowContextMenu.tsx`：右键菜单（打开 / 在 Finder 中显示）

## 5. Library 页面组装（src/pages/Library.tsx）

- [ ] 5.1 三栏 flex 布局 + TitleBar 展示 `果仓 · {projectName}`
- [ ] 5.2 左栏 `<CategorySidebar />`、中栏 `<VirtualFileList />`、右栏 `<FilePreviewPanel />`
- [ ] 5.3 首次挂载调 `library.load()` + `loadCategoryTree()` + `loadTagCloud()`
- [ ] 5.4 订阅 index/project 事件（在 store 内完成，页面层仅 `useEffect` 触发初始 load）
- [ ] 5.5 i18n key：`library.all` / `library.inbox` / `library.unreviewed` / `library.tags` / `library.categories` / `library.search_ph` / `library.open_editor` / `library.reveal` / `library.reviewing` 等

## 6. 编辑器占位跳转（phase 7 前兼容）

- [ ] 6.1 `/editor/:path` 路由（phase 1 已占位）在本阶段保持占位组件；显示 "编辑器将在后续阶段实装，当前路径：<path>"

## 7. 验收

- [ ] 7.1 打开一棵含 50 md 的树林 → 列表出现 50 行，默认按 clipped_at 倒序
- [ ] 7.2 点击"果篮" → 仅 `inbox/*` 文件出现
- [ ] 7.3 点击分类 "技术" → 含 "技术" 与 "技术/深度学习" 的全部行出现
- [ ] 7.4 点击标签 chip `#attention` → 列表收紧
- [ ] 7.5 顶部搜索框输入 "注意力" → 列表收紧；清空恢复
- [ ] 7.6 5000 行数据滚动流畅（dev tools Performance tab 观测 FPS）
- [ ] 7.7 选中某文件 → 预览面板显示 summary 卡片 + tags + 评分星；"打开编辑器"按钮可跳占位
- [ ] 7.8 `rating IS NULL` 的文件显示"理果中"状态（列表 + 预览）
- [ ] 7.9 右键 → "在 Finder 中显示" 生效
- [ ] 7.10 外部新建 md → 1s 内列表出现
- [ ] 7.11 外部删除选中文件 → 列表消失 + 预览清空
- [ ] 7.12 索引 scanning 状态进入果仓 → 顶部 banner 可见
- [ ] 7.13 切换树林 → 果仓数据清空并重新加载
- [ ] 7.14 `openspec validate phase-06-virtual-library-view --strict` 通过
