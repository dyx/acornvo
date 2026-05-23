# conflict-detection Specification

## Purpose

Editor 层的外部修改感知与冲突状态机，负责检测当前编辑文件在磁盘上的变更并驱动冲突处理流程。

## Requirements

### Requirement: Editor 外部修改感知

Editor 在 `ready` 态 SHALL 订阅 `index:fileChanged(path, { mtimeMs })`。收到事件时：

- `path ≠ currentPath` 或 `mtimeMs === savedMtimeMs` → 忽略
- `dirty === false` → 静默重载（调 `files.get(path)` 重置 body/savedBody/savedMtimeMs/baseBody）
- `dirty === true` → 设置 `conflictState = { kind: 'externalModified', remoteMtimeMs }`；UI 渲染 ExternalModifiedBanner

#### Scenario: 无本地修改时静默重载

- **WHEN** editor 打开 `notes/a.md` 且未编辑；外部 touch `notes/a.md`（mtime 变）
- **THEN** editor 自动重载；body 与 savedBody 更新；dirty=false；banner 不显示

#### Scenario: 有本地修改时提示

- **WHEN** editor 打开 `notes/a.md` 并输入过内容（dirty=true）；外部修改 `notes/a.md`
- **THEN** ExternalModifiedBanner 显示；自动保存被锁（直到用户选择）

#### Scenario: 非当前文件忽略

- **WHEN** editor 打开 `notes/a.md`；外部改 `notes/b.md`
- **THEN** editor 完全无反应（事件直接忽略）

### Requirement: mtime 比较容忍度

保存 `file.write` 的 mtime 校验 SHALL 允许 ±2ms 误差，以适配文件系统精度差异。超出容忍度才判 `E_MTIME_MISMATCH`。

#### Scenario: 精度内视为相等

- **WHEN** expectedMtime=1234567890.000、磁盘 mtime=1234567891.5（差 1.5ms）
- **THEN** 保存成功，不触发 mismatch

#### Scenario: 超出精度触发 mismatch

- **WHEN** expectedMtime=1234567890.000、磁盘 mtime=1234567895.000（差 5ms）
- **THEN** 返回 `E_MTIME_MISMATCH`

### Requirement: ConflictState 状态机

editor store SHALL 维护 `conflictState`：

```
type ConflictState =
  | { kind: 'none' }
  | { kind: 'externalModified'; remoteMtimeMs: number }
  | { kind: 'saveConflict'; remoteMtimeMs: number; remoteBody: string; remoteFrontmatter: Frontmatter }
```

转移：

- save 失败 `E_MTIME_MISMATCH` → 调 `files.get(path)` 拿 remote → `saveConflict`
- externalModified 下用户点"重载" → `none` + 刷新 editor
- externalModified 下用户点"忽略" → `none`（dirty 保留；下次 save 会进 `saveConflict`）
- saveConflict 下三选项任一解决后 → `none`

#### Scenario: saveConflict 优先级

- **WHEN** editor 处于 `externalModified` 态且用户触发保存
- **THEN** 保存失败 `E_MTIME_MISMATCH`，conflictState 升级为 `saveConflict`（覆盖 externalModified）

#### Scenario: 忽略后再编辑仍可触发

- **WHEN** 用户点"忽略"关闭 banner，继续输入 1 字后 debounce 触发 save
- **THEN** save 返回 `E_MTIME_MISMATCH`；打开 ConflictDialog
