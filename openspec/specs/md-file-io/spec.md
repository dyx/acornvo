## ADDED Requirements

### Requirement: file.trash IPC

系统 SHALL 提供 `file.trash(path)` IPC：main 侧 `safeResolve` + `shell.trashItem(abs)` + 成功后 `opsLog.record({ op:'trash', path })`。返回 `{ ok: true }` 或 `{ ok: false, error: { code: 'E_TRASH' | 'E_NOT_FOUND' | 'E_PERMISSION' } }`。

#### Scenario: 正常 trash

- **WHEN** `file.trash('notes/a.md')`，文件存在
- **THEN** 文件移入系统回收站；ops_log 多一行 `op='trash'`

#### Scenario: 文件不存在

- **WHEN** `file.trash('nonexistent.md')`
- **THEN** 返回 `E_NOT_FOUND`

#### Scenario: 路径越界

- **WHEN** `file.trash('../outside.md')`
- **THEN** 返回 `E_PERMISSION`

#### Scenario: shell.trashItem 失败

- **WHEN** Electron 底层抛异常（Linux 无 XDG 等）
- **THEN** 返回 `E_TRASH`；ops_log 不记录

### Requirement: file.hardDelete IPC（降级）

系统 SHALL 提供 `file.hardDelete(path)` IPC，直接 `fs.unlink`。该 IPC MUST 仅在"trash 失败后用户显式确认"场景被 renderer 调用；main 侧不做二次确认（信任 renderer 已弹窗）。成功后 `opsLog.record({ op:'hard_delete', path })`。

#### Scenario: 正常永久删除

- **WHEN** `file.hardDelete('notes/a.md')`
- **THEN** 文件从磁盘 unlink；ops_log 多一行 `op='hard_delete'`
