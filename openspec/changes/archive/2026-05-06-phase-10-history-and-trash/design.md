## Context

前置：

- phase 4：`safeResolve`、`file.rename`、原子写
- phase 5：watcher 监听 `unlink` → indexer 的 `deleteFile`；selfWrites 机制可被 trash 操作复用（trashItem 也是对磁盘的改动）
- phase 6：Library 右键菜单已有两项（"打开"、"在 Finder 中显示"）
- phase 9：`.acornvo/conflicts/<id>/` 快照目录 + `conflict.list/read/delete` IPC
- PRD S-4：删除即可回收（而非 hard delete）
- PRD S-7：冲突档案可查

## Goals / Non-Goals

**Goals:**

- 用户误删任意文件可从系统回收站找回（OS 原生能力，零额外存储）
- 历史冲突随时可视化回看 + 三路 diff
- 各种操作（trash / conflict / rename）有统一的审计流
- 快捷键 + 右键菜单双入口；确认弹窗防误删

**Non-Goals:**

- 不自建"应用内回收站"（会与系统回收站语义冲突）
- 不做程序化"从回收站还原"（跨平台 API 不稳定；用户去系统 UI 还原）
- 不做长期版本历史（如 git snapshot）；只保留冲突节点的快照 + ops_log
- 不做 diff 的交互式合并（点按钮把 remote 段落合进 local）
- 不做 Obsidian 风格的 daily note / revision diff

## Decisions

### D1: 软删除 = `shell.trashItem`

Electron 的 `shell.trashItem(abs)` 跨平台封装：

- macOS：Trash
- Windows：回收站
- Linux：XDG Trash（需 `~/.local/share/Trash`）
- 失败场景：Linux 无 XDG / 网盘上某些文件夹拒绝

**降级**：失败时弹 modal "无法移到系统回收站"，提供 "直接永久删除" 按钮（需用户二次确认）。**不静默 hard delete**。

**自身写回**：trash 操作也会让 watcher 触发 `unlink`，由 indexer 走 `deleteFile` 链路自然清理；不需特殊 selfWrites（delete 没有 mtime 可比，watcher 直接消费）。

### D2: Cmd/Ctrl+Backspace 快捷键

仅在 Library 聚焦（VirtualFileList 容器或 FileRow 有焦点）时触发：

- 弹 confirm modal："移到废纸篓？`<path>`" + "[取消]" + "[移到废纸篓]"
- 多选留 backlog（本阶段只支持单行）

Windows/Linux 约定：

- `Delete` 键等价
- `Shift+Delete` 保留为"跳过确认直接 trash"（进阶用户）—— 简化，**不做**；一律弹确认

### D3: ops_log schema

migration 003：

```sql
CREATE TABLE ops_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,            -- 'trash' | 'conflict_resolve' | 'rename'
  path TEXT NOT NULL,          -- 相对树林；rename 的是 old_path
  ts TEXT NOT NULL,            -- ISO8601
  meta_json TEXT               -- op 细节；conflict_resolve 含 { id, resolved_by }；rename 含 { new_path }
);
CREATE INDEX idx_ops_log_ts ON ops_log(ts DESC);
CREATE INDEX idx_ops_log_op_ts ON ops_log(op, ts DESC);
```

保留策略：每次写入前 `DELETE FROM ops_log WHERE ts < datetime('now', '-90 days')`；额外 `WHERE id NOT IN (SELECT id FROM ops_log ORDER BY ts DESC LIMIT 10000)` 兜底（上限 1W 条）。

**理由**：审计用途 + UI 列表需数据源；SQLite 表比 JSONL 更利于 filter/sort。

### D4: History 路由与 tabs

路由 `/history`：

- `/history/trash`（默认 redirect 到此）
- `/history/conflicts`
- `/history/ops`

Tab 组件用 shadcn `Tabs`；URL query 可传 `?focus=<ops_id>` 或 `?conflict=<id>` 以深链接到某条目（QuickSwitcher 未来可跳）。

### D5: Trash tab 不做"还原"

按钮只提供：

- "打开系统回收站"（按平台弹不同文案；不调 API——跨平台打开回收站不稳定）
- "打开文件原来的目录"（调 `shell.openPath(dirname(absPath))`，前提是该目录还存在）

**理由**：可靠性 > 功能。用户学会去系统回收站找回比程序化出错好。

