## Context

前置：
- phase 5 的 indexer + SQLite `files` / `tags` / `file_tags` 有数据
- phase 4 的 `file.read` 可获取全文（预览面板无需全文，但 "前 N 字"场景可借助）
- phase 1 的 `/library` 路由占位 + Zustand 根 store

UI 参考：`docs/ui/src/library.jsx` 的三栏布局（实现应对齐其视觉与交互，但代码结构重构为 React + TS + shadcn/ui 而非 prototype 的内联样式）。

PRD 限制：
- 虚拟化必须支撑上万条稳定滚动
- 预览面板展示 AI 摘要卡片（frontmatter.summary + highlights）；`rating IS NULL` → "理果中"占位
- 搜索入口 `Cmd/Ctrl+P`（QuickSwitcher）与 `Cmd/Ctrl+Shift+F`（全文）在 phase 8；本阶段果仓顶部搜索条只做"标题/路径 LIKE"

## Goals / Non-Goals

**Goals:**
- 果仓可用作用户日常翻阅入口
- 查询 IPC 稳定可供后续模块复用（phase 8 的 QuickSwitcher 查 files、phase 17 的 @ 文件选择器查 files）
- 索引变更即时反馈 UI
- 组件解耦：`CategorySidebar` / `VirtualFileList` / `FilePreviewPanel` 独立，后续松语 @ 选择器复用 VirtualFileList

**Non-Goals:**
- 不做 FTS5 全文（phase 8）
- 不做"智能文件夹 / 保存的搜索"（backlog）
- 不做"双击重命名"、"右键菜单完整实现"（右键菜单本阶段只做"打开 / 在 Finder 中显示"两项，删除到 phase 10）
- 不做拖拽排序、多选批量操作
- 不做分类/标签的编辑（用户改 frontmatter 间接改；UI 批量编辑留 backlog）

## Decisions

### D1: FileSummary DTO

```ts
interface FileSummary {
  path: string              // 相对树林根的 posix 路径
  title: string | null      // frontmatter.title 或 basename 去 .md
  category: string | null
  rating: number | null     // 1-5 或 null（理果未完成）
  clipped_at: string | null // ISO
  site: string | null
  has_summary: boolean      // frontmatter.summary 非空
  tags: string[]            // 本行关联的 tags 数组
  is_reviewing: boolean     // 通过查询 queue 表 kind='review' status='pending|running' 派生（预留，本阶段恒 false —— 交给 phase 14-15 实装后替换 JOIN）
}
```

**理由**：
- 列表行需要的字段都在 DTO 里，避免渲染时再 N+1 查询
- `is_reviewing` 预留字段本阶段恒 false；phase 14 queue 实装后把 SQL 改为 LEFT JOIN queue
- `tags` 在列表行不展示（视觉参照 UI 仅点阵评分 + 时间），但预览面板要；统一一个 DTO 降低查询条数

### D2: 查询分层

IPC：`files.list(filter, pagination)` → 单一 SQL：
```sql
SELECT f.path, f.title, f.category, f.rating, f.clipped_at,
       json_extract(f.frontmatter_json, '$.site') as site,
       CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END as has_summary,
       GROUP_CONCAT(ft.tag, '\u0001') as tags_concat,
       COUNT(*) OVER() as total
FROM files f
LEFT JOIN file_tags ft ON ft.path = f.path
WHERE
  (:category IS NULL OR f.category = :category OR f.category LIKE :category || '/%')
  AND (:pathPrefix IS NULL OR f.path LIKE :pathPrefix || '%')
  AND (:minRating IS NULL OR f.rating >= :minRating)
  AND (:maxRating IS NULL OR f.rating <= :maxRating)
  AND (:q IS NULL OR f.title LIKE '%' || :q || '%' OR f.path LIKE '%' || :q || '%')
  AND (:tag IS NULL OR f.path IN (SELECT path FROM file_tags WHERE tag=:tag))
GROUP BY f.path
ORDER BY CASE :orderBy
  WHEN 'clipped_desc' THEN f.clipped_at END DESC,
  CASE :orderBy WHEN 'title_asc' THEN f.title END ASC
LIMIT :limit OFFSET :offset
```

- `tags_concat` 用不可见字符 `\u0001` 做分隔（标签本身理论上不含该字符）
- `COUNT(*) OVER()` 拿总数避免二次查询

**备选**：两次查询（COUNT + SELECT）——更简单但两次 db roundtrip；项目规模两种都可接受，选一次查询节省。

### D3: 虚拟化

`@tanstack/react-virtual` 的 `useVirtualizer`：
- 固定行高估算（约 60px / 行，兼容三行文本）
- overscan 10 行
- 容器 `overflow-y: auto`，高度由父容器 flex 决定
- 滚动到位置用 `virtualizer.scrollToIndex(i)`（QuickSwitcher 命中跳转会用）

