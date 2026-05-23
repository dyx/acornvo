## MODIFIED Requirements

### Requirement: `/settings` 路由页

`src/pages/Settings.tsx` SHALL 挂载到路由 `/settings`，并 SHALL 布局为左侧 tab 列表（60px 宽，icon + 标签）+ 右侧详情区的双栏。Tab 顺序：通用 → 外观 → AI → 浏览器 → 可观测 → 关于。tab 切换用子路由 `/settings/general` / `/settings/appearance` / `/settings/ai` / `/settings/browser` / `/settings/observability` / `/settings/about`，默认重定向 `/settings` → `/settings/general`。

#### Scenario: 打开设置页

- **WHEN** 用户 navigate 到 `/settings`
- **THEN** 页面渲染双栏；默认显示"通用" tab；URL 重定向到 `/settings/general`

#### Scenario: 切 tab

- **WHEN** 用户点击"外观"
- **THEN** navigate 到 `/settings/appearance`；右侧区域切换为外观字段

#### Scenario: 进入可观测

- **WHEN** 用户点击"可观测"
- **THEN** navigate 到 `/settings/observability`；右侧区域切换为 observability-page 定义的 tab 结构

#### Scenario: 进入关于

- **WHEN** 用户点击"关于"
- **THEN** navigate 到 `/settings/about`；右侧区域渲染 about-page 定义的版本与许可信息
