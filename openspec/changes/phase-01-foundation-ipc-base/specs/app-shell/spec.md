## ADDED Requirements

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
渲染端 SHALL 使用 `react-router-dom` memory router，且 SHALL 预占位以下路由：`/`、`/picker`、`/library`、`/editor/:path`、`/browser`、`/chat`、`/settings`。Zustand 根 store MUST 提供 `theme` 与 `locale` 字段及其更新方法。

#### Scenario: 路由占位
- **WHEN** 渲染端启动
- **THEN** 所有预定义路由均可达且返回占位组件，控制台无路由错误

#### Scenario: 主题切换
- **WHEN** 调用 `rootStore.setTheme('dark')`
- **THEN** `document.documentElement` 的 `data-theme` 属性变为 `dark`

### Requirement: 外部链接拦截
应用 SHALL 拦截主窗口内的 `window.open` 与 `will-navigate` 事件，非白名单目标一律走 `shell.openExternal` 打开系统浏览器，禁止在主窗口内导航到任意 URL。

#### Scenario: 点击外链
- **WHEN** 主窗口渲染内容中存在一个外部 http(s) 链接并被激活
- **THEN** 系统默认浏览器打开该链接，主窗口内容不变
