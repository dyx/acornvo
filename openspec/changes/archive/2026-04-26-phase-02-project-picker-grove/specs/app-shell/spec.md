## ADDED Requirements

### Requirement: 切换树林菜单

主窗口 TitleBar SHALL 提供"切换树林"下拉菜单，包含：当前树林标识（名称 + 颜色块）、最近 5 项、分割线、"新建树林"、"打开已有目录"。该菜单 MUST 在 `/picker` 路由下隐藏（防止无意义操作）。

#### Scenario: 在 Library 可切换

- **WHEN** 用户在 `/library` 路由下点击 TitleBar 切换树林菜单
- **THEN** 下拉展示最近列表；点击某项触发树林切换
- **AND** 切换成功后跳转 `/library` 并触发 `project:changed` 事件

#### Scenario: 在 Picker 隐藏菜单

- **WHEN** 用户在 `/picker` 路由下
- **THEN** TitleBar 不显示切换树林入口（或以禁用状态展示）

## MODIFIED Requirements

### Requirement: 渲染端路由与根状态

渲染端 SHALL 使用 `react-router-dom` memory router，且 SHALL 预占位以下路由：`/`、`/picker`、`/library`、`/editor/:path`、`/browser`、`/chat`、`/settings`。Zustand 根 store MUST 提供 `theme` 与 `locale` 字段及其更新方法。**应用启动后的初始路由由 app-bootstrap 流水线决定**：最近列表有有效项时跳 `/library`，否则跳 `/picker`；`/` 仅作 loading 占位。

#### Scenario: 路由占位

- **WHEN** 渲染端启动
- **THEN** 所有预定义路由均可达且返回占位组件，控制台无路由错误

#### Scenario: 主题切换

- **WHEN** 调用 `rootStore.setTheme('dark')`
- **THEN** `document.documentElement` 的 `data-theme` 属性变为 `dark`

#### Scenario: 启动路由由 bootstrap 决定

- **WHEN** 应用启动完成
- **THEN** 根据 app-bootstrap 决策跳转到 `/picker` 或 `/library`，`/` 不作为稳定首屏
