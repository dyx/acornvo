# path-safety Specification

## Purpose

TBD - created by archiving change phase-04-file-io-atomic. Update Purpose after archive.

## Requirements

### Requirement: safeResolve 路径校验

系统 SHALL 提供 `safeResolve(groveRoot: string, p: string): string` 工具函数。所有面向磁盘的 IPC handler、AI tool、内部 service MUST 在落盘或读磁盘前调用此函数校验路径。返回值 MUST 是绝对路径且保证在 `groveRoot` 内部。

#### Scenario: 合法相对路径

- **WHEN** 调用 `safeResolve('/Users/x/Grove', 'notes/a.md')`
- **THEN** 返回 `/Users/x/Grove/notes/a.md`

#### Scenario: 绝对路径恰好在树林内

- **WHEN** 调用 `safeResolve('/Users/x/Grove', '/Users/x/Grove/notes/a.md')`
- **THEN** 返回 `/Users/x/Grove/notes/a.md`

#### Scenario: 越界

- **WHEN** 调用 `safeResolve('/Users/x/Grove', '../elsewhere.md')` 或 `safeResolve('/Users/x/Grove', '/etc/passwd')`
- **THEN** 抛 `IpcError('E_PERMISSION')`，不返回路径

#### Scenario: 路径段含 `..`

- **WHEN** 输入 `'a/../../b.md'`
- **THEN** 抛 `IpcError('E_PERMISSION')`（即便最终解析结果仍在树林内也拒绝，避免隐藏跨越）

### Requirement: 全链路强制调用

系统 MUST 保证所有 `path` / `rel` 参数的 IPC / tool 入口在读写磁盘前经过 `safeResolve`。代码审核层面 MUST 提供 lint/约定或集中 wrapper 强制此规则。

#### Scenario: file.rename 越界被拒

- **WHEN** `file.rename('a.md', '../b.md')`
- **THEN** 返回 `E_PERMISSION` 且源文件不动

#### Scenario: file.list 不逃逸

- **WHEN** `file.list('../')`
- **THEN** 返回 `E_PERMISSION`
