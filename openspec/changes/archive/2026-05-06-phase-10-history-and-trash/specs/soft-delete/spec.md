## ADDED Requirements

### Requirement: shell.trashItem 软删除
系统 SHALL 通过 `shell.trashItem(absPath)` 把文件送入系统回收站。调用 MUST 在 main 侧执行；renderer 通过 `file.trash(path)` IPC 触发。成功后 MUST 往 `ops_log` 写入 `(op='trash', path, ts, meta_json=null)`。文件消失后 watcher 的 `unlink` 事件由 indexer 正常处理（deleteFile + FTS 同步）。

#### Scenario: 成功软删除
- **WHEN** 调用 `file.trash('notes/a.md')`
- **THEN** 文件从树林中消失，进入系统回收站；`ops_log` 多一行 `op='trash'`；1s 内 `files` 表对应行被 watcher 删除

#### Scenario: trashItem 失败降级
- **WHEN** `shell.trashItem` 抛异常（Linux 无 XDG 等）
- **THEN** IPC 返回 `{ ok: false, error: { code: 'E_TRASH', message } }`；renderer 弹降级 modal；不 hard delete

### Requirement: Cmd+Backspace 快捷键
系统 SHALL 在 Library 聚焦（VirtualFileList 或 FileRow 获焦）时绑定 `Cmd/Ctrl+Backspace`（macOS）与 `Delete`（Win/Linux），触发删除确认弹窗。非 Library 路由 MUST NOT 响应该快捷键。

#### Scenario: Library 聚焦触发
- **WHEN** 用户在 `/library` 选中一行按 `Cmd+Backspace`
- **THEN** 弹 confirm modal："移到废纸篓？" + 路径 + 取消/确认按钮

#### Scenario: 编辑器不响应
- **WHEN** 用户在 `/editor/:path` 按 `Cmd+Backspace`
- **THEN** 该快捷键不触发删除（让编辑器自身的 delete line 行为保留）

#### Scenario: 取消 modal
- **WHEN** confirm modal 打开时用户按 Esc 或点"取消"
- **THEN** 文件未被移动；ops_log 无新增

### Requirement: 永久删除降级
当 `shell.trashItem` 失败时 renderer SHALL 弹出降级 modal，提供"永久删除"按钮；用户 MUST 二次确认（checkbox "我知道这无法恢复"）才可执行 `fs.unlink`。永久删除 MUST 在 `ops_log` 记录 `op='hard_delete'`。

#### Scenario: 降级后永久删除
- **WHEN** trashItem 失败 → 用户勾选确认 → 点"永久删除"
- **THEN** 文件被 unlink；`ops_log` 记录 `op='hard_delete'`；indexer 走 deleteFile 链路

#### Scenario: 未二次确认不删除
- **WHEN** 用户点"永久删除"但未勾选 checkbox
- **THEN** 按钮保持 disabled；无任何删除