**理由**：PRD 明确用 TanStack Virtual；其支持动态 size estimation（后续行高不均时可切换）。

### D4: 状态管理

`src/stores/library.ts`（Zustand）：
```
filter: Filter
orderBy: 'clipped_desc' | 'title_asc'
pagination: { limit, offset }
items: FileSummary[]         // 已加载的窗口
total: number
selectedPath: string | null  // 预览面板展示
isLoading: boolean
```

动作：
- `setFilter(partial)`：merge 后 reset pagination 重新 `load`
- `load()`：调 IPC，写 items + total
- `loadMore()`：`offset += limit`；拼接
- `setSelected(path)` → `files.get(path)` 拉完整 row（含 frontmatter_json）缓存到 `detailsByPath`（预览面板读）

索引事件订阅：
- `index:fileChanged/{Deleted,Renamed}` → 调 `load()` 重拉当前视图（简单粗暴；本阶段列表规模 ≤ 10K 文件，每次查询 < 50ms 可接受；后续可改增量合并）

### D5: 分类树

`files.getCategoryTree()`：
```sql
SELECT category, COUNT(*) as count FROM files WHERE category IS NOT NULL GROUP BY category
```

渲染侧按 `/` 拆分聚合成树：
```
技术 (3)
  深度学习 (3)
  工具链 (1)
产品 (2)
```

侧栏只展开两层；更深层需在下拉中展开（本阶段不做）。

**理由**：极少有用户分类超过 2 层；跟 PRD 对齐（单层分类，`/` 分隔层级）。

### D6: 标签云

`files.getTagCloud({ limit: 30 })`：
```sql
SELECT name, usage_count FROM tags WHERE usage_count > 0 ORDER BY usage_count DESC LIMIT :limit
```

侧栏渲染时按 `usage_count` 映射字号（11-13px 范围），点击 tag → `setFilter({ tag: name })`。

### D7: 预览面板设计

`FilePreviewPanel`：
- header: `category · site · word_count 字`
- title: h1
- rating: 5 颗星（SVG）
- summary 卡片：浅色背景 + `Sparkles` 图标 + summary 文本 + highlights bullets；无 summary → 脉动 loader + "理果中"文案
- tags chip 列表
- "打开编辑器" 按钮 → `navigate('/editor/' + encodeURIComponent(path))`

word_count：从 `frontmatter_json` 里读 `body` 并 `body.length`（字符数，不精确但够用）；本阶段 DTO 不含 body，`files.get(path)` 再读 md 正文一次（phase 4 的 `file.read`）

### D8: 右键菜单（本阶段最小）

`onContextMenu` → shadcn Popover / DropdownMenu 二选一：
- 打开（Enter / 双击同义）
- 在 Finder 中显示（调新 IPC `file.revealInFinder(rel)` → `shell.showItemInFolder(abs)`）

删除留到 phase 10（shell.trashItem）。

### D9: 与索引状态联动

订阅 `index:stateChange`：
- `scanning` / `idle`：列表置灰 + banner "索引进行中，数据可能不完整"；用户仍可浏览已有行
- `watching` / `ready`：正常
- `error`：banner 红色 + "查看日志"按钮（链接到 `~/.acornvo/logs/`，调 `shell.openPath`）

## Risks / Trade-offs

- **索引变更后全量重拉列表** → 10K 文件 SQL 查询约 50ms；UI 可能闪动。可接受；后续优化成增量 patch 列表
- **`tags_concat` 用 `\u0001` 分隔** → 理论上 tag 含该字符会拆错；tag 来源是用户 frontmatter 自定义，极少含控制字符；加防御性 `REPLACE(tag, char(1), '?')` 兜底
- **虚拟列表与选中高亮滚动** → 外部删除被选中的文件 → selectedPath 失效；捕获 `index:fileDeleted` 时若命中 selectedPath 则清空
- **前缀匹配的 `category` 查询** → `LIKE '技术/%'` 命中 "技术/深度学习" 但也会命中 "技术/工具链/B"；符合"分类树聚合"意图
- **`word_count` 的字符数语义** → 中文每字 1，英文按字符；不是精确的单词数；用户理解"字数"约等"字符数"可接受
- **shadcn 组件规模** → 本阶段一次引入多个组件，工作量实际在"安装 + 主题对齐"；用 `npx shadcn@latest add <n>` 按需加

## Migration Plan

无存量。

回滚：删除本 change 代码；`/library` 路由恢复占位。

## Open Questions

- 是否把"最近打开的文件"作为独立视图？**暂定否**，用排序 `clipped_desc` 覆盖
- FileSummary 是否放进 `shared/`？**是**，方便 phase 17 松语 @ 选择器复用
- 列表行高是否可配置（紧凑/舒适）？**否**，固定一种
