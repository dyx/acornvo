## MODIFIED Requirements

### Requirement: /history 路由

系统 SHALL 注册 `/history` 路由；默认 redirect 到 `/history/trash`。页面 SHALL 用 Tabs 组件展示四个子 tab：Trash（回收站记录）、Conflicts（冲突快照）、Ops（所有操作）、Jobs（任务队列）。URL 与 tab 双向同步。

#### Scenario: 进入默认 tab

- **WHEN** navigate 到 `/history`
- **THEN** URL 变为 `/history/trash`；Trash tab 激活

#### Scenario: 切换 tab

- **WHEN** 点击 Conflicts tab
- **THEN** URL 变为 `/history/conflicts`；Conflicts 内容显示

#### Scenario: 任务 tab URL

- **WHEN** 点击 Jobs tab
- **THEN** URL 变为 `/history/jobs`；Jobs 面板显示

## ADDED Requirements

### Requirement: History 面板空态 - Jobs 空

Jobs tab 无任务时 SHALL 显示文案 "没有待办任务"。

#### Scenario: Jobs 空

- **WHEN** 进入 `/history/jobs` 且符合默认 filter 的 job 数为 0
- **THEN** 显示空态文案
