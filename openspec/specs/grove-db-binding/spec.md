# grove-db-binding Specification

## Purpose

Binds the SQLite index database lifecycle to grove switching — ensures the db handle tracks the currently active grove via `project:changed` events, and that no dangling handles remain on failure.

## Requirements

### Requirement: db 句柄随树林切换

系统 SHALL 订阅 `project:changed` 事件；收到非空 path 时关闭旧句柄（若存在）再在新树林下打开；收到 null 时关闭当前句柄且不再打开新句柄。任一时刻 MUST 至多存在一个打开的 db 句柄。

#### Scenario: 切换树林

- **WHEN** 用户从树林 A 切换到树林 B
- **THEN** A 的句柄被关闭（`PRAGMA wal_checkpoint(TRUNCATE)` 后 `db.close()`）
- **AND** B 的 `<B>/.acornvo/index.db` 被打开并完成 integrity + migrations

#### Scenario: 关闭树林

- **WHEN** 当前树林被关闭（`closeGrove`）
- **THEN** 当前 db 句柄被关闭，后续 db IPC 调用返回 `E_NOT_FOUND`（无 current db）

### Requirement: 切换失败不留悬空

若新树林 db 打开或迁移失败，系统 MUST 确保没有悬空句柄，且向渲染端返回明确错误。

#### Scenario: 新树林 db 损坏无法重建

- **WHEN** 打开新树林时 integrity 与重建均失败
- **THEN** 无任何 db 句柄打开
- **AND** IPC 返回 `{ ok: false, error: { code: 'E_INTERNAL', message: ... } }`
- **AND** 渲染端收到错误 toast
