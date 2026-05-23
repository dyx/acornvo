## Why

前九个阶段用户已经可以浏览、编辑、搜索、处理冲突，但**没有一条"后悔药"**：误删文件、忘了冲突如何解决、想看之前的版本——目前都只能翻 `.acornvo/conflicts/` 原始目录。PRD S-4（删除即可回收）与 S-7（冲突档案可追溯）要求这一切有可视入口。本阶段把"废纸篓"（Trash）、"冲突快照"（Conflicts）、"最近操作"（Ops Log）合并为一个 `/history` 面板；同时把文件右键菜单的"移到废纸篓"真正落地，并提供简单的三路 diff 视图（phase 9 答应的"稍后提供"）。

## What Changes

- **软删除**：Library 行右键 + `Cmd/Ctrl+Backspace` → `shell.trashItem(absPath)` 把文件送入系统回收站；indexer 收到 `unlink` 事件正常走 `deleteFile`；额外写一条 `ops_log` 记录（path / ts / op='trash'）
- **Ops Log**：SQLite 新增 `ops_log(id, op, path, ts, meta_json)` 表（migration 003）；记录 trash / conflict-resolve / rename（记录过去 90 天，循环覆盖）
- **History 路由** `/history`：三个 tab
  - Trash：从 ops_log 查 `op='trash'` 近 90 天；每行显示 path / ts / "已在系统回收站中"；提供"打开系统回收站"入口（`shell.openPath(os.trashDir)` —— 但系统回收站路径跨平台不一致，改为按钮 `shell.showItemInFolder(trashItem)` 不可行 → **方案**：按钮只弹文案 "macOS: 废纸篓 / Windows: 回收站 / Linux: ~/.local/share/Trash"，说明 Acornvo 不管理系统回收站内容；本阶段不提供"一键还原"）
  - Conflicts：`conflict.list()` 的可视化；点击某条打开 `ConflictDetailPanel` 展示 base/local/remote 三路 diff
  - Ops：ops_log 通用事件流（按 ts 倒序）
- **Cmd+Z 撤销删除**（最近一次，仅 session 内内存栈）：记录最近 10 次 trash，按 `shell.moveItemFromTrash` 不可靠 → 改为 **"提示用户去系统回收站手动恢复"** + 不做程序化恢复
- **三路 diff UI**：`ConflictDetailPanel` 用 monaco-editor 的 diff 模式（轻量替代：自写 line-level diff + `diff` npm 包）；左右分屏显示 local vs remote，顶部切换 "local↔base / remote↔base / local↔remote"
- **右键菜单扩展**（phase 6 已有最小菜单 "打开 / 在 Finder 中显示"）：新增 "移到废纸篓"（确认弹窗）
- **Library 空态文案更新**：若 `ops_log` 30 天内有 trash 记录，空态提示"有 N 个文件在废纸篓，打开 /history 查看"
- **新 IPC**：`trash.file(path)` / `ops.list({ limit, offset, op? })` / `conflict.diff(id, sides)` （sides ∈ {'local-remote','local-base','remote-base'}，返回 unified diff 文本）

## Capabilities

### New Capabilities

- `soft-delete`: `shell.trashItem` 集成、`Cmd/Ctrl+Backspace` 快捷键、确认弹窗、ops_log 记录
- `ops-log`: SQLite `ops_log` 表、`ops.list` IPC、90 天循环保留
- `history-panel`: `/history` 三 tab 路由页的 UI 与导航
- `conflict-diff-view`: 三路 diff 视图（base/local/remote 两两切换）

### Modified Capabilities

- `library-view`: 右键菜单新增"移到废纸篓"项；快捷键 `Cmd/Ctrl+Backspace`；行选中后该快捷键等价右键菜单

> 备注：`md-file-io` 新增 `file.trash` / `file.hardDelete` IPC、`conflict-history-store` 新增 `conflict.diff` / `conflict.deleteAll` IPC，均以 ADDED 方式扩展既有 capability（不修改现有 requirement）。

## Impact

- 依赖：`diff`（npm，< 20KB，用于 unified diff 生成）；或选 `jsdiff`（同包）
- migration 003：`ops_log` 表 + `user_version=3`
- main：`electron/ipc/trash.ts`、`electron/ipc/ops.ts`、`src/main/ops/log.ts`（记录 + 定期 prune）
- renderer：`src/pages/History.tsx`、`src/components/history/*.tsx`（Trash/Conflicts/Ops tabs + ConflictDetailPanel）
- 快捷键：phase 1 根布局再加 `Cmd/Ctrl+Backspace`（仅当 Library 聚焦或某行选中时触发）
- 风险：`shell.trashItem` 在某些 Linux 环境（无 XDG 标准）可能失败 → 降级提示"无法移到回收站，是否直接删除？"；本阶段提供降级弹窗但**不默认实际删除**（用户必须显式二次确认 hard delete）
- 体积：diff 库 + monaco 可选（若不用 monaco 则自渲染 diff，~< 100 LoC）
