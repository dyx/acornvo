## MODIFIED Requirements

### Requirement: 渲染端路由与根状态

渲染端 SHALL 使用 `react-router-dom` memory router，且 SHALL 预占位以下路由：`/`、`/picker`、`/library`、`/editor:path`、`/browser`、`/chat`、`/settings`。`/browser` 路由 MUST 在本阶段激活为真实 `Browse` 页（TabBar + AddressBar + WebContentsView 占位 div + Bookmarks 侧栏），不再为占位组件。Zustand 根 store MUST 提供 `theme` 与 `locale` 字段及其更新方法。

#### Scenario: 路由占位

- **WHEN** 初始启动
- **THEN** 所有路由可访问（编辑器、拾果、松语等在本阶段可以显示 "即将推出"占位）
- **AND** `/library` 为默认（redirect from `/`）

#### Scenario: /browser 激活

- **WHEN** 用户 navigate 到 `/browser`
- **THEN** 页面渲染 TabBar + AddressBar + Bookmarks 侧栏 + 浏览器内容 viewport；首次进入自动创建一个空白 tab

#### Scenario: 主题切换

- **WHEN** 用户切换主题
- **THEN** 根 store `theme` 值更新，并持久化到用户设置

### Requirement: 外部链接拦截

应用 SHALL 拦截主窗口（React renderer webContents）内的 `window.open` 与 `will-navigate` 事件，非白名单目标一律走 `shell.openExternal` 打开系统浏览器，禁止在主窗口内导航到任意 URL。该规则 MUST 仅作用于主 BrowserWindow 的 webContents；`/browser` 路由挂载的 WebContentsView（拾果内置浏览器）MUST NOT 受此限制，其自身的外链策略由 `browser-navigation` 规格定义。

#### Scenario: 点击外链

- **WHEN** 用户在渲染端模板中点击 `<a href>` 指向非内部路由
- **THEN** 系统默认浏览器打开该链接，主窗口仍保持当前页面

#### Scenario: WebContentsView 不受限

- **WHEN** 拾果内置浏览器（WebContentsView）加载 `https://example.com` 并自内部 `<a>` 导航到 `https://x.com`
- **THEN** 导航在该 tab 内正常完成（受 `browser-navigation` 规则而非 app-shell 拦截）

### Requirement: AppRail 模块导航

应用主布局 SHALL 在左侧 AppRail 展示三个主模块入口：`果仓`（`/library`）、`拾果`（`/browser`）、`松语`（`/chat`）。每个入口 MUST 显示图标 + 文本标签；当前路由匹配时 MUST 显示 active 态（底色 + 左边框）。`松语` 入口在本阶段可为 disabled 或标注"即将推出"。

#### Scenario: AppRail 渲染

- **WHEN** 应用主窗口呈现
- **THEN** AppRail 可见；三个入口按序排列

#### Scenario: 切换模块

- **WHEN** 用户点击 "拾果"
- **THEN** navigate 到 `/browser`；AppRail 的"拾果"入口变为 active 态

#### Scenario: 未实装模块

- **WHEN** 用户悬停 "松语" 入口（phase 17 前）
- **THEN** tooltip 显示"即将推出"；点击无反应或 disabled
