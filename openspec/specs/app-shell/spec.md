# app-shell Specification

## Purpose
TBD - created by archiving change phase-01-foundation-ipc-base. Update Purpose after archive.
## Requirements
### Requirement: 桌面窗口启动
应用启动后 SHALL 创建单一主 `BrowserWindow`，尺寸 1280×800（最小 960×600），居中显示，加载渲染进程入口。渲染进程 MUST 在 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` / `webSecurity: true` 约束下运行。

#### Scenario: 首次启动
- **WHEN** 用户启动应用
- **THEN** 桌面出现单一主窗口，显示占位 "Hello Acornvo" 首页
- **AND** DevTools 可用，无 CSP 违规报错
- **AND** `window.require` / `window.process` 在 renderer 中为 `undefined`

#### Scenario: macOS Dock 点击
- **WHEN** macOS 下用户 `Cmd+W` 关闭主窗后点击 Dock 图标
- **THEN** 主窗口重新显示而非重建

### Requirement: 应用生命周期钩子
应用 SHALL 暴露可被后续模块订阅的生命周期钩子：`onBeforeQuit`、`onWindowResume`（系统睡眠唤醒）。钩子 MUST 支持多订阅者按注册顺序串行执行，任一订阅者抛异常不阻断后续订阅者但须记录日志。

#### Scenario: 退出前钩子执行
- **WHEN** 用户触发退出（macOS `Cmd+Q` / Windows 关窗 / `app.quit()`）
- **THEN** 所有注册的 `onBeforeQuit` 订阅者按注册顺序被调用
- **AND** 若某订阅者抛出异常，异常被日志记录但不阻止其他订阅者执行

#### Scenario: 平台差异的关窗行为
- **WHEN** macOS 下用户关闭主窗口
- **THEN** 窗口隐藏而非销毁，应用保持运行
- **WHEN** Windows/Linux 下用户关闭主窗口
- **THEN** 应用退出

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

#### Scenario: 启动路由由 bootstrap 决定
- **WHEN** 应用启动完成
- **THEN** 根据 app-bootstrap 决策跳转到 `/picker` 或 `/library`，`/` 不作为稳定首屏

### Requirement: 切换树林菜单
主窗口 TitleBar SHALL 提供"切换树林"下拉菜单，包含：当前树林标识（名称 + 颜色块）、最近 5 项、分割线、"新建树林"、"打开已有目录"。该菜单 MUST 在 `/picker` 路由下隐藏（防止无意义操作）。

#### Scenario: 在 Library 可切换
- **WHEN** 用户在 `/library` 路由下点击 TitleBar 切换树林菜单
- **THEN** 下拉展示最近列表；点击某项触发树林切换
- **AND** 切换成功后跳转 `/library` 并触发 `project:changed` 事件

#### Scenario: 在 Picker 隐藏菜单
- **WHEN** 用户在 `/picker` 路由下
- **THEN** TitleBar 不显示切换树林入口（或以禁用状态展示）

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
