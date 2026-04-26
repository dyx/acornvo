# app-bootstrap Specification

## Purpose
TBD - created by archiving change phase-02-project-picker-grove. Update Purpose after archive.
## Requirements
### Requirement: 启动决策流水线
应用启动时 SHALL 依次执行：载入 `~/.acornvo/recent-projects.json` → 过滤失效项 → 尝试打开首个有效项 → 成功则路由到 `/library`，否则路由到 `/picker`。整个流水线 MUST 不阻塞主窗口创建超过 2 秒，超时时强制回到 Picker。

#### Scenario: 最近列表为空
- **WHEN** 用户首次安装并启动应用
- **THEN** 主窗口显示 Project Picker（`/picker`）

#### Scenario: 自动打开成功
- **WHEN** 最近列表首项路径有效且未被其他实例锁定
- **THEN** 主窗口直接进入 `/library`（占位内容由后续 change 填充）
- **AND** 该项 `last_opened_at` 被更新

#### Scenario: 首项被锁定
- **WHEN** 最近列表首项被另一实例锁定
- **THEN** 主窗口显示 Picker 且首项带 "被占用" 标签与"接管"按钮

#### Scenario: 启动决策超时
- **WHEN** 流水线任一步骤超过 2 秒未完成
- **THEN** 主窗口强制显示 Picker，超时原因写入日志

### Requirement: 启动流水线不影响 IPC 就绪
主进程 MUST 在启动决策流水线开始之前完成 IPC router 注册。渲染端 Picker 首屏必须能正常调用 `project.listRecent` 等 IPC。

#### Scenario: Picker 可立即交互
- **WHEN** Picker 首屏渲染
- **THEN** 不出现 IPC 调用被拒绝或 `window.api` 未定义的错误
