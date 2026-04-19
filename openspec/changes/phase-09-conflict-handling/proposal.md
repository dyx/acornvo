## Why

phase 4 已预留 mtime 乐观锁；phase 7 的编辑器在保存失败时只 toast。现在要真正闭环冲突：用户一边在 Acornvo 编辑，一边用 iCloud/Obsidian/git 等在外部改同一文件 → 保存时必须给用户一个**可理解的三选项**，而不是默默覆盖或默默拒绝。PRD 的 S-3（跨工具并发写）与 S-9（git pull 覆盖）都指向这里。本阶段同时提供：保存前的外部修改感知、保存时的 mtime 冲突对话框、冲突历史留档（.acornvo/conflicts/）以便事后回溯。

## What Changes

- 编辑器在 ready 态 SHALL 订阅 `index:fileChanged(path)` 事件；若 path 等于当前文件且 `dirty=false` → 静默 reload；若 `dirty=true` → 在 TitleBar 显示 "文件在外部被修改" banner + "重载" / "忽略" 按钮
- 保存遇 `E_MTIME_MISMATCH` SHALL 打开 ConflictDialog：三选项
  - **保留本地**：强制覆盖磁盘（调 `file.write` 带 `force: true`）
  - **重载磁盘**：丢弃本地修改，重读文件
  - **另存副本**：把本地修改写到同目录 `<basename>.conflict.<ts>.md`，磁盘原文件保留外部版本
- 冲突发生时 SHALL 把三份内容的快照写到 `.acornvo/conflicts/<ts>-<basename>/`：
  - `local.md`（用户当前编辑器内容）
  - `remote.md`（磁盘当前内容）
  - `base.md`（editor 加载时的初始内容）
  - `meta.json`（path, resolved_by, resolved_at, winner）
- 新增 IPC `file.write(path, body, { expectedMtime, force })`：`force: true` 跳过 mtime 校验，内部先 `selfWrites` 注册再原子写
- 新增 IPC `conflict.list(limit)` / `conflict.read(id)` / `conflict.delete(id)`，为 phase 10（history/trash 页）做接口准备
- editor store：新增 `conflictState: { kind: 'none' | 'externalModified' | 'saveConflict'; remoteSnapshot?: Body }`；外部 reload 与三选项动作均从 store 驱动
- 当 editor 处于 `externalModified` 态且用户选"重载"：记录一次轻量 conflict history（仅 `remote → local` 的覆盖，不做三份快照），帮助事后审计

## Capabilities

### New Capabilities
- `conflict-detection`: 外部修改感知的规则（visibility-based：编辑器前台 + watcher 事件驱动）、editor.conflictState 状态机
- `conflict-resolution-ui`: `ConflictDialog` 三选项、`externalModified` banner 的 UI 规格
- `conflict-history-store`: `.acornvo/conflicts/` 目录 layout、`conflict.list/read/delete` IPC、保留策略（默认 30 天 / 上限 100 条）

### Modified Capabilities
- `md-file-io`: `file.write` 新增 `force` 选项；mtime-mismatch 路径明确返回 `E_MTIME_MISMATCH` 并附 `remoteMtimeMs`
- `editor-autosave`: `E_MTIME_MISMATCH` 不再只 toast，MUST 打开 ConflictDialog；dirty 态收到 `index:fileChanged` MUST 显示 banner；ConflictDialog 期间暂停自动保存

## Impact

- 依赖：无新第三方依赖；`.acornvo/conflicts/` 目录复用 phase 2 的 `.acornvo/` 初始化（补一个 ensureDir）
- main：`electron/ipc/conflicts.ts`、`electron/main/conflicts/store.ts`（目录管理 + 保留策略）
- renderer：`src/components/editor/ConflictDialog.tsx`、`src/components/editor/ExternalModifiedBanner.tsx`、editor store 扩展
- phase 5 watcher 事件 payload 已含 `{ path, contentHash, mtime, frontmatter }`，editor 直接消费（无 schema 变更）
- 风险：force 覆盖会损失外部修改，但快照已落 `.acornvo/conflicts/`，用户可手工找回；phase 10 会提供可视入口
