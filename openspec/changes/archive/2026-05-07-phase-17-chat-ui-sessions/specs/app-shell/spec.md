## MODIFIED Requirements

### Requirement: AppRail 模块导航
应用主布局 SHALL 在左侧 AppRail 展示三个主模块入口（上部）：`果仓`（`/library`）、`拾果`（`/browser`）、`松语`（`/chat`）；以及一个**底部设置入口**：齿轮图标 → `/settings`。每个入口 MUST 显示图标 + 文本标签；当前路由匹配时 MUST 显示 active 态（底色 + 左边框）。phase 17 起 `松语` 入口 MUST 启用为实际导航；不再 disabled 或显示"即将推出"。

#### Scenario: AppRail 渲染
- **WHEN** 应用主窗口呈现
- **THEN** AppRail 可见；上部三个入口按序；底部齿轮入口与主入口通过 `margin-top: auto` 间距区隔

#### Scenario: 切换模块
- **WHEN** 用户点击 "拾果"
- **THEN** navigate 到 `/browser`；AppRail 的"拾果"入口变为 active 态

#### Scenario: 打开松语
- **WHEN** 用户点击 "松语"
- **THEN** navigate 到 `/chat`；Chat 页面渲染（三栏布局）；AppRail 的"松语"入口变为 active 态

#### Scenario: 打开设置
- **WHEN** 用户点击 AppRail 底部齿轮图标
- **THEN** navigate 到 `/settings`；齿轮图标显示 active 态