### D6: Conflicts tab + ConflictDetailPanel

Tab 页：

- 左侧列表：`conflict.list()` 的行（id / path / ts / resolved_by badge）
- 右侧详情：ConflictDetailPanel
  - Header：path / 时间 / resolved_by / winner_path
  - 视图切换：三个 toggle "local ↔ remote" / "local ↔ base" / "remote ↔ base"（默认 local↔remote）
  - 主体：双列 diff（unified 还是 side-by-side？→ side-by-side，更直观）
  - 操作：
    - "下载 local.md" / "下载 remote.md" / "下载 base.md"（`shell.openPath(abs)` 跳 Finder）
    - "删除此快照"（调 `conflict.delete`；确认弹窗）

### D7: diff 实现

`diff` npm 包（jsdiff）：`diffLines(a, b)` 返回 `{ value, added, removed }[]`；side-by-side 视图自渲染两列，用 `added`/`removed` 上色。

不用 monaco —— 大包（~2MB）、对只读 diff 太重；自渲染 300 LoC 即够用。

`conflict.diff(id, sides)` IPC 返回 unified diff 字符串（`diffLines` 序列化），renderer 再自绘 side-by-side。或直接返回 `{ left: string[], right: string[], markers: [...] }` 结构，避免 renderer 重复解析。**采纳后者**——服务端返回结构化数据，renderer 只渲染。

### D8: Ops tab 通用事件流

所有 ops_log 行按 ts 倒序，虚拟化列表；每行：

- op 图标（trash = 🗑 / conflict = ⚔ / rename = ✎）—— 本阶段用文字或小 badge 替代，避免 emoji
- 主文案（按 op 模板）
- 路径 + 时间 distance
- 点击：对 conflict 跳 `/history/conflicts?focus=<id>`；对 trash/rename 暂无跳转

### D9: Library 右键菜单扩展

phase 6 的 `FileRowContextMenu` 增加一项：

- "移到废纸篓"（分隔线上方：打开 / 在 Finder 中显示；下方：移到废纸篓）
- 点击 → 复用 `Cmd+Backspace` 的 confirm modal

快捷键绑定：在 `VirtualFileList` 容器 `onKeyDown` 拦截 `Cmd/Ctrl+Backspace`（macOS）或 `Delete`（Windows/Linux）。

### D10: 降级场景：`shell.trashItem` 失败

```
try { await shell.trashItem(abs) }
catch (e) {
  // 弹 modal："无法移到系统回收站：<reason>"
  //   [取消]（默认）
  //   [永久删除]（红色危险按钮，需再次确认）
}
```

永久删除走 `fs.unlink`；watcher 自然触发 `index:fileDeleted`；ops_log 记录 `op='hard_delete'`。

## Risks / Trade-offs

- [shell.trashItem Linux 支持不稳] → 降级弹窗；告知用户可能是环境问题
- [ops_log 容量] → 1W 条 × 每条 ~200B ≈ 2MB，可接受
- [diff 大文件慢] → md 正常几十 KB；极端情况（10MB md）diff 会卡；本阶段不做虚拟化 diff
- [用户用 Obsidian 删除 md] → `unlink` 事件 indexer 正常清 `files` 表；但 ops_log 不记录（因为不是通过我们 trash 的）；History.Trash tab 只看 `op='trash'`，不显示外部删除 —— 这是 design 意图（只记 Acornvo 触发的操作）
- [`/history` 下 conflict 删除后 ops_log 仍指向它] → conflict.delete 触发时也写 ops_log（`op='conflict_delete'`），详情 404 时详情面板显示"快照已被删除"

## Migration Plan

- migration 003：`ops_log` 表 + `user_version=3`
- phase 2 的 grove init 追加（若此前没）：不需额外目录
- 回滚：删 migration 003 SQL（或加一条 `DROP TABLE ops_log` 的反向 SQL）；禁用 `/history` 路由；`trash.file` IPC 移除

## Open Questions

- 要不要做应用内"恢复按钮"？**不做**，跨平台不稳；纯跳系统 UI
- Ops tab 是否支持按 op 类型过滤？**是**，顶部 filter chips
- 多选批量删除？**留 backlog**
- "清空所有快照"按钮？**提供**，在 Conflicts tab 右上 + 二次确认
