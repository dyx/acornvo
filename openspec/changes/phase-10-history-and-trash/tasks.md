## 1. 依赖与 schema

- [x] 1.1 `npm install diff`（jsdiff）
- [x] 1.2 `migrations/003_ops_log.sql`：建 `ops_log` + 索引 + `user_version=3`
- [x] 1.3 `shared/ops-types.ts`：`OpsItem` / `Op` 枚举

## 2. Ops 写入器（main）

- [x] 2.1 `src/main/ops/log.ts`：`record({ op, path, meta? })` + 内部 `prune()`（90 天 + 10000 上限）
- [x] 2.2 prune 在每次 record 前跑（同事务）
- [x] 2.3 `list({ limit, offset, op? })` + total
- [x] 2.4 串接到 phase 9 `ConflictDialog` 三个分支（keep_local/load_remote/save_as）写 record
- [x] 2.5 串接到 phase 9 `banner 重载`（resolved_by='load_remote_banner'）写 record
- [x] 2.6 串接到 phase 5 rename 识别：watcher 确定 rename 后 `opsLog.record({op:'rename', path: oldPath, meta: {new_path: newPath}})`

## 3. IPC（main）

- [x] 3.1 `shared/ipc-contract.ts` 追加 `file.trash` / `file.hardDelete` / `ops.list` / `conflict.diff` / `conflict.deleteAll`
- [x] 3.2 `electron/ipc/trash.ts`：`file.trash` + `file.hardDelete`（后者无二次弹窗）
- [x] 3.3 `electron/ipc/ops.ts`：`ops.list`
- [x] 3.4 `electron/ipc/conflicts.ts` 扩展：`conflict.diff` + `conflict.deleteAll`
- [x] 3.5 `conflict.diff` 实现：读 3 份 md → 依 sides 选 2 份 → jsdiff `diffLines` → 结构化返回
- [x] 3.6 `conflict.delete` / `conflict.deleteAll` 成功时写 `op='conflict_delete'` ops_log

## 4. Library 集成（library-view MODIFIED）

- [x] 4.1 `FileRowContextMenu.tsx` 增"移到废纸篓"项（分隔线 + 底部）
- [x] 4.2 `TrashConfirmDialog.tsx`：共享 modal，含路径 + 取消/确认按钮；失败时切换到降级模式（含"永久删除" + checkbox）
- [x] 4.3 `VirtualFileList` 容器 `onKeyDown`：聚焦 + 有选中时 `Cmd/Ctrl+Backspace` / `Delete` → 打开 TrashConfirmDialog
- [x] 4.4 trash 成功后 library store 从 items 移除该行；若 selectedPath 等于被删 → 清空 selectedPath
- [x] 4.5 hard_delete 路径：降级 modal → 调 `file.hardDelete` → 同上更新 library

## 5. History 页面（src/pages/History.tsx）

- [x] 5.1 路由注册：`/history` → redirect `/history/trash`；`/history/:tab` 接受 trash|conflicts|ops
- [x] 5.2 `HistoryLayout.tsx`：Tabs + URL 同步（`useParams` + `useNavigate`）
- [x] 5.3 `TrashTab.tsx`：顶部提示 + `ops.list({ op: 'trash', limit: 100, offset: 0 })` 虚拟化列表；行"打开原目录"按钮
- [x] 5.4 `ConflictsTab.tsx`：左右 `ResizablePanel`（shadcn）；左 `conflict.list` 列表；右 `ConflictDetailPanel`；URL `?id=<cid>` 深链接；顶部"清空所有快照"按钮
- [x] 5.5 `OpsTab.tsx`：顶部 op 过滤 chips；`ops.list({ op })` 列表；click `conflict_resolve` 行跳 `/history/conflicts?id=<meta.id>`
- [x] 5.6 空态：三 tab 各自友好文案
- [x] 5.7 TitleBar："历史"

## 6. ConflictDetailPanel（conflict-diff-view）

- [x] 6.1 `src/components/history/ConflictDetailPanel.tsx`：header + 视图切换 toggle + diff 主体 + 底部操作
- [x] 6.2 `DiffView.tsx`：side-by-side 双列；行号 + 着色（等/删/增）
- [x] 6.3 切换 toggle 时重新调 `conflict.diff(id, sides)`
- [x] 6.4 "在系统文件管理器中打开 local/remote/base" → 调 `file.openExternal` 或 `shell.showItemInFolder`（三个按钮）
- [x] 6.5 "删除此快照"按钮 + 二次确认 → `conflict.delete(id)` → 关闭详情 / 列表刷新

## 7. i18n / 文案

- [x] 7.1 `history.tabs.trash` / `history.tabs.conflicts` / `history.tabs.ops`
- [x] 7.2 `trash.confirm_title` / `trash.confirm_body` / `trash.fallback_title` / `trash.hard_delete_confirm`
- [x] 7.3 `history.trash.notice`（系统回收站说明）
- [x] 7.4 `history.conflicts.clear_all` / `history.conflicts.clear_all_confirm`
- [x] 7.5 `diff.view.local_remote` / `diff.view.local_base` / `diff.view.remote_base`
- [x] 7.6 op 文案模板：`ops.op.trash` / `ops.op.hard_delete` / `ops.op.conflict_resolve` / `ops.op.conflict_delete` / `ops.op.rename`

## 8. 验收

- [x] 8.1 右键某文件 "移到废纸篓" → confirm → 文件进系统回收站；Library 行消失；ops_log 加行
- [x] 8.2 `Cmd+Backspace`（聚焦 Library 选中行）→ 同上 confirm 弹窗
- [x] 8.3 在 `/editor/:path` 按 `Cmd+Backspace` → 不触发删除
- [x] 8.4 `shell.trashItem` 失败（mock）→ 降级 modal；勾选确认 "永久删除" → `fs.unlink`；ops_log `op='hard_delete'`
- [ ] 8.5 `/history/trash` 列出最近删的文件；点"打开原目录"跳 Finder
- [ ] 8.6 `/history/conflicts` 列出 phase 9 产生的快照；点击某条右侧显示 side-by-side diff
- [ ] 8.7 切换 `local ↔ base` → diff 重绘
- [ ] 8.8 点击"删除此快照" → 确认 → 该条从列表消失；ops_log 新增 `conflict_delete`
- [ ] 8.9 `/history/ops` 按 ts 倒序列出所有；chips 过滤 "trash" 生效
- [ ] 8.10 点 Ops 的 conflict_resolve 行 → 跳 `/history/conflicts?id=<id>` 并高亮
- [ ] 8.11 `conflict.deleteAll` → 列表清空；ops_log 新增 N 行 `conflict_delete`
- [ ] 8.12 ops_log 超 90 天行自动 prune（人工插入 100 天前行 → 下次 record 后消失）
- [ ] 8.13 空态：全新树林打开三 tab 看到友好文案
- [ ] 8.14 phase 9 的"另存副本"冲突解决后 `ops.list` 有对应 `conflict_resolve` 行，meta.winner_path 正确
- [ ] 8.15 rename 文件后 `ops.list` 出现 `op='rename'` 行
- [ ] 8.16 `openspec validate phase-10-history-and-trash --strict` 通过
