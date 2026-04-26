# grove-management Specification

## Purpose
TBD - created by archiving change phase-02-project-picker-grove. Update Purpose after archive.
## Requirements
### Requirement: 新建树林
系统 SHALL 支持用户在指定父目录下新建树林：创建根目录、`.acornvo/` 子目录以及 `project.json`、`inbox/`、`assets/`、`.nosync`、`.icloud` 占位。`project.json` MUST 包含 `id`（uuid v4）、`schema_version`、`name`、`color`、`created_at`。

#### Scenario: 新建成功
- **WHEN** 用户选父目录 `/Users/foo/Documents` 并输入名字 `"我的树林"`
- **THEN** 目录 `/Users/foo/Documents/我的树林/` 被创建
- **AND** `/Users/foo/Documents/我的树林/.acornvo/project.json` 存在且 schema 合法
- **AND** `/Users/foo/Documents/我的树林/inbox/`、`assets/` 存在
- **AND** 该项被追加到 `~/.acornvo/recent-projects.json` 首位

#### Scenario: 父目录不可写
- **WHEN** 用户选的父目录无写权限
- **THEN** IPC 返回 `{ ok: false, error: { code: 'E_PERMISSION' } }`，文件系统未发生任何变更

#### Scenario: 同名目录已存在
- **WHEN** 用户输入的树林名在父目录下已存在
- **THEN** IPC 返回 `E_INVALID_ARGS` 并指出冲突，不覆盖

### Requirement: 打开已有目录（含 Obsidian vault）
系统 SHALL 允许打开任意已存在目录作为树林。若目录下不存在 `.acornvo/`，系统 MUST 自动初始化（创建 `.acornvo/` 与必要子项），且不破坏目录下已有内容（包括 `.obsidian/`）。

#### Scenario: 打开一个 Obsidian vault
- **WHEN** 用户选一个含 `.obsidian/` 但无 `.acornvo/` 的目录
- **THEN** `.acornvo/project.json` 被创建，`name` 默认取目录名，`.obsidian/` 保持原样
- **AND** 该项进入最近列表

#### Scenario: `project.json` 损坏
- **WHEN** 打开一个已有 `.acornvo/project.json` 但 Zod 校验失败的目录
- **THEN** 系统将其备份为 `project.json.bak-<timestamp>` 并写入新的默认 `project.json`，日志记录

### Requirement: `.acornvo/` 初始化幂等
多次调用初始化函数 MUST 不覆盖已有的合法 `project.json`，但 MUST 补齐缺失的 `.nosync` / `.icloud` / `inbox/` / `assets/`。

#### Scenario: 二次初始化
- **WHEN** 对一个已初始化树林再次调用 `initialize`
- **THEN** `project.json` 内容不变（`last_opened_at` 可更新）
- **AND** 若用户此前手动删除了 `.nosync`，本次调用会重新创建它

### Requirement: 实例锁防止并发打开
系统 SHALL 在每次打开树林时校验 `<grove>/.acornvo/.lock`。若 lock 存在且 `hostname` 与本机相同且 `pid` 进程仍存活，系统 MUST 拒绝直接打开并向渲染端返回 `{ locked: true, holder: { pid, hostname, started_at } }`。用户选择"强制接管"后系统 MAY 覆盖 lock。

#### Scenario: 陈旧 lock 自动覆盖
- **WHEN** 打开树林时 lock 中的 pid 已不存在
- **THEN** 系统覆盖 lock 并正常打开

#### Scenario: 活跃 lock 拒绝并提示
- **WHEN** 打开树林时 lock 中的 pid 仍存活
- **THEN** 系统返回 locked 信息；Picker UI 显示接管确认
- **WHEN** 用户点击"强制接管"
- **THEN** 系统覆盖 lock 并打开；日志记录接管事件

#### Scenario: 退出时清理 lock
- **WHEN** 应用通过 `app.quit()` 正常退出
- **THEN** 当前打开树林的 `.lock` 文件被删除

### Requirement: 最近打开列表
系统 SHALL 将所有打开过的树林记录到 `~/.acornvo/recent-projects.json`，按 `last_opened_at` 倒序。每次打开 MUST 更新时间戳并把项移到首位。失效路径（`fs.existsSync` 为 false）MUST 在 Picker 中标记失效，且用户可一键从列表移除。

#### Scenario: 打开更新时间戳
- **WHEN** 用户打开列表中第 3 项
- **THEN** 该项 `last_opened_at` 更新为当前时间，位置移到首位

#### Scenario: 失效路径
- **WHEN** Picker 载入时某项路径已被删除
- **THEN** 该项在 UI 上置灰且展示"移除"按钮
- **WHEN** 用户点击"移除"
- **THEN** 该项从 `recent-projects.json` 中删除

### Requirement: 同步目录告警
系统 SHALL 在打开树林时检测路径是否包含已知云同步目录特征（iCloud / Dropbox / OneDrive / Google Drive / Nextcloud / pCloud），命中时 MUST 记录到 `project.json.sync_warning` 字段并写入日志。

#### Scenario: 命中 iCloud
- **WHEN** 用户打开 `/Users/foo/Library/Mobile Documents/com~apple~CloudDocs/MyGrove`
- **THEN** `project.json.sync_warning` = `"iCloud"`
- **AND** 日志出现警告行

### Requirement: 打开树林流水线集成 db 初始化
打开树林的流水线（`openGrove`）SHALL 在成功获取 lock 并读取 `project.json` 之后、返回成功之前，额外串行执行 db 初始化：连接 `<grove>/.acornvo/index.db` → integrity check → 可能重建 → 跑 migrations。整个流水线 MUST 作为一个事务性操作：任一步骤失败均回退（释放 lock、关闭已打开句柄、不更新 `last_opened_at`）。

#### Scenario: 成功打开
- **WHEN** 流水线全部步骤成功
- **THEN** `project:changed` 事件带新树林信息发出
- **AND** `db.version()` 可正常调用
- **AND** `last_opened_at` 被更新

#### Scenario: db 步骤失败回退
- **WHEN** db 初始化在 migrations 中抛错且重建亦失败
- **THEN** 本次打开的 lock 被释放
- **AND** `recent-projects.json` 中该项 `last_opened_at` 未被更新
- **AND** IPC 返回 `E_INTERNAL` 错误
- **AND** 当前树林仍为上一棵（若有）或 null

### Requirement: 切换树林广播
当前打开的树林被切换时，系统 MUST 通过 `project:changed` IPC 事件通知渲染端并附带新树林的 `{ id, path, name, color }`。

#### Scenario: 切换事件
- **WHEN** 用户在 Picker 或 GroveSwitcher 打开另一棵树林
- **THEN** 渲染端所有订阅 `project:changed` 的监听器被调用一次
- **AND** 业务 slice（后续 change 新增）据此清空上一树林状态
